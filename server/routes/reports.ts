import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../auth';

export const reportsRouter = Router();

const createReportSchema = z.object({
  targetType: z.enum(['post', 'user', 'comment', 'message']),
  targetId: z.string().min(1),
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'hate_speech', 'misinformation', 'copyright', 'other']),
  details: z.string().max(500).optional(),
});

// SUBMIT REPORT
reportsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', message: parsed.error.issues[0]?.message });
    }

    const { targetType, targetId, reason, details = '' } = parsed.data;
    const currentUserId = req.user!.id;
    const reportId = crypto.randomUUID();

    await db.execute({
      sql: `
        INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
      `,
      args: [reportId, currentUserId, targetType, targetId, reason, details],
    });

    return res.status(201).json({
      message: 'Thank you for reporting. Our moderation team will review this promptly.',
      reportId,
    });
  } catch (err: any) {
    console.error('[REPORT ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to submit report.' });
  }
});

// ADMIN: GET REPORTS
reportsRouter.get('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';

    const reportsRes = await db.execute({
      sql: `
        SELECT r.id, r.reporter_id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
               u.username as reporter_username
        FROM reports r
        JOIN users u ON r.reporter_id = u.id
        WHERE r.status = ?
        ORDER BY r.created_at DESC
        LIMIT 50
      `,
      args: [status],
    });

    return res.json({ reports: reportsRes.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch reports.' });
  }
});

// ADMIN: RESOLVE REPORT
reportsRouter.patch('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const reportId = req.params.id;
    const { status } = req.body;

    if (!['reviewed', 'dismissed', 'actioned'].includes(status)) {
      return res.status(400).json({ error: 'InvalidStatus', message: 'Invalid status.' });
    }

    await db.execute({
      sql: `UPDATE reports SET status = ? WHERE id = ?`,
      args: [status, reportId],
    });

    return res.json({ message: `Report marked as ${status}.` });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update report.' });
  }
});
