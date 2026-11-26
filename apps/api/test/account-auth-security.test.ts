import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, randomUUID, sign as cryptoSign } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AsyncSemaphore } from '../src/password';
import { testEmailOutbox } from '../src/auth-security';

let app: INestApplication;
let db: Pool;
let adminDb: Pool;
let base: string;
let dbName: string;
let serviceRef: any;
const origin = 'http://127.0.0.1:3100';

async function call(
 path: string,
 {
  method = 'GET',
  body,
  cookie = '',
  headers = {},
  rawBody,
 }: { method?: string; body?: any; cookie?: string; headers?: Record<string, string>; rawBody?: string } = {},
) {
 const r = await fetch(base + '/api' + path, {
  method,
  headers: {
   Origin: origin,
   'Content-Type': 'application/json',
   ...(cookie ? { Cookie: cookie } : {}),
   ...headers,
  },
  body: method === 'GET' ? undefined : (rawBody ?? JSON.stringify(body || {})),
 });
 let data: any = null;
 try {
  data = await r.json();
 } catch {}
 return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function guestCookie() {
 return (await call('/session')).cookie;
}

before(async () => {
 for (const key of ['TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY']) {
  delete process.env[key];
 }
 process.env.NODE_ENV = 'test';
 process.env.ENABLE_DEV_AUTH = 'true';
 process.env.WEB_ORIGIN = origin;
 process.env.ADMIN_TOKEN = 'test-admin-secret-' + randomUUID();
 process.env.TELEGRAM_BOT_TOKEN = '123456:TEST_BOT_TOKEN_LOCAL';
 process.env.TELEGRAM_BOT_USERNAME = 'TimQuanNgonTestBot';
 process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret-' + randomUUID();

 const connection = process.env.DATABASE_URL || 'postgresql://angiday:local_demo_only@127.0.0.1:55439/angiday';
 if (!['127.0.0.1', 'localhost'].includes(new URL(connection).hostname)) {
  throw Error('Test chỉ chạy trên DB local');
 }
 adminDb = new Pool({ connectionString: connection });
 dbName = 'angiday_auth_test_' + randomUUID().replace(/-/g, '');
 await adminDb.query(`CREATE DATABASE ${dbName}`);

 const url = new URL(connection);
 url.pathname = '/' + dbName;
 process.env.DATABASE_URL = url.toString();
 db = new Pool({ connectionString: url.toString() });

 for (const f of [
  '001_initial.sql',
  '002_users.sql',
  '003_filter_privacy.sql',
  '004_restaurant_imports.sql',
  '005_live_hanoi.sql',
  '006_foody_catalogue.sql',
  '007_search_tokens.sql',
  '008_performance_and_scale.sql',
  '009_restaurant_images.sql',
  '010_popularity_and_accounts_pro.sql',
  '011_multi_city.sql',
  '012_auth_security_and_verification.sql',
  '013_admin_cms_and_analytics.sql',
 ]) {
  await db.query(readFileSync('db/' + f, 'utf8'));
 }

 const mainMod = require('../src/main');
 serviceRef = mainMod.service;
 app = await mainMod.createApp();
 await app.listen(0, '127.0.0.1');
 base = await app.getUrl();
});

after(async () => {
 await app?.close();
 if (db) await db.end();
 const { closePools } = require('../src/db');
 await closePools();
 if (adminDb) {
  if (dbName) await adminDb.query(`DROP DATABASE ${dbName} WITH (FORCE)`);
  await adminDb.end();
 }
});

test('Chặn email rác 1 lần, xác thực Email bằng mã 6 số & link 1 chạm, khóa Pro trial trước khi xác thực', async () => {
 testEmailOutbox.length = 0;

 // 1. Reject disposable temp-mail domains
 const burner = await call('/auth/register', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { displayName: 'Spam Bot', email: 'bot123@10minutemail.com', password: 'Password123!' },
 });
 assert.equal(burner.status, 400);

 // 2. Register real email -> unverified initially, Pro trial blocked until verified
 const reg = await call('/auth/register', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { displayName: 'Lan Hương', email: 'lanhuong@gmail.com', password: 'Password123!' },
 });
 assert.equal(reg.status, 200);
 assert.equal(reg.data.verificationRequired, true);
 assert.equal(reg.data.user.verified, false);
 assert.ok(reg.data.user.verification_deadline);

 const blockedTrial = await call('/pro/trial', { method: 'POST', cookie: reg.cookie });
 assert.equal(blockedTrial.status, 403);

 // 3. Verify using 6-digit OTP delivered to outbox
 const mail = testEmailOutbox.find((m) => m.to === 'lanhuong@gmail.com' && m.purpose === 'email_verify');
 assert.ok(mail && /^\d{6}$/.test(mail.code));

 const badVerify = await call('/auth/verify-email', {
  method: 'POST',
  cookie: reg.cookie,
  body: { code: mail.code === '000000' ? '111111' : '000000' },
 });
 assert.equal(badVerify.status, 400);

 const okVerify = await call('/auth/verify-email', {
  method: 'POST',
  cookie: reg.cookie,
  body: { code: mail.code },
 });
 assert.equal(okVerify.status, 200);
 assert.equal(okVerify.data.user.verified, true);
 assert.equal(okVerify.data.user.verification_deadline, null);

 // Pro trial now unlocked!
 const okTrial = await call('/pro/trial', { method: 'POST', cookie: reg.cookie });
 assert.equal(okTrial.status, 200);

 // 4. Also verify 1-click magic link token flow
 const reg2 = await call('/auth/register', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { displayName: 'Quốc Tuấn', email: 'quoctuan@gmail.com', password: 'Password123!' },
 });
 const mail2 = testEmailOutbox.find((m) => m.to === 'quoctuan@gmail.com' && m.purpose === 'email_verify');
 assert.ok(mail2);
 const linkToken = new URL(mail2.actionUrl).searchParams.get('verifyEmail');
 assert.ok(linkToken);
 const linkRes = await call('/auth/verify-email', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { token: linkToken },
 });
 assert.equal(linkRes.status, 200);
 const hub2 = await call('/account/hub', { cookie: reg2.cookie });
 assert.equal(hub2.data.user.verified, true);
});

