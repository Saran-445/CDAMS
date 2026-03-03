import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from './db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-demo';

// Setup multer for file uploads
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware to verify JWT
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Mock Email Service
const sendEmail = (to: string, subject: string, text: string) => {
  console.log(`\n📧 [EMAIL MOCK] To: ${to} | Subject: ${subject}\n${text}\n`);
};

// Auth Routes
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare(`
    SELECT u.*, r.name as role_name, d.name as department_name 
    FROM users u 
    LEFT JOIN roles r ON u.role_id = r.id 
    LEFT JOIN departments d ON u.department_id = d.id 
    WHERE u.email = ?
  `).get(email) as any;

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role_name, department_id: user.department_id },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role_name,
      department: user.department_name
    }
  });
});

// Document Routes
router.get('/documents', authenticate, (req: any, res) => {
  const { role, department_id, id } = req.user;
  const { search, status, category } = req.query;
  
  let query = `
    SELECT d.*, u.name as uploader_name, dept.name as department_name,
           (SELECT role_required_id FROM workflow_steps ws WHERE ws.workflow_id = d.workflow_id AND ws.step_order = d.current_step) as current_role_required_id
    FROM documents d
    LEFT JOIN users u ON d.uploader_id = u.id
    LEFT JOIN departments dept ON d.department_id = dept.id
    WHERE d.is_deleted = 0
  `;
  
  let params: any[] = [];

  // Basic RBAC filtering
  if (role === 'Employee') {
    query += ' AND d.uploader_id = ?';
    params.push(id);
  } else if (role === 'Department Manager' || role === 'Approver') {
    query += ' AND d.department_id = ?';
    params.push(department_id);
  }

  if (search) {
    query += ' AND d.title LIKE ?';
    params.push(`%${search}%`);
  }
  if (status) {
    query += ' AND d.status = ?';
    params.push(status);
  }
  if (category) {
    query += ' AND d.category = ?';
    params.push(category);
  }
  
  query += ' ORDER BY d.created_at DESC';

  const docs = db.prepare(query).all(...params);
  
  // Add canApprove flag
  const userRole = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as any;
  const docsWithApproval = docs.map((doc: any) => ({
    ...doc,
    canApprove: doc.status === 'PENDING' && doc.current_role_required_id === userRole.id
  }));

  res.json(docsWithApproval);
});

router.get('/approvals/my-pending', authenticate, (req: any, res) => {
  const { role } = req.user;
  const userRole = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as any;

  const query = `
    SELECT d.*, u.name as uploader_name, dept.name as department_name
    FROM documents d
    LEFT JOIN users u ON d.uploader_id = u.id
    LEFT JOIN departments dept ON d.department_id = dept.id
    JOIN workflow_steps ws ON ws.workflow_id = d.workflow_id AND ws.step_order = d.current_step
    WHERE d.status = 'PENDING' AND d.is_deleted = 0 AND ws.role_required_id = ?
    ORDER BY d.created_at DESC
  `;

  const docs = db.prepare(query).all(userRole.id);
  res.json(docs);
});

