import { test, describe } from 'node:test';
import assert from 'node:assert';
import { db } from '../server/db';
import { hashToken, generateSecureToken } from '../server/auth';
import { isSmtpConfigured, getSmtpStatus, sendTransactionalEmail } from '../server/email';

const BASE_URL = 'http://localhost:3000';

describe('Production-Style Email Verification & SMTP Delivery Suite', () => {
  const timestamp = Date.now();
  const testUser = {
    email: `email_test_${timestamp}@verve-test.app`,
    username: `verif_tester_${timestamp}`,
    displayName: 'Verification Tester',
    password: 'Password999!',
  };

  let sessionCookie = '';
  let userId = '';
  let extractedToken = '';

  test('1. SMTP status reports accurately without leaking credentials', async () => {
    const status = getSmtpStatus();
    assert.strictEqual(typeof status.isConfigured, 'boolean');
    assert.strictEqual(typeof status.from, 'string');
    // Ensure no password field exists in status object
    assert.strictEqual((status as any).pass, undefined);
    assert.strictEqual((status as any).password, undefined);

    const res = await fetch(`${BASE_URL}/api/dev/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.smtp.isConfigured, 'boolean');
    assert.strictEqual(data.smtp.pass, undefined);
  });

  test('2. Unverified user signup creates hashed token and dispatches email', async () => {
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });

    assert.strictEqual(signupRes.status, 201);
    const signupData = await signupRes.json();
    userId = signupData.user.id;
    assert.strictEqual(signupData.user.isVerified, false);

    const setCookie = signupRes.headers.get('set-cookie');
    assert.ok(setCookie);
    sessionCookie = setCookie.split(';')[0];

    // Verify token stored in DB is hashed, not raw token
    const dbVerif = await db.execute({
      sql: `SELECT id, user_id, token_hash, expires_at FROM email_verifications WHERE user_id = ?`,
      args: [userId],
    });
    assert.strictEqual(dbVerif.rows.length, 1);
    const storedHash = dbVerif.rows[0].token_hash as string;
    assert.strictEqual(storedHash.length, 64); // SHA-256 is 64 hex characters

    // Retrieve email from dev outbox (fallback in dev mode)
    const emailsRes = await fetch(`${BASE_URL}/api/dev/emails`);
    assert.strictEqual(emailsRes.status, 200);
    const emailsData = await emailsRes.json();
    const email = emailsData.emails.find((e: any) => e.to_email === testUser.email);
    assert.ok(email, 'Verification email must be recorded in sent_emails');
    assert.ok(email.token);
    extractedToken = email.token;

    // Verify that hashing the email token matches the DB token_hash
    assert.strictEqual(hashToken(extractedToken), storedHash);
  });

  test('3. Unverified user CANNOT create a post', async () => {
    const postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
        caption: 'Should fail because unverified',
      }),
    });

    assert.strictEqual(postRes.status, 403);
    const postData = await postRes.json();
    assert.strictEqual(postData.error, 'UnverifiedEmail');
  });

  test('4. Unverified user CANNOT send direct messages', async () => {
    const msgRes = await fetch(`${BASE_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        recipientId: 'any-user-id',
        content: 'Should fail because unverified',
      }),
    });

    assert.strictEqual(msgRes.status, 403);
    const msgData = await msgRes.json();
    assert.strictEqual(msgData.error, 'UnverifiedEmail');
  });

  test('5. Verification with invalid token fails with 400', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'definitely-invalid-nonexistent-token' }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'InvalidToken');
  });

  test('6. Verification with expired token fails with 400', async () => {
    // Create an explicitly expired token in database
    const expiredRawToken = generateSecureToken();
    const expiredHash = hashToken(expiredRawToken);
    const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour in the past

    await db.execute({
      sql: `
        INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `,
      args: [`test-expired-${Date.now()}`, userId, expiredHash, pastDate],
    });

    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: expiredRawToken }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'InvalidToken');
  });

  test('7. Resending verification email is rate limited', async () => {
    // Clear any previous rate limit hits for isolation across runs
    await db.execute(`DELETE FROM rate_limits WHERE key LIKE 'resend-verif:%'`);

    // 1st resend succeeds
    const res1 = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(res1.status, 200);

    // 2nd resend succeeds
    const res2 = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(res2.status, 200);

    // 3rd resend succeeds
    const res3 = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(res3.status, 200);

    // 4th resend exceeds rate limit (configured at 3 per minute)
    const res4 = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(res4.status, 429);
    const data4 = await res4.json();
    assert.strictEqual(data4.error, 'Too many requests');
  });

  test('8. Valid token successfully verifies user and is single-use', async () => {
    // Get newest token from DB / sent_emails
    const emailsRes = await fetch(`${BASE_URL}/api/dev/emails`);
    const emailsData = await emailsRes.json();
    const latestEmail = emailsData.emails
      .filter((e: any) => e.to_email === testUser.email && e.purpose === 'verification')
      .sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];

    assert.ok(latestEmail);
    const activeToken = latestEmail.token;

    // Verify successfully
    const verifRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: activeToken }),
    });
    assert.strictEqual(verifRes.status, 200);

    // Verify User is now marked verified in /me
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    const meData = await meRes.json();
    assert.strictEqual(meData.user.isVerified, true);

    // Replay / Reusing the same token MUST fail (single-use token invalidation)
    const replayRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: activeToken }),
    });
    assert.strictEqual(replayRes.status, 400);
    const replayData = await replayRes.json();
    assert.strictEqual(replayData.error, 'InvalidToken');
  });

  test('9. Resending verification when already verified returns 400', async () => {
    // Clear rate limit record for test so verified check is tested directly
    await db.execute(`DELETE FROM rate_limits WHERE key LIKE 'resend-verif:%'`);

    const res = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'AlreadyVerified');
  });

  test('10. Verified user CAN create a post', async () => {
    const postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
        caption: 'Now verified! Welcome to Verve.',
      }),
    });

    assert.strictEqual(postRes.status, 201);
    const postData = await postRes.json();
    assert.ok(postData.post.id);
  });
});
