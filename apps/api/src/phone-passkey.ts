import { HttpException } from '@nestjs/common';
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import { normalizeVietnamPhone } from './auth-security';

/**
 * 1. Zero-Cost Reverse Phone Verification via Official Telegram Bot (`request_contact`)
 * - User opens `https://t.me/<BOT_USERNAME>?start=login_<challengeCode>` and taps Telegram's native
 *   "Share My Phone Number" button.
 * - Telegram delivers a signed webhook (`X-Telegram-Bot-Api-Secret-Token`) where
 *   `message.contact.user_id === message.from.id`, cryptographically proving SIM ownership on Telegram
 *   at 0 VND cost with zero SMS pumping risk!
 */
export function telegramPhoneBotConfigured(): { enabled: boolean; botUsername: string | null } {
 const token = process.env.TELEGRAM_BOT_TOKEN;
 const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '').trim() || null;
 return { enabled: Boolean(token && botUsername), botUsername };
}

export function verifyTelegramWebhookSecret(headerSecret: string | undefined): boolean {
 const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
 if (!expected || expected.length < 16 || !headerSecret) return false;
 const a = createHash('sha256').update(expected).digest();
 const b = createHash('sha256').update(headerSecret).digest();
 return timingSafeEqual(a, b);
}

export type VerifiedTelegramContact = {
 challengeCode: string | null;
 telegramUserId: string;
 phone: string;
 displayName: string;
 chatId: number;
};

export function extractTelegramVerifiedContact(update: any): {
 startChallenge?: { chatId: number; challengeCode: string };
 verifiedContact?: VerifiedTelegramContact;
} {
 const msg = update?.message;
 if (!msg || !msg.from || !msg.chat) return {};

 const chatId = Number(msg.chat.id);
 const fromId = String(msg.from.id);

 // Step A: User clicked deep link `/start login_<challengeCode>`
 if (typeof msg.text === 'string' && msg.text.startsWith('/start ')) {
  const arg = msg.text.slice(7).trim();
  if (/^login_[A-Za-z0-9_-]{16,48}$/.test(arg)) {
   return { startChallenge: { chatId, challengeCode: arg.slice(6) } };
  }
 }

 // Step B: User tapped the native keyboard button `request_contact: true`
 if (msg.contact && msg.contact.phone_number) {
  // CRITICAL ANTI-SPOOFING CHECK: contact.user_id MUST equal msg.from.id (rejects forwarded business cards!)
  if (String(msg.contact.user_id) !== fromId) {
   throw new HttpException('Vui lòng bấm nút Chia sẻ số điện thoại chính chủ của bạn, không chuyển tiếp danh bạ.', 400);
  }
  const phone = normalizeVietnamPhone(String(msg.contact.phone_number));
  const firstName = typeof msg.from.first_name === 'string' ? msg.from.first_name.trim() : '';
  const lastName = typeof msg.from.last_name === 'string' ? msg.from.last_name.trim() : '';
  const displayName = `${firstName} ${lastName}`.trim().slice(0, 50) || 'Bạn dùng SĐT';
  // Challenge code can be carried in reply_to_message text (`Mã phiên: <code >`)
  const replyText = typeof msg.reply_to_message?.text === 'string' ? msg.reply_to_message.text : '';
  const match = replyText.match(/Mã phiên:\s*([A-Za-z0-9_-]{16,48})/);
  return {
   verifiedContact: {
    challengeCode: match ? match[1] : null,
    telegramUserId: fromId,
    phone,
    displayName,
    chatId,
   },
  };
 }

 return {};
}

export async function sendTelegramBotPrompt(chatId: number, text: string, requestContactButton = false) {
 const token = process.env.TELEGRAM_BOT_TOKEN;
 if (!token || process.env.NODE_ENV === 'test') return;
 const body: Record<string, unknown> = {
  chat_id: chatId,
  text,
  parse_mode: 'HTML',
 };
 if (requestContactButton) {
  body.reply_markup = {
   keyboard: [[{ text: '📱 Xác nhận Số điện thoại chính chủ', request_contact: true }]],
   resize_keyboard: true,
   one_time_keyboard: true,
  };
 } else {
  body.reply_markup = { remove_keyboard: true };
 }
 await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(5000),
 }).catch(() => {});
}

/**
 * 2. Zero-Cost WebAuthn Passkeys (FaceID / TouchID / Windows Hello) using pure Node.js `node:crypto`!
 * Supports ES256 (-7, P-256) and RS256 (-257, RSA) via standard browser `getPublicKey()` SPKI export.
 */
export function generateWebAuthnChallenge(): string {
 return randomBytes(32).toString('base64url');
}

function fromBase64Url(input: string): Buffer {
 return Buffer.from(input, 'base64url');
}

export function resolveExpectedRpId(originHeader: string): string {
 const host = new URL(originHeader).hostname.toLowerCase();
 if (host === 'www.timquanngon.com') return 'timquanngon.com';
 return host;
}

