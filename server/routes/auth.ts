import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  destroyAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
  hashToken,
  generateSecureToken,
  rateLimiter,
  requireAuth,
} from '../auth';
import { sendTransactionalEmail } from '../email';

export const authRouter = Router();

// Validation schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(255).toLowerCase().trim(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .toLowerCase()
    .trim(),
  displayName: z.string().min(1, 'Display name is required').max(50).trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid token'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

// SIGNUP
authRouter.post(
  '/signup',
  rateLimiter('signup', 10, 60 * 1000), // 10 per minute
  async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'ValidationError',
          message: parsed.error.issues[0]?.message || 'Invalid input data',
          issues: parsed.error.issues,
        });
      }

      const { email, username, displayName, password } = parsed.data;

      // Check duplicate email or username
      const existing = await db.execute({
        sql: `SELECT id, email, username FROM users WHERE email = ? OR username = ?`,
        args: [email, username],
      });

      if (existing.rows.length > 0) {
        const found = existing.rows[0];
        if (found.email === email) {
          return res.status(409).json({ error: 'Conflict', message: 'An account with this email already exists.' });
        }
        if (found.username === username) {
          return res.status(409).json({ error: 'Conflict', message: 'This username is already taken.' });
        }
      }

      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();

      await db.execute({
        sql: `
          INSERT INTO users (id, email, username, display_name, password_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
        args: [userId, email, username, displayName, passwordHash],
      });

      // Create email verification token
      const rawVerifToken = generateSecureToken();
      const tokenHash = hashToken(rawVerifToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      await db.execute({
        sql: `
          INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `,
        args: [crypto.randomUUID(), userId, tokenHash, expiresAt],
      });

      // App base URL for verification link
      const origin = req.headers.origin || process.env.APP_URL || `http://${req.headers.host || 'localhost:3000'}`;
      const actionUrl = `${origin}/verify-email?token=${rawVerifToken}`;

      // Send verification email
      await sendTransactionalEmail({
        to: email,
        subject: 'Verify your email on Verve',
        purpose: 'verification',
        token: rawVerifToken,
        actionUrl,
        userName: displayName,
      });

      // Automatically create active session and set cookie
      const sessionToken = await createSession(userId, req);
      setSessionCookie(res, sessionToken);

      return res.status(201).json({
        message: 'Account created successfully. Please check your email for the verification link.',
        user: {
          id: userId,
          email,
          username,
          displayName,
          avatarUrl: '',
          bio: '',
          website: '',
          isPrivate: false,
          isVerified: false,
          role: 'user',
        },
        sessionToken,
      });
    } catch (err: any) {
      console.error('[SIGNUP ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Failed to create account.' });
    }
  }
);

// LOGIN
authRouter.post(
  '/login',
  rateLimiter('login', 8, 60 * 1000), // 8 attempts per minute
  async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'ValidationError', message: 'Identifier and password are required.' });
      }

      const { identifier, password } = parsed.data;
      const normalizedIdentifier = identifier.toLowerCase().trim();

      const userRes = await db.execute({
        sql: `
          SELECT id, email, username, display_name, password_hash, avatar_url, bio, website,
                 is_private, is_verified, role, deactivated_at
          FROM users
          WHERE email = ? OR username = ?
        `,
        args: [normalizedIdentifier, normalizedIdentifier],
      });

      if (userRes.rows.length === 0) {
        return res.status(401).json({ error: 'InvalidCredentials', message: 'Invalid email/username or password.' });
      }

      const userRow = userRes.rows[0];
      if (userRow.deactivated_at) {
        return res.status(403).json({
          error: 'DeactivatedAccount',
          message: 'This account has been deactivated. Please contact support to reactivate.',
        });
      }

      const match = await verifyPassword(password, userRow.password_hash as string);
      if (!match) {
        return res.status(401).json({ error: 'InvalidCredentials', message: 'Invalid email/username or password.' });
      }

      // Create session
      const sessionToken = await createSession(userRow.id as string, req);
      setSessionCookie(res, sessionToken);

      return res.json({
        message: 'Logged in successfully.',
        user: {
          id: userRow.id,
          email: userRow.email,
          username: userRow.username,
          displayName: userRow.display_name,
          avatarUrl: userRow.avatar_url || '',
          bio: userRow.bio || '',
          website: userRow.website || '',
          isPrivate: Boolean(userRow.is_private),
          isVerified: Boolean(userRow.is_verified),
          role: userRow.role || 'user',
        },
        sessionToken,
      });
    } catch (err: any) {
      console.error('[LOGIN ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Unable to log in at this time.' });
    }
  }
);