test('Tự động nhắc nhở ngày thứ 6 và xóa sạch tài khoản chưa xác thực sau 7 ngày (giữ nguyên tài khoản đã xác thực)', async () => {
 testEmailOutbox.length = 0;
 const unv = await call('/auth/register', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { displayName: 'Chưa Xác Thực', email: 'unverified7d@gmail.com', password: 'Password123!' },
 });
 const accId = unv.data.user.id;

 // Rewind to 6 days 2 hours ago -> sends reminder, does NOT delete yet
 await db.query("UPDATE accounts SET created_at = now() - interval '6 days 2 hours' WHERE id = $1", [accId]);
 const step6d = await serviceRef.authManager.purgeUnverifiedAccounts();
 assert.equal(step6d.reminded, 1);
 assert.equal(step6d.purged, 0);
 assert.ok(testEmailOutbox.some((m) => m.to === 'unverified7d@gmail.com' && m.purpose === 'expiry_warning'));

 // Rewind to 7 days 1 hour ago -> hard deletes account & user, freeing the email!
 await db.query("UPDATE accounts SET created_at = now() - interval '7 days 1 hour' WHERE id = $1", [accId]);
 // Also rewind a verified account to 30 days ago to prove verified accounts are NEVER purged
 await db.query("UPDATE accounts SET created_at = now() - interval '30 days' WHERE lower(email) = 'lanhuong@gmail.com'");

 const step7d = await serviceRef.authManager.purgeUnverifiedAccounts();
 assert.equal(step7d.purged, 1);
 assert.equal((await db.query('SELECT count(*)::int AS c FROM accounts WHERE id = $1', [accId])).rows[0].c, 0);
 assert.equal((await db.query("SELECT count(*)::int AS c FROM accounts WHERE lower(email) = 'lanhuong@gmail.com'")).rows[0].c, 1);

 // Email is now free to register again
 const rereg = await call('/auth/register', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { displayName: 'Đăng Ký Lại', email: 'unverified7d@gmail.com', password: 'Password123!' },
 });
 assert.equal(rereg.status, 200);
});

