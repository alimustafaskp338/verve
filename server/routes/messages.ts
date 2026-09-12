import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth, requireVerified, rateLimiter } from '../auth';

export const messagesRouter = Router();

// Helper to get or create conversation between two users
async function getOrCreateConversation(userAId: string, userBId: string): Promise<string> {
  // Canonical order to enforce unique compound constraint
  const [user1Id, user2Id] = [userAId, userBId].sort();

  const convRes = await db.execute({
    sql: `SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?`,
    args: [user1Id, user2Id],
  });

  if (convRes.rows.length > 0) {
    return convRes.rows[0].id as string;
  }

  const convId = crypto.randomUUID();
  await db.execute({
    sql: `
      INSERT INTO conversations (id, user1_id, user2_id, last_message_at, created_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `,
    args: [convId, user1Id, user2Id],
  });

  return convId;
}

// GET ALL CONVERSATIONS FOR CURRENT USER
messagesRouter.get('/conversations', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    const convRes = await db.execute({
      sql: `
        SELECT c.id, c.last_message_at, c.created_at,
               CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
               u.username, u.display_name, u.avatar_url, u.is_verified,
               (
                 SELECT m.content FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC LIMIT 1
               ) as last_message,
               (
                 SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id AND m.recipient_id = ? AND m.is_read = 0
               ) as unread_count
        FROM conversations c
        JOIN users u ON u.id = (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END)
        WHERE (c.user1_id = ? OR c.user2_id = ?)
          AND u.deactivated_at IS NULL
          AND u.id NOT IN (
            SELECT blocked_id FROM blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM blocks WHERE blocked_id = ?
          )
        ORDER BY c.last_message_at DESC
      `,
      args: [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId],
    });

    const conversations = convRes.rows.map((r) => ({
      id: r.id,
      lastMessageAt: r.last_message_at,
      lastMessage: r.last_message || '',
      unreadCount: Number(r.unread_count) || 0,
      otherUser: {
        id: r.other_user_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url || '',
        isVerified: Boolean(r.is_verified),
      },
    }));

    return res.json({ conversations });
  } catch (err: any) {
    console.error('[CONVERSATIONS ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to load conversations.' });
  }
});

// GET MESSAGES IN CONVERSATION
messagesRouter.get('/conversations/:conversationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const conversationId = req.params.conversationId;
    const limit = Math.min(parseInt((req.query.limit as string) || '40', 10), 80);
    const before = (req.query.before as string) || '';

    // Verify user is a participant
    const convRes = await db.execute({
      sql: `SELECT user1_id, user2_id FROM conversations WHERE id = ?`,
      args: [conversationId],
    });

    if (convRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Conversation not found.' });
    }

    const { user1_id, user2_id } = convRes.rows[0];
    if (user1_id !== currentUserId && user2_id !== currentUserId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized for this conversation.' });
    }

    const otherUserId = user1_id === currentUserId ? user2_id : user1_id;

    // Check blocks
    const blockRes = await db.execute({
      sql: `
        SELECT id FROM blocks
        WHERE (blocker_id = ? AND blocked_id = ?)
           OR (blocker_id = ? AND blocked_id = ?)
      `,
      args: [currentUserId, otherUserId, otherUserId, currentUserId],
    });

    const isBlocked = blockRes.rows.length > 0;

    let cursorClause = '';
    const args: any[] = [conversationId];
    if (before) {
      cursorClause = 'AND created_at < ?';
      args.push(before);
    }
    args.push(limit);

    const msgRes = await db.execute({
      sql: `
        SELECT id, sender_id, recipient_id, content, is_read, created_at
        FROM messages
        WHERE conversation_id = ?
          ${cursorClause}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args,
    });

    // Mark messages sent to current user as read
    await db.execute({
      sql: `UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND recipient_id = ?`,
      args: [conversationId, currentUserId],
    });

    // Return in ascending chronological order for UI display
    const messages = msgRes.rows.reverse().map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      recipientId: r.recipient_id,
      content: r.content,
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
    }));

    return res.json({ messages, isBlocked });
  } catch (err: any) {
    console.error('[GET MESSAGES ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to fetch messages.' });
  }
});

// SEND MESSAGE
messagesRouter.post(
  '/send',
  requireAuth,
  requireVerified,
  rateLimiter('send-msg', 30, 60 * 1000), // 30 per minute
  async (req: Request, res: Response) => {
    try {
      const currentUserId = req.user!.id;
      const { recipientId, conversationId: existingConvId, content } = req.body;

      const trimmedContent = (content || '').trim().slice(0, 1000);
      if (!trimmedContent) {
        return res.status(400).json({ error: 'EmptyMessage', message: 'Message cannot be empty.' });
      }

      let convId = existingConvId;
      let targetRecipientId = recipientId;

      if (convId) {
        const convRes = await db.execute({
          sql: `SELECT user1_id, user2_id FROM conversations WHERE id = ?`,
          args: [convId],
        });
        if (convRes.rows.length === 0) {
          return res.status(404).json({ error: 'NotFound', message: 'Conversation not found.' });
        }
        const { user1_id, user2_id } = convRes.rows[0];
        targetRecipientId = user1_id === currentUserId ? user2_id : user1_id;
      } else if (targetRecipientId) {
        if (targetRecipientId === currentUserId) {
          return res.status(400).json({ error: 'SelfAction', message: 'Cannot message yourself.' });
        }
        convId = await getOrCreateConversation(currentUserId, targetRecipientId);
      } else {
        return res.status(400).json({ error: 'BadRequest', message: 'Recipient or conversation is required.' });
      }

      // Check blocks
      const blockRes = await db.execute({
        sql: `
          SELECT id FROM blocks
          WHERE (blocker_id = ? AND blocked_id = ?)
             OR (blocker_id = ? AND blocked_id = ?)
        `,
        args: [currentUserId, targetRecipientId, targetRecipientId, currentUserId],
      });

      if (blockRes.rows.length > 0) {
        return res.status(403).json({ error: 'Blocked', message: 'You cannot message this user.' });
      }

      const messageId = crypto.randomUUID();

      await db.execute({
        sql: `
          INSERT INTO messages (id, conversation_id, sender_id, recipient_id, content, is_read, created_at)
          VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        `,
        args: [messageId, convId, currentUserId, targetRecipientId, trimmedContent],
      });

      // Update conversation last_message_at
      await db.execute({
        sql: `UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`,
        args: [convId],
      });

      // Notify recipient
      await db.execute({
        sql: `
          INSERT INTO notifications (id, recipient_id, actor_id, type, created_at)
          VALUES (?, ?, ?, 'message', datetime('now'))
        `,
        args: [crypto.randomUUID(), targetRecipientId, currentUserId],
      });

      return res.status(201).json({
        message: {
          id: messageId,
          conversationId: convId,
          senderId: currentUserId,
          recipientId: targetRecipientId,
          content: trimmedContent,
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error('[SEND MESSAGE ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Failed to send message.' });
    }
  }
);