// LOGOUT
authRouter.post('/logout', async (req: Request, res: Response) => {
  if (req.sessionToken) {
    await destroySession(req.sessionToken);
  }
  clearSessionCookie(res);
  return res.json({ message: 'Logged out successfully.' });
});

// CURRENT USER / ME
authRouter.get('/me', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.json({ user: null });
  }

  // Count unread notifications & pending follow requests
  const notifRes = await db.execute({
    sql: `SELECT COUNT(*) as unread_count FROM notifications WHERE recipient_id = ? AND is_read = 0`,
    args: [req.user.id],
  });

  const msgRes = await db.execute({
    sql: `SELECT COUNT(*) as unread_count FROM messages WHERE recipient_id = ? AND is_read = 0`,
    args: [req.user.id],
  });

  const unreadNotifications = Number(notifRes.rows[0]?.unread_count) || 0;
  const unreadMessages = Number(msgRes.rows[0]?.unread_count) || 0;

  return res.json({
    user: {
      ...req.user,
      isPrivate: Boolean(req.user.is_private),
      isVerified: Boolean(req.user.is_verified),
    },
    unreadNotifications,
    unreadMessages,
  });
});

// EMAIL VERIFICATION
authRouter.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = req.body.token as string;
    if (!token) {
      return res.status(400).json({ error: 'InvalidToken', message: 'Verification token is required.' });
    }

    const tokenHash = hashToken(token);
    const now = new Date().toISOString();

    const verifRes = await db.execute({
      sql: `
        SELECT id, user_id, expires_at FROM email_verifications
        WHERE token_hash = ? AND expires_at > ?
      `,
      args: [tokenHash, now],
    });

    if (verifRes.rows.length === 0) {
      return res.status(400).json({
        error: 'InvalidToken',
        message: 'Verification link is invalid or has expired. Please request a new one.',
      });
    }

    const { user_id, id } = verifRes.rows[0];

    // Mark user as verified
    await db.execute({
      sql: `UPDATE users SET is_verified = 1, updated_at = datetime('now') WHERE id = ?`,
      args: [user_id],
    });

    // Delete used token
    await db.execute({
      sql: `DELETE FROM email_verifications WHERE id = ?`,
      args: [id],
    });

    return res.json({ message: 'Email verified successfully! You now have full access to all features.' });
  } catch (err: any) {
    console.error('[VERIFY EMAIL ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to verify email.' });
  }
});

// RESEND VERIFICATION EMAIL
authRouter.post(
  '/resend-verification',
  rateLimiter('resend-verif', 3, 60 * 1000), // 3 per minute
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.is_verified) {
        return res.status(400).json({ message: 'Your email address is already verified.' });
      }

      // Invalidate old tokens
      await db.execute({
        sql: `DELETE FROM email_verifications WHERE user_id = ?`,
        args: [req.user!.id],
      });

      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await db.execute({
        sql: `
          INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `,
        args: [crypto.randomUUID(), req.user!.id, tokenHash, expiresAt],
      });

      const origin = req.headers.origin || process.env.APP_URL || `http://${req.headers.host || 'localhost:3000'}`;
      const actionUrl = `${origin}/verify-email?token=${rawToken}`;

      await sendTransactionalEmail({
        to: req.user!.email,
        subject: 'Verify your email on Verve',
        purpose: 'verification',
        token: rawToken,
        actionUrl,
        userName: req.user!.display_name,
      });

      return res.json({ message: 'A new verification email has been dispatched. Check your inbox.' });
    } catch (err: any) {
      console.error('[RESEND VERIF ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Failed to send verification email.' });
    }
  }
);

