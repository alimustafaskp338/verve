import { createClient, Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';

const dbDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

function resolveDatabaseUrl(): string {
  const candidate = process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (candidate) {
    const supportedPrefixes = ['libsql:', 'wss:', 'ws:', 'https:', 'http:', 'file:'];
    const isSupported = supportedPrefixes.some((prefix) => candidate.startsWith(prefix));
    if (isSupported) {
      return candidate;
    }
    console.warn(
      `[DATABASE] Unsupported scheme in DATABASE_URL ("${candidate.split(':')[0]}:"). LibSQL requires libsql:, wss:, ws:, https:, http:, or file: URLs. Falling back to local database: file:data/verve.db`
    );
  }
  return 'file:data/verve.db';
}

const dbUrl = resolveDatabaseUrl();

export const db: Client = createClient({
  url: dbUrl,
  authToken: process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
});

export async function initDatabase(): Promise<void> {
  // Foreign keys enabled
  await db.execute('PRAGMA foreign_keys = ON;');

  // Users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      website TEXT DEFAULT '',
      is_private INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      deactivated_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Indexes on users
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

  // Sessions table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      user_agent TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`);

  // Email verification tokens
  await db.execute(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verifications(user_id);`);

  // Password reset tokens
  await db.execute(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);`);

  // Follows table (status: 'accepted' or 'pending')
  await db.execute(`
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('accepted', 'pending')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(follower_id, following_id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);`);

  // Blocks table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(blocker_id, blocked_id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);`);

  // Posts table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      thumbnail_url TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      location TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      width INTEGER DEFAULT 1080,
      height INTEGER DEFAULT 1080,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);`);

  // Post tags table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS post_tags (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(post_id, tag)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tags_tag ON post_tags(tag);`);

  // Likes table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);`);

  // Comments table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);`);

  // Saved posts table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS saved_posts (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_posts(user_id);`);

  // Notifications table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('follow', 'follow_request', 'follow_accept', 'like', 'comment', 'message')),
      post_id TEXT DEFAULT NULL REFERENCES posts(id) ON DELETE CASCADE,
      comment_id TEXT DEFAULT NULL REFERENCES comments(id) ON DELETE CASCADE,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);`);

  // Conversations table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_message_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user1_id, user2_id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_conv_user1 ON conversations(user1_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_conv_user2 ON conversations(user2_id);`);

  // Messages table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at ASC);`);

  // Reports table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('post', 'user', 'comment', 'message')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);`);

  // Transactional sent emails table (for real SMTP delivery and in-app mailbox preview)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sent_emails (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_content TEXT NOT NULL,
      html_content TEXT NOT NULL,
      token TEXT DEFAULT '',
      purpose TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_emails_to ON sent_emails(to_email);`);

  // Rate limiting table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER DEFAULT 1,
      reset_at INTEGER NOT NULL
    );
  `);
}
