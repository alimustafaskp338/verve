import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db';
import { seedInitialData } from './server/seed';
import { authenticate } from './server/auth';
import { authRouter } from './server/routes/auth';
import { usersRouter } from './server/routes/users';
import { socialRouter } from './server/routes/social';
import { postsRouter } from './server/routes/posts';
import { engagementRouter } from './server/routes/engagement';
import { messagesRouter } from './server/routes/messages';
import { notificationsRouter } from './server/routes/notifications';
import { reportsRouter } from './server/routes/reports';
import { devRouter } from './server/routes/dev';

async function startServer() {
  // Initialize database schema and initial data
  try {
    await initDatabase();
    await seedInitialData();
  } catch (err) {
    console.error('[DB INIT ERROR]', err);
  }

  const app = express();
  const PORT = 3000;

  // Basic security & parsing middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Static uploads serving with caching
  const uploadsPath = path.resolve(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath, { maxAge: '7d' }));

  // Global authentication middleware (populates req.user if session valid)
  app.use(authenticate);

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'Verve Social API',
      timestamp: new Date().toISOString(),
    });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/social', socialRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/engagement', engagementRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/dev', devRouter);

  // Global 404 for unknown /api/* requests
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'NotFound', message: `Endpoint ${req.method} ${req.path} not found.` });
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(err.status || 500).json({
      error: err.name || 'InternalServerError',
      message: err.message || 'An unexpected error occurred.',
    });
  });

  // Vite middleware for development vs static production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VERVE] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