// FORGOT PASSWORD
authRouter.post(
  '/forgot-password',
  rateLimiter('forgot-pw', 4, 60 * 1000), // 4 per minute
  async (req: Request, res: Response) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'ValidationError', message: 'Valid email is required.' });
      }

      const { email } = parsed.data;

      // Always return a non-enumerating generic response
      const genericResponse = {
        message: 'If an account exists with that email address, a password reset link has been dispatched.',
      };

      const userRes = await db.execute({
        sql: `SELECT id, display_name, email FROM users WHERE email = ? AND deactivated_at IS NULL`,
        args: [email],
      });

      if (userRes.rows.length === 0) {
        // Delay slightly to prevent timing analysis
        await new Promise((resolve) => setTimeout(resolve, 300));
        return res.json(genericResponse);
      }

      const user = userRes.rows[0];
      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await db.execute({
        sql: `
          INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `,
        args: [crypto.randomUUID(), user.id, tokenHash, expiresAt],
      });

      const origin = req.headers.origin || process.env.APP_URL || `http://${req.headers.host || 'localhost:3000'}`;
      const actionUrl = `${origin}/reset-password?token=${rawToken}`;

      await sendTransactionalEmail({
        to: user.email as string,
        subject: 'Reset your Verve password',
        purpose: 'password_reset',
        token: rawToken,
        actionUrl,
        userName: user.display_name as string,
      });

      return res.json(genericResponse);
    } catch (err: any) {
      console.error('[FORGOT PASSWORD ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Unable to process password reset.' });
    }
  }
);

// RESET PASSWORD
authRouter.post(
  '/reset-password',
  rateLimiter('reset-pw', 5, 60 * 1000),
  async (req: Request, res: Response) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'ValidationError',
          message: parsed.error.issues[0]?.message || 'Invalid data',
        });
      }

      const { token, newPassword } = parsed.data;
      const tokenHash = hashToken(token);
      const now = new Date().toISOString();

      const resetRes = await db.execute({
        sql: `
          SELECT id, user_id FROM password_resets
          WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL
        `,
        args: [tokenHash, now],
      });

      if (resetRes.rows.length === 0) {
        return res.status(400).json({
          error: 'InvalidToken',
          message: 'Reset link is invalid, expired, or already used. Please request a new one.',
        });
      }

      const resetRow = resetRes.rows[0];
      const newHash = await hashPassword(newPassword);

      // Update password
      await db.execute({
        sql: `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [newHash, resetRow.user_id],
      });

      // Mark token used
      await db.execute({
        sql: `UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`,
        args: [resetRow.id],
      });

      // Invalidate all existing sessions for security against session fixation / hijacking
      await destroyAllUserSessions(resetRow.user_id as string);
      clearSessionCookie(res);

      return res.json({
        message: 'Password reset successfully. Please log in with your new password.',
      });
    } catch (err: any) {
      console.error('[RESET PW ERROR]', err);
      return res.status(500).json({ error: 'ServerError', message: 'Failed to reset password.' });
    }
  }
);

// CHANGE PASSWORD (AUTHENTICATED)
authRouter.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'ValidationError', message: 'New password must be at least 8 characters.' });
    }

    const userRes = await db.execute({
      sql: `SELECT password_hash FROM users WHERE id = ?`,
      args: [req.user!.id],
    });

    const match = await verifyPassword(currentPassword, userRes.rows[0].password_hash as string);
    if (!match) {
      return res.status(400).json({ error: 'InvalidPassword', message: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    await db.execute({
      sql: `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [newHash, req.user!.id],
    });

    return res.json({ message: 'Password updated successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'ServerError', message: 'Failed to update password.' });
  }
});

// DELETE / DEACTIVATE ACCOUNT
authRouter.post('/delete-account', requireAuth, async (req: Request, res: Response) => {
  try {
    const { password, reason } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'ValidationError', message: 'Password is required to confirm account deletion.' });
    }

    const userRes = await db.execute({
      sql: `SELECT password_hash FROM users WHERE id = ?`,
      args: [req.user!.id],
    });

    const match = await verifyPassword(password, userRes.rows[0].password_hash as string);
    if (!match) {
      return res.status(400).json({ error: 'InvalidPassword', message: 'Incorrect password.' });
    }

    // Permanently remove user and cascade delete sessions, posts, comments, likes, notifications
    await db.execute({
      sql: `DELETE FROM users WHERE id = ?`,
      args: [req.user!.id],
    });

    clearSessionCookie(res);
    return res.json({ message: 'Account permanently deleted. We are sad to see you go.' });
  } catch (err: any) {
    console.error('[DELETE ACCOUNT ERROR]', err);
    return res.status(500).json({ error: 'ServerError', message: 'Failed to delete account.' });
  }
});
