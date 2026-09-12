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

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return transporter;
  }
  return null;
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, purpose, token = '', actionUrl, userName } = params;
  const from = process.env.SMTP_FROM || 'Verve <no-reply@verve-social.app>';

  const isVerification = purpose === 'verification';
  const actionText = isVerification ? 'Verify My Email' : 'Reset Password';
  const heading = isVerification ? 'Verify your email address' : 'Reset your Verve password';
  const intro = isVerification
    ? `Welcome to Verve, ${userName}! Please confirm your email address to unlock full privileges like posting and messaging.`
    : `Hello ${userName}, we received a request to reset your Verve account password. If this was not you, please ignore this email.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0f12; color: #f1f5f9; margin: 0; padding: 30px; }
          .container { max-width: 520px; margin: 0 auto; background: #16191f; border-radius: 12px; border: 1px solid #282f3c; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #38bdf8; margin-bottom: 24px; }
          h2 { color: #ffffff; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
          .alt-url { word-break: break-all; color: #38bdf8; font-size: 13px; }
          .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #282f3c; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">VERVE</div>
          <h2>${heading}</h2>
          <p>${intro}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${actionUrl}" class="button" target="_blank">${actionText}</a>
          </div>
          <p style="font-size: 13px; color: #64748b;">If the button above does not work, copy and paste this link into your browser:</p>
          <p class="alt-url">${actionUrl}</p>
          <div class="footer">
            Verve Visual Social Platform &bull; Automated Security Notice &bull; Valid for 1 hour
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `${heading}\n\n${intro}\n\nClick link: ${actionUrl}\n\nValid for 1 hour.`;

  // Always persist in sent_emails table for audit log and in-app mailbox preview
  const emailId = crypto.randomUUID();
  await db.execute({
    sql: `
      INSERT INTO sent_emails (id, to_email, subject, text_content, html_content, token, purpose, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    args: [emailId, to, subject, textContent, htmlContent, token, purpose],
  });

  // Attempt real delivery via SMTP if configured
  const mailer = getTransporter();
  if (mailer) {
    try {
      await mailer.sendMail({
        from,
        to,
        subject,
        text: textContent,
        html: htmlContent,
      });
      console.log(`[SMTP] Transactional email sent to ${to}: ${subject}`);
    } catch (err) {
      console.error(`[SMTP ERROR] Failed to send email to ${to}:`, err);
    }
  } else {
    console.log(`[DEV EMAIL] Stored transactional email to ${to}: "${subject}". Accessible via in-app mailbox.`);
  }
}