test('Quên mật khẩu chống dò email, đặt lại mật khẩu thành công và thu hồi phiên đăng nhập trên thiết bị khác', async () => {
 testEmailOutbox.length = 0;

 // Non-existent email returns exact same 200 message (Zero Enumeration)
 const unknown = await call('/auth/forgot-password', {
  method: 'POST',
  body: { email: 'khongtontai123@gmail.com' },
 });
 const known = await call('/auth/forgot-password', {
  method: 'POST',
  body: { email: 'lanhuong@gmail.com' },
 });
 assert.equal(unknown.status, 200);
 assert.equal(known.status, 200);
 assert.equal(unknown.data.message, known.data.message);

 // Login on a "second device" before password reset
 const device2 = await call('/auth/password-login', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { username: 'lanhuong@gmail.com', password: 'Password123!' },
 });
 assert.equal(device2.status, 200);

 const resetMail = testEmailOutbox.find((m) => m.to === 'lanhuong@gmail.com' && m.purpose === 'password_reset');
 assert.ok(resetMail);

 const resetRes = await call('/auth/reset-password', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { email: 'lanhuong@gmail.com', code: resetMail.code, newPassword: 'NewStrongPassword456!' },
 });
 assert.equal(resetRes.status, 200);

 // Old device session is immediately revoked!
 const oldSessionCheck = await call('/session', { cookie: device2.cookie });
 assert.equal(oldSessionCheck.data.user, null);

 // Old password fails, new password succeeds
 assert.equal(
  (await call('/auth/password-login', {
   method: 'POST',
   cookie: await guestCookie(),
   body: { username: 'lanhuong@gmail.com', password: 'Password123!' },
  })).status,
  401,
 );
 assert.equal(
  (await call('/auth/password-login', {
   method: 'POST',
   cookie: await guestCookie(),
   body: { username: 'lanhuong@gmail.com', password: 'NewStrongPassword456!' },
  })).status,
  200,
 );
});

test('Chống Hack & DDoS: Khóa tạm tài khoản sau 5 lần sai mật khẩu, chặn JSON >8KB trên /auth/* và giới hạn hàng đợi scrypt', async () => {
 const reg = await call('/auth/register', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { displayName: 'Bảo Mật', email: 'locktest@gmail.com', password: 'CorrectPassword99!' },
 });
 assert.equal(reg.status, 200);

 // 5 consecutive wrong password attempts trigger progressive account lockout
 for (let i = 0; i < 5; i++) {
  const r = await call('/auth/password-login', {
   method: 'POST',
   cookie: await guestCookie(),
   body: { username: 'locktest@gmail.com', password: 'WrongPassword_' + i },
  });
  assert.equal(r.status, 401);
 }

 // 6th attempt is blocked with 429 even if attacker guesses the right password during lockout window!
 const locked = await call('/auth/password-login', {
  method: 'POST',
  cookie: await guestCookie(),
  body: { username: 'locktest@gmail.com', password: 'CorrectPassword99!' },
 });
 assert.equal(locked.status, 429);

 // Payload > 8KB to /api/auth/* is immediately rejected with 413
 const huge = 'x'.repeat(9000);
 const oversize = await call('/auth/password-login', {
  method: 'POST',
  rawBody: JSON.stringify({ username: huge, password: 'abc' }),
 });
 assert.equal(oversize.status, 413);

 // AsyncSemaphore bounds concurrency and sheds overflow with 429
 const sem = new AsyncSemaphore(2, 2);
 const tasks = Array.from({ length: 6 }, () =>
  sem.run(() => new Promise((r) => setTimeout(() => r('ok'), 40))),
 );
 const settled = await Promise.allSettled(tasks);
 assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 4);
 assert.equal(settled.filter((s) => s.status === 'rejected').length, 2);
});

