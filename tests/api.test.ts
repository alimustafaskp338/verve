import { test, describe, before } from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

describe('Verve Platform API & Security Tests', () => {
  let cookieUserA = '';
  let cookieUserB = '';
  let userAId = '';
  let userBId = '';
  let createdPostId = '';
  let verificationToken = '';

  const testUserA = {
    email: `test_a_${Date.now()}@verve.social`,
    username: `test_user_a_${Date.now()}`,
    displayName: 'Test User Alpha',
    password: 'Password123!',
  };

  const testUserB = {
    email: `test_b_${Date.now()}@verve.social`,
    username: `test_user_b_${Date.now()}`,
    displayName: 'Test User Beta',
    password: 'Password123!',
  };

  test('1. Signup creates user, session cookie, and verification token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserA),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.user.id);
    assert.strictEqual(data.user.email, testUserA.email);
    assert.strictEqual(data.user.isVerified, false);
    userAId = data.user.id;

    // Capture cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    cookieUserA = setCookie.split(';')[0];
    assert.ok(cookieUserA.startsWith('verve_session='));
  });

  test('2. Duplicate signup fails with 409 Conflict', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserA),
    });

    assert.strictEqual(res.status, 409);
  });

  test('3. Signup second user (User B)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserB),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    userBId = data.user.id;
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    cookieUserB = setCookie.split(';')[0];
  });

  test('4. Fetch sent verification email from Dev Outbox & verify email', async () => {
    const res = await fetch(`${BASE_URL}/api/dev/emails`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.emails));

    const emailForA = data.emails.find((e: any) => e.to_email === testUserA.email);
    assert.ok(emailForA, 'Verification email must be present in sent_emails');
    assert.ok(emailForA.token);
    verificationToken = emailForA.token;

    // Call verify-email
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verificationToken }),
    });

    assert.strictEqual(verifyRes.status, 200);

    // Verify User A now has isVerified = true
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookieUserA },
    });
    const meData = await meRes.json();
    assert.strictEqual(meData.user.isVerified, true);
  });

  test('5. Verify User B email as well', async () => {
    const res = await fetch(`${BASE_URL}/api/dev/emails`);
    const data = await res.json();
    const emailForB = data.emails.find((e: any) => e.to_email === testUserB.email);
    assert.ok(emailForB);

    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: emailForB.token }),
    });
    assert.strictEqual(verifyRes.status, 200);
  });

  test('6. User A creates a post', async () => {
    const res = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieUserA,
      },
      body: JSON.stringify({
        imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
        caption: 'Sunset test post #testing #nature',
        location: 'Test Bay',
        altText: 'A beautiful test sunset',
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.post.id);
    assert.strictEqual(data.post.userId, userAId);
    createdPostId = data.post.id;
  });

  test('7. User B follows User A', async () => {
    const res = await fetch(`${BASE_URL}/api/social/follow/${userAId}`, {
      method: 'POST',
      headers: { Cookie: cookieUserB },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'accepted');
  });

  test('8. User B likes and comments on User A post', async () => {
    // Like
    const likeRes = await fetch(`${BASE_URL}/api/engagement/like/${createdPostId}`, {
      method: 'POST',
      headers: { Cookie: cookieUserB },
    });
    assert.strictEqual(likeRes.status, 200);
    const likeData = await likeRes.json();
    assert.strictEqual(likeData.isLiked, true);
    assert.strictEqual(likeData.likesCount, 1);

    // Comment
    const commentRes = await fetch(`${BASE_URL}/api/engagement/comments/${createdPostId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieUserB,
      },
      body: JSON.stringify({ content: 'Incredible shot!' }),
    });
    assert.strictEqual(commentRes.status, 201);
    const commentData = await commentRes.json();
    assert.strictEqual(commentData.comment.content, 'Incredible shot!');
  });

  test('9. User A receives notifications for follow, like, and comment', async () => {
    const notifRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Cookie: cookieUserA },
    });
    assert.strictEqual(notifRes.status, 200);
    const notifData = await notifRes.json();
    assert.ok(notifData.notifications.length >= 3);
    const types = notifData.notifications.map((n: any) => n.type);
    assert.ok(types.includes('follow'));
    assert.ok(types.includes('like'));
    assert.ok(types.includes('comment'));
  });

  test('10. User B saves post to private bookmark collection', async () => {
    const saveRes = await fetch(`${BASE_URL}/api/engagement/save/${createdPostId}`, {
      method: 'POST',
      headers: { Cookie: cookieUserB },
    });
    assert.strictEqual(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.strictEqual(saveData.isSaved, true);

    const getSavedRes = await fetch(`${BASE_URL}/api/engagement/saved`, {
      headers: { Cookie: cookieUserB },
    });
    const savedList = await getSavedRes.json();
    assert.ok(savedList.posts.some((p: any) => p.id === createdPostId));
  });

  test('11. Direct messaging between User B and User A', async () => {
    const sendRes = await fetch(`${BASE_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieUserB,
      },
      body: JSON.stringify({
        recipientId: userAId,
        content: 'Hey Alpha, wonderful photo!',
      }),
    });

    assert.strictEqual(sendRes.status, 201);
    const sendData = await sendRes.json();
    assert.ok(sendData.message.id);
    const convId = sendData.message.conversationId;

    // User A reads conversation
    const readRes = await fetch(`${BASE_URL}/api/messages/conversations/${convId}`, {
      headers: { Cookie: cookieUserA },
    });
    assert.strictEqual(readRes.status, 200);
    const readData = await readRes.json();
    assert.ok(readData.messages.some((m: any) => m.content === 'Hey Alpha, wonderful photo!'));
  });

  test('12. Blocking: User A blocks User B', async () => {
    const blockRes = await fetch(`${BASE_URL}/api/social/block/${userBId}`, {
      method: 'POST',
      headers: { Cookie: cookieUserA },
    });
    assert.strictEqual(blockRes.status, 200);

    // After block, User B messaging User A should be forbidden
    const msgRes = await fetch(`${BASE_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieUserB,
      },
      body: JSON.stringify({
        recipientId: userAId,
        content: 'Can you see this?',
      }),
    });
    assert.strictEqual(msgRes.status, 403);
  });

  test('13. Password Reset Flow', async () => {
    // Forgot password request
    const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserA.email }),
    });
    assert.strictEqual(forgotRes.status, 200);

    // Retrieve token from sent_emails
    const emailRes = await fetch(`${BASE_URL}/api/dev/emails`);
    const emailData = await emailRes.json();
    const resetEmail = emailData.emails.find(
      (e: any) => e.to_email === testUserA.email && e.purpose === 'password_reset'
    );
    assert.ok(resetEmail, 'Password reset email must be recorded');
    assert.ok(resetEmail.token);

    // Reset password
    const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetEmail.token,
        newPassword: 'BrandNewPassword888!',
      }),
    });
    assert.strictEqual(resetRes.status, 200);

    // Login with new password
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testUserA.email,
        password: 'BrandNewPassword888!',
      }),
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.user.email, testUserA.email);
  });
});
