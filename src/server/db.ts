import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

// Initialize database schema
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role_id INTEGER,
      department_id INTEGER,
      FOREIGN KEY (role_id) REFERENCES roles (id),
      FOREIGN KEY (department_id) REFERENCES departments (id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploader_id INTEGER,
      department_id INTEGER,
      category TEXT,
      status TEXT DEFAULT 'Pending',
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploader_id) REFERENCES users (id),
      FOREIGN KEY (department_id) REFERENCES departments (id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      approver_id INTEGER,
      status TEXT DEFAULT 'Pending',
      comments TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents (id),
      FOREIGN KEY (approver_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  // Seed initial data
  const rolesCount = db.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number };
  if (rolesCount.count === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name) VALUES (?)');
    ['Admin', 'Department Manager', 'Approver', 'Employee', 'External Viewer'].forEach(role => insertRole.run(role));
    
    const insertDept = db.prepare('INSERT INTO departments (name) VALUES (?)');
    ['HR', 'Finance', 'IT', 'Operations'].forEach(dept => insertDept.run(dept));

    const insertUser = db.prepare('INSERT INTO users (name, email, password, role_id, department_id) VALUES (?, ?, ?, ?, ?)');
    const hash = bcrypt.hashSync('password123', 10);
    
    // Admin
    insertUser.run('Admin User', 'admin@kit.edu', hash, 1, 3);
    // Manager
    insertUser.run('HR Manager', 'manager@kit.edu', hash, 2, 1);
    // Approver
    insertUser.run('Finance Approver', 'approver@kit.edu', hash, 3, 2);
    // Employee
    insertUser.run('John Employee', 'employee@kit.edu', hash, 4, 1);
  }
}

export default db;
