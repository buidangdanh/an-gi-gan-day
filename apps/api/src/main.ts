import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { All, ArgumentsHost, Catch, Controller, ExceptionFilter, HttpException, Module, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { json } from 'express';
import { ZodError } from 'zod';
import { FoodService, clientIp, getAllowedOrigins } from './service';

export const service = new FoodService();

@Catch()
class Errors implements ExceptionFilter {
 catch(error: unknown, host: ArgumentsHost) {
  const res = host.switchToHttp().getResponse<Response>();
  let status = 500;
  let message = 'Có lỗi xử lý. Vui lòng thử lại.';
  if (error instanceof HttpException) {
   status = error.getStatus();
   message = error.message;
  } else if (error instanceof ZodError) {
   status = 400;
   message = error.issues.map((x) => (x.path.length ? x.path.join('.') + ': ' : '') + x.message).join('; ');
  } else if ((error as any)?.code === '23503' || (error as any)?.code === '23505') {
   status = 409;
   message = 'Dữ liệu tham chiếu không hợp lệ hoặc đã tồn tại.';
  } else if ((error as any)?.type === 'entity.too.large') {
   status = 413;
   message = 'Dữ liệu gửi lên vượt quá giới hạn cho phép.';
  } else {
   console.error('Request failed:', (error as Error)?.name, (error as any)?.code || '');
  }
  res.status(status).json({ message });
 }
}

@Controller('api')
class ApiController {
 @All('{*path}')
 async route(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');

  const path = req.path.replace(/^\/api/, '') || '/';
  const method = req.method;
  const ip = clientIp(req);

  if (method === 'GET' && path === '/health') {
   return service.healthCheck();
  }
  if (method === 'POST' && path === '/payments/webhook') {
   return service.webhook(req);
  }
  // Official Telegram Bot signed webhook (authenticated via X-Telegram-Bot-Api-Secret-Token)
  if (method === 'POST' && path === '/auth/phone/telegram/webhook') {
   service.readRate('tg-wh:' + ip, 120, 60);
   return service.authManager.handleTelegramWebhook(req);
  }

  // Layer 5 DDoS Payload Guard: Strictly cap /api/auth/* request bodies at 8 KB
  if (path.startsWith('/auth/')) {
   const rawBuf = (req as any).rawBody as Buffer | undefined;
   const contentLen = Number(req.headers['content-length'] || 0);
   if (contentLen > 8192 || (rawBuf && rawBuf.length > 8192)) {
    throw new HttpException('Dữ liệu gửi lên vượt quá giới hạn bảo mật (8KB).', 413);
   }
  }

  // Stateless, zero-DB-write public read endpoints
  const publicCacheHeader = process.env.NODE_ENV === 'test'
   ? 'no-store'
   : 'public, max-age=15, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600';

  if (method === 'GET' && path === '/directory') {
   service.readRate('read:' + ip, 360, 60);
   res.setHeader('Cache-Control', publicCacheHeader);
   res.setHeader('Vary', 'Accept-Encoding');
   return service.directory(req.query);
  }
  if (method === 'GET' && path === '/restaurants') {
   service.readRate('read:' + ip, 360, 60);
   res.setHeader('Cache-Control', publicCacheHeader);
   res.setHeader('Vary', 'Accept-Encoding');
   return service.restaurants(req.query);
  }
  const detailMatch = method === 'GET' ? path.match(/^\/restaurants\/([^/]+)$/) : null;
  if (detailMatch) {
   service.readRate('read:' + ip, 360, 60);
   res.setHeader('Cache-Control', process.env.NODE_ENV === 'test' ? 'no-store' : 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');
   res.setHeader('Vary', 'Accept-Encoding');
   return service.detail(detailMatch[1]);
  }

  // Strict origin & content-type check on all state-changing mutations
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
   const allowedOrigins = getAllowedOrigins();
   if (!req.headers.origin || !allowedOrigins.has(req.headers.origin)) {
    throw new HttpException('Nguồn yêu cầu không hợp lệ.', 403);
   }
   const fetchSite = req.headers['sec-fetch-site'];
   if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    throw new HttpException('Nguồn yêu cầu không hợp lệ.', 403);
   }
   if (method !== 'DELETE' && !req.is('application/json')) {
    throw new HttpException('Cần nội dung JSON.', 415);
   }
  }

  // Admin endpoints do not create guest sessions
  if (path === '/admin' && method === 'GET') return service.adminList(req);
  if (path === '/admin/restaurants' && method === 'POST') return service.adminRestaurant(req);
  if (path === '/admin/geocode' && method === 'POST') return service.geocode(req);
  const adminMatch = path.match(/^\/admin\/(restaurants|reviews|reports)\/([^/]+)$/);
  if (adminMatch) {
   if (adminMatch[1] === 'restaurants' && method === 'PUT') return service.adminRestaurant(req, adminMatch[2]);
   if (adminMatch[1] === 'restaurants' && method === 'DELETE') return service.adminDelete(req, adminMatch[2]);
   if (adminMatch[1] === 'reviews' && method === 'PATCH') return service.moderate(req, adminMatch[2]);
   if (adminMatch[1] === 'reports' && method === 'PATCH') return service.resolve(req, adminMatch[2]);
  }

  // Stateless password recovery request (does not require creating a DB session before validation)
  if (method === 'POST' && path === '/auth/forgot-password') {
   return service.authManager.forgotPassword(req);
  }
  if (method === 'POST' && path === '/auth/passkey/login/options') {
   return service.authManager.passkeyLoginOptions(req);
  }

  // Session-backed endpoints (Guest / Thường / Pro)
  service.readRate('api:' + ip, 300, 60);
  const s = await service.session(req, res);

  if (method === 'GET' && path === '/session') return service.status(s);
  if (method === 'GET' && path === '/account/hub') return service.accountHub(s);
  if (method === 'PATCH' && path === '/account/profile') return service.updateProfile(s, req.body);
  if (method === 'PUT' && path === '/account/preferences') return service.updatePreferences(s, req.body);
  if (method === 'POST' && path === '/pro/trial') return service.claimProTrial(s);

  // Account & Multi-Channel Authentication Endpoints
  if (method === 'POST' && path === '/auth/register') return service.register(s, req, res);
  if (method === 'POST' && path === '/auth/password-login') return service.passwordLogin(s, req, res);
  if (method === 'POST' && path === '/auth/verify-email') return service.authManager.verifyEmail(s, req);
  if (method === 'POST' && path === '/auth/resend-verification') return service.authManager.resendVerification(s, req);
  if (method === 'POST' && path === '/auth/reset-password') return service.authManager.resetPassword(s, req, res);
  if (method === 'POST' && path === '/auth/oauth/google') return service.authManager.oauthLogin('google', s, req, res);
  if (method === 'POST' && path === '/auth/oauth/facebook') return service.authManager.oauthLogin('facebook', s, req, res);
  if (method === 'POST' && path === '/auth/phone/telegram/start') return service.authManager.startTelegramPhoneChallenge(s, req);
  if (method === 'POST' && path === '/auth/phone/telegram/poll') return service.authManager.pollTelegramPhoneChallenge(s, req, res);
  if (method === 'POST' && path === '/auth/passkey/register/options') return service.authManager.passkeyRegisterOptions(s, req);
  if (method === 'POST' && path === '/auth/passkey/register/verify') return service.authManager.passkeyRegisterVerify(s, req);
  if (method === 'POST' && path === '/auth/passkey/login/verify') return service.authManager.passkeyLoginVerify(s, req, res);
  const pkDelMatch = method === 'DELETE' ? path.match(/^\/auth\/passkey\/([A-Za-z0-9_-]{8,512})$/) : null;
  if (pkDelMatch) return service.authManager.deletePasskey(s, pkDelMatch[1]);

  if (method === 'POST' && path === '/auth/login') return service.login(s, req, res);
  if (method === 'POST' && path === '/auth/logout') return service.logout(s, res);
  if (method === 'POST' && path === '/auth/logout-all') return service.authManager.logoutOtherSessions(s);
  if (method === 'POST' && path === '/auth/otp') {
   await service.rate('otp:' + ip, 3, 600);
   throw new HttpException('Gửi OTP chưa được cấu hình. Cần Firebase Phone Auth có reCAPTCHA phía client.', 503);
  }

  if (method === 'POST' && path === '/locations/resolve') return service.geocode(req, s);
  if (method === 'GET' && path === '/library') return service.library(s);
  if (method === 'POST' && path === '/filters') return service.saveFilter(s, req.body);
  if (method === 'GET' && path === '/compare') return service.compare(s, req.query);

  if (method === 'POST' && path === '/collections') return service.createCollection(s, req.body);
  const colMatch = path.match(/^\/collections\/([^/]+)(?:\/items(?:\/([^/]+))?)?$/);
  if (colMatch) {
   const [, colId, itemId] = colMatch;
   if (method === 'DELETE' && !path.includes('/items')) return service.deleteCollection(s, colId);
   if (method === 'POST' && path.endsWith('/items')) return service.toggleCollectionItem(s, colId, req.body?.restaurantId || '', true);
   if (method === 'DELETE' && itemId) return service.toggleCollectionItem(s, colId, itemId, false);
  }

  const m = path.match(/^\/restaurants\/([^/]+)\/(visit|favorite|note|eligibility|reviews|reports)$/);
  if (m) {
   const [, id, action] = m;
   if (method === 'POST' && action === 'visit') return service.visit(s, id);
   if ((method === 'POST' || method === 'DELETE') && action === 'favorite') return service.favorite(s, id, method === 'POST');
   if (method === 'PUT' && action === 'note') return service.saveNote(s, id, req.body);
   if (method === 'DELETE' && action === 'note') return service.deleteNote(s, id);
   if (method === 'GET' && action === 'eligibility') return service.eligibility(s, id);
   if (method === 'POST' && action === 'reviews') return service.review(s, id, req.body);
   if (method === 'POST' && action === 'reports') return service.report(s, id, req.body);
  }

  throw new HttpException('Không tìm thấy API.', 404);
 }
}

