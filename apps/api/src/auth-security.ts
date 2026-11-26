import { HttpException } from '@nestjs/common';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const DISPOSABLE_EMAIL_DOMAINS = new Set([
 '10minutemail.com', '10minutemail.net', '20minutemail.com', 'anonbox.net', 'bccto.me',
 'burnermail.io', 'chacuo.net', 'crazymailing.com', 'deadaddress.com', 'despam.it',
 'discard.email', 'discardmail.com', 'dispostable.com', 'dropmail.me', 'emailondeck.com',
 'emailsensei.com', 'emailtemporario.com.br', 'ephemail.net', 'fakeinbox.com', 'fakemail.fr',
 'fakemailgenerator.com', 'filzmail.com', 'getairmail.com', 'getnada.com', 'grr.la',
 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com',
 'inboxalias.com', 'incognitomail.org', 'jetable.org', 'kasmail.com', 'koszmail.pl',
 'kurzepost.de', 'linshi-email.com', 'luxusmail.org', 'mail-temporaire.fr', 'mailcatch.com',
 'maildrop.cc', 'mailexpire.com', 'mailforspam.com', 'mailinator.com', 'mailinator.net',
 'mailnesia.com', 'mailnull.com', 'mailsac.com', 'mailtemp.info', 'meltmail.com',
 'mintemail.com', 'mohmal.com', 'mt2015.com', 'mytemp.email', 'mytrashmail.com',
 'nada.email', 'neomailbox.com', 'no-spam.ws', 'nobulk.com', 'noclickemail.com',
 'nospam4.us', 'nowmymail.com', 'objectmail.com', 'onewaymail.com', 'opayq.com',
 'owlpic.com', 'pokemail.net', 'proxymail.eu', 'rcpt.at', 'sharklasers.com',
 'shitmail.me', 'shortmail.net', 'sogetthis.com', 'soodonims.com', 'spam4.me',
 'spamavert.com', 'spambog.com', 'spambox.us', 'spamex.com', 'spamfree24.org',
 'spamgourmet.com', 'spamhole.com', 'spaml.com', 'spammotel.com', 'temp-mail.io',
 'temp-mail.org', 'tempail.com', 'tempalias.com', 'tempe-mail.com', 'tempinbox.com',
 'tempmail.co', 'tempmail.com', 'tempmail.de', 'tempmail.eu', 'tempmail.net',
 'tempmail.plus', 'tempmailaddress.com', 'tempmailo.com', 'tempomail.fr', 'temporaryemail.net',
 'throwaway.email', 'throwawaymail.com', 'tmail.ws', 'tmpeml.info', 'trash-mail.at',
 'trash-mail.com', 'trashmail.at', 'trashmail.com', 'trashmail.io', 'trashmail.me',
 'trashmail.net', 'wegwerfmail.de', 'wegwerfmail.net', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
]);

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeAndValidateEmail(raw: string): string {
 const trimmed = raw.trim().toLowerCase();
 if (trimmed.length < 5 || trimmed.length > 120 || !EMAIL_RE.test(trimmed)) {
  throw new HttpException('Địa chỉ email không hợp lệ.', 400);
 }
 const atIdx = trimmed.lastIndexOf('@');
 const domain = trimmed.slice(atIdx + 1);
 if (!domain.includes('.') || domain.endsWith('.local') || domain.endsWith('.invalid')) {
  throw new HttpException('Tên miền email không hợp lệ.', 400);
 }
 if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
  throw new HttpException('Không hỗ trợ địa chỉ email tạm thời / dùng 1 lần. Vui lòng dùng Gmail hoặc email thật.', 400);
 }
 return trimmed;
}

export function normalizeVietnamPhone(raw: string): string {
 const digits = raw.replace(/[\s().-]/g, '');
 if (/^\+84[35789]\d{8}$/.test(digits)) return digits;
 if (/^84[35789]\d{8}$/.test(digits)) return '+' + digits;
 if (/^\+?0[35789]\d{8}$/.test(digits)) return '+84' + digits.replace(/^\+?0/, '');
 if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
 if (/^[1-9]\d{8,14}$/.test(digits)) return '+' + digits;
 throw new HttpException('Số điện thoại không đúng định dạng (VD: 0912345678 hoặc +84912345678).', 400);
}

