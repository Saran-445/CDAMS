import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { initDb } from './src/server/db.js';
import { initCronJobs } from './src/server/cron.js';
import apiRoutes from './src/server/routes.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB
  initDb();
  
  // Initialize Cron Jobs
  initCronJobs();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', apiRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