@Module({ controllers: [ApiController] })
class AppModule {}

export async function createApp() {
 if (process.env.NODE_ENV === 'production') {
  if (process.env.ENABLE_DEV_AUTH === 'true') throw Error('ENABLE_DEV_AUTH bị cấm ở production');
  if (!process.env.DATABASE_URL || !process.env.WEB_ORIGIN?.startsWith('https://')) {
   throw Error('Production cần DATABASE_URL và WEB_ORIGIN HTTPS');
  }
 }
 const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
 const expressApp = app.getHttpAdapter().getInstance();
 expressApp.disable('x-powered-by');
 if (process.env.TRUST_PROXY === 'true') expressApp.set('trust proxy', 1);
 expressApp.use(
  json({
   limit: '64kb',
   verify: (req: any, _res, buf) => {
    req.rawBody = buf;
   },
  }),
 );
 app.useGlobalFilters(new Errors());
 return app;
}

if (require.main === module) {
 createApp()
  .then((app) => app.listen(Number(process.env.API_PORT || 4100), process.env.API_HOST || '127.0.0.1'))
  .then(() => {
   console.log('API http://' + (process.env.API_HOST || '127.0.0.1') + ':' + (process.env.API_PORT || 4100));
   // Run 7-day unverified email cleanup on startup and every 60 minutes
   service.authManager.purgeUnverifiedAccounts().catch(() => {});
   const timer = setInterval(() => {
    service.authManager.purgeUnverifiedAccounts().catch(() => {});
   }, 3600_000);
   timer.unref();
  })
  .catch(() => {
   console.error('Không khởi động được API. Kiểm tra cấu hình.');
   process.exitCode = 1;
  });
}
