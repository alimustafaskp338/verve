import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app, ensureDbReady } from './server/app';

async function startServer() {
  // Initialize database schema and initial data
  await ensureDbReady();

  const PORT = 3000;

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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VERVE] Server running at http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('[SERVER LISTEN ERROR]', err);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('[FATAL SERVER ERROR]', err);
});
