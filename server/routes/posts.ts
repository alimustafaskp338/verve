import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireVerified } from '../auth';
import { uploadMiddleware, validateAndProcessImage, deleteFileSafely } from '../storage';

export const postsRouter = Router();

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((tag) => tag.substring(1).toLowerCase())));
}

// CREATE POST
postsRouter.post(
  '/',
  requireAuth,
  requireVerified,
  uploadMiddleware.single('image'),
  async (req: Request, res: Response) => {
    try {
      const currentUserId = req.user!.id;
      let imageUrl = '';
      let width = 1080;
      let height = 1080;

      if (req.file) {
        const validated = validateAndProcessImage(req.file);
        imageUrl = validated.url;
        width = validated.width;
        height = validated.height;
      } else if (req.body.imageUrl) {
        imageUrl = req.body.imageUrl;
      } else {
        return res.status(400).json({ error: 'NoImage', message: 'An image is required to create a post.' });
      }

      const caption = (req.body.caption || '').trim().slice(0, 2200);
      const location = (req.body.location || '').trim().slice(0, 100);
      const altText = (req.body.altText || '').trim().slice(0, 300);

      const postId = crypto.randomUUID();

      await db.execute({
        sql: `
          INSERT INTO posts (id, user_id, image_url, thumbnail_url, caption, location, alt_text, width, height, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
        args: [postId, currentUserId, imageUrl, imageUrl, caption, location, altText, width, height],
      });

      // Insert hashtags
      const tags = extractHashtags(caption);
      for (const tag of tags) {
        await db.execute({
          sql: `
            INSERT OR IGNORE INTO post_tags (id, post_id, tag, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `,
          args: [crypto.randomUUID(), postId, tag],
        });
      }

      return res.status(201).json({
        message: 'Post created successfully.',
        post: {
          id: postId,
          userId: currentUserId,
          imageUrl,
          caption,
          location,
          altText,
          width,
          height,
          createdAt: new Date().toISOString(),
          likesCount: 0,
          commentsCount: 0,
          isLiked: false,
          isSaved: false,
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
      console.error('[CREATE POST ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: err.message || 'Failed to create post.' });
    }
  }
);

// HOME FEED (FOLLOWED USERS + OWN POSTS)
postsRouter.get('/feed', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const limit = Math.min(parseInt((req.query.limit as string) || '15', 10), 30);
    const cursor = (req.query.cursor as string) || '';

    let cursorClause = '';
    const args: any[] = [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId];

    if (cursor) {
      cursorClause = 'AND p.created_at < ?';
      args.push(cursor);
    }
    args.push(limit + 1);

    const feedRes = await db.execute({
      sql: `
        SELECT p.id, p.user_id, p.image_url, p.thumbnail_url, p.caption, p.location, p.alt_text,
               p.width, p.height, p.created_at,
               u.username, u.display_name, u.avatar_url, u.is_verified,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
               (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as is_liked,
               (SELECT COUNT(*) FROM saved_posts WHERE post_id = p.id AND user_id = ?) as is_saved
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE (
          p.user_id = ?
          OR p.user_id IN (
            SELECT following_id FROM follows WHERE follower_id = ? AND status = 'accepted'
          )
        )
        AND p.user_id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = ?
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = ?
        )
        AND u.deactivated_at IS NULL
        ${cursorClause}
        ORDER BY p.created_at DESC
        LIMIT ?
      `,
      args: [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, ...(cursor ? [cursor] : []), limit + 1],
    });

    const hasMore = feedRes.rows.length > limit;
    const items = hasMore ? feedRes.rows.slice(0, limit) : feedRes.rows;
    const nextCursor = items.length > 0 ? (items[items.length - 1].created_at as string) : null;

    const posts = items.map((row) => ({
      id: row.id,
      userId: row.user_id,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url || row.image_url,
      caption: row.caption || '',
      location: row.location || '',
      altText: row.alt_text || '',
      width: row.width || 1080,
      height: row.height || 1080,
      createdAt: row.created_at,
      likesCount: Number(row.likes_count) || 0,
      commentsCount: Number(row.comments_count) || 0,
      isLiked: Number(row.is_liked) > 0,
      isSaved: Number(row.is_saved) > 0,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url || '',
        isVerified: Boolean(row.is_verified),
      },
    }));

    return res.json({ posts, nextCursor, hasMore });
  } catch (err: any) {
    console.error('[FEED ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load home feed.' });
  }
});

// EXPLORE / DISCOVERY FEED (PUBLIC POSTS)
postsRouter.get('/explore', async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user?.id || '';
    const tag = (req.query.tag as string || '').toLowerCase().replace('#', '').trim();
    const limit = Math.min(parseInt((req.query.limit as string) || '24', 10), 50);
    const cursor = (req.query.cursor as string) || '';

    let tagJoin = '';
    let tagWhere = '';
    if (tag) {
      tagJoin = 'JOIN post_tags pt ON pt.post_id = p.id';
      tagWhere = 'AND pt.tag = ?';
    }

    let cursorClause = '';
    if (cursor) {
      cursorClause = 'AND p.created_at < ?';
    }

    const args: any[] = [currentUserId, currentUserId];
    if (tag) args.push(tag);
    args.push(currentUserId, currentUserId);
    if (cursor) args.push(cursor);
    args.push(limit + 1);

    const exploreRes = await db.execute({
      sql: `
        SELECT p.id, p.user_id, p.image_url, p.thumbnail_url, p.caption, p.location, p.alt_text,
               p.width, p.height, p.created_at,
               u.username, u.display_name, u.avatar_url, u.is_verified,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
               (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as is_liked,
               (SELECT COUNT(*) FROM saved_posts WHERE post_id = p.id AND user_id = ?) as is_saved
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ${tagJoin}
        WHERE u.is_private = 0
          AND u.deactivated_at IS NULL
          ${tagWhere}
          AND p.user_id NOT IN (
            SELECT blocked_id FROM blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM blocks WHERE blocked_id = ?
          )
          ${cursorClause}
        ORDER BY p.created_at DESC
        LIMIT ?
      `,
      args,
    });

    const hasMore = exploreRes.rows.length > limit;
    const items = hasMore ? exploreRes.rows.slice(0, limit) : exploreRes.rows;
    const nextCursor = items.length > 0 ? (items[items.length - 1].created_at as string) : null;

    const posts = items.map((row) => ({
      id: row.id,
      userId: row.user_id,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url || row.image_url,
      caption: row.caption || '',
      location: row.location || '',
      altText: row.alt_text || '',
      width: row.width || 1080,
      height: row.height || 1080,
      createdAt: row.created_at,
      likesCount: Number(row.likes_count) || 0,
      commentsCount: Number(row.comments_count) || 0,
      isLiked: Number(row.is_liked) > 0,
      isSaved: Number(row.is_saved) > 0,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url || '',
        isVerified: Boolean(row.is_verified),
      },
    }));

    return res.json({ posts, nextCursor, hasMore });
  } catch (err: any) {
    console.error('[EXPLORE ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load explore feed.' });
  }
});

// GET POST BY ID
postsRouter.get('/:postId', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId;
    const currentUserId = req.user?.id || '';

    const postRes = await db.execute({
      sql: `
        SELECT p.id, p.user_id, p.image_url, p.thumbnail_url, p.caption, p.location, p.alt_text,
               p.width, p.height, p.created_at,
               u.username, u.display_name, u.avatar_url, u.is_verified, u.is_private,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
               (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as is_liked,
               (SELECT COUNT(*) FROM saved_posts WHERE post_id = p.id AND user_id = ?) as is_saved
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ? AND u.deactivated_at IS NULL
      `,
      args: [currentUserId, currentUserId, postId],
    });

    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Post not found.' });
    }

    const row = postRes.rows[0];
    const authorId = row.user_id as string;
    const isPrivate = Boolean(row.is_private);
    const isSelf = currentUserId === authorId;

    // Check privacy
    if (isPrivate && !isSelf) {
      const followRes = await db.execute({
        sql: `SELECT status FROM follows WHERE follower_id = ? AND following_id = ? AND status = 'accepted'`,
        args: [currentUserId, authorId],
      });
      if (followRes.rows.length === 0) {
        return res.status(403).json({ error: 'PrivateAccount', message: 'This post is from a private account.' });
      }
    }

    return res.json({
      post: {
        id: row.id,
        userId: row.user_id,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url || row.image_url,
        caption: row.caption || '',
        location: row.location || '',
        altText: row.alt_text || '',
        width: row.width || 1080,
        height: row.height || 1080,
        createdAt: row.created_at,
        likesCount: Number(row.likes_count) || 0,
        commentsCount: Number(row.comments_count) || 0,
        isLiked: Number(row.is_liked) > 0,
        isSaved: Number(row.is_saved) > 0,
        user: {
          id: row.user_id,
          username: row.username,
          displayName: row.display_name,
          avatarUrl: row.avatar_url || '',
          isVerified: Boolean(row.is_verified),
        },
      },
    });
  } catch (err: any) {
    console.error('[GET POST ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch post.' });
  }
});

// USER'S POSTS GRID
postsRouter.get('/user/:username', async (req: Request, res: Response) => {
  try {
    const targetUsername = req.params.username.toLowerCase().trim();
    const currentUserId = req.user?.id || '';
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 60);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const userRes = await db.execute({
      sql: `SELECT id, is_private FROM users WHERE username = ? AND deactivated_at IS NULL`,
      args: [targetUsername],
    });

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found.' });
    }

    const targetUser = userRes.rows[0];
    const targetId = targetUser.id as string;
    const isPrivate = Boolean(targetUser.is_private);
    const isSelf = currentUserId === targetId;

    if (isPrivate && !isSelf) {
      const followRes = await db.execute({
        sql: `SELECT status FROM follows WHERE follower_id = ? AND following_id = ? AND status = 'accepted'`,
        args: [currentUserId, targetId],
      });
      if (followRes.rows.length === 0) {
        return res.status(403).json({
          error: 'PrivateAccount',
          message: 'This account is private. Follow to view their posts.',
          posts: [],
        });
      }
    }

    const postsRes = await db.execute({
      sql: `
        SELECT p.id, p.user_id, p.image_url, p.thumbnail_url, p.caption, p.created_at,
               (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
               (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
        FROM posts p
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [targetId, limit, offset],
    });

    const posts = postsRes.rows.map((row) => ({
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
    console.error('[USER POSTS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch user posts.' });
  }
});

// EDIT POST (AUTHOR ONLY)
postsRouter.patch('/:postId', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId;
    const currentUserId = req.user!.id;

    const postRes = await db.execute({
      sql: `SELECT id, user_id FROM posts WHERE id = ?`,
      args: [postId],
    });

    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Post not found.' });
    }

    if (postRes.rows[0].user_id !== currentUserId) {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only edit your own posts.' });
    }

    const caption = req.body.caption !== undefined ? req.body.caption.trim().slice(0, 2200) : undefined;
    const location = req.body.location !== undefined ? req.body.location.trim().slice(0, 100) : undefined;
    const altText = req.body.altText !== undefined ? req.body.altText.trim().slice(0, 300) : undefined;

    const updates: string[] = ["updated_at = datetime('now')"];
    const args: any[] = [];

    if (caption !== undefined) {
      updates.push('caption = ?');
      args.push(caption);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      args.push(location);
    }
    if (altText !== undefined) {
      updates.push('alt_text = ?');
      args.push(altText);
    }

    args.push(postId);

    await db.execute({
      sql: `UPDATE posts SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    // Update tags if caption changed
    if (caption !== undefined) {
      await db.execute({
        sql: `DELETE FROM post_tags WHERE post_id = ?`,
        args: [postId],
      });
      const tags = extractHashtags(caption);
      for (const tag of tags) {
        await db.execute({
          sql: `
            INSERT OR IGNORE INTO post_tags (id, post_id, tag, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `,
          args: [crypto.randomUUID(), postId, tag],
        });
      }
    }

    return res.json({ message: 'Post updated successfully.' });
  } catch (err: any) {
    console.error('[EDIT POST ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update post.' });
  }
});

// DELETE POST (AUTHOR ONLY)
postsRouter.delete('/:postId', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId;
    const currentUserId = req.user!.id;

    const postRes = await db.execute({
      sql: `SELECT id, user_id, image_url FROM posts WHERE id = ?`,
      args: [postId],
    });

    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Post not found.' });
    }

    const post = postRes.rows[0];
    if (post.user_id !== currentUserId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only delete your own posts.' });
    }

    // Delete post record from database (cascades to likes, comments, saved_posts, post_tags)
    await db.execute({
      sql: `DELETE FROM posts WHERE id = ?`,
      args: [postId],
    });

    // Clean up uploaded image if local
    if (post.image_url && (post.image_url as string).startsWith('/uploads/')) {
      deleteFileSafely(post.image_url as string);
    }

    return res.json({ message: 'Post deleted successfully.' });
  } catch (err: any) {
    console.error('[DELETE POST ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to delete post.' });
  }
});
