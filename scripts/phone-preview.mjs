import http from 'node:http';
import { networkInterfaces } from 'node:os';

const host = process.env.PHONE_PREVIEW_HOST;
const port = Number(process.env.PHONE_PREVIEW_PORT || 3180);
const localAddresses = Object.values(networkInterfaces()).flat().filter(Boolean).map((x) => x.address);
const externalOrigin = process.env.PHONE_PREVIEW_ORIGIN;

if (!host || !localAddresses.includes(host) || !(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || (host === '127.0.0.1' && externalOrigin?.startsWith('https://')))) {
 throw Error('Cần IP LAN hoặc gateway HTTPS trên loopback.');
}

const origin = externalOrigin || `http://${host}:${port}`;
if (externalOrigin && new URL(externalOrigin).origin !== externalOrigin) throw Error('Origin HTTPS không hợp lệ.');

const allowedOrigins = new Set([origin]);
for (const extra of (process.env.PHONE_PREVIEW_EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
 if (!extra.startsWith('https://') || new URL(extra).origin !== extra) throw Error('Origin phụ không hợp lệ.');
 allowedOrigins.add(extra);
}

const redirectOrigin = process.env.PHONE_PREVIEW_REDIRECT;
if (redirectOrigin && (!redirectOrigin.startsWith('https://') || new URL(redirectOrigin).origin !== redirectOrigin)) {
 throw Error('Đích chuyển HTTPS không hợp lệ.');
}

// Narrow gateway: Admin, webhooks, dev-auth, and paid geocoding remain strictly blocked (403).
// Standard user features (browse, search, Thường/Pro password auth, favorites, collections, notes, compare) are forwarded safely.
const server = http.createServer((req, res) => {
 const url = new URL(req.url || '/', origin);
 const method = req.method || 'GET';
 const pathname = url.pathname;

 if (req.headers.host !== `${host}:${port}`) {
  res.writeHead(403);
  res.end('Host không hợp lệ');
  return;
 }
 if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
  res.writeHead(405);
  res.end();
  return;
 }
 const isTelegramWebhook = method === 'POST' && pathname === '/api/auth/phone/telegram/webhook';
 if (!['GET', 'HEAD'].includes(method) && !isTelegramWebhook && !allowedOrigins.has(req.headers.origin || '')) {
  res.writeHead(403);
  res.end('Nguồn yêu cầu không hợp lệ');
  return;
 }

 // Strictly block admin, webhooks, legacy dev login, and local data files
 if (
  pathname === '/admin' ||
  pathname.startsWith('/api/admin') ||
  pathname === '/api/payments/webhook' ||
  pathname === '/api/auth/login' ||
  pathname.startsWith('/.') ||
  pathname.startsWith('/data/')
 ) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Khu vực quản trị / nội bộ bị chặn trên cổng xem điện thoại.');
  return;
 }

 const allowedRead =
  pathname === '/api/session' ||
  pathname === '/api/account/hub' ||
  pathname === '/api/library' ||
  pathname === '/api/compare' ||
  pathname === '/api/health' ||
  pathname === '/api/directory' ||
  pathname === '/api/restaurants' ||
  /^\/api\/restaurants\/[a-f0-9-]{36}(\/eligibility)?$/.test(pathname);

 const allowedWrite =
  pathname === '/api/auth/register' ||
  pathname === '/api/auth/password-login' ||
  pathname === '/api/auth/verify-email' ||
  pathname === '/api/auth/resend-verification' ||
  pathname === '/api/auth/forgot-password' ||
  pathname === '/api/auth/reset-password' ||
  pathname === '/api/auth/oauth/google' ||
  pathname === '/api/auth/oauth/facebook' ||
  pathname === '/api/auth/phone/telegram/start' ||
  pathname === '/api/auth/phone/telegram/poll' ||
  (pathname === '/api/auth/phone/telegram/webhook' && Boolean(req.headers['x-telegram-bot-api-secret-token'])) ||
  pathname === '/api/auth/passkey/register/options' ||
  pathname === '/api/auth/passkey/register/verify' ||
  pathname === '/api/auth/passkey/login/options' ||
  pathname === '/api/auth/passkey/login/verify' ||
  /^\/api\/auth\/passkey\/[A-Za-z0-9_-]{8,512}$/.test(pathname) ||
  pathname === '/api/auth/logout' ||
  pathname === '/api/auth/logout-all' ||
  pathname === '/api/account/profile' ||
  pathname === '/api/account/preferences' ||
  pathname === '/api/pro/trial' ||
  pathname === '/api/filters' ||
  pathname === '/api/locations/resolve' ||
  pathname === '/api/collections' ||
  /^\/api\/collections\/[a-f0-9-]{36}(\/items(\/[a-f0-9-]{36})?)?$/.test(pathname) ||
  /^\/api\/restaurants\/[a-f0-9-]{36}\/(visit|favorite|note|reviews|reports)$/.test(pathname);

 const page =
  pathname === '/' ||
  pathname === '/ha-noi' ||
  pathname === '/tim-kiem' ||
  pathname === '/goi-y' ||
  pathname === '/about' ||
  pathname.startsWith('/_next/') ||
  pathname === '/favicon.ico' ||
  pathname === '/icon.svg' ||
  pathname === '/an-gi-day-placeholder.svg';

 const isReadMethod = method === 'GET' || method === 'HEAD';
 if (!(isReadMethod ? allowedRead || page : allowedWrite)) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Đường dẫn không được mở trên cổng điện thoại.');
  return;
 }

 if (redirectOrigin && isReadMethod && ['/', '/ha-noi', '/tim-kiem', '/goi-y', '/about'].includes(pathname)) {
  res.writeHead(307, { Location: redirectOrigin + pathname + url.search, 'Cache-Control': 'no-store' });
  res.end();
  return;
 }

 const headers = { ...req.headers, host: '127.0.0.1:3100' };
 delete headers.authorization;
 delete headers['x-forwarded-for'];
 delete headers['x-forwarded-host'];
 delete headers['x-forwarded-proto'];
 if (!isReadMethod) headers.origin = process.env.WEB_ORIGIN || 'http://127.0.0.1:3100';

 const upstream = http.request({ hostname: '127.0.0.1', port: 3100, path: req.url, method, headers }, (reply) => {
  const cookies = reply.headers['set-cookie']?.map((c) =>
   origin.startsWith('https://') && !/; secure/i.test(c) ? c + '; Secure' : c,
  );
  res.writeHead(reply.statusCode || 502, {
   ...reply.headers,
   ...(cookies ? { 'set-cookie': cookies } : {}),
   'Cache-Control': 'no-store',
  });
  reply.pipe(res);
 });
 upstream.setTimeout(15000, () => upstream.destroy());
 upstream.on('error', () => {
  if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Ứng dụng đang khởi động, vui lòng tải lại.');
 });
 req.on('aborted', () => upstream.destroy());
 req.pipe(upstream);
});

server.listen(port, host, () => console.log(`Preview ${origin} • Gateway ${host}:${port} • Admin/webhook bị chặn.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