router.post('/documents', authenticate, upload.single('file'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { title, category, tags } = req.body;
  const { id: uploader_id, department_id } = req.user;

  try {
    const transaction = db.transaction(() => {
      // Find workflow for department
      const workflow = db.prepare('SELECT id FROM workflows WHERE department_id = ? LIMIT 1').get(department_id) as any;
      if (!workflow) throw new Error('No workflow defined for this department');

      // Insert document
      const stmt = db.prepare(`
        INSERT INTO documents (title, file_path, original_name, mime_type, size, uploader_id, department_id, category, tags, workflow_id, current_step, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
      `);

      const info = stmt.run(
        title,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        uploader_id,
        department_id,
        category,
        tags,
        workflow.id
      );

      const documentId = info.lastInsertRowid;

      // Find first step
      const firstStep = db.prepare('SELECT id FROM workflow_steps WHERE workflow_id = ? AND step_order = 1').get(workflow.id) as any;
      
      // Create initial approval record
      db.prepare('INSERT INTO approvals (document_id, step_id, status) VALUES (?, ?, ?)')
        .run(documentId, firstStep.id, 'PENDING');

      // Log audit
      db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)')
        .run(uploader_id, 'UPLOAD', 'DOCUMENT', documentId);

      // Send mock email to the first approver role (simplified)
      sendEmail('approvers@kit.edu', `New Document Uploaded: ${title}`, `A new document "${title}" has been uploaded and is waiting for approval.`);

      return documentId;
    });

    const docId = transaction();
    res.status(201).json({ id: docId, message: 'Document uploaded successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/documents/:id/download', authenticate, (req: any, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Log audit
  db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'DOWNLOAD', 'DOCUMENT', doc.id);

  const filePath = path.join(uploadDir, doc.file_path);
  res.download(filePath, doc.original_name);
});

// Approvals
router.post('/documents/:id/approve', authenticate, (req: any, res) => {
  const { id } = req.params;
  const { comments } = req.body;
  
  try {
    const transaction = db.transaction(() => {
      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
      if (!doc) throw new Error('Document not found');
      if (doc.status !== 'PENDING') throw new Error('Document not in pending state');

      const currentStep = db.prepare('SELECT * FROM workflow_steps WHERE workflow_id = ? AND step_order = ?').get(doc.workflow_id, doc.current_step) as any;
      if (!currentStep) throw new Error('Workflow step not found');

      // Check if user has required role
      const userRole = db.prepare('SELECT id FROM roles WHERE name = ?').get(req.user.role) as any;
      if (userRole.id !== currentStep.role_required_id) {
        throw new Error('Unauthorized approval attempt');
      }

      // Update approval record
      db.prepare(`
        UPDATE approvals 
        SET status = 'APPROVED', approver_id = ?, comments = ?, action_date = CURRENT_TIMESTAMP 
        WHERE document_id = ? AND step_id = ?
      `).run(req.user.id, comments || '', id, currentStep.id);

      if (currentStep.is_final_step) {
        db.prepare('UPDATE documents SET status = ?, current_step = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('APPROVED', id);
        sendEmail('uploader@kit.edu', `Document Approved: ${doc.title}`, `Your document "${doc.title}" has been fully approved.`);
      } else {
        const nextStepOrder = doc.current_step + 1;
        db.prepare('UPDATE documents SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(nextStepOrder, id);
        
        const nextStep = db.prepare('SELECT id FROM workflow_steps WHERE workflow_id = ? AND step_order = ?').get(doc.workflow_id, nextStepOrder) as any;
        db.prepare('INSERT INTO approvals (document_id, step_id, status) VALUES (?, ?, ?)')
          .run(id, nextStep.id, 'PENDING');
        sendEmail('next_approver@kit.edu', `Pending Approval: ${doc.title}`, `A document "${doc.title}" is waiting for your approval.`);
      }

      db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)')
        .run(req.user.id, 'APPROVE', 'DOCUMENT', id, 'APPROVED');
    });

    transaction();
    res.json({ message: 'Document approved successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/documents/:id/reject', authenticate, (req: any, res) => {
  const { id } = req.params;
  const { comments } = req.body;
  
  try {
    const transaction = db.transaction(() => {
      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
      if (!doc) throw new Error('Document not found');
      if (doc.status !== 'PENDING') throw new Error('Document not in pending state');

      const currentStep = db.prepare('SELECT * FROM workflow_steps WHERE workflow_id = ? AND step_order = ?').get(doc.workflow_id, doc.current_step) as any;
      
      // Update approval record
      db.prepare(`
        UPDATE approvals 
        SET status = 'REJECTED', approver_id = ?, comments = ?, action_date = CURRENT_TIMESTAMP 
        WHERE document_id = ? AND step_id = ?
      `).run(req.user.id, comments || '', id, currentStep.id);

      db.prepare('UPDATE documents SET status = ?, current_step = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('REJECTED', id);

      db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)')
        .run(req.user.id, 'REJECT', 'DOCUMENT', id, 'REJECTED');
        
      sendEmail('uploader@kit.edu', `Document Rejected: ${doc.title}`, `Your document "${doc.title}" has been rejected.\nComments: ${comments}`);
    });

    transaction();
    res.json({ message: 'Document rejected successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Dashboard Stats
router.get('/stats', authenticate, (req: any, res) => {
  const totalDocs = (db.prepare('SELECT COUNT(*) as count FROM documents WHERE is_deleted = 0').get() as any).count;
  const pendingDocs = (db.prepare("SELECT COUNT(*) as count FROM documents WHERE status = 'PENDING' AND is_deleted = 0").get() as any).count;
  const approvedDocs = (db.prepare("SELECT COUNT(*) as count FROM documents WHERE status = 'APPROVED' AND is_deleted = 0").get() as any).count;
  
  const deptStats = db.prepare(`
    SELECT d.name, COUNT(doc.id) as count 
    FROM departments d 
    LEFT JOIN documents doc ON d.id = doc.department_id AND doc.is_deleted = 0
    GROUP BY d.id
  `).all();

  res.json({ totalDocs, pendingDocs, approvedDocs, deptStats });
});

// Delete Document (Soft Delete)
router.delete('/documents/:id', authenticate, (req: any, res) => {
  const { id } = req.params;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND is_deleted = 0').get(id) as any;
  
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  
  if (req.user.role !== 'Admin' && req.user.id !== doc.uploader_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare('UPDATE documents SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'DELETE', 'DOCUMENT', id);

  res.json({ message: 'Document deleted successfully' });
});

// Audit Logs
router.get('/audit-logs', authenticate, (req: any, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const logs = db.prepare(`
    SELECT a.*, u.name as user_name 
    FROM audit_logs a 
    LEFT JOIN users u ON a.user_id = u.id 
    ORDER BY a.created_at DESC 
    LIMIT 100
  `).all();

  res.json(logs);
});

export default router;