export function verifyPasskeyRegistration(params: {
 expectedChallenge: string;
 allowedOrigins: Set<string>;
 expectedRpId: string;
 credentialId: string;
 clientDataJSONB64: string;
 authenticatorDataB64: string;
 publicKeySpkiB64: string;
 algorithm: number;
}): { counter: number; publicKeySpkiB64: string; algorithm: number } {
 if (![-7, -257].includes(params.algorithm)) {
  throw new HttpException('Thuật toán Passkey không được hỗ trợ (cần ES256 hoặc RS256).', 400);
 }

 const clientDataBuf = fromBase64Url(params.clientDataJSONB64);
 let clientData: { type?: string; challenge?: string; origin?: string };
 try {
  clientData = JSON.parse(clientDataBuf.toString('utf8'));
 } catch {
  throw new HttpException('Dữ liệu clientDataJSON không hợp lệ.', 400);
 }

 if (clientData.type !== 'webauthn.create') {
  throw new HttpException('Loại xác thực WebAuthn không đúng.', 400);
 }
 if (clientData.challenge !== params.expectedChallenge) {
  throw new HttpException('Mã thử thách Passkey không khớp hoặc đã hết hạn.', 401);
 }
 if (!clientData.origin || !params.allowedOrigins.has(clientData.origin)) {
  throw new HttpException('Nguồn gốc (Origin) của Passkey không hợp lệ.', 403);
 }

 const authData = fromBase64Url(params.authenticatorDataB64);
 if (authData.length < 37) {
  throw new HttpException('Dữ liệu authenticatorData quá ngắn.', 400);
 }
 const expectedRpHash = createHash('sha256').update(params.expectedRpId).digest();
 const actualRpHash = authData.subarray(0, 32);
 if (!timingSafeEqual(expectedRpHash, actualRpHash)) {
  throw new HttpException('RP ID của Passkey không khớp tên miền.', 403);
 }

 const flags = authData[32];
 const userPresent = (flags & 0x01) !== 0;
 if (!userPresent) {
  throw new HttpException('Chưa xác nhận hiện diện người dùng trên thiết bị.', 401);
 }

 const counter = authData.readUInt32BE(33);

 // Validate that publicKeySpkiB64 is a genuine DER SubjectPublicKeyInfo key usable by node:crypto
 const spkiBuf = fromBase64Url(params.publicKeySpkiB64);
 try {
  const pubKey = createPublicKey({ key: spkiBuf, format: 'der', type: 'spki' });
  if (params.algorithm === -7 && pubKey.asymmetricKeyType !== 'ec') {
   throw Error('Expected EC key');
  }
  if (params.algorithm === -257 && pubKey.asymmetricKeyType !== 'rsa') {
   throw Error('Expected RSA key');
  }
 } catch {
  throw new HttpException('Khóa công khai Passkey không hợp lệ.', 400);
 }

 return {
  counter,
  publicKeySpkiB64: spkiBuf.toString('base64'),
  algorithm: params.algorithm,
 };
}

export function verifyPasskeyAssertion(params: {
 expectedChallenge: string;
 allowedOrigins: Set<string>;
 expectedRpId: string;
 storedPublicKeySpkiB64: string;
 storedCounter: number;
 clientDataJSONB64: string;
 authenticatorDataB64: string;
 signatureB64: string;
}): { nextCounter: number } {
 const clientDataBuf = fromBase64Url(params.clientDataJSONB64);
 let clientData: { type?: string; challenge?: string; origin?: string };
 try {
  clientData = JSON.parse(clientDataBuf.toString('utf8'));
 } catch {
  throw new HttpException('Dữ liệu clientDataJSON không hợp lệ.', 400);
 }

 if (clientData.type !== 'webauthn.get') {
  throw new HttpException('Loại đăng nhập WebAuthn không đúng.', 400);
 }
 if (clientData.challenge !== params.expectedChallenge) {
  throw new HttpException('Mã thử thách đăng nhập không khớp hoặc đã hết hạn.', 401);
 }
 if (!clientData.origin || !params.allowedOrigins.has(clientData.origin)) {
  throw new HttpException('Nguồn gốc (Origin) đăng nhập không hợp lệ.', 403);
 }

 const authData = fromBase64Url(params.authenticatorDataB64);
 if (authData.length < 37) {
  throw new HttpException('Dữ liệu authenticatorData không hợp lệ.', 400);
 }

 const expectedRpHash = createHash('sha256').update(params.expectedRpId).digest();
 const actualRpHash = authData.subarray(0, 32);
 if (!timingSafeEqual(expectedRpHash, actualRpHash)) {
  throw new HttpException('RP ID đăng nhập không khớp tên miền.', 403);
 }

 const flags = authData[32];
 if ((flags & 0x01) === 0) {
  throw new HttpException('Chưa xác nhận sinh trắc học / thiết bị.', 401);
 }

 const signCount = authData.readUInt32BE(33);
 if (params.storedCounter > 0 && signCount > 0 && signCount <= params.storedCounter) {
  throw new HttpException('Phát hiện bộ đếm khóa bất thường (nghi ngờ sao chép khóa).', 401);
 }

 const clientDataHash = createHash('sha256').update(clientDataBuf).digest();
 const signedPayload = Buffer.concat([authData, clientDataHash]);
 const signatureBuf = fromBase64Url(params.signatureB64);
 const pubKey = createPublicKey({
  key: Buffer.from(params.storedPublicKeySpkiB64, 'base64'),
  format: 'der',
  type: 'spki',
 });

 const valid = cryptoVerify('sha256', signedPayload, pubKey, signatureBuf);
 if (!valid) {
  throw new HttpException('Chữ ký sinh trắc học Passkey không hợp lệ.', 401);
 }

 return { nextCounter: Math.max(params.storedCounter, signCount) };
}
