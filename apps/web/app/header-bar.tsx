'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
 AccountHubData,
 AccountPreferences,
 api,
 EXCLUDABLE_GROUPS,
 PopularityBadgeKind,
 Restaurant,
} from './api';
import { BrandLogo } from './brand-logo';

export type SavedPlace = {
 id: string;
 name: string;
 address: string;
 primary_group?: string;
 image_url?: string | null;
 popularity_badge?: PopularityBadgeKind | null;
};

export const SAVED_PLACES_KEY = 'ag_saved_places_v1';
const COLLECTION_ICONS = ['📌', '🍜', '☕', '💑', '🏢', '🌧️', '🔥', '🍰'];

export function loadSavedPlaces(): SavedPlace[] {
 if (typeof window === 'undefined') return [];
 try {
  const raw = window.localStorage.getItem(SAVED_PLACES_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
 } catch {
  return [];
 }
}

export function toggleLocalSavedPlace(list: SavedPlace[], r: Restaurant): SavedPlace[] {
 const exists = list.some((x) => x.id === r.id);
 const next = exists
  ? list.filter((x) => x.id !== r.id)
  : [
     {
      id: r.id,
      name: r.name,
      address: r.address,
      primary_group: r.primary_group || r.dishes?.[0]?.group || 'Quán ngon',
      image_url: r.image_url ?? null,
      popularity_badge: r.popularity_badge ?? null,
     },
     ...list,
    ].slice(0, 10);
 try {
  window.localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
 } catch {}
 return next;
}

function toBase64Url(buf: ArrayBuffer): string {
 const bytes = new Uint8Array(buf);
 let binary = '';
 for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
 return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array {
 const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
 const base64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
 const raw = atob(base64);
 const out = new Uint8Array(raw.length);
 for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
 return out;
}

function loadExternalScript(src: string, id: string): Promise<void> {
 return new Promise((resolve, reject) => {
  if (typeof document === 'undefined') return reject(new Error('No DOM'));
  if (document.getElementById(id)) return resolve();
  const s = document.createElement('script');
  s.id = id;
  s.src = src;
  s.async = true;
  s.defer = true;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error('Không tải được SDK xác thực bên ngoài.'));
  document.head.appendChild(s);
 });
}

function formatRemainingCountdown(deadlineIso?: string | null): string {
 if (!deadlineIso) return '7 ngày';
 const diffMs = new Date(deadlineIso).getTime() - Date.now();
 if (diffMs <= 0) return 'Sắp hết hạn';
 const totalHours = Math.floor(diffMs / 3600_000);
 const days = Math.floor(totalHours / 24);
 const hours = totalHours % 24;
 if (days >= 1) return `${days} ngày ${hours} giờ`;
 return `${Math.max(1, hours)} giờ`;
}

type HubTab = 'profile' | 'saved' | 'personalize' | 'plans';
type AuthSubMode = 'login' | 'register' | 'phone' | 'forgot' | 'reset';

type HeaderProps = {
 activeTab?: 'suggest' | 'search';
 hub: AccountHubData | null;
 localSaved: SavedPlace[];
 externalOpenTab?: HubTab | null;
 onClearExternalOpen?: () => void;
 onRefreshHub: () => Promise<AccountHubData | null>;
 onRemoveLocalSaved: (id: string) => void;
 onVisitPlaceId: (id: string) => void;
 onPreferencesChanged?: (prefs: AccountPreferences) => void;
 onResetHome?: () => void;
};

export function HeaderBar({
 hub,
 localSaved,
 externalOpenTab,
 onClearExternalOpen,
 onRefreshHub,
 onRemoveLocalSaved,
 onVisitPlaceId,
 onPreferencesChanged,
 onResetHome,
}: HeaderProps) {
 const [open, setOpen] = useState(false);
 const [tab, setTab] = useState<HubTab>('profile');
 const [authMode, setAuthMode] = useState<AuthSubMode>('login');

 const [displayName, setDisplayName] = useState('');
 const [username, setUsername] = useState('');
 const [emailInput, setEmailInput] = useState('');
 const [password, setPassword] = useState('');
 const [newPassword, setNewPassword] = useState('');
 const [otpCode, setOtpCode] = useState('');
 const [resetLinkToken, setResetLinkToken] = useState('');
 const [turnstileToken, setTurnstileToken] = useState('');

 const [verifyCodeInput, setVerifyCodeInput] = useState('');
 const [editName, setEditName] = useState('');
 const [editingName, setEditingName] = useState(false);

 // Telegram reverse phone challenge state
 const [tgChallenge, setTgChallenge] = useState<{
  challengeId: string;
  pollSecret: string;
  botUrl: string;
 } | null>(null);

 const [newColName, setNewColName] = useState('');
 const [newColIcon, setNewColIcon] = useState('📌');

 const [busy, setBusy] = useState(false);
 const [notice, setNotice] = useState('');
 const [err, setErr] = useState('');

 const turnstileBoxRef = useRef<HTMLDivElement | null>(null);
 const turnstileWidgetIdRef = useRef<string | null>(null);
 const urlHandledRef = useRef(false);

 function resetTurnstileWidget() {
  setTurnstileToken('');
  const win = typeof window !== 'undefined' ? (window as any) : null;
  if (turnstileWidgetIdRef.current && win?.turnstile?.reset) {
   try {
    win.turnstile.reset(turnstileWidgetIdRef.current);
   } catch {}
  }
 }

 const user = hub?.user ?? null;
 const isPro = Boolean(user?.pro);
 const authCfg = hub?.config;
 const cloudFavs = hub?.favorites ?? [];
 const displayedFavs = user ? cloudFavs : localSaved;
 const favCount = displayedFavs.length;
 const prefs = hub?.preferences || { excluded_groups: [], default_area: null, pro_boost: true };
 const passkeySupported =
  typeof window !== 'undefined' && Boolean(authCfg?.passkey && window.PublicKeyCredential && navigator.credentials);

 // Handle 1-click Email Verification (`?verifyEmail=...`) & Password Reset (`?resetToken=...`) links from inbox
 useEffect(() => {
  if (typeof window === 'undefined' || urlHandledRef.current) return;
  const sp = new URLSearchParams(window.location.search);
  const verifyTok = sp.get('verifyEmail');
  const resetTok = sp.get('resetToken');
  if (!verifyTok && !resetTok) return;
  urlHandledRef.current = true;

  // Clean token from URL address bar immediately so Referer / browser history never leaks it
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('verifyEmail');
  cleanUrl.searchParams.delete('resetToken');
  window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);

  setTab('profile');
  setOpen(true);

  if (verifyTok) {
   setBusy(true);
   api('/auth/verify-email', 'POST', { token: verifyTok })
    .then(async () => {
     await onRefreshHub();
     setNotice('🎉 Đã xác thực địa chỉ email thành công! Tài khoản của bạn được bảo lưu vĩnh viễn.');
    })
    .catch((e: Error) => setErr(e.message))
    .finally(() => setBusy(false));
  } else if (resetTok) {
   setResetLinkToken(resetTok);
   setAuthMode('reset');
   setNotice('Nhập mật khẩu mới (tối thiểu 8 ký tự) bên dưới để hoàn tất khôi phục tài khoản.');
  }
 }, [onRefreshHub]);

 useEffect(() => {
  if (externalOpenTab) {
   setTab(externalOpenTab);
   setErr('');
   setNotice('');
   setOpen(true);
   if (onClearExternalOpen) onClearExternalOpen();
  }
 }, [externalOpenTab, onClearExternalOpen]);

 useEffect(() => {
  if (!open) {
   setTgChallenge(null);
   return;
  }
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') setOpen(false);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [open]);

 // Render Cloudflare Turnstile widget automatically when configured
 useEffect(() => {
  const siteKey = authCfg?.turnstileSiteKey;
  if (!open || !siteKey || !turnstileBoxRef.current) return;
  let widgetId: string | undefined;
  let cancelled = false;
  loadExternalScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', 'cf-turnstile-sdk')
   .then(() => {
    const win = window as any;
    if (cancelled || !win.turnstile || !turnstileBoxRef.current) return;
    turnstileBoxRef.current.innerHTML = '';
    widgetId = win.turnstile.render(turnstileBoxRef.current, {
     sitekey: siteKey,
     theme: 'light',
     callback: (tok: string) => setTurnstileToken(tok),
     'expired-callback': () => setTurnstileToken(''),
    });
    turnstileWidgetIdRef.current = widgetId || null;
   })
   .catch(() => {});
  return () => {
   cancelled = true;
   const win = window as any;
   if (widgetId && win?.turnstile?.remove) {
    try {
     win.turnstile.remove(widgetId);
    } catch {}
   }
  };
 }, [open, authMode, authCfg?.turnstileSiteKey]);

 // Poll Telegram phone verification when active
 useEffect(() => {
  if (!tgChallenge || !open) return;
  let stopped = false;
  const interval = window.setInterval(async () => {
   if (stopped) return;
   try {
    const res = await api('/auth/phone/telegram/poll', 'POST', {
     challengeId: tgChallenge.challengeId,
     pollSecret: tgChallenge.pollSecret,
    });
    if (res.status === 'verified') {
     stopped = true;
     setTgChallenge(null);
     await syncGuestFavoritesAndRefresh(res.continuation);
     setNotice('🎉 Đã xác thực số điện thoại chính chủ thành công!');
    }
   } catch (e) {
    stopped = true;
    setTgChallenge(null);
    setErr((e as Error).message);
   }
  }, 2500);
  return () => {
   stopped = true;
   window.clearInterval(interval);
  };
 }, [tgChallenge, open]);

 async function syncGuestFavoritesAndRefresh(continuation?: { url?: string } | null) {
  for (const item of localSaved.slice(0, 10)) {
   await api('/restaurants/' + item.id + '/favorite', 'POST').catch(() => {});
  }
  const updated = await onRefreshHub();
  if (updated?.preferences && onPreferencesChanged) onPreferencesChanged(updated.preferences);
  if (continuation?.url) {
   window.open(continuation.url, '_blank', 'noopener,noreferrer');
  }
 }

 async function submitAuth(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   if (authMode === 'register') {
    const res = await api('/auth/register', 'POST', {
     displayName,
     email: emailInput.trim(),
     password,
     ...(turnstileToken ? { turnstileToken } : {}),
    });
    await syncGuestFavoritesAndRefresh(res.continuation);
    setPassword('');
    setNotice(
     res.verificationSent
      ? '🎉 Đã tạo tài khoản! Mã xác thực 6 số đã gửi tới email của bạn (vui lòng xác thực trong 7 ngày).'
      : '🎉 Đã tạo tài khoản Thường (0đ)! Vui lòng xác thực email trong vòng 7 ngày.',
    );
   } else if (authMode === 'login') {
    const res = await api('/auth/password-login', 'POST', {
     username: username.trim(),
     password,
     ...(turnstileToken ? { turnstileToken } : {}),
    });
    await syncGuestFavoritesAndRefresh(res.continuation);
    setPassword('');
    setNotice('Đăng nhập thành công!');
   }
  } catch (e) {
   resetTurnstileWidget();
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleForgotPassword(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const res = await api('/auth/forgot-password', 'POST', {
    email: emailInput.trim(),
    ...(turnstileToken ? { turnstileToken } : {}),
   });
   resetTurnstileWidget();
   setResetLinkToken('');
   setAuthMode('reset');
   setNotice(res.message);
  } catch (e) {
   resetTurnstileWidget();
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleResetPassword(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const payload = resetLinkToken
    ? { token: resetLinkToken, newPassword }
    : { email: emailInput.trim(), code: otpCode.trim(), newPassword };
   const res = await api('/auth/reset-password', 'POST', payload);
   await syncGuestFavoritesAndRefresh(res.continuation);
   setNewPassword('');
   setOtpCode('');
   setResetLinkToken('');
   setAuthMode('login');
   setNotice('✅ Đã đặt lại mật khẩu mới và đăng xuất toàn bộ các thiết bị cũ!');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleGoogleSignIn() {
  setErr('');
  setNotice('');
  if (!authCfg?.googleClientId) {
   setAuthMode('register');
   setNotice('Google OAuth sẵn sàng kích hoạt ngay khi thêm GOOGLE_CLIENT_ID vào .env.local — hiện bạn có thể tạo nhanh bằng Email!');
   return;
  }
  setBusy(true);
  try {
   await loadExternalScript('https://accounts.google.com/gsi/client', 'google-gis-sdk');
   const win = window as any;
   win.google.accounts.id.initialize({
    client_id: authCfg.googleClientId,
    callback: async (resp: { credential?: string }) => {
     if (!resp?.credential) {
      setBusy(false);
      return;
     }
     try {
      const r = await api('/auth/oauth/google', 'POST', { token: resp.credential });
      await syncGuestFavoritesAndRefresh(r.continuation);
      setNotice('🎉 Đăng nhập bằng Google thành công!');
     } catch (errObj) {
      setErr((errObj as Error).message);
     } finally {
      setBusy(false);
     }
    },
   });
   win.google.accounts.id.prompt((notification: any) => {
    if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
     setBusy(false);
     setErr('Trình duyệt đang chặn cửa sổ bật lên của Google. Hãy cho phép popup hoặc đăng nhập bằng Email.');
    }
   });
  } catch (e) {
   setBusy(false);
   setErr((e as Error).message);
  }
 }

 async function handleFacebookSignIn() {
  setErr('');
  setNotice('');
  if (!authCfg?.facebookAppId) {
   setAuthMode('register');
   setNotice('Facebook Login sẵn sàng kích hoạt ngay khi thêm FACEBOOK_APP_ID vào .env.local — hiện bạn có thể đăng ký bằng Email!');
   return;
  }
  setBusy(true);
  try {
   await loadExternalScript('https://connect.facebook.net/vi_VN/sdk.js', 'facebook-jssdk');
   const win = window as any;
   win.FB.init({
    appId: authCfg.facebookAppId,
    cookie: false,
    xfbml: false,
    version: 'v20.0',
   });
   win.FB.login(
    async (response: any) => {
     const accessToken = response?.authResponse?.accessToken;
     if (!accessToken) {
      setBusy(false);
      return;
     }
     try {
      const r = await api('/auth/oauth/facebook', 'POST', { token: accessToken });
      await syncGuestFavoritesAndRefresh(r.continuation);
      setNotice('🎉 Đăng nhập bằng Facebook thành công!');
     } catch (errObj) {
      setErr((errObj as Error).message);
     } finally {
      setBusy(false);
     }
    },
    { scope: 'public_profile,email' },
   );
  } catch (e) {
   setBusy(false);
   setErr((e as Error).message);
  }
 }

 async function handleStartTelegramPhone() {
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const ch = await api('/auth/phone/telegram/start', 'POST');
   setTgChallenge({ challengeId: ch.challengeId, pollSecret: ch.pollSecret, botUrl: ch.botUrl });
   window.open(ch.botUrl, '_blank', 'noopener,noreferrer');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handlePasskeyLogin() {
  if (!passkeySupported) {
   setErr('Trình duyệt hiện tại chưa hỗ trợ FaceID / Vân tay (Passkey).');
   return;
  }
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const opts = await api('/auth/passkey/login/options', 'POST', {
    ...(username.trim() ? { identifier: username.trim() } : {}),
   });
   const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64Url(opts.challenge) as BufferSource,
    rpId: opts.rpId,
    timeout: opts.timeout || 60000,
    userVerification: 'preferred',
    ...(opts.allowCredentials?.length
     ? {
        allowCredentials: opts.allowCredentials.map((c: { id: string }) => ({
         id: fromBase64Url(c.id) as BufferSource,
         type: 'public-key' as const,
        })),
       }
     : {}),
   };
   const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
   if (!cred) throw new Error('Đã hủy xác thực sinh trắc học.');
   const assertion = cred.response as AuthenticatorAssertionResponse;
   const res = await api('/auth/passkey/login/verify', 'POST', {
    challenge: opts.challenge,
    credentialId: toBase64Url(cred.rawId),
    clientDataJSON: toBase64Url(assertion.clientDataJSON),
    authenticatorData: toBase64Url(assertion.authenticatorData),
    signature: toBase64Url(assertion.signature),
   });
   await syncGuestFavoritesAndRefresh(res.continuation);
   setNotice('🎉 Đăng nhập nhanh bằng FaceID / Vân tay thành công!');
  } catch (e) {
   const msg = (e as Error).message || '';
   if (!/NotAllowedError|AbortError/i.test((e as Error).name || '')) {
    setErr(msg || 'Không thể đăng nhập bằng Passkey trên thiết bị này.');
   }
  } finally {
   setBusy(false);
  }
 }

 async function handleRegisterPasskey() {
  if (!passkeySupported) {
   setErr('Thiết bị / trình duyệt này chưa hỗ trợ tạo Passkey.');
   return;
  }
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const opts = await api('/auth/passkey/register/options', 'POST');
   const cred = (await navigator.credentials.create({
    publicKey: {
     challenge: fromBase64Url(opts.challenge) as BufferSource,
     rp: opts.rp,
     user: {
      id: fromBase64Url(opts.user.id) as BufferSource,
      name: opts.user.name,
      displayName: opts.user.displayName,
     },
     pubKeyCredParams: opts.pubKeyCredParams,
     timeout: opts.timeout || 60000,
     authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
     },
     excludeCredentials: (opts.excludeCredentials || []).map((c: { id: string }) => ({
      id: fromBase64Url(c.id) as BufferSource,
      type: 'public-key' as const,
     })),
    },
   })) as PublicKeyCredential | null;

   if (!cred) throw new Error('Đã hủy thiết lập FaceID / Vân tay.');
   const att = cred.response as AuthenticatorAttestationResponse & {
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
    getAuthenticatorData?: () => ArrayBuffer;
   };
   const spki = att.getPublicKey?.();
   const authData = att.getAuthenticatorData?.();
   const alg = att.getPublicKeyAlgorithm?.() ?? -7;
   if (!spki || !authData) {
    throw new Error('Trình duyệt chưa hỗ trợ chuẩn xuất khóa WebAuthn Level 2.');
   }
   const uaPlatform = /iPhone|iPad/i.test(navigator.userAgent)
    ? 'iPhone / iPad (FaceID)'
    : /Android/i.test(navigator.userAgent)
      ? 'Điện thoại Android (Vân tay)'
      : /Windows/i.test(navigator.userAgent)
        ? 'Máy tính Windows Hello'
        : 'Thiết bị cá nhân';

   await api('/auth/passkey/register/verify', 'POST', {
    challenge: opts.challenge,
    credentialId: toBase64Url(cred.rawId),
    clientDataJSON: toBase64Url(att.clientDataJSON),
    authenticatorData: toBase64Url(authData),
    publicKeySpki: toBase64Url(spki),
    algorithm: alg,
    deviceLabel: uaPlatform,
   });
   await onRefreshHub();
   setNotice('✅ Đã bật đăng nhập nhanh bằng FaceID / Vân tay (0đ) trên thiết bị này!');
  } catch (e) {
   if (!/NotAllowedError|AbortError/i.test((e as Error).name || '')) {
    setErr((e as Error).message || 'Chưa bật được Passkey.');
   }
  } finally {
   setBusy(false);
  }
 }

 async function handleDeletePasskey(credId: string) {
  setBusy(true);
  setErr('');
  try {
   await api('/auth/passkey/' + encodeURIComponent(credId), 'DELETE');
   await onRefreshHub();
   setNotice('Đã gỡ khóa sinh trắc học khỏi tài khoản.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleVerifyEmailCode(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   await api('/auth/verify-email', 'POST', { code: verifyCodeInput.trim() });
   setVerifyCodeInput('');
   await onRefreshHub();
   setNotice('🎉 Đã xác thực địa chỉ email thành công! Tài khoản được giữ vĩnh viễn và mở khóa dùng thử Pro 14 ngày.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleResendVerifyEmail() {
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const r = await api('/auth/resend-verification', 'POST', {
    ...(turnstileToken ? { turnstileToken } : {}),
   });
   setNotice(
    r.delivered
     ? '📨 Đã gửi lại mã xác thực 6 số vào hộp thư của bạn!'
     : 'Chưa cấu hình RESEND_API_KEY trong .env.local nên máy chủ chưa gửi thư ra ngoài.',
   );
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleLogout() {
  setBusy(true);
  setErr('');
  try {
   await api('/auth/logout', 'POST');
   await onRefreshHub();
   setNotice('Đã đăng xuất tài khoản.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleLogoutOtherDevices() {
  setBusy(true);
  setErr('');
  try {
   const r = await api('/auth/logout-all', 'POST');
   await onRefreshHub();
   setNotice(`Đã đăng xuất an toàn khỏi ${r.revokedCount || 0} phiên thiết bị khác.`);
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleSaveProfile(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  try {
   await api('/account/profile', 'PATCH', { displayName: editName });
   await onRefreshHub();
   setEditingName(false);
   setNotice('Đã cập nhật tên hiển thị.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleClaimTrial() {
  if (!user) {
   setTab('profile');
   setAuthMode('register');
   setNotice('Hãy đăng nhập Google hoặc tạo tài khoản miễn phí trước để nhận 14 ngày Pro!');
   return;
  }
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   await api('/pro/trial', 'POST');
   const updated = await onRefreshHub();
   if (updated?.preferences && onPreferencesChanged) onPreferencesChanged(updated.preferences);
   setNotice('🎉 Đã kích hoạt Quán Ngon · Pro 14 ngày miễn phí! Mọi đặc quyền Pro đã mở khóa.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleRemoveFav(id: string) {
  if (!user) {
   onRemoveLocalSaved(id);
   return;
  }
  setBusy(true);
  try {
   await api('/restaurants/' + id + '/favorite', 'DELETE');
   await onRefreshHub();
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleCreateCollection(e: React.FormEvent) {
  e.preventDefault();
  if (!newColName.trim()) return;
  setBusy(true);
  setErr('');
  try {
   await api('/collections', 'POST', { name: newColName.trim(), icon: newColIcon });
   setNewColName('');
   await onRefreshHub();
   setNotice('Đã tạo bộ sưu tập mới!');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleDeleteCollection(colId: string) {
  setBusy(true);
  setErr('');
  try {
   await api('/collections/' + colId, 'DELETE');
   await onRefreshHub();
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleRemoveFromCollection(colId: string, restaurantId: string) {
  setBusy(true);
  try {
   await api(`/collections/${colId}/items/${restaurantId}`, 'DELETE');
   await onRefreshHub();
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function updatePrefPatch(patch: Partial<AccountPreferences>) {
  setBusy(true);
  setErr('');
  try {
   const res = await api('/account/preferences', 'PUT', patch);
   await onRefreshHub();
   if (onPreferencesChanged && res.preferences) onPreferencesChanged(res.preferences);
   setNotice('Đã lưu thiết lập cá nhân hóa!');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 function toggleExcludedGroup(g: string) {
  if (!isPro) {
   setTab('plans');
   return;
  }
  const exists = prefs.excluded_groups.includes(g);
  const next = exists ? prefs.excluded_groups.filter((x) => x !== g) : [...prefs.excluded_groups, g];
  updatePrefPatch({ excluded_groups: next });
 }

 return (
  <>
   <header className="discovery-topbar">
    <div className="topbar-left">
     <a
      href="/"
      className="discovery-brand"
      onClick={(e) => {
       if (onResetHome) {
        e.preventDefault();
        onResetHome();
       }
      }}
     >
      <BrandLogo size="header" />
      <span className="discovery-brand-text">
       <span className="discovery-brand-name">
        Tìm quán <em>ngon</em>
       </span>
      </span>
     </a>
    </div>

    <div className="topbar-right">
     <button
      type="button"
      className={`account-first-btn${isPro ? ' is-pro-member' : ''}`}
      onClick={() => {
       setErr('');
       setNotice('');
       setOpen(true);
      }}
      aria-label="Mở trung tâm Tài khoản Thường & Pro"
     >
      <span className="account-avatar-dot" aria-hidden="true">
       {user ? user.display_name.slice(0, 1).toUpperCase() : '👤'}
      </span>
      <span className="account-btn-label">{user ? user.display_name : 'Tài khoản'}</span>
      {user && !user.verified && <span className="verify-dot-warn" title="Chờ xác thực email">!</span>}
      {isPro && <span className="pro-mini-pill">PRO</span>}
      {favCount > 0 && (
       <span className="account-saved-count" title="Số quán yêu thích">
        ♥ {favCount}
       </span>
      )}
     </button>
    </div>
   </header>

   {open && (
    <div className="action-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Trung tâm Tài khoản Thường & Pro" onClick={() => setOpen(false)}>
     <div className="account-sheet-card is-wide-hub" onClick={(e) => e.stopPropagation()}>
      <div className="account-sheet-head">
       <div className="account-sheet-user">
        <span className={`account-sheet-avatar${isPro ? ' is-pro' : ''}`} aria-hidden="true">
         {user ? user.display_name.slice(0, 1).toUpperCase() : '👤'}
        </span>
        <div>
         <div className="hub-title-row">
          <h2>{user ? user.display_name : 'Đăng nhập'}</h2>
          {user && (
           <button
            type="button"
            className={`tier-badge is-clickable ${isPro ? 'is-pro' : 'is-free'}${tab === 'plans' ? ' is-open' : ''}`}
            onClick={() => setTab(tab === 'plans' ? 'profile' : 'plans')}
            title="Xem so sánh gói Basic & Pro"
           >
            {isPro ? 'Pro' : 'Basic'}
           </button>
          )}
         </div>
         {user && (
          <p>
           {isPro && user.expires_at
            ? `Đặc quyền Pro hiệu lực đến ${new Date(user.expires_at).toLocaleDateString('vi-VN')}`
            : `${user.email || user.phone || '@' + (user.username || 'thanh-vien')} · ${user.verified ? 'Đã xác thực ✓' : 'Chờ xác thực email'}`}
          </p>
         )}
        </div>
       </div>
       <button type="button" className="action-sheet-close is-static" onClick={() => setOpen(false)} aria-label="Đóng">
        ×
       </button>
      </div>

      {/* 3 Hub Navigation Tabs */}
      <div className="hub-tabs" role="tablist">
       <button type="button" role="tab" aria-selected={tab === 'profile'} className={`hub-tab${tab === 'profile' ? ' is-active' : ''}`} onClick={() => setTab('profile')}>
        Tài khoản
       </button>
       <button type="button" role="tab" aria-selected={tab === 'saved'} className={`hub-tab${tab === 'saved' ? ' is-active' : ''}`} onClick={() => setTab('saved')}>
        Đã lưu ({favCount})
       </button>
       <button type="button" role="tab" aria-selected={tab === 'personalize'} className={`hub-tab${tab === 'personalize' ? ' is-active' : ''}`} onClick={() => setTab('personalize')}>
        Khẩu vị Pro
       </button>
      </div>

      {err && <p className="hub-alert is-err" role="alert">{err}</p>}
      {notice && <p className="hub-alert is-ok" role="status">{notice}</p>}

      <div className="account-sheet-body">
       {/* TAB 1: PROFILE / MULTI-CHANNEL AUTH */}
       {tab === 'profile' && (
        <>
         {!user ? (
          <div className="auth-card-box">
           {/* PRIORITY #1: 1-CLICK GOOGLE (& OPTIONAL FACEBOOK) */}
           <div className={`social-auth-grid${authCfg?.facebook ? '' : ' is-single'}`}>
            <button type="button" className="social-auth-btn is-google" disabled={busy} onClick={handleGoogleSignIn}>
             <span className="social-icon" aria-hidden="true">G</span>
             <span>Tiếp tục với Google</span>
            </button>
            {Boolean(authCfg?.facebook) && (
             <button type="button" className="social-auth-btn is-facebook" disabled={busy} onClick={handleFacebookSignIn}>
              <span className="social-icon" aria-hidden="true">f</span>
              <span>Tiếp tục với Facebook</span>
             </button>
            )}
           </div>

           {passkeySupported && (
            <button type="button" className="passkey-fast-btn" disabled={busy} onClick={handlePasskeyLogin}>
             🔑 Đăng nhập 1 chạm bằng FaceID / Vân tay (Passkey)
            </button>
           )}

           <div className="auth-divider"><span>hoặc dùng Email / Số điện thoại</span></div>

           <div className="auth-mode-switch is-three-tabs">
            <button
             type="button"
             className={authMode === 'login' ? 'is-active' : ''}
             onClick={() => { setAuthMode('login'); setErr(''); setTgChallenge(null); }}
            >
             Đăng nhập
            </button>
            <button
             type="button"
             className={authMode === 'register' ? 'is-active' : ''}
             onClick={() => { setAuthMode('register'); setErr(''); setTgChallenge(null); }}
            >
             Đăng ký Email
            </button>
            <button
             type="button"
             className={authMode === 'phone' ? 'is-active' : ''}
             onClick={() => { setAuthMode('phone'); setErr(''); }}
            >
             Số điện thoại
            </button>
           </div>

           {/* MODE A & B: EMAIL LOGIN / REGISTER */}
           {(authMode === 'login' || authMode === 'register') && (
            <form className="auth-form" onSubmit={submitAuth}>
             {authMode === 'register' && (
              <label>
               <span>Tên hiển thị</span>
               <input
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ví dụ: Minh Anh"
               />
              </label>
             )}

             {authMode === 'register' ? (
              <label>
               <span>Địa chỉ Email</span>
               <input
                type="email"
                required
                maxLength={120}
                autoComplete="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Ví dụ: minhanh@gmail.com"
               />
              </label>
             ) : (
              <label>
               <span>Email hoặc Tên đăng nhập</span>
               <input
                required
                minLength={3}
                maxLength={120}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: minhanh@gmail.com"
               />
              </label>
             )}

             <label>
              <div className="auth-label-split">
               <span>Mật khẩu {authMode === 'register' ? '(tối thiểu 8 ký tự)' : ''}</span>
               {authMode === 'login' && (
                <button
                 type="button"
                 className="inline-link-btn"
                 onClick={() => {
                  setEmailInput(username.includes('@') ? username : '');
                  setAuthMode('forgot');
                  setErr('');
                 }}
                >
                 Quên mật khẩu?
                </button>
               )}
              </div>
              <input
               type="password"
               required
               minLength={authMode === 'register' ? 8 : 1}
               maxLength={128}
               autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               placeholder="••••••••"
              />
             </label>

             {authCfg?.turnstileSiteKey && <div ref={turnstileBoxRef} className="turnstile-slot" />}

             <button type="submit" className="account-primary-btn" disabled={busy}>
              {busy
               ? 'Đang xử lý bảo mật…'
               : authMode === 'register'
                 ? 'Tạo tài khoản'
                 : 'Đăng nhập ngay'}
             </button>
            </form>
           )}

           {/* MODE C: ZERO-COST PHONE VERIFICATION */}
           {authMode === 'phone' && (
            <div className="phone-verify-box">
             <p className="hub-desc">
              Xác thực số điện thoại chính chủ <b>miễn phí 0đ trọn đời</b> qua nút chia sẻ danh bạ xác minh của Telegram Bot (chống hoàn toàn tin nhắn rác & lộ OTP):
             </p>
             {!tgChallenge ? (
              <button type="button" className="account-primary-btn" disabled={busy} onClick={handleStartTelegramPhone}>
               {busy ? 'Đang khởi tạo phiên…' : '📱 Xác thực SĐT miễn phí qua Telegram (2 giây)'}
              </button>
             ) : (
              <div className="tg-waiting-card">
               <b>⏳ Đang chờ bạn xác nhận trên Telegram…</b>
               <p>Bấm nút <b>“📱 Xác nhận Số điện thoại chính chủ”</b> trong cửa sổ Telegram vừa mở — trang này sẽ tự động đăng nhập ngay!</p>
               <div className="profile-actions-row">
                <a href={tgChallenge.botUrl} target="_blank" rel="noopener noreferrer" className="saved-go-btn">
                 Mở lại Telegram ↗
                </a>
                <button type="button" className="account-secondary-btn is-auto" onClick={() => setTgChallenge(null)}>
                 Hủy
                </button>
               </div>
              </div>
             )}

             {passkeySupported && (
              <p className="account-auth-hint">
               💡 Đã từng xác thực SĐT và bật sinh trắc học? Bấm nút <b>FaceID / Vân tay</b> ở trên để vào trong 1 giây không cần mở Telegram!
              </p>
             )}
            </div>
           )}

           {/* MODE D: FORGOT PASSWORD */}
           {authMode === 'forgot' && (
            <form className="auth-form" onSubmit={handleForgotPassword}>
             <label>
              <span>Nhập Email đã đăng ký để nhận mã khôi phục 6 số</span>
              <input
               type="email"
               required
               maxLength={120}
               value={emailInput}
               onChange={(e) => setEmailInput(e.target.value)}
               placeholder="Ví dụ: minhanh@gmail.com"
              />
             </label>
             {authCfg?.turnstileSiteKey && <div ref={turnstileBoxRef} className="turnstile-slot" />}
             <button type="submit" className="account-primary-btn" disabled={busy}>
              {busy ? 'Đang gửi mã…' : 'Gửi mã khôi phục mật khẩu'}
             </button>
             <button type="button" className="account-secondary-btn" onClick={() => setAuthMode('login')}>
              ← Quay lại Đăng nhập
             </button>
            </form>
           )}

           {/* MODE E: RESET PASSWORD */}
           {authMode === 'reset' && (
            <form className="auth-form" onSubmit={handleResetPassword}>
             {!resetLinkToken && (
              <>
               <label>
                <span>Địa chỉ Email</span>
                <input
                 type="email"
                 required
                 maxLength={120}
                 value={emailInput}
                 onChange={(e) => setEmailInput(e.target.value)}
                />
               </label>
               <label>
                <span>Mã khôi phục 6 chữ số trong Email (hiệu lực 15 phút)</span>
                <input
                 required
                 pattern="\d{6}"
                 maxLength={6}
                 inputMode="numeric"
                 value={otpCode}
                 onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                 placeholder="123456"
                />
               </label>
              </>
             )}
             <label>
              <span>Mật khẩu mới (tối thiểu 8 ký tự)</span>
              <input
               type="password"
               required
               minLength={8}
               maxLength={128}
               autoComplete="new-password"
               value={newPassword}
               onChange={(e) => setNewPassword(e.target.value)}
               placeholder="Nhập mật khẩu mới an toàn…"
              />
             </label>
             <button type="submit" className="account-primary-btn" disabled={busy}>
              {busy ? 'Đang cập nhật…' : 'Lưu mật khẩu mới & Đăng nhập'}
             </button>
             <button type="button" className="account-secondary-btn" onClick={() => { setResetLinkToken(''); setAuthMode('login'); }}>
              ← Hủy
             </button>
            </form>
           )}

           <div className="guest-perks-note">
            <b>Quyền lợi ngay khi đăng nhập Thường (0đ):</b>
            <ul>
             <li>Mở chỉ đường Google Maps <b>không giới hạn</b> (bỏ giới hạn 4 quán/phiên).</li>
             <li>Đồng bộ tối đa <b>30 quán yêu thích</b> và xem lại <b>15 quán vừa ghé</b>.</li>
             <li>Nhận ngay <b>14 ngày dùng thử Quán Ngon · Pro miễn phí</b> sau khi xác thực!</li>
            </ul>
           </div>
          </div>
         ) : (
          <div className="logged-profile-box">
           {/* 7-DAY UNVERIFIED EMAIL WARNING & INLINE 6-DIGIT VERIFIER */}
           {!user.verified && user.email && (
            <div className="verify-warning-banner">
             <div className="verify-warning-head">
              <b>⏳ Xác thực Email trong {formatRemainingCountdown(user.verification_deadline)}</b>
              <p>
               Tài khoản <b>{user.email}</b> chưa xác thực sẽ tự động bị xóa sau 7 ngày kể từ lúc tạo. Nhập mã 6 số đã gửi vào hộp thư của bạn:
              </p>
             </div>
             <form className="verify-code-inline" onSubmit={handleVerifyEmailCode}>
              <input
               required
               pattern="\d{6}"
               maxLength={6}
               inputMode="numeric"
               value={verifyCodeInput}
               onChange={(e) => setVerifyCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
               placeholder="Nhập mã 6 số"
              />
              <button type="submit" className="saved-go-btn" disabled={busy}>
               Xác thực
              </button>
              <button type="button" className="account-secondary-btn is-auto" disabled={busy} onClick={handleResendVerifyEmail}>
               Gửi lại mã
              </button>
             </form>
            </div>
           )}

           <div className="hub-stats-grid">
            <div className="hub-stat-tile">
             <b>{cloudFavs.length}{!isPro ? '/30' : ''}</b>
             <span>Quán yêu thích</span>
            </div>
            <div className="hub-stat-tile">
             <b>{hub?.collections?.length ?? 0}</b>
             <span>Bộ sưu tập Pro</span>
            </div>
            <div className="hub-stat-tile">
             <b>{hub?.history?.length ?? 0}</b>
             <span>Lịch sử đã ghé</span>
            </div>
           </div>

           {!isPro && hub?.trialAvailable && (
            <div className="pro-promo-banner">
             <div>
              <b>🎁 Trải nghiệm Quán Ngon · Pro 14 ngày (0đ)</b>
              <p>Mở khóa Bộ sưu tập quán ruột, Ghi chú bí kíp từng quán, Tự động né món không ăn & So sánh quán!</p>
             </div>
             <button type="button" className="pro-cta-btn" disabled={busy} onClick={handleClaimTrial}>
              Kích hoạt dùng thử ngay ✦
             </button>
            </div>
           )}

           {/* SECURITY & LINKED ACCOUNTS PANEL */}
           <div className="hub-subblock">
            <div className="account-section-title">🛡️ Bảo mật & Tài khoản liên kết</div>
            <div className="security-pills-row">
             {user.email && (
              <span className={`sec-pill ${user.email_verified_at ? 'is-ok' : 'is-warn'}`}>
               {user.email_verified_at ? `✓ Email: ${user.email}` : `⏳ Chờ xác thực: ${user.email}`}
              </span>
             )}
             {user.phone && <span className="sec-pill is-ok">✓ SĐT: {user.phone}</span>}
             {(user.providers || []).includes('google') && <span className="sec-pill is-ok">✓ Đã nối Google</span>}
             {(user.providers || []).includes('facebook') && <span className="sec-pill is-ok">✓ Đã nối Facebook</span>}
            </div>

            {passkeySupported && (
             <div className="passkey-manage-box">
              {(hub?.passkeys?.length ?? 0) > 0 && (
               <div className="saved-places-list">
                {hub!.passkeys!.map((pk) => (
                 <div className="saved-place-row" key={pk.credential_id}>
                  <div className="saved-place-info">
                   <b>🔑 {pk.device_label}</b>
                   <small>Tạo ngày {new Date(pk.created_at).toLocaleDateString('vi-VN')}</small>
                  </div>
                  <button
                   type="button"
                   className="saved-remove-btn"
                   disabled={busy}
                   onClick={() => handleDeletePasskey(pk.credential_id)}
                   aria-label="Xóa khóa sinh trắc học"
                  >
                   ×
                  </button>
                 </div>
                ))}
               </div>
              )}
              <button type="button" className="passkey-fast-btn" disabled={busy} onClick={handleRegisterPasskey}>
               ＋ Bật đăng nhập nhanh bằng FaceID / Vân tay trên máy này (0đ)
              </button>
             </div>
            )}
           </div>

           {editingName ? (
            <form className="inline-edit-row" onSubmit={handleSaveProfile}>
             <input
              required
              minLength={2}
              maxLength={50}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
             />
             <button type="submit" className="saved-go-btn" disabled={busy}>Lưu</button>
             <button type="button" className="account-secondary-btn is-auto" onClick={() => setEditingName(false)}>Hủy</button>
            </form>
           ) : (
            <div className="profile-actions-row">
             <button
              type="button"
              className="account-secondary-btn"
              onClick={() => {
               setEditName(user.display_name);
               setEditingName(true);
              }}
             >
              ✎ Đổi tên hiển thị
             </button>
             {(hub?.activeSessions ?? 1) > 1 && (
              <button type="button" className="account-secondary-btn" disabled={busy} onClick={handleLogoutOtherDevices}>
               Khóa {hub!.activeSessions! - 1} thiết bị khác
              </button>
             )}
             <button type="button" className="account-secondary-btn is-danger" disabled={busy} onClick={handleLogout}>
              Đăng xuất
             </button>
            </div>
           )}

           {(hub?.history?.length ?? 0) > 0 && (
            <div className="hub-subblock">
             <div className="account-section-title">🕒 Quán bạn vừa mở bản đồ gần đây</div>
             <div className="saved-places-list">
              {hub!.history!.slice(0, 8).map((h) => (
               <div className="saved-place-row" key={h.id}>
                <div className="saved-place-info">
                 <span className="saved-place-tag">{h.primary_group || 'Đã xem'}</span>
                 <b>{h.name}</b>
                 <small>{new Date(h.chosen_at).toLocaleDateString('vi-VN')}</small>
                </div>
                <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(h.id)}>
                 Chỉ đường ↗
                </button>
               </div>
              ))}
             </div>
            </div>
           )}
          </div>
         )}
        </>
       )}

       {/* TAB 2: FAVORITES & PRO COLLECTIONS */}
       {tab === 'saved' && (
        <>
         <div className="account-section-title">
          <span>❤️ Quán yêu thích ({favCount}{!user ? '/10 trên máy' : !isPro ? '/30 gói Thường' : ' · Không giới hạn'})</span>
         </div>

         {displayedFavs.length === 0 ? (
          <div className="account-empty-box">
           Chưa có quán yêu thích. Hãy bấm <b>♡</b> trên thẻ quán bất kỳ để lưu lại!
          </div>
         ) : (
          <div className="saved-places-list">
           {displayedFavs.map((p) => (
            <div className="saved-place-row" key={p.id}>
             <div className="saved-place-info">
              <span className="saved-place-tag">{p.primary_group || 'Quán ngon'}</span>
              <b>{p.name}</b>
              <small>{p.address}</small>
             </div>
             <div className="saved-place-actions">
              <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(p.id)}>
               Chỉ đường ↗
              </button>
              <button type="button" className="saved-remove-btn" onClick={() => handleRemoveFav(p.id)} aria-label={`Bỏ lưu ${p.name}`}>
               ×
              </button>
             </div>
            </div>
           ))}
          </div>
         )}

         <div className="hub-subblock">
          <div className="account-section-title">
           <span>📌 Bộ sưu tập cá nhân</span>
           <span className="pro-mini-pill">PRO</span>
          </div>

          {!isPro ? (
           <div className="pro-locked-card">
            <p>Gom quán theo chủ đề riêng: <b>“Ăn trưa văn phòng”</b>, <b>“Hẹn hò cuối tuần”</b>, <b>“Cà phê chạy deadline”</b>…</p>
            <button type="button" className="pro-cta-btn" onClick={() => (user && hub?.trialAvailable ? handleClaimTrial() : setTab('plans'))}>
             {user && hub?.trialAvailable ? 'Mở khóa miễn phí 14 ngày ✦' : 'Xem quyền lợi Pro ✦'}
            </button>
           </div>
          ) : (
           <>
            <form className="collection-create-form" onSubmit={handleCreateCollection}>
             <select value={newColIcon} onChange={(e) => setNewColIcon(e.target.value)} aria-label="Biểu tượng bộ sưu tập">
              {COLLECTION_ICONS.map((ic) => (
               <option key={ic} value={ic}>{ic}</option>
              ))}
             </select>
             <input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              maxLength={60}
              placeholder="Tên bộ sưu tập mới (VD: Quán ruột trưa)…"
             />
             <button type="submit" className="saved-go-btn" disabled={busy}>＋ Tạo</button>
            </form>

            {(hub?.collections?.length ?? 0) === 0 ? (
             <div className="account-empty-box">
              Tạo bộ sưu tập đầu tiên ở trên, sau đó chạm vào thẻ quán bất kỳ để thêm quán vào!
             </div>
            ) : (
             <div className="collections-stack">
              {hub!.collections!.map((col) => (
               <details className="collection-box" key={col.id}>
                <summary>
                 <span><b>{col.icon} {col.name}</b> ({col.items.length} quán)</span>
                 <button
                  type="button"
                  className="text-danger-mini"
                  onClick={(e) => {
                   e.preventDefault();
                   handleDeleteCollection(col.id);
                  }}
                 >
                  Xóa
                 </button>
                </summary>
                <div className="collection-items-body">
                 {col.items.length === 0 ? (
                  <small className="muted">Chưa có quán nào trong bộ sưu tập này.</small>
                 ) : (
                  col.items.map((item) => (
                   <div className="saved-place-row" key={item.id}>
                    <div className="saved-place-info">
                     <span className="saved-place-tag">{item.primary_group}</span>
                     <b>{item.name}</b>
                     <small>{item.address}</small>
                    </div>
                    <div className="saved-place-actions">
                     <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(item.id)}>Mở Maps ↗</button>
                     <button type="button" className="saved-remove-btn" onClick={() => handleRemoveFromCollection(col.id, item.id)}>×</button>
                    </div>
                   </div>
                  ))
                 )}
                </div>
               </details>
              ))}
             </div>
            )}
           </>
          )}
         </div>

         {isPro && (hub?.notes?.length ?? 0) > 0 && (
          <div className="hub-subblock">
           <div className="account-section-title">📝 Ghi chú bí kíp riêng của bạn ({hub!.notes!.length})</div>
           <div className="saved-places-list">
            {hub!.notes!.map((n) => (
             <div className="saved-place-row" key={n.restaurant_id}>
              <div className="saved-place-info">
               <b>{n.restaurant_name}</b>
               <small>“{n.note}”</small>
              </div>
              <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(n.restaurant_id)}>Chỉ đường ↗</button>
             </div>
            ))}
           </div>
          </div>
         )}
        </>
       )}

       {/* TAB 3: PERSONALIZE (PRO BOOST + DIETARY BLACKLIST) */}
       {tab === 'personalize' && (
        <>
         <div className="hub-subblock">
          <div className="account-section-title">
           <span>⚡ Ưu tiên quán Top Yêu thích</span>
           <span className="pro-mini-pill">PRO</span>
          </div>
          <p className="hub-desc">
           Kết hợp khoảng cách gần với điểm yêu thích cao từ cộng đồng để 4 thẻ luôn ưu tiên quán nổi tiếng, đông khách lưu.
          </p>
          {isPro ? (
           <label className="pro-toggle-box">
            <input
             type="checkbox"
             checked={prefs.pro_boost}
             onChange={(e) => updatePrefPatch({ pro_boost: e.target.checked })}
            />
            <span>Đang bật ưu tiên quán được yêu thích nhất trên trang Gợi ý</span>
           </label>
          ) : (
           <button type="button" className="pro-cta-btn" onClick={() => (user && hub?.trialAvailable ? handleClaimTrial() : setTab('plans'))}>
            Mở khóa với Quán Ngon · Pro ✦
           </button>
          )}
         </div>

         <div className="hub-subblock">
          <div className="account-section-title">
           <span>🚫 Tự động ẩn các món không ăn / dị ứng</span>
           <span className="pro-mini-pill">PRO</span>
          </div>
          <p className="hub-desc">
           Chọn các nhóm món bạn muốn né — hệ thống sẽ loại hoàn toàn khỏi mọi lượt đổi 4 thẻ!
          </p>
          <div className="area-chips">
           {EXCLUDABLE_GROUPS.map((g) => {
            const active = prefs.excluded_groups.includes(g);
            return (
             <button
              key={g}
              type="button"
              className={`area-chip is-exclude-chip${active ? ' is-excluded' : ''}`}
              onClick={() => toggleExcludedGroup(g)}
             >
              {active ? `✕ Đã ẩn: ${g}` : g}
             </button>
            );
           })}
          </div>
         </div>
        </>
       )}

       {/* DETAILED TIER COMPARISON (BASIC VS PRO — OPENED BY CLICKING BASIC / PRO BADGE) */}
       {tab === 'plans' && (
        <div className="plans-grid">
         <div className="plan-card">
          <span className="tier-badge is-free">GÓI BASIC</span>
          <h3>0đ <small>/ mãi mãi</small></h3>
          <p>Đủ gọn nhẹ cho nhu cầu tìm quán hằng ngày.</p>
          <ul>
           <li>✓ Đăng nhập 1 chạm Google, Email & Số điện thoại</li>
           <li>✓ Đổi 4 thẻ gợi ý Ăn / Uống không giới hạn</li>
           <li>✓ Mở chỉ đường Google Maps <b>không giới hạn</b></li>
           <li>✓ Lưu đồng bộ tối đa <b>30 quán yêu thích</b></li>
           <li>✓ Xem lại <b>15 quán</b> mở bản đồ gần nhất</li>
           <li>✓ Tự động gợi ý quán gần vị trí của bạn</li>
          </ul>
          {!user && (
           <button type="button" className="account-secondary-btn" onClick={() => { setTab('profile'); setAuthMode('register'); }}>
            Đăng ký Basic miễn phí
           </button>
          )}
         </div>

         <div className="plan-card is-pro-plan">
          <div className="plan-head-row">
           <span className="tier-badge is-pro">✦ QUÁN NGON · PRO</span>
           <span className="save-tag">Tiết kiệm 45% gói năm</span>
          </div>
          <h3>29.000đ <small>/ tháng · hoặc 199k/năm</small></h3>
          <p>Trợ lý ẩm thực cá nhân hóa trọn vẹn cho người sành ăn.</p>
          <ul>
           <li>✦ Toàn bộ quyền lợi gói Basic</li>
           <li>✦ <b>Ưu tiên quán Top Yêu thích</b> trong bán kính gần</li>
           <li>✦ Lưu yêu thích <b>không giới hạn</b> + <b>20 Bộ sưu tập riêng</b></li>
           <li>✦ <b>Tự động ẩn món không ăn / dị ứng</b> khỏi 4 thẻ</li>
           <li>✦ <b>Ghi chú bí kíp riêng</b> trên từng quán ăn</li>
           <li>✦ <b>Khay So sánh trực quan 2–4 quán</b> cùng lúc</li>
           <li>✦ Lịch sử <b>100 quán</b> + Viết đánh giá & Huy hiệu PRO</li>
          </ul>
          {isPro ? (
           <div className="pro-active-pill">✓ Bạn đang sử dụng gói Quán Ngon · Pro</div>
          ) : hub?.trialAvailable !== false ? (
           <button type="button" className="pro-cta-btn is-full" disabled={busy} onClick={handleClaimTrial}>
            🎁 Dùng thử miễn phí 14 ngày (0đ)
           </button>
          ) : (
           <p className="account-auth-hint">Liên hệ cổng thanh toán đối tác để gia hạn gói Pro chính thức.</p>
          )}
         </div>
        </div>
       )}
      </div>
     </div>
    </div>
   )}
  </>
 );
}
