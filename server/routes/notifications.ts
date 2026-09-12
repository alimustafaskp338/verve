import { Router, Request, Response } from 'express';
import { db } from '../db';
import { requireAuth } from '../auth';

export const notificationsRouter = Router();

// GET NOTIFICATIONS
notificationsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 60);

    const notifRes = await db.execute({
      sql: `
        SELECT n.id, n.type, n.post_id, n.comment_id, n.is_read, n.created_at,
               u.id as actor_id, u.username as actor_username, u.display_name as actor_display_name,
               u.avatar_url as actor_avatar_url, u.is_verified as actor_is_verified,
               p.image_url as post_image_url
        FROM notifications n
        JOIN users u ON n.actor_id = u.id
        LEFT JOIN posts p ON n.post_id = p.id
        WHERE n.recipient_id = ?
        ORDER BY n.created_at DESC
        LIMIT ?
      `,
      args: [currentUserId, limit],
    });

    const notifications = notifRes.rows.map((r) => ({
      id: r.id,
      type: r.type,
      postId: r.post_id || null,
      commentId: r.comment_id || null,
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
      postImageUrl: r.post_image_url || null,
      actor: {
        id: r.actor_id,
        username: r.actor_username,
        displayName: r.actor_display_name,
        avatarUrl: r.actor_avatar_url || '',
        isVerified: Boolean(r.actor_is_verified),
      },
    }));

    return res.json({ notifications });
  } catch (err: any) {
    console.error('[NOTIFICATIONS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch notifications.' });
  }
});

// GET UNREAD COUNT
notificationsRouter.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    const notifRes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ? AND is_read = 0`,
      args: [currentUserId],
    });

    const msgRes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM messages WHERE recipient_id = ? AND is_read = 0`,
      args: [currentUserId],
    });

    return res.json({
      notificationsCount: Number(notifRes.rows[0]?.count) || 0,
      messagesCount: Number(msgRes.rows[0]?.count) || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to get counts.' });
  }
});

// MARK SINGLE NOTIFICATION READ
notificationsRouter.post('/read/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const notifId = req.params.id;

    await db.execute({
      sql: `UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?`,
      args: [notifId, currentUserId],
    });

    return res.json({ message: 'Notification marked as read.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update notification.' });
  }
});

// MARK ALL READ
notificationsRouter.post('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    await db.execute({
      sql: `UPDATE notifications SET is_read = 1 WHERE recipient_id = ?`,
      args: [currentUserId],
    });

    return res.json({ message: 'All notifications marked as read.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to mark notifications read.' });
  }
});
