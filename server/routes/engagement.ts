import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireVerified } from '../auth';

export const engagementRouter = Router();

// TOGGLE LIKE
engagementRouter.post('/like/:postId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const postId = req.params.postId;

    // Check post existence and owner
    const postRes = await db.execute({
      sql: `SELECT id, user_id FROM posts WHERE id = ?`,
      args: [postId],
    });

    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Post not found.' });
    }

    const postOwnerId = postRes.rows[0].user_id as string;

    // Check if already liked
    const existingRes = await db.execute({
      sql: `SELECT id FROM likes WHERE post_id = ? AND user_id = ?`,
      args: [postId, currentUserId],
    });

    let isLiked = false;
    if (existingRes.rows.length > 0) {
      // Unlike
      await db.execute({
        sql: `DELETE FROM likes WHERE post_id = ? AND user_id = ?`,
        args: [postId, currentUserId],
      });
      // Remove unread like notification
      await db.execute({
        sql: `DELETE FROM notifications WHERE recipient_id = ? AND actor_id = ? AND post_id = ? AND type = 'like'`,
        args: [postOwnerId, currentUserId, postId],
      });
      isLiked = false;
    } else {
      // Like
      await db.execute({
        sql: `
          INSERT OR IGNORE INTO likes (id, post_id, user_id, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `,
        args: [crypto.randomUUID(), postId, currentUserId],
      });
      isLiked = true;

      // Notify post author if not liking own post
      if (postOwnerId !== currentUserId) {
        await db.execute({
          sql: `
            INSERT INTO notifications (id, recipient_id, actor_id, type, post_id, created_at)
            VALUES (?, ?, ?, 'like', ?, datetime('now'))
          `,
          args: [crypto.randomUUID(), postOwnerId, currentUserId, postId],
        });
      }
    }

    const countRes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM likes WHERE post_id = ?`,
      args: [postId],
    });

    return res.json({
      isLiked,
      likesCount: Number(countRes.rows[0]?.count) || 0,
    });
  } catch (err: any) {
    console.error('[LIKE ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update like status.' });
  }
});

// GET COMMENTS
engagementRouter.get('/comments/:postId', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId;
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

    const commentsRes = await db.execute({
      sql: `
        SELECT c.id, c.post_id, c.user_id, c.content, c.created_at,
               u.username, u.display_name, u.avatar_url, u.is_verified
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ? AND u.deactivated_at IS NULL
        ORDER BY c.created_at ASC
        LIMIT ?
      `,
      args: [postId, limit],
    });

    const comments = commentsRes.rows.map((row) => ({
      id: row.id,
      postId: row.post_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url || '',
        isVerified: Boolean(row.is_verified),
      },
    }));

    return res.json({ comments });
  } catch (err: any) {
    console.error('[GET COMMENTS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch comments.' });
  }
});

// ADD COMMENT
engagementRouter.post(
  '/comments/:postId',
  requireAuth,
  requireVerified,
  async (req: Request, res: Response) => {
    try {
      const currentUserId = req.user!.id;
      const postId = req.params.postId;
      const content = (req.body.content || '').trim().slice(0, 1000);

      if (!content) {
        return res.status(400).json({ error: 'EmptyComment', message: 'Comment content cannot be empty.' });
      }

      const postRes = await db.execute({
        sql: `SELECT id, user_id FROM posts WHERE id = ?`,
        args: [postId],
      });

      if (postRes.rows.length === 0) {
        return res.status(404).json({ error: 'NotFound', message: 'Post not found.' });
      }

      const postOwnerId = postRes.rows[0].user_id as string;
      const commentId = crypto.randomUUID();

      await db.execute({
        sql: `
          INSERT INTO comments (id, post_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `,
        args: [commentId, postId, currentUserId, content],
      });

      // Notify post owner if not self-comment
      if (postOwnerId !== currentUserId) {
        await db.execute({
          sql: `
            INSERT INTO notifications (id, recipient_id, actor_id, type, post_id, comment_id, created_at)
            VALUES (?, ?, ?, 'comment', ?, ?, datetime('now'))
          `,
          args: [crypto.randomUUID(), postOwnerId, currentUserId, postId, commentId],
        });
      }

      return res.status(201).json({
        message: 'Comment added.',
        comment: {
          id: commentId,
          postId,
          userId: currentUserId,
          content,
          createdAt: new Date().toISOString(),
          user: {
            id: req.user!.id,
            username: req.user!.username,
            displayName: req.user!.display_name,
            avatarUrl: req.user!.avatar_url,
            isVerified: Boolean(req.user!.is_verified),
          },
        },
      });
    } catch (err: any) {
      console.error('[ADD COMMENT ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Failed to post comment.' });
    }
  }
);

// DELETE COMMENT (AUTHOR OF COMMENT OR POST OWNER)
engagementRouter.delete('/comments/:commentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const commentId = req.params.commentId;

    const commentRes = await db.execute({
      sql: `
        SELECT c.id, c.user_id as comment_author_id, p.user_id as post_owner_id
        FROM comments c
        JOIN posts p ON c.post_id = p.id
        WHERE c.id = ?
      `,
      args: [commentId],
    });

    if (commentRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Comment not found.' });
    }

    const { comment_author_id, post_owner_id } = commentRes.rows[0];

    // Permitted if comment author, post owner, or admin
    if (
      comment_author_id !== currentUserId &&
      post_owner_id !== currentUserId &&
      req.user!.role !== 'admin'
    ) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to delete this comment.' });
    }

    await db.execute({
      sql: `DELETE FROM comments WHERE id = ?`,
      args: [commentId],
    });

    return res.json({ message: 'Comment deleted successfully.' });
  } catch (err: any) {
    console.error('[DELETE COMMENT ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to delete comment.' });
  }
});

// TOGGLE SAVE POST (PRIVATE BOOKMARK)
engagementRouter.post('/save/:postId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const postId = req.params.postId;

    const existingRes = await db.execute({
      sql: `SELECT id FROM saved_posts WHERE post_id = ? AND user_id = ?`,
      args: [postId, currentUserId],
    });

    let isSaved = false;
    if (existingRes.rows.length > 0) {
      await db.execute({
        sql: `DELETE FROM saved_posts WHERE post_id = ? AND user_id = ?`,
        args: [postId, currentUserId],
      });
      isSaved = false;
    } else {
      await db.execute({
        sql: `
          INSERT OR IGNORE INTO saved_posts (id, post_id, user_id, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `,
        args: [crypto.randomUUID(), postId, currentUserId],
      });
      isSaved = true;
    }

    return res.json({ isSaved, message: isSaved ? 'Post saved to your collection.' : 'Post removed from saved.' });
  } catch (err: any) {
    console.error('[SAVE POST ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update saved status.' });
  }
});

// GET CURRENT USER'S SAVED POSTS
engagementRouter.get('/saved', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 60);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const savedRes = await db.execute({
      sql: `
        SELECT p.id, p.user_id, p.image_url, p.thumbnail_url, p.caption, p.created_at,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
               (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
        FROM saved_posts sp
        JOIN posts p ON sp.post_id = p.id
        WHERE sp.user_id = ?
        ORDER BY sp.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [currentUserId, limit, offset],
    });

    const posts = savedRes.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url || row.image_url,
      caption: row.caption || '',
      createdAt: row.created_at,
      likesCount: Number(row.likes_count) || 0,
      commentsCount: Number(row.comments_count) || 0,
    }));

    return res.json({ posts });
  } catch (err: any) {
    console.error('[GET SAVED ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch saved posts.' });
  }
});
