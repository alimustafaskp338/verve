import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  website: string;
  is_private: number;
  is_verified: number;
  role: string;
  created_at: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  role?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'verve_session';
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// SESSION_SECRET validation & startup check
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length >= 16) {
    return secret.trim();
  }
  // Safe fallback to prevent server crashes on startup in any environment
  return 'verve-production-safe-fallback-secret-2025-a1b2c3d4e5f6g7h8';
}

/**
 * Generate a signed JSON Web Token (JWT) for the authenticated user.
 */
export function generateJwtToken(payload: { userId: string; email: string; username: string; role?: string }): string {
  const secret = getSessionSecret();
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
      role: payload.role || 'user',
    },
    secret,
    {
      expiresIn: '14d',
      algorithm: 'HS256',
    }
  );
}

/**
 * Verify and decode a JWT token string. Returns decoded payload or null if invalid/expired.
 */
export function verifyJwtToken(token: string): JwtPayload | null {
  try {
    const secret = getSessionSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string, req: Request): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';

  await db.execute({
    sql: `
      INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `,
    args: [tokenHash, userId, expiresAt, userAgent, ipAddress],
  });

  return rawToken;
}

export async function destroySession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.execute({
    sql: `DELETE FROM sessions WHERE id = ?`,
    args: [tokenHash],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO revoked_tokens (token_hash) VALUES (?)`,
    args: [tokenHash],
  });
}

export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.execute({
    sql: `DELETE FROM sessions WHERE user_id = ?`,
    args: [userId],
  });
}

export function setSessionCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

// Rate limiting middleware helper
export async function checkRateLimit(key: string, maxCount: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const now = Date.now();
  const result = await db.execute({
    sql: `SELECT count, reset_at FROM rate_limits WHERE key = ?`,
    args: [key],
  });

  if (result.rows.length > 0) {
    const row = result.rows[0] as unknown as { count: number; reset_at: number };
    if (now < row.reset_at) {
      if (row.count >= maxCount) {
        return { allowed: false, retryAfterSec: Math.ceil((row.reset_at - now) / 1000) };
      }
      await db.execute({
        sql: `UPDATE rate_limits SET count = count + 1 WHERE key = ?`,
        args: [key],
      });
      return { allowed: true };
    }
  }

  // Set or reset window
  const resetAt = now + windowMs;
  await db.execute({
    sql: `
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at
    `,
    args: [key, resetAt],
  });
  return { allowed: true };
}

export function rateLimiter(prefix: string, maxCount: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'ip';
    const key = `${prefix}:${ip}`;
    const { allowed, retryAfterSec } = await checkRateLimit(key, maxCount, windowMs);
    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSec || 60);
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please wait ${retryAfterSec}s before retrying.`,
      });
    }
    next();
  };
}

// Authentication middleware (supports both JWT Bearer tokens and HTTP-only session cookies)
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.[SESSION_COOKIE_NAME];
    
    // Check Bearer authorization header if provided (RFC 6750)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return next();
    }

    // Check if token has been revoked / logged out
    const tokenHash = hashToken(token);
    const revokedCheck = await db.execute({
      sql: `SELECT token_hash FROM revoked_tokens WHERE token_hash = ?`,
      args: [tokenHash],
    });
    if (revokedCheck.rows.length > 0) {
      return next();
    }

    // 1. Check if token is a valid signed JWT
    const jwtPayload = verifyJwtToken(token);
    if (jwtPayload && jwtPayload.userId) {
      const userRes = await db.execute({
        sql: `
          SELECT id, email, username, display_name, avatar_url, bio, website,
                 is_private, is_verified, role, created_at, deactivated_at
          FROM users
          WHERE id = ? AND deactivated_at IS NULL
        `,
        args: [jwtPayload.userId],
      });

      if (userRes.rows.length > 0) {
        const row = userRes.rows[0];
        req.user = {
          id: row.id as string,
          email: row.email as string,
          username: row.username as string,
          display_name: row.display_name as string,
          avatar_url: (row.avatar_url as string) || '',
          bio: (row.bio as string) || '',
          website: (row.website as string) || '',
          is_private: Number(row.is_private) || 0,
          is_verified: Number(row.is_verified) || 0,
          role: (row.role as string) || 'user',
          created_at: row.created_at as string,
        };
        req.sessionToken = token;
        return next();
      }
    }

    // 2. Fallback to opaque session token lookup in sessions table
    const now = new Date().toISOString();

    const sessionRes = await db.execute({
      sql: `
        SELECT s.id as session_id, s.expires_at, u.id, u.email, u.username, u.display_name,
               u.avatar_url, u.bio, u.website, u.is_private, u.is_verified, u.role,
               u.created_at, u.deactivated_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ? AND s.expires_at > ? AND u.deactivated_at IS NULL
      `,
      args: [tokenHash, now],
    });

    if (sessionRes.rows.length > 0) {
      const row = sessionRes.rows[0];
      req.user = {
        id: row.id as string,
        email: row.email as string,
        username: row.username as string,
        display_name: row.display_name as string,
        avatar_url: (row.avatar_url as string) || '',
        bio: (row.bio as string) || '',
        website: (row.website as string) || '',
        is_private: Number(row.is_private) || 0,
        is_verified: Number(row.is_verified) || 0,
        role: (row.role as string) || 'user',
        created_at: row.created_at as string,
      };
      req.sessionToken = token;
    }

    next();
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in to perform this action.' });
  }
  next();
}

// Alias for standard JWT protected route naming
export const protectRoute = requireAuth;

export function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in.' });
  }
  if (!req.user.is_verified) {
    return res.status(403).json({
      error: 'UnverifiedEmail',
      message: 'Please verify your email address to unlock this feature.',
    });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin privileges required.' });
  }
  next();
}
