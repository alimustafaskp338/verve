import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth } from '../auth';

export const socialRouter = Router();

// FOLLOW / REQUEST FOLLOW
socialRouter.post('/follow/:targetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const targetId = req.params.targetId;

    if (currentUserId === targetId) {
      return res.status(400).json({ error: 'SelfAction', message: 'You cannot follow yourself.' });
    }

    // Check if target user exists
    const targetRes = await db.execute({
      sql: `SELECT id, username, is_private FROM users WHERE id = ? AND deactivated_at IS NULL`,
      args: [targetId],
    });

    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found.' });
    }

    const targetUser = targetRes.rows[0];

    // Check blocks
    const blockRes = await db.execute({
      sql: `
        SELECT id FROM blocks
        WHERE (blocker_id = ? AND blocked_id = ?)
           OR (blocker_id = ? AND blocked_id = ?)
      `,
      args: [currentUserId, targetId, targetId, currentUserId],
    });

    if (blockRes.rows.length > 0) {
      return res.status(403).json({ error: 'Blocked', message: 'Unable to follow this account.' });
    }

    // Check existing follow
    const existingFollow = await db.execute({
      sql: `SELECT id, status FROM follows WHERE follower_id = ? AND following_id = ?`,
      args: [currentUserId, targetId],
    });

    if (existingFollow.rows.length > 0) {
      return res.json({
        message: 'Already requested or following.',
        status: existingFollow.rows[0].status,
      });
    }

    const isPrivate = Boolean(targetUser.is_private);
    const newStatus = isPrivate ? 'pending' : 'accepted';
    const followId = crypto.randomUUID();

    await db.execute({
      sql: `
        INSERT INTO follows (id, follower_id, following_id, status, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `,
      args: [followId, currentUserId, targetId, newStatus],
    });

    // Notify target user
    const notifType = isPrivate ? 'follow_request' : 'follow';
    await db.execute({
      sql: `
        INSERT INTO notifications (id, recipient_id, actor_id, type, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `,
      args: [crypto.randomUUID(), targetId, currentUserId, notifType],
    });

    return res.json({
      message: isPrivate ? 'Follow request sent.' : 'Now following user.',
      status: newStatus,
    });
  } catch (err: any) {
    console.error('[FOLLOW ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to follow user.' });
  }
});

// UNFOLLOW OR CANCEL REQUEST
socialRouter.post('/unfollow/:targetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const targetId = req.params.targetId;

    await db.execute({
      sql: `DELETE FROM follows WHERE follower_id = ? AND following_id = ?`,
      args: [currentUserId, targetId],
    });

    // Clean up unread follow / follow_request notification
    await db.execute({
      sql: `
        DELETE FROM notifications
        WHERE recipient_id = ? AND actor_id = ? AND type IN ('follow', 'follow_request')
      `,
      args: [targetId, currentUserId],
    });

    return res.json({ message: 'Unfollowed successfully.', status: 'none' });
  } catch (err: any) {
    console.error('[UNFOLLOW ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to unfollow.' });
  }
});

// GET PENDING FOLLOW REQUESTS
socialRouter.get('/requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    const requestsRes = await db.execute({
      sql: `
        SELECT f.id, f.follower_id, f.created_at,
               u.username, u.display_name, u.avatar_url, u.is_verified
        FROM follows f
        JOIN users u ON f.follower_id = u.id
        WHERE f.following_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `,
      args: [currentUserId],
    });

    const requests = requestsRes.rows.map((row) => ({
      id: row.id,
      followerId: row.follower_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || '',
      isVerified: Boolean(row.is_verified),
      createdAt: row.created_at,
    }));

    return res.json({ requests });
  } catch (err: any) {
    console.error('[GET REQUESTS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch requests.' });
  }
});