function tokenPepper(): string {
 return process.env.AUTH_TOKEN_PEPPER || process.env.ADMIN_TOKEN || 'timquanngon-local-token-pepper-v1';
}

export function hashAuthSecret(scope: string, value: string): string {
 return createHmac('sha256', tokenPepper()).update(`${scope}:${value}`).digest('hex');
}

export function safeEqualHex(hexA: string, hexB: string): boolean {
 if (hexA.length !== hexB.length || hexA.length % 2 !== 0) return false;
 const a = Buffer.from(hexA, 'hex');
 const b = Buffer.from(hexB, 'hex');
 if (a.length !== b.length || a.length === 0) return false;
 return timingSafeEqual(a, b);
}

export function generateEmailAuthSecrets(accountId: string, purpose: 'email_verify' | 'password_reset') {
 const code = String(randomInt(100000, 1000000));
 const linkToken = randomBytes(24).toString('base64url');
 return {
  code,
  linkToken,
  codeHash: hashAuthSecret(`${purpose}:code:${accountId}`, code),
  linkTokenHash: hashAuthSecret(`${purpose}:link`, linkToken),
 };
}

export async function ensureMinLatency(startedAtMs: number, minMs = 220) {
 if (process.env.NODE_ENV === 'test') return;
 const elapsed = Date.now() - startedAtMs;
 if (elapsed < minMs) {
  await new Promise((r) => setTimeout(r, minMs - elapsed));
 }
}

/**
 * Layer 2 DDoS / Bot Shield: Cloudflare Turnstile server-side verification.
 * Enabled automatically whenever TURNSTILE_SECRET_KEY is configured.
 */
export function turnstileEnabled(): boolean {
 return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: string | undefined | null, ip: string): Promise<void> {
 const secret = process.env.TURNSTILE_SECRET_KEY;
 if (!secret) return; // Gracefully skipped until keys are configured in .env.local
 if (!token || typeof token !== 'string' || token.length > 4096) {
  throw new HttpException('Vui lòng hoàn thành bước xác minh chống bot (Cloudflare Turnstile).', 400);
 }
 try {
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (ip && ip !== 'local') form.set('remoteip', ip);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
   method: 'POST',
   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
   body: form.toString(),
   signal: AbortSignal.timeout(4500),
  });
  const data = (await resp.json()) as { success?: boolean };
  if (!resp.ok || !data?.success) {
   throw new HttpException('Xác minh chống bot chưa hợp lệ hoặc đã hết hạn. Vui lòng thử lại.', 403);
  }
 } catch (e) {
  if (e instanceof HttpException) throw e;
  throw new HttpException('Không kiểm tra được mã chống bot lúc này. Vui lòng thử lại.', 503);
 }
}

export type OutboundEmailRecord = {
 to: string;
 subject: string;
 code: string;
 actionUrl: string;
 purpose: 'email_verify' | 'password_reset' | 'expiry_warning' | 'security_alert';
 sentAt: string;
 provider: 'resend' | 'brevo' | 'test-memory' | 'unconfigured';
};

// Ring buffer used ONLY in NODE_ENV=test so automated tests can inspect OTP codes & links
export const testEmailOutbox: OutboundEmailRecord[] = [];

export function emailDeliveryConfigured(): boolean {
 return Boolean(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY || process.env.NODE_ENV === 'test');
}

