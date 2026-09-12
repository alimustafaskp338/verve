import { Router, Request, Response } from 'express';
import { db } from '../db';
import { seedInitialData } from '../seed';
import { isSmtpConfigured, getSmtpStatus } from '../email';

export const devRouter = Router();

// Dev status endpoint
devRouter.get('/status', (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  return res.json({
    environment: process.env.NODE_ENV || 'development',
    smtp: getSmtpStatus(),
    isDevOutboxAvailable: !isProd || !isSmtpConfigured(),
  });
});

// LIST TRANSACTIONAL OUTBOX EMAILS (Dev-only fallback)
devRouter.get('/emails', async (req: Request, res: Response) => {
  try {
    // If running in strict production and SMTP is active, prevent silent dev outbox reliance
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && isSmtpConfigured()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Dev email outbox is disabled in production when real SMTP is configured.',
      });
    }

    const emailsRes = await db.execute({
      sql: `SELECT id, to_email, subject, text_content, html_content, token, purpose, sent_at FROM sent_emails ORDER BY sent_at DESC LIMIT 25`,
    });

    return res.json({
      emails: emailsRes.rows,
      smtpActive: isSmtpConfigured(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch emails.' });
  }
});

// TRIGGER SEEDING
devRouter.post('/seed', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Forbidden', message: 'Seeding is disabled in production.' });
    }
    await seedInitialData();
    return res.json({ message: 'Seed data generated successfully.' });
  } catch (err: any) {
    console.error('[SEED ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Seeding failed.' });
  }
});