// APPROVE FOLLOW REQUEST
socialRouter.post('/requests/:requestId/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const requestId = req.params.requestId;

    const followRes = await db.execute({
      sql: `SELECT id, follower_id FROM follows WHERE id = ? AND following_id = ? AND status = 'pending'`,
      args: [requestId, currentUserId],
    });

    if (followRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Follow request not found.' });
    }

    const followerId = followRes.rows[0].follower_id as string;

    await db.execute({
      sql: `UPDATE follows SET status = 'accepted' WHERE id = ?`,
      args: [requestId],
    });

    // Notify follower that their request was accepted
    await db.execute({
      sql: `
        INSERT INTO notifications (id, recipient_id, actor_id, type, created_at)
        VALUES (?, ?, ?, 'follow_accept', datetime('now'))
      `,
      args: [crypto.randomUUID(), followerId, currentUserId],
    });

    return res.json({ message: 'Follow request approved.' });
  } catch (err: any) {
    console.error('[APPROVE REQUEST ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to approve request.' });
  }
});

// REJECT FOLLOW REQUEST
socialRouter.post('/requests/:requestId/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const requestId = req.params.requestId;

    await db.execute({
      sql: `DELETE FROM follows WHERE id = ? AND following_id = ? AND status = 'pending'`,
      args: [requestId, currentUserId],
    });

    return res.json({ message: 'Follow request rejected.' });
  } catch (err: any) {
    console.error('[REJECT REQUEST ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to reject request.' });
  }
});

// GET FOLLOWERS
socialRouter.get('/:userId/followers', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const followersRes = await db.execute({
      sql: `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.is_verified, f.created_at
        FROM follows f
        JOIN users u ON f.follower_id = u.id
        WHERE f.following_id = ? AND f.status = 'accepted'
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [userId, limit, offset],
    });

    const followers = followersRes.rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || '',
      bio: r.bio || '',
      isVerified: Boolean(r.is_verified),
    }));

    return res.json({ followers });
  } catch (err: any) {
    console.error('[GET FOLLOWERS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load followers.' });
  }
});

// GET FOLLOWING
socialRouter.get('/:userId/following', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const followingRes = await db.execute({
      sql: `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.is_verified, f.created_at
        FROM follows f
        JOIN users u ON f.following_id = u.id
        WHERE f.follower_id = ? AND f.status = 'accepted'
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [userId, limit, offset],
    });

    const following = followingRes.rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || '',
      bio: r.bio || '',
      isVerified: Boolean(r.is_verified),
    }));

    return res.json({ following });
  } catch (err: any) {
    console.error('[GET FOLLOWING ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load following list.' });
  }
});

// BLOCK USER
socialRouter.post('/block/:targetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const targetId = req.params.targetId;

    if (currentUserId === targetId) {
      return res.status(400).json({ error: 'SelfAction', message: 'You cannot block yourself.' });
    }

    const blockId = crypto.randomUUID();
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `,
      args: [blockId, currentUserId, targetId],
    });

    // Remove any follows in both directions
    await db.execute({
      sql: `
        DELETE FROM follows
        WHERE (follower_id = ? AND following_id = ?)
           OR (follower_id = ? AND following_id = ?)
      `,
      args: [currentUserId, targetId, targetId, currentUserId],
    });

    return res.json({ message: 'User blocked.' });
  } catch (err: any) {
    console.error('[BLOCK ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to block user.' });
  }
});

// UNBLOCK USER
socialRouter.post('/unblock/:targetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const targetId = req.params.targetId;

    await db.execute({
      sql: `DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`,
      args: [currentUserId, targetId],
    });

    return res.json({ message: 'User unblocked.' });
  } catch (err: any) {
    console.error('[UNBLOCK ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to unblock user.' });
  }
});

// GET BLOCKED USERS
socialRouter.get('/blocked', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    const blockedRes = await db.execute({
      sql: `
        SELECT b.id, b.blocked_id, b.created_at, u.username, u.display_name, u.avatar_url
        FROM blocks b
        JOIN users u ON b.blocked_id = u.id
        WHERE b.blocker_id = ?
        ORDER BY b.created_at DESC
      `,
      args: [currentUserId],
    });

    const blocked = blockedRes.rows.map((r) => ({
      id: r.id,
      userId: r.blocked_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || '',
      createdAt: r.created_at,
    }));

    return res.json({ blocked });
  } catch (err: any) {
    console.error('[GET BLOCKED ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch blocked users.' });
  }
});
