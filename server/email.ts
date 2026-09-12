import nodemailer, { Transporter } from 'nodemailer';
import { db } from './db';
import crypto from 'crypto';

interface SendEmailParams {
  to: string;
  subject: string;
  purpose: 'verification' | 'password_reset' | 'notification';
  token?: string;
  actionUrl: string;
  userName: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  mode: 'smtp' | 'dev_outbox';
  messageId?: string;
  error?: string;
}

export interface SmtpConfigStatus {
  isConfigured: boolean;
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  secure?: boolean;
}

let transporter: Transporter | null = null;
let lastSmtpKey: string | null = null;

export function isSmtpConfigured(): boolean {
  let host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host && user && (user.toLowerCase().endsWith('@gmail.com') || user.toLowerCase().endsWith('@googlemail.com'))) {
    host = 'smtp.gmail.com';
  }
  return Boolean(host && user && pass);
}

export function getSmtpStatus(): SmtpConfigStatus {
  let host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const from = process.env.SMTP_FROM?.trim() || 'Verve <no-reply@verve-social.app>';

  if (!host && user && (user.toLowerCase().endsWith('@gmail.com') || user.toLowerCase().endsWith('@googlemail.com'))) {
    host = 'smtp.gmail.com';
  }

  const configured = isSmtpConfigured();
  return {
    isConfigured: configured,
    host: configured ? host : undefined,
    port: configured ? port : undefined,
    user: configured && user ? `${user.slice(0, 3)}***@${user.split('@')[1] || 'domain'}` : undefined,
    from,
    secure: port === 465,
  };
}

export function getTransporter(): Transporter | null {
  let host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  // Smart convenience: If user provided Gmail account and password without host, default to smtp.gmail.com
  if (!host && user && (user.toLowerCase().endsWith('@gmail.com') || user.toLowerCase().endsWith('@googlemail.com'))) {
    host = 'smtp.gmail.com';
  }

  if (!host || !user || !pass) {
    transporter = null;
    lastSmtpKey = null;
    return null;
  }

  const currentKey = `${host}:${port}:${user}`;
  if (transporter && lastSmtpKey === currentKey) {
    return transporter;
  }

  // Create transporter with proper TLS/STARTTLS support
  // Port 465 uses SSL direct (`secure: true`).
  // Port 587 uses STARTTLS (`secure: false` with requireTLS / opportunistic STARTTLS).
  const isDirectSsl = port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: isDirectSsl,
    auth: { user, pass },
    tls: {
      // Do not fail on valid self-signed or modern cipher negotiation
      minVersion: 'TLSv1.2',
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  lastSmtpKey = currentKey;
  return transporter;
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<EmailDeliveryResult> {
  const { to, subject, purpose, token = '', actionUrl, userName } = params;
  const from = process.env.SMTP_FROM?.trim() || 'Verve <no-reply@verve-social.app>';

  const isVerification = purpose === 'verification';
  const actionText = isVerification ? 'Verify My Email' : 'Reset Password';
  const heading = isVerification ? 'Verify your email address' : 'Reset your Verve password';
  const intro = isVerification
    ? `Welcome to Verve, ${userName}! Please confirm your email address to unlock full privileges like publishing posts and sending direct messages.`
    : `Hello ${userName}, we received a request to reset your Verve account password. If this was not you, please ignore this email.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f1f5f9; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #111622; border-radius: 14px; border: 1px solid #1e293b; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
          .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
          .logo { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #38bdf8; text-transform: uppercase; }
          .badge { font-size: 11px; font-weight: 700; color: #94a3b8; background: #1e293b; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.5px; }
          h2 { color: #ffffff; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 14px; letter-spacing: -0.3px; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.65; margin-bottom: 24px; }
          .button-wrapper { text-align: center; margin: 34px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff !important; text-decoration: none; padding: 14px 34px; border-radius: 10px; font-weight: 700; font-size: 15px; letter-spacing: 0.2px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35); }
          .alt-url-box { background: #0b0f17; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; margin-top: 20px; }
          .alt-url { word-break: break-all; color: #38bdf8; font-size: 12px; font-family: monospace; }
          .footer { font-size: 12px; color: #64748b; margin-top: 36px; border-top: 1px solid #1e293b; padding-top: 20px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="brand">
            <span class="logo">VERVE</span>
            <span class="badge">Visual Social</span>
          </div>
          <h2>${heading}</h2>
          <p>${intro}</p>
          <div class="button-wrapper">
            <a href="${actionUrl}" class="button" target="_blank" rel="noopener noreferrer">${actionText}</a>
          </div>
          <p style="font-size: 13px; color: #64748b; margin-bottom: 8px;">If the button above does not work, copy and paste this link into your browser:</p>
          <div class="alt-url-box">
            <a href="${actionUrl}" class="alt-url">${actionUrl}</a>
          </div>
          <div class="footer">
            Verve Visual Social Platform &bull; Automated Security Notice &bull; Valid for 24 hours<br/>
            If you did not create an account on Verve, you can safely ignore this message.
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `${heading}\n\n${intro}\n\nVerify URL:\n${actionUrl}\n\nThis verification link is valid for 24 hours.\nIf you did not request this, please disregard.`;

  // Always record in sent_emails table for audit / dev preview
  const emailId = crypto.randomUUID();
  try {
    await db.execute({
      sql: `
        INSERT INTO sent_emails (id, to_email, subject, text_content, html_content, token, purpose, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [emailId, to, subject, textContent, htmlContent, token, purpose],
    });
  } catch (dbErr) {
    console.error('[EMAIL DB AUDIT ERROR]', dbErr);
  }

  const mailer = getTransporter();

  // If in production, and SMTP is NOT configured, warn or fail appropriately
  const isProduction = process.env.NODE_ENV === 'production';

  if (!mailer) {
    if (isProduction) {
      console.warn(
        `[EMAIL WARNING] Running in production without SMTP environment variables configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Falling back to dev email store.`
      );
    } else {
      console.log(
        `[DEV EMAIL] Saved transactional email to "${to}" [${purpose}]. Stored in-app mailbox (no SMTP configured).`
      );
    }
    return { success: true, mode: 'dev_outbox' };
  }

  // Attempt real delivery via SMTP
  try {
    const info = await mailer.sendMail({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`[SMTP SUCCESS] Transactional email sent to ${to} (Message-ID: ${info.messageId})`);
    return {
      success: true,
      mode: 'smtp',
      messageId: info.messageId,
    };
  } catch (smtpErr: any) {
    // Sanitize error so credentials or connection secrets are NEVER leaked
    const safeErrorMsg = smtpErr?.message ? String(smtpErr.message).replace(/auth:.*/i, '') : 'SMTP transport error';
    console.error(`[SMTP ERROR] Failed to send email to ${to}: ${safeErrorMsg}`);

    // In production, an SMTP error should be recorded and bubbled up safely
    return {
      success: false,
      mode: 'smtp',
      error: 'Failed to deliver email through SMTP server. Please check SMTP configuration.',
    };
  }
}
