import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, readPool, transaction } from './db';
import { devAuthEnabled, VerifiedIdentity, verifyIdentity } from './auth';
import { hashPassword, verifyPassword } from './password';
import {
 buildPasswordResetEmailContent,
 buildVerificationEmailContent,
 ensureMinLatency,
 generateEmailAuthSecrets,
 hashAuthSecret,
 normalizeAndValidateEmail,
 normalizeVietnamPhone,
 safeEqualHex,
 sendAccountEmail,
 verifyTurnstile,
} from './auth-security';
import {
 extractTelegramVerifiedContact,
 generateWebAuthnChallenge,
 resolveExpectedRpId,
 sendTelegramBotPrompt,
 telegramPhoneBotConfigured,
 verifyPasskeyAssertion,
 verifyPasskeyRegistration,
 verifyTelegramWebhookSecret,
} from './phone-passkey';

function fail(message: string, status = 400): never {
 throw new HttpException(message, status);
}
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export type SessionRow = {
 id: string;
 account_id: string | null;
 pending_restaurant: string | null;
 pending_at: Date | null;
};

export type AccountAuthDeps = {
 clientIp: (req: Request) => string;
 readRate: (key: string, limit: number, seconds: number) => void;
 rate: (key: string, limit: number, seconds: number) => Promise<void>;
 rotateSessionToAccount: (
  oldSessionId: string,
  accountId: string,
  res: Response,
  authMethod?: string,
 ) => Promise<{ next: SessionRow; continuation: any }>;
 loadUser: (s: SessionRow) => Promise<any>;
 allowedOrigins: () => Set<string>;
 publicWebOrigin: () => string;
};

// Ephemeral map of Telegram chatId -> latest challengeCode started in that chat (TTL 10m)
const telegramChatChallenge = new Map<number, { code: string; expiresAt: number }>();

export class AccountAuthManager {
 constructor(private readonly deps: AccountAuthDeps) {}

 private async issueAndSendVerificationEmail(accountId: string, email: string, displayName: string) {
  const { code, linkToken, codeHash, linkTokenHash } = generateEmailAuthSecrets(accountId, 'email_verify');
  await pool.query(
   `UPDATE auth_tokens SET consumed_at = now()
    WHERE account_id = $1 AND purpose = 'email_verify' AND consumed_at IS NULL`,
   [accountId],
  );
  await pool.query(
   `INSERT INTO auth_tokens(id, account_id, purpose, code_hash, link_token_hash, expires_at)
    VALUES($1, $2, 'email_verify', $3, $4, now() + interval '24 hours')`,
   [randomUUID(), accountId, codeHash, linkTokenHash],
  );
  const verifyUrl = `${this.deps.publicWebOrigin()}/ha-noi?verifyEmail=${encodeURIComponent(linkToken)}`;
  const mail = buildVerificationEmailContent(displayName, code, verifyUrl);
  const delivery = await sendAccountEmail({
   to: email,
   subject: mail.subject,
   html: mail.html,
   text: mail.text,
   code,
   actionUrl: verifyUrl,
   purpose: 'email_verify',
  });
  return { delivered: delivery.delivered, provider: delivery.provider };
 }

 /**
  * 1. Registration with Disposable Email Blocking, Turnstile Anti-Bot, and 7-Day Email Verification Deadline
  */
 async register(s: SessionRow, req: Request, res: Response) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('reg-burst:' + ip, 8, 300);
  await this.deps.rate('register:' + sha256(ip), 10, 600);

  const b = z
   .object({
    displayName: z.string().trim().min(2, 'Tên hiển thị tối thiểu 2 ký tự').max(50),
    username: z
     .string()
     .trim()
     .toLowerCase()
     .min(3, 'Email hoặc tên đăng nhập tối thiểu 3 ký tự')
     .max(120)
     .regex(/^[a-z0-9._@+-]+$/, 'Chỉ dùng chữ không dấu, số hoặc địa chỉ email')
     .optional(),
    email: z.string().trim().max(120).optional(),
    password: z.string().min(8, 'Mật khẩu cần tối thiểu 8 ký tự').max(128),
    turnstileToken: z.string().max(4096).optional(),
   })
   .strict()
   .parse(req.body);

  await verifyTurnstile(b.turnstileToken, ip);

  const rawIdentifier = (b.email || b.username || '').trim().toLowerCase();
  if (!rawIdentifier) fail('Vui lòng nhập địa chỉ email để đăng ký.', 400);

  let normalizedEmail: string | null = null;
  let usernameKey = rawIdentifier;

  if (rawIdentifier.includes('@') || b.email) {
   normalizedEmail = normalizeAndValidateEmail(rawIdentifier);
   usernameKey = normalizedEmail;
  } else if (!devAuthEnabled()) {
   fail('Vui lòng đăng ký bằng địa chỉ email hợp lệ (ví dụ: tenban@gmail.com).', 400);
  }

  const pwHash = await hashPassword(b.password);

