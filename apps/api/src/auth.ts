import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpException } from '@nestjs/common';
import { emailDeliveryConfigured, turnstileEnabled } from './auth-security';
import { telegramPhoneBotConfigured } from './phone-passkey';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 });
const firebaseKeys = createRemoteJWKSet(
 new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
 { timeoutDuration: 5000 },
);

export function devAuthEnabled() {
 return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_AUTH === 'true';
}

export function authConfig() {
 const tg = telegramPhoneBotConfigured();
 return {
  development: devAuthEnabled(),
  google: !!process.env.GOOGLE_CLIENT_ID,
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  facebook: !!process.env.FACEBOOK_APP_ID && !!process.env.FACEBOOK_APP_SECRET,
  facebookAppId: process.env.FACEBOOK_APP_ID || null,
  phone: !!process.env.FIREBASE_PROJECT_ID || tg.enabled,
  telegramPhoneBot: tg.botUsername,
  passkey: process.env.ENABLE_PASSKEY === 'true',
  emailVerification: emailDeliveryConfigured(),
  turnstile: turnstileEnabled(),
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
  otpSending: false,
  payment: false,
 };
}

export type VerifiedIdentity = {
 subject: string;
 name: string;
 email?: string | null;
 emailVerified?: boolean;
 phone?: string | null;
};

export async function verifyIdentity(provider: string, token: string): Promise<VerifiedIdentity> {
 if (provider === 'google') {
  if (!process.env.GOOGLE_CLIENT_ID) throw new HttpException('Google chưa được cấu hình', 503);
  const { payload } = await jwtVerify(token, googleKeys, {
   issuer: ['https://accounts.google.com', 'accounts.google.com'],
   audience: process.env.GOOGLE_CLIENT_ID,
   algorithms: ['RS256'],
   maxTokenAge: '1h',
  });
  if (!payload.sub) throw Error('Missing subject');
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  const emailVerified = Boolean(payload.email_verified && email);
  return {
   subject: payload.sub,
   name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 80) : 'Bạn dùng Google',
   email,
   emailVerified,
  };
 }

 if (provider === 'phone') {
  const project = process.env.FIREBASE_PROJECT_ID;
  if (!project) throw new HttpException('Phone OTP chưa được cấu hình', 503);
  const { payload } = await jwtVerify(token, firebaseKeys, {
   issuer: `https://securetoken.google.com/${project}`,
   audience: project,
   algorithms: ['RS256'],
   maxTokenAge: '1h',
  });
  const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
  if (!payload.sub || firebase?.sign_in_provider !== 'phone' || typeof payload.phone_number !== 'string') {
   throw Error('Phone token required');
  }
  return {
   subject: payload.sub,
   name: 'Bạn dùng số điện thoại',
   phone: payload.phone_number,
  };
 }

 if (provider === 'facebook') {
  const app = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!app || !secret) throw new HttpException('Facebook chưa được cấu hình', 503);

  const debugUrl = new URL('https://graph.facebook.com/debug_token');
  debugUrl.searchParams.set('input_token', token);
  debugUrl.searchParams.set('access_token', `${app}|${secret}`);
  const result = await fetch(debugUrl, { signal: AbortSignal.timeout(5000) });
  const { data } = (await result.json()) as {
   data?: {
    is_valid: boolean;
    app_id: string;
    user_id: string;
    expires_at: number;
    data_access_expires_at?: number;
   };
  };
  if (
   !result.ok ||
   !data?.is_valid ||
   data.app_id !== app ||
   !data.user_id ||
   data.expires_at * 1000 <= Date.now() ||
   (data.data_access_expires_at && data.data_access_expires_at * 1000 <= Date.now())
  ) {
   throw Error('Invalid Facebook token');
  }

  let fbName = 'Bạn dùng Facebook';
  let fbEmail: string | null = null;
  try {
   const meUrl = new URL('https://graph.facebook.com/v20.0/me');
   meUrl.searchParams.set('fields', 'id,name,email');
   meUrl.searchParams.set('access_token', token);
   const meRes = await fetch(meUrl, { signal: AbortSignal.timeout(4000) });
   if (meRes.ok) {
    const me = (await meRes.json()) as { id?: string; name?: string; email?: string };
    if (me.id === data.user_id) {
     if (typeof me.name === 'string' && me.name.trim()) fbName = me.name.trim().slice(0, 80);
     if (typeof me.email === 'string' && me.email.includes('@')) fbEmail = me.email.trim().toLowerCase();
    }
   }
  } catch {
   // Fallback to user_id if profile fetch times out
  }

  return {
   subject: data.user_id,
   name: fbName,
   email: fbEmail,
   emailVerified: Boolean(fbEmail),
  };
 }

 throw new HttpException('Nhà cung cấp không hợp lệ', 400);
}