export async function sendAccountEmail(params: {
 to: string;
 subject: string;
 html: string;
 text: string;
 code?: string;
 actionUrl?: string;
 purpose: OutboundEmailRecord['purpose'];
}): Promise<{ delivered: boolean; provider: OutboundEmailRecord['provider'] }> {
 if (process.env.NODE_ENV === 'test') {
  testEmailOutbox.push({
   to: params.to,
   subject: params.subject,
   code: params.code || '',
   actionUrl: params.actionUrl || '',
   purpose: params.purpose,
   sentAt: new Date().toISOString(),
   provider: 'test-memory',
  });
  if (testEmailOutbox.length > 200) testEmailOutbox.shift();
  return { delivered: true, provider: 'test-memory' };
 }

 const fromAddress = process.env.EMAIL_FROM || 'Tìm quán ngon <no-reply@timquanngon.com>';

 // Channel 1: Resend Free Tier (100/day, 3,000/month, clean custom domain DKIM)
 if (process.env.RESEND_API_KEY) {
  try {
   const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
     Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
     'Content-Type': 'application/json',
    },
    body: JSON.stringify({
     from: fromAddress,
     to: [params.to],
     subject: params.subject,
     html: params.html,
     text: params.text,
    }),
    signal: AbortSignal.timeout(6000),
   });
   if (r.ok) return { delivered: true, provider: 'resend' };
  } catch {
   // Fall through to secondary free channel
  }
 }

 // Channel 2 (Automatic Failover): Brevo Free Tier (300/day = 9,000/month)
 if (process.env.BREVO_API_KEY) {
  try {
   const senderEmail = (fromAddress.match(/<([^>]+)>/)?.[1] || 'no-reply@timquanngon.com').trim();
   const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
     'api-key': process.env.BREVO_API_KEY,
     'Content-Type': 'application/json',
    },
    body: JSON.stringify({
     sender: { name: 'Tìm quán ngon', email: senderEmail },
     to: [{ email: params.to }],
     subject: params.subject,
     htmlContent: params.html,
     textContent: params.text,
    }),
    signal: AbortSignal.timeout(6000),
   });
   if (r.ok) return { delivered: true, provider: 'brevo' };
  } catch {
   // Fall through
  }
 }

 return { delivered: false, provider: 'unconfigured' };
}

export function buildVerificationEmailContent(displayName: string, code: string, verifyUrl: string) {
 const safeName = displayName.replace(/[<>&"]/g, '');
 const subject = `[${code}] Mã xác thực tài khoản Tìm quán ngon`;
 const text = `Xin chào ${safeName},\n\nMã xác thực email trên Tìm quán ngon (timquanngon.com) của bạn là: ${code}\nHoặc bấm vào liên kết: ${verifyUrl}\n\nLưu ý: Tài khoản chưa xác thực email trong vòng 7 ngày kể từ lúc đăng ký sẽ tự động bị xóa để bảo vệ chủ sở hữu email.`;
 const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">
   <h2 style="margin:0 0 12px;color:#0284c7">Tìm quán ngon</h2>
   <p>Xin chào <b>${safeName}</b>,</p>
   <p>Nhập mã 6 chữ số dưới đây trong mục <b>Tài khoản</b> để xác thực địa chỉ email của bạn:</p>
   <div style="font-size:28px;font-weight:800;letter-spacing:6px;background:#f0f9ff;color:#0369a1;padding:14px 20px;border-radius:12px;text-align:center;margin:16px 0">${code}</div>
   <p style="text-align:center;margin:20px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Xác thực Email bằng 1 chạm</a>
   </p>
   <p style="font-size:13px;color:#64748b;line-height:1.5">
    Mã có hiệu lực trong 24 giờ. Lưu ý: Nếu tài khoản không xác thực email trong vòng <b>7 ngày</b> kể từ lúc tạo, hệ thống sẽ tự động xóa tài khoản để bảo vệ quyền riêng tư của bạn.
   </p>
  </div>`;
 return { subject, text, html };
}

export function buildPasswordResetEmailContent(code: string, resetUrl: string) {
 const subject = `[${code}] Đặt lại mật khẩu Tìm quán ngon`;
 const text = `Mã khôi phục mật khẩu Tìm quán ngon của bạn là: ${code} (hiệu lực 15 phút).\nHoặc đặt lại trực tiếp tại: ${resetUrl}\nNếu bạn không yêu cầu, hãy bỏ qua thư này.`;
 const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">
   <h2 style="margin:0 0 12px;color:#0284c7">Khôi phục mật khẩu · Tìm quán ngon</h2>
   <p>Bạn vừa yêu cầu đặt lại mật khẩu. Nhập mã khôi phục 6 số dưới đây (hiệu lực <b>15 phút</b>):</p>
   <div style="font-size:28px;font-weight:800;letter-spacing:6px;background:#f0f9ff;color:#0369a1;padding:14px 20px;border-radius:12px;text-align:center;margin:16px 0">${code}</div>
   <p style="text-align:center;margin:20px 0">
    <a href="${resetUrl}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Đặt lại mật khẩu ngay</a>
   </p>
   <p style="font-size:13px;color:#64748b">Nếu bạn không thực hiện yêu cầu này, mật khẩu hiện tại của bạn vẫn an toàn và không có thay đổi nào xảy ra.</p>
  </div>`;
 return { subject, text, html };
}
