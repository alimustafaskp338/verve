import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../auth';
import { uploadMiddleware, validateAndProcessImage } from '../storage';

export const usersRouter = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(200).optional(),
  website: z.string().max(100).optional(),
  isPrivate: z.boolean().optional(),
});

// GET PROFILE BY USERNAME
usersRouter.get('/profile/:username', async (req: Request, res: Response) => {
  try {
    const targetUsername = req.params.username.toLowerCase().trim();
    const currentUserId = req.user?.id;

    const userRes = await db.execute({
      sql: `
        SELECT id, username, display_name, avatar_url, bio, website, is_private, is_verified, created_at
        FROM users
        WHERE username = ? AND deactivated_at IS NULL
      `,
      args: [targetUsername],
    });

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found.' });
    }

    const targetUser = userRes.rows[0];
    const targetId = targetUser.id as string;

    // Check blocks in either direction
    if (currentUserId) {
      const blockRes = await db.execute({
        sql: `
          SELECT blocker_id FROM blocks
          WHERE (blocker_id = ? AND blocked_id = ?)
             OR (blocker_id = ? AND blocked_id = ?)
        `,
        args: [currentUserId, targetId, targetId, currentUserId],
      });

      if (blockRes.rows.length > 0) {
        const isBlockedByTarget = blockRes.rows.some((r) => r.blocker_id === targetId);
        const hasBlockedTarget = blockRes.rows.some((r) => r.blocker_id === currentUserId);
        return res.json({
          profile: {
            id: targetId,
            username: targetUser.username,
            displayName: targetUser.display_name,
            avatarUrl: targetUser.avatar_url,
            isBlocked: true,
            isBlockedByTarget,
            hasBlockedTarget,
          },
          accessible: false,
          isSelf: false,
        });
      }
    }

    // Counts: posts, followers, following
    const [postsRes, followersRes, followingRes] = await Promise.all([
      db.execute({
        sql: `SELECT COUNT(*) as c FROM posts WHERE user_id = ?`,
        args: [targetId],
      }),
      db.execute({
        sql: `SELECT COUNT(*) as c FROM follows WHERE following_id = ? AND status = 'accepted'`,
        args: [targetId],
      }),
      db.execute({
        sql: `SELECT COUNT(*) as c FROM follows WHERE follower_id = ? AND status = 'accepted'`,
        args: [targetId],
      }),
    ]);

    const postsCount = Number(postsRes.rows[0]?.c) || 0;
    const followersCount = Number(followersRes.rows[0]?.c) || 0;
    const followingCount = Number(followingRes.rows[0]?.c) || 0;

    // Follow status
    let followStatus: 'none' | 'pending' | 'accepted' = 'none';
    const isSelf = currentUserId === targetId;

    if (currentUserId && !isSelf) {
      const followRes = await db.execute({
        sql: `SELECT status FROM follows WHERE follower_id = ? AND following_id = ?`,
        args: [currentUserId, targetId],
      });
      if (followRes.rows.length > 0) {
        followStatus = followRes.rows[0].status as any;
      }
    }

    const isPrivate = Boolean(targetUser.is_private);
    // Can view posts if public, or isSelf, or followStatus is 'accepted'
    const accessible = !isPrivate || isSelf || followStatus === 'accepted';

    return res.json({
      profile: {
        id: targetId,
        username: targetUser.username,
        displayName: targetUser.display_name,
        avatarUrl: targetUser.avatar_url || '',
        bio: targetUser.bio || '',
        website: targetUser.website || '',
        isPrivate,
        isVerified: Boolean(targetUser.is_verified),
        createdAt: targetUser.created_at,
        postsCount,
        followersCount,
        followingCount,
        followStatus,
      },
      accessible,
      isSelf,
    });
  } catch (err: any) {
    console.error('[PROFILE ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch user profile.' });
  }
});

// UPDATE PROFILE
usersRouter.patch('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', message: parsed.error.issues[0]?.message });
    }

    const { displayName, bio, website, isPrivate } = parsed.data;
    const updates: string[] = [];
    const args: any[] = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      args.push(displayName);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      args.push(bio);
    }
    if (website !== undefined) {
      updates.push('website = ?');
      args.push(website);
    }
    if (isPrivate !== undefined) {
      updates.push('is_private = ?');
      args.push(isPrivate ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.json({ message: 'No changes provided.' });
    }

    updates.push("updated_at = datetime('now')");
    args.push(req.user!.id);

    await db.execute({
      sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    const updatedUserRes = await db.execute({
      sql: `SELECT id, email, username, display_name, avatar_url, bio, website, is_private, is_verified FROM users WHERE id = ?`,
      args: [req.user!.id],
    });

    const u = updatedUserRes.rows[0];
    return res.json({
      message: 'Profile updated successfully.',
      user: {
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url || '',
        bio: u.bio || '',
        website: u.website || '',
        isPrivate: Boolean(u.is_private),
        isVerified: Boolean(u.is_verified),
      },
    });
  } catch (err: any) {
    console.error('[UPDATE PROFILE ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update profile.' });
  }
});

// UPLOAD AVATAR
usersRouter.post('/avatar', requireAuth, uploadMiddleware.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'NoFile', message: 'Please select an image file to upload.' });
    }

    const validated = validateAndProcessImage(req.file);

    await db.execute({
      sql: `UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [validated.url, req.user!.id],
    });

    return res.json({
      message: 'Avatar updated successfully.',
      avatarUrl: validated.url,
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'UploadError', message: err.message || 'Avatar upload failed.' });
  }
});

// SEARCH USERS
usersRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim().toLowerCase();
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);
    const currentUserId = req.user?.id || '';

    if (!q) {
      return res.json({ users: [] });
    }

    const searchRes = await db.execute({
      sql: `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified, u.bio
        FROM users u
        WHERE (LOWER(u.username) LIKE ? OR LOWER(u.display_name) LIKE ?)
          AND u.deactivated_at IS NULL
          AND u.id NOT IN (
            SELECT blocked_id FROM blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM blocks WHERE blocked_id = ?
          )
        ORDER BY
          CASE WHEN LOWER(u.username) = ? THEN 1
               WHEN LOWER(u.username) LIKE ? THEN 2
               ELSE 3 END,
          u.username ASC
        LIMIT ?
      `,
      args: [`%${q}%`, `%${q}%`, currentUserId, currentUserId, q, `${q}%`, limit],
    });

    const users = searchRes.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || '',
      isVerified: Boolean(row.is_verified),
      bio: row.bio || '',
    }));

    return res.json({ users });
  } catch (err: any) {
    console.error('[SEARCH USERS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to perform user search.' });
  }
});
