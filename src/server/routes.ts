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
  
  let query = `
    SELECT d.*, u.name as uploader_name, dept.name as department_name
    FROM documents d
    LEFT JOIN users u ON d.uploader_id = u.id
    LEFT JOIN departments dept ON d.department_id = dept.id
  `;
  
  let params: any[] = [];

  // Basic RBAC filtering
  if (role === 'Employee') {
    query += ' WHERE d.uploader_id = ?';
    params.push(id);
  } else if (role === 'Department Manager' || role === 'Approver') {
    query += ' WHERE d.department_id = ?';
    params.push(department_id);
  }
  
  query += ' ORDER BY d.created_at DESC';

  const docs = db.prepare(query).all(...params);
  res.json(docs);
});

router.post('/documents', authenticate, upload.single('file'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { title, category, tags } = req.body;
  const { id: uploader_id, department_id } = req.user;

  const stmt = db.prepare(`
    INSERT INTO documents (title, file_path, original_name, mime_type, size, uploader_id, department_id, category, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    tags
  );

  // Log audit
  db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)')
    .run(uploader_id, 'UPLOAD', 'DOCUMENT', info.lastInsertRowid);

  res.status(201).json({ id: info.lastInsertRowid, message: 'Document uploaded successfully' });
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
  const { status, comments } = req.body; // 'Approved' or 'Rejected'
  
  if (req.user.role !== 'Admin' && req.user.role !== 'Approver' && req.user.role !== 'Department Manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare('UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  
  db.prepare('INSERT INTO approvals (document_id, approver_id, status, comments) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, status, comments || '');

  db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, 'APPROVE', 'DOCUMENT', id, status);

  res.json({ message: `Document ${status.toLowerCase()} successfully` });
});

// Dashboard Stats
router.get('/stats', authenticate, (req: any, res) => {
  const totalDocs = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as any).count;
  const pendingDocs = (db.prepare("SELECT COUNT(*) as count FROM documents WHERE status = 'Pending'").get() as any).count;
  const approvedDocs = (db.prepare("SELECT COUNT(*) as count FROM documents WHERE status = 'Approved'").get() as any).count;
  
  const deptStats = db.prepare(`
    SELECT d.name, COUNT(doc.id) as count 
    FROM departments d 
    LEFT JOIN documents doc ON d.id = doc.department_id 
    GROUP BY d.id
  `).all();

  res.json({ totalDocs, pendingDocs, approvedDocs, deptStats });
});

export default router;