test('Xác thực SĐT miễn phí 0đ qua Telegram Bot (chặn giả mạo danh bạ) & Đăng nhập sinh trắc học Passkey ES256', async () => {
 const c1 = await guestCookie();
 const started = await call('/auth/phone/telegram/start', { method: 'POST', cookie: c1 });
 assert.equal(started.status, 200);
 const startCode = new URL(started.data.botUrl).searchParams.get('start')!.replace(/^login_/, '');

 // Webhook without valid secret rejected
 assert.equal(
  (await call('/auth/phone/telegram/webhook', {
   method: 'POST',
   body: { message: { chat: { id: 9001 }, from: { id: 777 }, text: '/start login_' + startCode } },
  })).status,
  401,
 );

 const whHeaders = { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET! };

 // 1. User opens bot `/start login_<code>`
 assert.equal(
  (await call('/auth/phone/telegram/webhook', {
   method: 'POST',
   headers: whHeaders,
   body: { message: { chat: { id: 9001 }, from: { id: 777, first_name: 'Hải' }, text: '/start login_' + startCode } },
  })).status,
  200,
 );

 // 2. Spoofed contact (forwarding someone else's contact card where contact.user_id !== from.id) MUST fail with 400!
 assert.equal(
  (await call('/auth/phone/telegram/webhook', {
   method: 'POST',
   headers: whHeaders,
   body: {
    message: {
     chat: { id: 9001 },
     from: { id: 777, first_name: 'Hải' },
     contact: { phone_number: '84912345678', user_id: 999999 },
    },
   },
  })).status,
  400,
 );

 // 3. Genuine native contact share (`contact.user_id === from.id`) succeeds!
 assert.equal(
  (await call('/auth/phone/telegram/webhook', {
   method: 'POST',
   headers: whHeaders,
   body: {
    message: {
     chat: { id: 9001 },
     from: { id: 777, first_name: 'Hải', last_name: 'Nam' },
     contact: { phone_number: '0912345678', user_id: 777 },
    },
   },
  })).status,
  200,
 );

 // 4. Poll completes login with normalized E.164 phone +84912345678
 const polled = await call('/auth/phone/telegram/poll', {
  method: 'POST',
  cookie: c1,
  body: { challengeId: started.data.challengeId, pollSecret: started.data.pollSecret },
 });
 assert.equal(polled.status, 200);
 assert.equal(polled.data.status, 'verified');
 assert.equal(polled.data.user.phone, '+84912345678');
 assert.equal(polled.data.user.verified, true);

 // 5. Register a real cryptographic ES256 (P-256) WebAuthn Passkey on this phone account & log back in!
 const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
 const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
 const credId = 'pk_cred_' + randomUUID().replace(/-/g, '');

 const regOpts = await call('/auth/passkey/register/options', { method: 'POST', cookie: polled.cookie });
 assert.equal(regOpts.status, 200);

 const rpHash = createHash('sha256').update('127.0.0.1').digest();
 const flags = Buffer.from([0x05]); // User Present (0x01) + User Verified (0x04)
 const counter1 = Buffer.alloc(4);
 counter1.writeUInt32BE(1, 0);
 const authDataReg = Buffer.concat([rpHash, flags, counter1]);
 const clientDataReg = Buffer.from(
  JSON.stringify({ type: 'webauthn.create', challenge: regOpts.data.challenge, origin }),
 );

 const regVer = await call('/auth/passkey/register/verify', {
  method: 'POST',
  cookie: polled.cookie,
  body: {
   challenge: regOpts.data.challenge,
   credentialId: credId,
   clientDataJSON: clientDataReg.toString('base64url'),
   authenticatorData: authDataReg.toString('base64url'),
   publicKeySpki: spkiDer.toString('base64url'),
   algorithm: -7,
   deviceLabel: 'iPhone FaceID Test',
  },
 });
 assert.equal(regVer.status, 200);

 // Now login on a brand-new guest session using ONLY the Passkey cryptographic signature!
 const freshGuest = await guestCookie();
 const loginOpts = await call('/auth/passkey/login/options', {
  method: 'POST',
  body: { identifier: '0912345678' },
 });
 assert.equal(loginOpts.status, 200);
 assert.equal(loginOpts.data.allowCredentials[0].id, credId);

 const counter2 = Buffer.alloc(4);
 counter2.writeUInt32BE(2, 0);
 const authDataLogin = Buffer.concat([rpHash, flags, counter2]);
 const clientDataLogin = Buffer.from(
  JSON.stringify({ type: 'webauthn.get', challenge: loginOpts.data.challenge, origin }),
 );
 const signedPayload = Buffer.concat([
  authDataLogin,
  createHash('sha256').update(clientDataLogin).digest(),
 ]);
 const signature = cryptoSign('sha256', signedPayload, privateKey);

 const pkLogged = await call('/auth/passkey/login/verify', {
  method: 'POST',
  cookie: freshGuest,
  body: {
   challenge: loginOpts.data.challenge,
   credentialId: credId,
   clientDataJSON: clientDataLogin.toString('base64url'),
   authenticatorData: authDataLogin.toString('base64url'),
   signature: signature.toString('base64url'),
  },
 });
 assert.equal(pkLogged.status, 200);
 assert.equal(pkLogged.data.user.phone, '+84912345678');
});
