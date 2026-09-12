import crypto from 'crypto';
import { db } from './db';
import { hashPassword } from './auth';

export async function seedInitialData(): Promise<void> {
  const usersCountRes = await db.execute('SELECT COUNT(*) as count FROM users');
  const count = Number(usersCountRes.rows[0]?.count) || 0;

  if (count > 0) {
    // Already has data
    return;
  }

  console.log('[SEED] Seeding initial creators and posts for Verve...');

  const defaultPasswordHash = await hashPassword('Password123!');

  const creators = [
    {
      id: crypto.randomUUID(),
      email: 'elena@verve.social',
      username: 'elena_lens',
      displayName: 'Elena Rostova',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      bio: 'Architectural & cinematic photographer based in Berlin. Capturing quiet geometric light.',
      website: 'https://elenarostova.photography',
      isPrivate: 0,
      isVerified: 1,
      role: 'user',
    },
    {
      id: crypto.randomUUID(),
      email: 'marcus@verve.social',
      username: 'marcus_nordic',
      displayName: 'Marcus Lindqvist',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      bio: 'Nordic wilderness explorer & analog frame collector. Stockholm, Sweden.',
      website: 'https://marcuslindqvist.com',
      isPrivate: 0,
      isVerified: 1,
      role: 'user',
    },
    {
      id: crypto.randomUUID(),
      email: 'maya@verve.social',
      username: 'maya_design',
      displayName: 'Maya Chen',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
      bio: 'Visual designer & creative director. Exploring textures, brutalist forms & typography.',
      website: 'https://mayachen.studio',
      isPrivate: 0,
      isVerified: 1,
      role: 'user',
    },
    {
      id: crypto.randomUUID(),
      email: 'alex@verve.social',
      username: 'alex_wander',
      displayName: 'Alex Thorne',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
      bio: 'Coffee, mountains, and dawn silhouettes. Pacific Northwest.',
      website: '',
      isPrivate: 1, // Private account example to test follow requests!
      isVerified: 1,
      role: 'user',
    },
    {
      id: crypto.randomUUID(),
      email: 'admin@verve.social',
      username: 'verve_admin',
      displayName: 'Verve Moderation',
      avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
      bio: 'Official platform moderation and announcements account.',
      website: 'https://verve-social.app',
      isPrivate: 0,
      isVerified: 1,
      role: 'admin',
    },
  ];

  for (const c of creators) {
    await db.execute({
      sql: `
        INSERT INTO users (id, email, username, display_name, password_hash, avatar_url, bio, website, is_private, is_verified, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [c.id, c.email, c.username, c.displayName, defaultPasswordHash, c.avatarUrl, c.bio, c.website, c.isPrivate, c.isVerified, c.role],
    });
  }

  // Inter-followings
  const elena = creators[0];
  const marcus = creators[1];
  const maya = creators[2];

  await db.execute({
    sql: `INSERT INTO follows (id, follower_id, following_id, status, created_at) VALUES (?, ?, ?, 'accepted', datetime('now'))`,
    args: [crypto.randomUUID(), elena.id, marcus.id],
  });
  await db.execute({
    sql: `INSERT INTO follows (id, follower_id, following_id, status, created_at) VALUES (?, ?, ?, 'accepted', datetime('now'))`,
    args: [crypto.randomUUID(), marcus.id, elena.id],
  });
  await db.execute({
    sql: `INSERT INTO follows (id, follower_id, following_id, status, created_at) VALUES (?, ?, ?, 'accepted', datetime('now'))`,
    args: [crypto.randomUUID(), maya.id, elena.id],
  });
  await db.execute({
    sql: `INSERT INTO follows (id, follower_id, following_id, status, created_at) VALUES (?, ?, ?, 'accepted', datetime('now'))`,
    args: [crypto.randomUUID(), elena.id, maya.id],
  });

  // Sample posts
  const posts = [
    {
      id: crypto.randomUUID(),
      userId: elena.id,
      imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=85',
      caption: 'Morning sun cast through the concrete atrium. Finding calm in clean lines. #minimalism #architecture #berlin',
      location: 'Berlin, Germany',
      altText: 'Sunlight streaming through geometric concrete windows into a modern minimalist atrium',
      width: 1200,
      height: 800,
    },
    {
      id: crypto.randomUUID(),
      userId: marcus.id,
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&auto=format&fit=crop&q=85',
      caption: 'First mist over the northern fjord at 5:00 AM. Nothing beats stillness before sunrise. #travel #nature #nordic',
      location: 'Lofoten Islands, Norway',
      altText: 'Scenic misty mountain lake in Norway with calm reflections at sunrise',
      width: 1200,
      height: 900,
    },
    {
      id: crypto.randomUUID(),
      userId: maya.id,
      imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=85',
      caption: 'Glass facade reflections catching the late afternoon amber glow. Structure study #04. #architecture #design #urban',
      location: 'Tokyo, Japan',
      altText: 'Sleek modern glass skyscraper reflecting warm amber clouds',
      width: 1200,
      height: 1200,
    },
    {
      id: crypto.randomUUID(),
      userId: elena.id,
      imageUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&auto=format&fit=crop&q=85',
      caption: 'Framing the passage of light. Golden hour inside the studio. #photography #light #composition',
      location: 'Studio Kreuzberg',
      altText: 'Warm golden sunlight cutting diagonally across an artistic studio space',
      width: 1080,
      height: 1350,
    },
    {
      id: crypto.randomUUID(),
      userId: marcus.id,
      imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=85',
      caption: 'Emerald ridges disappearing into low-hanging clouds. #wilderness #mountains #wanderlust',
      location: 'Sarek National Park',
      altText: 'Vast dramatic green alpine peaks covered in ethereal clouds',
      width: 1200,
      height: 800,
    },
  ];

  for (const p of posts) {
    await db.execute({
      sql: `
        INSERT INTO posts (id, user_id, image_url, thumbnail_url, caption, location, alt_text, width, height, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [p.id, p.userId, p.imageUrl, p.imageUrl, p.caption, p.location, p.altText, p.width, p.height],
    });

    // Tags
    const tags = p.caption.match(/#[a-zA-Z0-9_]+/g) || [];
    for (const rawTag of tags) {
      const tag = rawTag.substring(1).toLowerCase();
      await db.execute({
        sql: `INSERT OR IGNORE INTO post_tags (id, post_id, tag, created_at) VALUES (?, ?, ?, datetime('now'))`,
        args: [crypto.randomUUID(), p.id, tag],
      });
    }
  }

  // Initial likes and comments
  const post1 = posts[0];
  await db.execute({
    sql: `INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
    args: [crypto.randomUUID(), post1.id, marcus.id],
  });
  await db.execute({
    sql: `INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
    args: [crypto.randomUUID(), post1.id, maya.id],
  });

  await db.execute({
    sql: `INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    args: [crypto.randomUUID(), post1.id, marcus.id, 'The tonal gradation here is sublime, Elena!'],
  });
  await db.execute({
    sql: `INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    args: [crypto.randomUUID(), post1.id, maya.id, 'Brilliant geometric shadow work.'],
  });

  console.log('[SEED] Initial data seeded successfully.');
}
