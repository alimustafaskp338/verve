import { Router, Request, Response } from 'express';
import { db } from '../db';
import { seedInitialData } from '../seed';

export const devRouter = Router();

// LIST TRANSACTIONAL OUTBOX EMAILS
devRouter.get('/emails', async (req: Request, res: Response) => {
  try {
    const emailsRes = await db.execute({
      sql: `SELECT id, to_email, subject, text_content, html_content, token, purpose, sent_at FROM sent_emails ORDER BY sent_at DESC LIMIT 25`,
    });

    return res.json({ emails: emailsRes.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch emails.' });
  }
});

// TRIGGER SEEDING
devRouter.post('/seed', async (req: Request, res: Response) => {
  try {
    await seedInitialData();
    return res.json({ message: 'Seed data generated successfully.' });
  } catch (err: any) {
    console.error('[SEED ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Seeding failed.' });
  }
});