  const accountId = await transaction(async (c) => {
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cred:' + usernameKey]);

   // If an unverified account squatted this email > 7 days ago, clean it up inline first
   if (normalizedEmail) {
    const stale = await c.query(
     `SELECT id, user_id FROM accounts
      WHERE lower(email) = $1
        AND email_verified_at IS NULL
        AND phone_verified_at IS NULL
        AND created_at < now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.account_id = accounts.id)`,
     [normalizedEmail],
    );
    for (const row of stale.rows) {
     await c.query('DELETE FROM accounts WHERE id = $1', [row.id]);
     await c.query('DELETE FROM users WHERE id = $1', [row.user_id]);
    }
   }

   const existsCred = await c.query('SELECT 1 FROM account_credentials WHERE username = $1', [usernameKey]);
   if (existsCred.rowCount) fail('Địa chỉ email hoặc tên đăng nhập này đã được đăng ký.', 409);

   if (normalizedEmail) {
    const existsEmail = await c.query('SELECT 1 FROM accounts WHERE lower(email) = $1', [normalizedEmail]);
    if (existsEmail.rowCount) fail('Địa chỉ email này đã được liên kết với tài khoản khác.', 409);
   }

   const userId = randomUUID();
   const accId = randomUUID();
   await c.query('INSERT INTO users(id, display_name) VALUES($1, $2)', [userId, b.displayName]);
   await c.query(
    'INSERT INTO accounts(id, user_id, email, email_verified_at) VALUES($1, $2, $3, $4)',
    [accId, userId, normalizedEmail, normalizedEmail ? null : new Date()],
   );
   await c.query(
    'INSERT INTO account_credentials(account_id, username, password_hash) VALUES($1, $2, $3)',
    [accId, usernameKey, pwHash],
   );
   await c.query('INSERT INTO account_preferences(account_id) VALUES($1) ON CONFLICT DO NOTHING', [accId]);
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'account-register', $1)", [accId]);
   return accId;
  });

  let verificationSent = false;
  if (normalizedEmail) {
   const resMail = await this.issueAndSendVerificationEmail(accountId, normalizedEmail, b.displayName);
   verificationSent = resMail.delivered;
  }

  const { next, continuation } = await this.deps.rotateSessionToAccount(s.id, accountId, res);
  return {
   user: await this.deps.loadUser(next),
   continuation,
   verificationRequired: Boolean(normalizedEmail),
   verificationSent,
  };
 }

 /**
  * 2. Hardened Password Login with Progressive Account Lockout & Adaptive Turnstile
  */
 async passwordLogin(s: SessionRow, req: Request, res: Response) {
  const startedAt = Date.now();
  const ip = this.deps.clientIp(req);
  this.deps.readRate('pwlogin-burst:' + ip, 12, 60);
  await this.deps.rate('pwlogin:' + sha256(ip), 15, 300);

  const b = z
   .object({
    username: z.string().trim().toLowerCase().min(3).max(120),
    password: z.string().min(1).max(128),
    turnstileToken: z.string().max(4096).optional(),
   })
   .strict()
   .parse(req.body);

  const cred = (
   await pool.query(
    `SELECT c.account_id, c.password_hash, c.failed_attempts, c.locked_until
     FROM account_credentials c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.username = $1 OR lower(a.email) = $1
     LIMIT 1`,
    [b.username],
   )
  ).rows[0];

  if (cred && Number(cred.failed_attempts) >= 3) {
   await verifyTurnstile(b.turnstileToken, ip);
  }

  // Always run scrypt verification (dummy derivation if account doesn't exist) to prevent timing enumeration
  const valid = await verifyPassword(b.password, cred?.password_hash);

  if (cred?.locked_until && new Date(cred.locked_until).getTime() > Date.now()) {
   const minsLeft = Math.max(1, Math.ceil((new Date(cred.locked_until).getTime() - Date.now()) / 60000));
   await ensureMinLatency(startedAt);
   fail(
    `Tài khoản đang tạm khóa đăng nhập mật khẩu (${minsLeft} phút) để chống dò mật khẩu. Bạn có thể thử lại sau hoặc dùng Quên mật khẩu / Google.`,
    429,
   );
  }

  if (!valid || !cred) {
   if (cred) {
    const nextFails = Number(cred.failed_attempts || 0) + 1;
    const lockSql =
     nextFails >= 10
      ? "now() + interval '30 minutes'"
      : nextFails >= 5
        ? "now() + interval '5 minutes'"
        : 'NULL';
    await pool.query(
     `UPDATE account_credentials SET failed_attempts = $2, locked_until = ${lockSql} WHERE account_id = $1`,
     [cred.account_id, nextFails],
    );
   }
   await ensureMinLatency(startedAt);
   fail('Tên đăng nhập / email hoặc mật khẩu chưa đúng.', 401);
  }

  if (cred.failed_attempts > 0 || cred.locked_until) {
   await pool.query('UPDATE account_credentials SET failed_attempts = 0, locked_until = NULL WHERE account_id = $1', [
    cred.account_id,
   ]);
  }

  const { next, continuation } = await this.deps.rotateSessionToAccount(s.id, cred.account_id, res);
  return { user: await this.deps.loadUser(next), continuation };
 }

 /**
  * 3. Verify Email via 6-digit OTP code OR 1-click link token
  */
 async verifyEmail(s: SessionRow, req: Request) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('verify-email:' + ip, 12, 300);
  await this.deps.rate('verify-email:' + sha256(ip), 15, 600);

  const b = z
   .object({
    code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số').optional(),
    token: z.string().trim().min(16).max(128).optional(),
   })
   .strict()
   .parse(req.body);

  if (!b.code && !b.token) fail('Cần mã 6 chữ số hoặc liên kết xác thực.', 400);

  if (b.token) {
   const linkHash = hashAuthSecret('email_verify:link', b.token);
   const verifiedAccountId = await transaction(async (c) => {
    const tok = (
     await c.query(
      `SELECT id, account_id, expires_at, consumed_at FROM auth_tokens
       WHERE purpose = 'email_verify' AND link_token_hash = $1 FOR UPDATE`,
      [linkHash],
     )
    ).rows[0];
    if (!tok || tok.consumed_at || new Date(tok.expires_at).getTime() <= Date.now()) {
     fail('Liên kết xác thực không hợp lệ hoặc đã hết hạn.', 400);
    }
    await c.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [tok.id]);
    await c.query('UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [
     tok.account_id,
    ]);
    await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'email-verified-link', $1)", [tok.account_id]);
    return tok.account_id as string;
   });
   return { ok: true, accountId: verifiedAccountId, user: await this.deps.loadUser(s) };
  }

  // 6-digit OTP verification for the currently logged-in account
  if (!s.account_id) fail('Vui lòng đăng nhập tài khoản để nhập mã 6 chữ số.', 401);
  const expectedHash = hashAuthSecret(`email_verify:code:${s.account_id}`, b.code!);

  await transaction(async (c) => {
   const tok = (
    await c.query(
     `SELECT id, code_hash, attempts, expires_at FROM auth_tokens
      WHERE account_id = $1 AND purpose = 'email_verify' AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
     [s.account_id],
    )
   ).rows[0];

   if (!tok || new Date(tok.expires_at).getTime() <= Date.now() || Number(tok.attempts) >= 5) {
    fail('Mã xác thực đã hết hạn hoặc nhập sai quá 5 lần. Vui lòng bấm Gửi lại mã mới.', 400);
   }

   if (!safeEqualHex(tok.code_hash, expectedHash)) {
    const nextAttempts = Number(tok.attempts) + 1;
    await c.query(
     'UPDATE auth_tokens SET attempts = $2, consumed_at = CASE WHEN $2 >= 5 THEN now() ELSE NULL END WHERE id = $1',
     [tok.id, nextAttempts],
    );
    fail(`Mã xác thực chưa đúng (còn ${Math.max(0, 5 - nextAttempts)} lần thử).`, 400);
   }

   await c.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [tok.id]);
   await c.query('UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [
    s.account_id,
   ]);
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'email-verified-code', $1)", [s.account_id]);
  });

  return { ok: true, user: await this.deps.loadUser(s) };
 }

 /**
  * 4. Resend Verification Email (Protected against Email Bombing: 1/120s & 5/day)
  */
 async resendVerification(s: SessionRow, req: Request) {
  if (!s.account_id) fail('Vui lòng đăng nhập trước.', 401);
  const ip = this.deps.clientIp(req);
  const b = z.object({ turnstileToken: z.string().max(4096).optional() }).strict().parse(req.body || {});
  await verifyTurnstile(b.turnstileToken, ip);

  await this.deps.rate('resend-cooldown:' + s.account_id, 1, 120);
  await this.deps.rate('resend-daily:' + s.account_id, 5, 86400);
  await this.deps.rate('resend-ip:' + sha256(ip), 8, 3600);

  const acc = (
   await pool.query(
    `SELECT a.email, a.email_verified_at, u.display_name
     FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
    [s.account_id],
   )
  ).rows[0];

  if (!acc?.email) fail('Tài khoản này chưa gắn địa chỉ email.', 400);
  if (acc.email_verified_at) return { ok: true, alreadyVerified: true };

  const delivery = await this.issueAndSendVerificationEmail(s.account_id, acc.email, acc.display_name);
  return { ok: true, delivered: delivery.delivered };
 }

 /**
  * 5. Forgot Password (Zero-Enumeration Constant-Time Flow)
  */
 async forgotPassword(req: Request) {
  const startedAt = Date.now();
  const ip = this.deps.clientIp(req);
  this.deps.readRate('forgot-burst:' + ip, 5, 300);
  await this.deps.rate('forgot-ip:' + sha256(ip), 4, 900);

  const b = z
   .object({
    email: z.string().trim().max(120),
    turnstileToken: z.string().max(4096).optional(),
   })
   .strict()
   .parse(req.body);

  await verifyTurnstile(b.turnstileToken, ip);
  const email = normalizeAndValidateEmail(b.email);
  await this.deps.rate('forgot-email:' + sha256(email), 3, 900);

  const acc = (
   await pool.query('SELECT id FROM accounts WHERE lower(email) = $1 LIMIT 1', [email])
  ).rows[0];

  if (acc) {
   const { code, linkToken, codeHash, linkTokenHash } = generateEmailAuthSecrets(acc.id, 'password_reset');
   await pool.query(
    `UPDATE auth_tokens SET consumed_at = now()
     WHERE account_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
    [acc.id],
   );
   await pool.query(
    `INSERT INTO auth_tokens(id, account_id, purpose, code_hash, link_token_hash, expires_at)
     VALUES($1, $2, 'password_reset', $3, $4, now() + interval '15 minutes')`,
    [randomUUID(), acc.id, codeHash, linkTokenHash],
   );
   const resetUrl = `${this.deps.publicWebOrigin()}/ha-noi?resetToken=${encodeURIComponent(linkToken)}`;
   const mail = buildPasswordResetEmailContent(code, resetUrl);
   await sendAccountEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    code,
    actionUrl: resetUrl,
    purpose: 'password_reset',
   });
  }

  await ensureMinLatency(startedAt, 260);
  return {
   ok: true,
   message: 'Nếu địa chỉ email này đã đăng ký trên Tìm quán ngon, mã khôi phục mật khẩu (hiệu lực 15 phút) đã được gửi đi.',
  };
 }

 /**
  * 6. Reset Password (Invalidates all other sessions across devices & verifies email ownership)
  */
 async resetPassword(s: SessionRow, req: Request, res: Response) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('reset-burst:' + ip, 8, 300);
  await this.deps.rate('reset-ip:' + sha256(ip), 10, 900);

  const b = z
   .object({
    email: z.string().trim().max(120).optional(),
    code: z.string().trim().regex(/^\d{6}$/, 'Mã khôi phục gồm 6 chữ số').optional(),
    token: z.string().trim().min(16).max(128).optional(),
    newPassword: z.string().min(8, 'Mật khẩu mới cần tối thiểu 8 ký tự').max(128),
   })
   .strict()
   .parse(req.body);

  if (!b.token && !(b.email && b.code)) {
   fail('Vui lòng cung cấp liên kết khôi phục hoặc email kèm mã 6 chữ số.', 400);
  }

  const newPwHash = await hashPassword(b.newPassword);

  const accountId = await transaction(async (c) => {
   let targetAccountId: string | null = null;

   if (b.token) {
    const linkHash = hashAuthSecret('password_reset:link', b.token);
    const tok = (
     await c.query(
      `SELECT id, account_id, expires_at, consumed_at FROM auth_tokens
       WHERE purpose = 'password_reset' AND link_token_hash = $1 FOR UPDATE`,
      [linkHash],
     )
    ).rows[0];
    if (!tok || tok.consumed_at || new Date(tok.expires_at).getTime() <= Date.now()) {
     fail('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn (15 phút).', 400);
    }
    await c.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [tok.id]);
    targetAccountId = tok.account_id;
   } else {
    const normEmail = normalizeAndValidateEmail(b.email!);
    const acc = (await c.query('SELECT id FROM accounts WHERE lower(email) = $1 FOR UPDATE', [normEmail])).rows[0];
    if (!acc) fail('Mã khôi phục không hợp lệ hoặc đã hết hạn.', 400);

    const tok = (
     await c.query(
      `SELECT id, code_hash, attempts, expires_at FROM auth_tokens
       WHERE account_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [acc.id],
     )
    ).rows[0];
    if (!tok || new Date(tok.expires_at).getTime() <= Date.now() || Number(tok.attempts) >= 5) {
     fail('Mã khôi phục đã hết hạn hoặc nhập sai quá 5 lần.', 400);
    }
    const expectedCodeHash = hashAuthSecret(`password_reset:code:${acc.id}`, b.code!);
    if (!safeEqualHex(tok.code_hash, expectedCodeHash)) {
     const nextAtt = Number(tok.attempts) + 1;
     await c.query(
      'UPDATE auth_tokens SET attempts = $2, consumed_at = CASE WHEN $2 >= 5 THEN now() ELSE NULL END WHERE id = $1',
      [tok.id, nextAtt],
     );
     fail('Mã khôi phục chưa đúng.', 400);
    }
    await c.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [tok.id]);
    targetAccountId = acc.id;
   }

   if (!targetAccountId) fail('Mã khôi phục không hợp lệ.', 400);
   const accRow = (await c.query('SELECT email FROM accounts WHERE id = $1', [targetAccountId])).rows[0];
   const usernameVal = accRow?.email || targetAccountId;

   await c.query(
    `INSERT INTO account_credentials(account_id, username, password_hash, failed_attempts, locked_until, password_changed_at)
     VALUES($1, $2, $3, 0, NULL, now())
     ON CONFLICT (account_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      failed_attempts = 0,
      locked_until = NULL,
      password_changed_at = now()`,
    [targetAccountId, usernameVal, newPwHash],
   );

   // Proving inbox access also completes email verification!
   await c.query('UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [
    targetAccountId,
   ]);

   // Revoke ALL other sessions across devices for this account
   await c.query(
    "UPDATE sessions SET last_seen = now() - interval '25 hours', account_id = NULL WHERE account_id = $1 AND id <> $2",
    [targetAccountId, s.id],
   );
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'password-reset', $1)", [targetAccountId]);
   return targetAccountId!;
  });

  const { next, continuation } = await this.deps.rotateSessionToAccount(s.id, accountId, res);
  return { ok: true, user: await this.deps.loadUser(next), continuation };
 }

 /**
  * 7. 7-Day Unverified Email Auto-Purge & Day-6 Reminder Worker
  */
 async purgeUnverifiedAccounts(): Promise<{ reminded: number; purged: number }> {
  // Clean expired ephemeral challenges/tokens first
  await pool
   .query("DELETE FROM passkey_challenges WHERE expires_at < now() - interval '10 minutes'")
   .catch(() => {});
  await pool
   .query("DELETE FROM phone_auth_challenges WHERE expires_at < now() - interval '1 hour'")
   .catch(() => {});

  // Step A: Day-6 final reminder email (between 6 and 7 days old)
  const toRemind = (
   await pool.query(
    `SELECT a.id, a.email, u.display_name
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE a.email IS NOT NULL
       AND a.email_verified_at IS NULL
       AND a.phone_verified_at IS NULL
       AND a.verify_reminded_at IS NULL
       AND a.created_at <= now() - interval '6 days'
       AND a.created_at > now() - interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.account_id = a.id)
     LIMIT 50`,
   )
  ).rows;

  let reminded = 0;
  for (const row of toRemind) {
   await pool.query('UPDATE accounts SET verify_reminded_at = now() WHERE id = $1', [row.id]);
   await sendAccountEmail({
    to: row.email,
    subject: 'Nhắc nhở: Tài khoản Tìm quán ngon sẽ tự xóa sau 24 giờ nếu chưa xác thực',
    text: `Xin chào ${row.display_name}, tài khoản trên timquanngon.com của bạn chưa được xác thực email và sẽ tự động xóa sau 24 giờ nữa. Vui lòng đăng nhập tại ${this.deps.publicWebOrigin()} để xác thực.`,
    html: `<p>Xin chào <b>${row.display_name.replace(/[<>&"]/g, '')}</b>,</p><p>Tài khoản của bạn trên <a href="${this.deps.publicWebOrigin()}">timquanngon.com</a> chưa xác thực email trong 6 ngày qua và sẽ <b>tự động bị xóa sau 24 giờ nữa</b>. Hãy mở mục Tài khoản trên web để hoàn tất xác thực nhé!</p>`,
    purpose: 'expiry_warning',
   });
   reminded++;
  }

  // Step B: Hard purge accounts older than 7 days (168h) that never verified email/phone/OAuth
  const purged = await transaction(async (c) => {
   const expired = (
    await c.query(
     `SELECT a.id, a.user_id
      FROM accounts a
      WHERE a.email_verified_at IS NULL
        AND a.phone_verified_at IS NULL
        AND a.created_at <= now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.account_id = a.id)
      LIMIT 200
      FOR UPDATE SKIP LOCKED`,
    )
   ).rows;

   if (!expired.length) return 0;

   const accIds = expired.map((r) => r.id);
   const userIds = expired.map((r) => r.user_id);

   await c.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [accIds]);
   await c.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES('system', 'purge-unverified-7d', 'batch', $1)", [
    JSON.stringify({ count: expired.length }),
   ]);
   return expired.length;
  });

  return { reminded, purged };
 }

 /**
  * 8. Google & Facebook 1-Click OAuth Login with Anti-Prehijacking Account Linking
  */
 async oauthLogin(provider: 'google' | 'facebook', s: SessionRow, req: Request, res: Response) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('oauth-burst:' + ip, 15, 60);
  await this.deps.rate('oauth:' + sha256(ip), 20, 300);

  const b = z
   .object({
    token: z.string().min(10).max(6000),
   })
   .strict()
   .parse(req.body);

  let identity: VerifiedIdentity;
  try {
   identity = await verifyIdentity(provider, b.token);
  } catch (e) {
   if (e instanceof HttpException) throw e;
   fail(`Xác thực ${provider === 'google' ? 'Google' : 'Facebook'} không hợp lệ hoặc đã hết hạn.`, 401);
  }

  const accountId = await transaction(async (c) => {
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${provider}:${identity.subject}`]);
   let accId = (
    await c.query('SELECT account_id FROM auth_identities WHERE provider = $1 AND subject = $2', [
     provider,
     identity.subject,
    ])
   ).rows[0]?.account_id as string | undefined;

   if (!accId && identity.email && identity.emailVerified) {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`email:${identity.email}`]);
    const existingByEmail = (
     await c.query('SELECT id, email_verified_at FROM accounts WHERE lower(email) = $1 FOR UPDATE', [identity.email])
    ).rows[0];

    if (existingByEmail) {
     accId = existingByEmail.id;
     if (!existingByEmail.email_verified_at) {
      // Anti-Prehijacking: Evict unverified password squatter & revoke their sessions!
      await c.query('DELETE FROM account_credentials WHERE account_id = $1', [accId]);
      await c.query(
       "UPDATE sessions SET last_seen = now() - interval '25 hours', account_id = NULL WHERE account_id = $1 AND id <> $2",
       [accId, s.id],
      );
      await c.query('UPDATE accounts SET email_verified_at = now() WHERE id = $1', [accId]);
     }
     await c.query(
      'INSERT INTO auth_identities(provider, subject, account_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
      [provider, identity.subject, accId],
     );
    }
   }

   if (!accId) {
    accId = randomUUID();
    const userId = randomUUID();
    await c.query('INSERT INTO users(id, display_name) VALUES($1, $2)', [userId, identity.name]);
    await c.query(
     'INSERT INTO accounts(id, user_id, email, email_verified_at) VALUES($1, $2, $3, $4)',
     [accId, userId, identity.email || null, identity.emailVerified ? new Date() : null],
    );
    await c.query('INSERT INTO auth_identities(provider, subject, account_id) VALUES($1, $2, $3)', [
     provider,
     identity.subject,
     accId,
    ]);
    await c.query('INSERT INTO account_preferences(account_id) VALUES($1) ON CONFLICT DO NOTHING', [accId]);
    await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'oauth-register', $1, $2)", [
     accId,
     JSON.stringify({ provider }),
    ]);
   }
   return accId!;
  });

  const { next, continuation } = await this.deps.rotateSessionToAccount(s.id, accountId, res, provider);
  return { user: await this.deps.loadUser(next), continuation };
 }

 /**
  * 9. Logout From All Other Devices
  */
 async logoutOtherSessions(s: SessionRow) {
  if (!s.account_id) fail('Bạn chưa đăng nhập.', 401);
  const r = await pool.query(
   "UPDATE sessions SET last_seen = now() - interval '25 hours', account_id = NULL WHERE account_id = $1 AND id <> $2",
   [s.account_id, s.id],
  );
  return { ok: true, revokedCount: r.rowCount || 0 };
 }

 /**
  * 10. Zero-Cost Reverse Phone Verification via Official Telegram Bot (`request_contact`)
  */
 async startTelegramPhoneChallenge(s: SessionRow, req: Request) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('tg-start:' + ip, 8, 300);
  await this.deps.rate('tg-start:' + sha256(ip), 10, 600);

  const tg = telegramPhoneBotConfigured();
  if (!tg.enabled || !tg.botUsername) {
   fail(
    'Bot Telegram xác thực SĐT miễn phí chưa gắn khóa TELEGRAM_BOT_TOKEN. Bạn có thể đăng nhập bằng Google / Email ngay!',
    503,
   );
  }

  const challengeId = randomUUID();
  const challengeCode = randomBytes(18).toString('base64url');
  const pollSecret = randomBytes(24).toString('base64url');
  const pollSecretHash = hashAuthSecret('tg_poll', pollSecret);

  await pool.query(
   `INSERT INTO phone_auth_challenges(id, challenge_code, poll_secret_hash, session_id, expires_at)
    VALUES($1, $2, $3, $4, now() + interval '5 minutes')`,
   [challengeId, challengeCode, pollSecretHash, s.id],
  );

  return {
   challengeId,
   pollSecret,
   botUrl: `https://t.me/${tg.botUsername}?start=login_${challengeCode}`,
   expiresInSeconds: 300,
  };
 }

 async handleTelegramWebhook(req: Request) {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  if (!verifyTelegramWebhookSecret(typeof secretHeader === 'string' ? secretHeader : undefined)) {
   fail('Chữ ký Telegram Webhook không hợp lệ.', 401);
  }

  const parsed = extractTelegramVerifiedContact(req.body);

  if (parsed.startChallenge) {
   const { chatId, challengeCode } = parsed.startChallenge;
   const ch = (
    await pool.query(
     'SELECT id FROM phone_auth_challenges WHERE challenge_code = $1 AND consumed_at IS NULL AND expires_at > now()',
     [challengeCode],
    )
   ).rows[0];
   if (!ch) {
    await sendTelegramBotPrompt(chatId, '⚠️ Phiên xác thực đã hết hạn. Vui lòng quay lại timquanngon.com và bấm lại nút Xác thực SĐT.');
    return { ok: true };
   }
   telegramChatChallenge.set(chatId, { code: challengeCode, expiresAt: Date.now() + 5 * 60_000 });
   if (telegramChatChallenge.size > 5000) {
    const firstKey = telegramChatChallenge.keys().next().value;
    if (firstKey !== undefined) telegramChatChallenge.delete(firstKey);
   }
   await sendTelegramBotPrompt(
    chatId,
    `👋 Chào bạn! Bấm nút <b>📱 Xác nhận Số điện thoại chính chủ</b> bên dưới để đăng nhập vào <b>Tìm quán ngon</b> hoàn toàn miễn phí.\n\nMã phiên: ${challengeCode}`,
    true,
   );
   return { ok: true };
  }

  if (parsed.verifiedContact) {
   const { chatId, telegramUserId, phone, displayName } = parsed.verifiedContact;
   const mapped = telegramChatChallenge.get(chatId);
   const code =
    parsed.verifiedContact.challengeCode ||
    (mapped && mapped.expiresAt > Date.now() ? mapped.code : null);

   if (!code) {
    await sendTelegramBotPrompt(chatId, '⚠️ Không tìm thấy phiên đăng nhập đang chờ. Vui lòng bấm từ trang timquanngon.com.');
    return { ok: true };
   }

   const updated = await pool.query(
    `UPDATE phone_auth_challenges
     SET phone = $2, telegram_user_id = $3, display_name = $4, verified_at = now()
     WHERE challenge_code = $1 AND consumed_at IS NULL AND verified_at IS NULL AND expires_at > now()
     RETURNING id`,
    [code, phone, telegramUserId, displayName],
   );
   telegramChatChallenge.delete(chatId);

   if (updated.rowCount) {
    await sendTelegramBotPrompt(
     chatId,
     `✅ Đã xác thực số <b>${phone}</b> thành công! Hãy quay lại trình duyệt <b>timquanngon.com</b> — tài khoản của bạn đã tự động mở.`,
     false,
    );
   }
   return { ok: true };
  }

  return { ok: true };
 }

 async pollTelegramPhoneChallenge(s: SessionRow, req: Request, res: Response) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('tg-poll:' + ip, 40, 60);

  const b = z
   .object({
    challengeId: z.string().uuid(),
    pollSecret: z.string().min(16).max(128),
   })
   .strict()
   .parse(req.body);

  const ch = (
   await pool.query('SELECT * FROM phone_auth_challenges WHERE id = $1', [b.challengeId])
  ).rows[0];

  if (!ch || ch.session_id !== s.id || ch.consumed_at || new Date(ch.expires_at).getTime() <= Date.now()) {
   fail('Phiên xác thực số điện thoại đã hết hạn.', 400);
  }
  const expectedHash = hashAuthSecret('tg_poll', b.pollSecret);
  if (!safeEqualHex(ch.poll_secret_hash, expectedHash)) {
   fail('Khóa kiểm tra phiên không hợp lệ.', 403);
  }

  if (!ch.verified_at || !ch.phone) {
   return { status: 'pending' as const };
  }

  const accountId = await transaction(async (c) => {
   const locked = (
    await c.query(
     'UPDATE phone_auth_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING *',
     [b.challengeId],
    )
   ).rows[0];
   if (!locked) fail('Phiên xác thực này đã được sử dụng.', 409);

   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['phone:' + locked.phone]);

   // If user is already logged in on this session, attach verified phone to their current account!
   if (s.account_id) {
    const conflict = await c.query('SELECT id FROM accounts WHERE phone = $1 AND id <> $2', [locked.phone, s.account_id]);
    if (!conflict.rowCount) {
     await c.query('UPDATE accounts SET phone = $2, phone_verified_at = now() WHERE id = $1', [
      s.account_id,
      locked.phone,
     ]);
     await c.query(
      "INSERT INTO auth_identities(provider, subject, account_id) VALUES('telegram_phone', $1, $2) ON CONFLICT DO NOTHING",
      [locked.telegram_user_id, s.account_id],
     );
     return s.account_id;
    }
   }

   let accId = (await c.query('SELECT id FROM accounts WHERE phone = $1', [locked.phone])).rows[0]?.id as
    | string
    | undefined;
   if (!accId) {
    accId = (
     await c.query("SELECT account_id FROM auth_identities WHERE provider = 'telegram_phone' AND subject = $1", [
      locked.telegram_user_id,
     ])
    ).rows[0]?.account_id;
   }

   if (!accId) {
    accId = randomUUID();
    const userId = randomUUID();
    await c.query('INSERT INTO users(id, display_name) VALUES($1, $2)', [userId, locked.display_name || 'Bạn dùng SĐT']);
    await c.query('INSERT INTO accounts(id, user_id, phone, phone_verified_at) VALUES($1, $2, $3, now())', [
     accId,
     userId,
     locked.phone,
    ]);
    await c.query("INSERT INTO auth_identities(provider, subject, account_id) VALUES('telegram_phone', $1, $2)", [
     locked.telegram_user_id,
     accId,
    ]);
    await c.query('INSERT INTO account_preferences(account_id) VALUES($1) ON CONFLICT DO NOTHING', [accId]);
    await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'phone-telegram-register', $1)", [accId]);
   } else {
    await c.query('UPDATE accounts SET phone = COALESCE(phone, $2), phone_verified_at = COALESCE(phone_verified_at, now()) WHERE id = $1', [
     accId,
     locked.phone,
    ]);
   }

   return accId!;
  });

  const { next, continuation } = await this.deps.rotateSessionToAccount(s.id, accountId, res);
  return { status: 'verified' as const, user: await this.deps.loadUser(next), continuation };
 }

 /**
  * 11. Zero-Cost WebAuthn Passkeys (FaceID / TouchID / Windows Hello)
  */
 async passkeyRegisterOptions(s: SessionRow, req: Request) {
  const accountId = s.account_id;
  if (!accountId) fail('Vui lòng đăng nhập tài khoản trước khi bật FaceID / Vân tay (Passkey).', 401);
  await this.deps.rate('pk-reg-opt:' + accountId, 10, 600);

  const u = await this.deps.loadUser(s);
  const existing = (
   await readPool.query('SELECT credential_id FROM passkey_credentials WHERE account_id = $1', [accountId])
  ).rows;
  if (existing.length >= 10) fail('Tài khoản đã liên kết tối đa 10 thiết bị Passkey.', 400);

  const challenge = generateWebAuthnChallenge();
  await pool.query(
   `INSERT INTO passkey_challenges(id, challenge, account_id, purpose, expires_at)
    VALUES($1, $2, $3, 'register', now() + interval '5 minutes')`,
   [randomUUID(), challenge, accountId],
  );

  const originHeader = req.headers.origin || this.deps.publicWebOrigin();
  const rpId = resolveExpectedRpId(originHeader);

  return {
   challenge,
   rp: { name: 'Tìm quán ngon', id: rpId },
   user: {
    id: Buffer.from(accountId).toString('base64url'),
    name: u.email || u.phone || u.username || u.display_name,
    displayName: u.display_name,
   },
   pubKeyCredParams: [
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 },
   ],
   timeout: 60000,
   excludeCredentials: existing.map((r) => ({ id: r.credential_id, type: 'public-key' })),
  };
 }

 async passkeyRegisterVerify(s: SessionRow, req: Request) {
  if (!s.account_id) fail('Vui lòng đăng nhập trước.', 401);
  const b = z
   .object({
    challenge: z.string().min(20).max(128),
    credentialId: z.string().min(8).max(512).regex(/^[A-Za-z0-9_-]+$/),
    clientDataJSON: z.string().min(20).max(4096),
    authenticatorData: z.string().min(40).max(4096),
    publicKeySpki: z.string().min(40).max(4096),
    algorithm: z.number().int(),
    deviceLabel: z.string().trim().min(1).max(60).optional(),
   })
   .strict()
   .parse(req.body);

  const originHeader = req.headers.origin || this.deps.publicWebOrigin();
  const rpId = resolveExpectedRpId(originHeader);

  await transaction(async (c) => {
   const ch = (
    await c.query(
     `DELETE FROM passkey_challenges
      WHERE challenge = $1 AND account_id = $2 AND purpose = 'register' AND expires_at > now()
      RETURNING id`,
     [b.challenge, s.account_id],
    )
   ).rows[0];
   if (!ch) fail('Phiên đăng ký Passkey đã hết hạn. Vui lòng thử lại.', 401);

   const verified = verifyPasskeyRegistration({
    expectedChallenge: b.challenge,
    allowedOrigins: this.deps.allowedOrigins(),
    expectedRpId: rpId,
    credentialId: b.credentialId,
    clientDataJSONB64: b.clientDataJSON,
    authenticatorDataB64: b.authenticatorData,
    publicKeySpkiB64: b.publicKeySpki,
    algorithm: b.algorithm,
   });

   const dup = await c.query('SELECT 1 FROM passkey_credentials WHERE credential_id = $1', [b.credentialId]);
   if (dup.rowCount) fail('Khóa sinh trắc học này đã được đăng ký.', 409);

   await c.query(
    `INSERT INTO passkey_credentials(credential_id, account_id, public_key_spki, algorithm, counter, device_label)
     VALUES($1, $2, $3, $4, $5, $6)`,
    [
     b.credentialId,
     s.account_id,
     verified.publicKeySpkiB64,
     verified.algorithm,
     verified.counter,
     b.deviceLabel || 'FaceID / Vân tay trên máy này',
    ],
   );
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'passkey-register', $2)", [
    s.account_id,
    b.credentialId.slice(0, 32),
   ]);
  });

  return { ok: true, user: await this.deps.loadUser(s) };
 }

 async passkeyLoginOptions(req: Request) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('pk-login-opt:' + ip, 15, 60);

  const b = z
   .object({
    identifier: z.string().trim().max(120).optional(),
   })
   .strict()
   .parse(req.body || {});

  const challenge = generateWebAuthnChallenge();
  await pool.query(
   `INSERT INTO passkey_challenges(id, challenge, purpose, expires_at)
    VALUES($1, $2, 'login', now() + interval '5 minutes')`,
   [randomUUID(), challenge],
  );

  let allowCredentials: { id: string; type: 'public-key' }[] = [];
  if (b.identifier) {
   const idNorm = b.identifier.includes('@')
    ? b.identifier.toLowerCase()
    : /^[+0-9\s().-]{8,16}$/.test(b.identifier)
      ? (() => {
         try {
          return normalizeVietnamPhone(b.identifier);
         } catch {
          return b.identifier.toLowerCase();
         }
        })()
      : b.identifier.toLowerCase();

   const creds = (
    await readPool.query(
     `SELECT pk.credential_id
      FROM passkey_credentials pk
      JOIN accounts a ON a.id = pk.account_id
      LEFT JOIN account_credentials c ON c.account_id = a.id
      WHERE lower(a.email) = $1 OR a.phone = $1 OR c.username = $1
      LIMIT 10`,
     [idNorm],
    )
   ).rows;
   allowCredentials = creds.map((r) => ({ id: r.credential_id, type: 'public-key' }));
  }

  const originHeader = req.headers.origin || this.deps.publicWebOrigin();
  return {
   challenge,
   rpId: resolveExpectedRpId(originHeader),
   timeout: 60000,
   allowCredentials,
  };
 }

 async passkeyLoginVerify(s: SessionRow, req: Request, res: Response) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('pk-login-ver:' + ip, 12, 60);
  await this.deps.rate('pk-login:' + sha256(ip), 15, 300);

  const b = z
   .object({
    challenge: z.string().min(20).max(128),
    credentialId: z.string().min(8).max(512).regex(/^[A-Za-z0-9_-]+$/),
    clientDataJSON: z.string().min(20).max(4096),
    authenticatorData: z.string().min(40).max(4096),
    signature: z.string().min(16).max(2048),
   })
   .strict()
   .parse(req.body);

  const originHeader = req.headers.origin || this.deps.publicWebOrigin();
  const rpId = resolveExpectedRpId(originHeader);

  const accountId = await transaction(async (c) => {
   const ch = (
    await c.query(
     `DELETE FROM passkey_challenges
      WHERE challenge = $1 AND purpose = 'login' AND expires_at > now()
      RETURNING id`,
     [b.challenge],
    )
   ).rows[0];
   if (!ch) fail('Phiên đăng nhập Passkey đã hết hạn. Vui lòng thử lại.', 401);

   const stored = (
    await c.query('SELECT * FROM passkey_credentials WHERE credential_id = $1 FOR UPDATE', [b.credentialId])
   ).rows[0];
   if (!stored) fail('Thiết bị này chưa được bật Passkey trên Tìm quán ngon.', 401);

   const { nextCounter } = verifyPasskeyAssertion({
    expectedChallenge: b.challenge,
    allowedOrigins: this.deps.allowedOrigins(),
    expectedRpId: rpId,
    storedPublicKeySpkiB64: stored.public_key_spki,
    storedCounter: Number(stored.counter || 0),
    clientDataJSONB64: b.clientDataJSON,
    authenticatorDataB64: b.authenticatorData,
    signatureB64: b.signature,
   });

   await c.query('UPDATE passkey_credentials SET counter = $2, last_used_at = now() WHERE credential_id = $1', [
    b.credentialId,
    nextCounter,
   ]);
   return stored.account_id as string;
  });

  const { next, continuation } = await this.deps.rotateSessionToAccount(s.id, accountId, res, 'passkey');
  return { user: await this.deps.loadUser(next), continuation };
 }

 async deletePasskey(s: SessionRow, credentialId: string) {
  if (!s.account_id) fail('Bạn chưa đăng nhập.', 401);
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(credentialId)) fail('Mã khóa không hợp lệ.', 400);
  const r = await pool.query('DELETE FROM passkey_credentials WHERE credential_id = $1 AND account_id = $2', [
   credentialId,
   s.account_id,
  ]);
  if (!r.rowCount) fail('Không tìm thấy thiết bị Passkey.', 404);
  return { ok: true };
 }
}
