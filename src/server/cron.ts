import cron from 'node-cron';
import db from './db.js';

export function initCronJobs() {
  console.log('Initializing cron jobs...');

  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    console.log('Running daily reminder job...');
    
    // Find pending approvals older than 2 days
    const pendingApprovals = db.prepare(`
      SELECT a.*, d.title, u.email, u.name as approver_name
      FROM approvals a
      JOIN documents d ON a.document_id = d.id
      JOIN users u ON a.approver_id = u.id
      WHERE a.status = 'PENDING' AND a.created_at < datetime('now', '-2 days')
    `).all() as any[];

    for (const approval of pendingApprovals) {
      console.log(`\n📧 [EMAIL MOCK] To: ${approval.email} | Subject: Reminder: Pending Approval for ${approval.title}`);
      console.log(`Hello ${approval.approver_name},\nThis is a reminder that you have a pending document "${approval.title}" waiting for your approval.\n`);
    }
  });
}
