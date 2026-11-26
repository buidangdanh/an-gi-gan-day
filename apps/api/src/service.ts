import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { z } from 'zod';
import { pool, readPool, transaction } from './db';
import { coordinate, tags, isOpen, mapsUrl, normalize, rankScore, restaurantSchema, Dish } from './domain';
import { authConfig, devAuthEnabled, verifyIdentity } from './auth';
import { directoryPage, searchTerms, allFoodGroups, invalidateCatalogueCache, licenseSql } from './catalogue';
import { LruCache, MemoryRateLimiter, escapeLike } from './cache';
import { hashPassword, verifyPassword } from './password';
import { AccountAuthManager } from './account-auth-service';

const fail = (message: string, status = 400): never => { throw new HttpException(message, status); };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const hashBytes = (s: string) => createHash('sha256').update(s).digest();
const uuid = z.string().uuid();
const COOKIE = 'ag_session';
const PROD_COOKIE = '__Host-ag_session';
export const FREE_FAVORITES_LIMIT = 30;

export function getAllowedOrigins(): Set<string> {
 const base = process.env.WEB_ORIGIN || 'http://127.0.0.1:3100';
 const set = new Set<string>([base]);
 for (const extra of (process.env.WEB_EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
  set.add(extra);
 }
 return set;
}

export function getPublicWebOrigin(): string {
 const extras = (process.env.WEB_EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter((s) => s.startsWith('https://'));
 if (extras.length > 0) return extras[0];
 return process.env.WEB_ORIGIN || 'https://timquanngon.com';
}

const searchSchema = coordinate.extend({
 q: z.string().max(120).default(''),
 radius: z.coerce.number().min(100).max(20000).default(2000),
 budget: z.coerce.number().min(0).max(10000000).optional(),
 open: z.enum(['true', 'false']).default('false'),
 group: z.string().max(80).optional(),
 tags: z.string().max(200).default(''),
 exclude: z.string().max(1500).default(''),
});

type Session = { id: string; account_id: string | null; pending_restaurant: string | null; pending_at: Date | null };

const priorCache = new LruCache<number | null>(4);
const healthCache = new LruCache<{ ok: boolean }>(2);
const readRateLimiter = new MemoryRateLimiter(100_000);
const adminFailLimiter = new MemoryRateLimiter(10_000);

export function clientIp(req: Request): string {
 if (process.env.TRUST_PROXY === 'true') {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim().slice(0, 64);
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim().slice(0, 64);
 }
 return (req.ip || 'local').slice(0, 64);
}

export class FoodService {
 readonly authManager: AccountAuthManager;

 constructor() {
  this.authManager = new AccountAuthManager({
   clientIp,
   readRate: (k, l, sec) => this.readRate(k, l, sec),
   rate: (k, l, sec) => this.rate(k, l, sec),
   rotateSessionToAccount: (oldId, accId, res) => this.rotateSessionToAccount(oldId, accId, res),
   loadUser: (s) => this.user(s),
   allowedOrigins: getAllowedOrigins,
   publicWebOrigin: getPublicWebOrigin,
  });
 }

 readRate(key: string, limit: number, seconds: number) {
  const res = readRateLimiter.check(key, limit, seconds);
  if (!res.allowed) fail('Bạn thao tác hơi nhanh. Vui lòng thử lại sau.', 429);
 }

 async rate(key: string, limit: number, seconds: number) {
  const r = await pool.query(
   "INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count",
   [key, seconds],
  );
  if (r.rows[0].count > limit) fail('Bạn thao tác hơi nhanh. Vui lòng thử lại sau.', 429);
 }

 async healthCheck() {
  const check = async () => {
   await readPool.query('SELECT 1');
   return { ok: true };
  };
  try {
   if (process.env.NODE_ENV === 'test') await check();
   else await healthCache.getOrCompute('health', 5_000, check);
   return { ok: true, service: 'Tìm quán ngon', domain: 'timquanngon.com', database: 'PostgreSQL + PostGIS' };
  } catch {
   fail('Cơ sở dữ liệu tạm thời chưa sẵn sàng.', 503);
  }
 }

 async session(req: Request, res: Response): Promise<Session> {
  const cookies = (req.headers.cookie || '').split(';').map((v) => v.trim());
  const hostToken = cookies.find((v) => v.startsWith(PROD_COOKIE + '='))?.slice(PROD_COOKIE.length + 1);
  const devToken = cookies.find((v) => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const token = hostToken || devToken;

  if (token && /^[a-f0-9]{64}$/.test(token)) {
   const result = await pool.query(
    "UPDATE sessions SET last_seen=now() WHERE id=$1 AND last_seen>now()-interval '30 minutes' AND created_at>now()-interval '24 hours' RETURNING *",
    [hash(token)],
   );
   if (result.rows[0]) return result.rows[0];
  }
  await this.rate('session:' + hash(clientIp(req)), 60, 60);
  const newToken = randomBytes(32).toString('hex');
  const id = hash(newToken);
  const r = await pool.query('INSERT INTO sessions(id) VALUES($1) RETURNING *', [id]);
  this.cookie(res, newToken);
  return r.rows[0];
 }

 cookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(isProd ? PROD_COOKIE : COOKIE, token, {
   httpOnly: true,
   sameSite: 'lax',
   secure: isProd,
   path: '/',
   maxAge: 24 * 3600 * 1000,
  });
 }

 async user(s: Session) {
  if (!s.account_id) return null;
  const r = await readPool.query(
   `SELECT a.id, u.display_name, a.created_at, c.username,
           a.email, a.email_verified_at, a.phone, a.phone_verified_at,
           (a.email_verified_at IS NOT NULL OR a.phone_verified_at IS NOT NULL OR EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.account_id = a.id)) AS verified,
           CASE
            WHEN a.email IS NOT NULL AND a.email_verified_at IS NULL AND a.phone_verified_at IS NULL
                 AND NOT EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.account_id = a.id)
            THEN a.created_at + interval '7 days'
            ELSE NULL
           END AS verification_deadline,
           COALESCE((SELECT array_agg(provider ORDER BY provider) FROM auth_identities ai WHERE ai.account_id = a.id), '{}'::text[]) AS providers,
           COALESCE(p.expires_at > now(), false) AS pro, p.expires_at, p.source AS pro_source
    FROM accounts a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN subscriptions p ON p.account_id = a.id
    LEFT JOIN account_credentials c ON c.account_id = a.id
    WHERE a.id = $1`,
   [s.account_id],
  );
  return r.rows[0] || null;
 }

 async requireUser(s: Session, pro = false) {
  const u = await this.user(s);
  if (!u) fail('Bạn cần đăng nhập tài khoản miễn phí.', 401);
  if (pro && !u.pro) fail('Tính năng cần tài khoản Quán Ngon · Pro đang còn hạn.', 403);
  return u;
 }

 admin(req: Request) {
  const ipKey = 'admin-fail:' + hash(clientIp(req));
  const key = process.env.ADMIN_TOKEN;
  const given = req.headers.authorization?.replace(/^Bearer /, '') || '';
  if (!key || key.length < 32 || !given || !timingSafeEqual(hashBytes(key), hashBytes(given))) {
   if (process.env.NODE_ENV !== 'test') {
    const attempt = adminFailLimiter.check(ipKey, 10, 900);
    if (!attempt.allowed) fail('Quá nhiều lần thử quản trị không hợp lệ. Vui lòng thử lại sau.', 429);
   }
   fail('Không có quyền quản trị.', 403);
  }
 }

 async status(s: Session) {
  return {
   user: await this.user(s),
   config: { ...authConfig(), passwordAuth: true },
   distinctVisits: Number((await pool.query('SELECT count(*) FROM visits WHERE session_id=$1', [s.id])).rows[0].count),
   pending: s.pending_restaurant,
   dataset: 'Danh sách quán ăn/uống kèm hình ảnh, thời tiết & độ yêu thích tham khảo.',
  };
 }

 private async rotateSessionToAccount(oldSessionId: string, accountId: string, res: Response): Promise<{ next: Session; continuation: any }> {
  const token = randomBytes(32).toString('hex');
  const newId = hash(token);
  const next = await transaction(async (c) => {
   const old = (await c.query('SELECT * FROM sessions WHERE id=$1 FOR UPDATE', [oldSessionId])).rows[0];
   if (!old) fail('Phiên đã đổi. Vui lòng tải lại.', 409);
   const created = (
    await c.query('INSERT INTO sessions(id,account_id,pending_restaurant,pending_at) VALUES($1,$2,$3,$4) RETURNING *', [
     newId,
     accountId,
     old.pending_restaurant,
     old.pending_at,
    ])
   ).rows[0];
   await c.query('UPDATE visits SET account_id=$2 WHERE session_id=$1 AND account_id IS NULL', [oldSessionId, accountId]);
   await c.query('UPDATE visits SET session_id=$2 WHERE session_id=$1', [oldSessionId, newId]);
   await c.query("UPDATE sessions SET last_seen=now()-interval '25 hours',account_id=NULL,pending_restaurant=NULL,pending_at=NULL WHERE id=$1", [oldSessionId]);
   return created as Session;
  });
  this.cookie(res, token);
  const continuation =
   next.pending_restaurant && next.pending_at && Date.now() - new Date(next.pending_at).getTime() < 30 * 60000
    ? await this.visit(next, next.pending_restaurant)
    : null;
  return { next, continuation };
 }

 async register(s: Session, req: Request, res: Response) {
  return this.authManager.register(s, req, res);
 }

 async passwordLogin(s: Session, req: Request, res: Response) {
  return this.authManager.passwordLogin(s, req, res);
 }

 async accountHub(s: Session) {
  const u = await this.user(s);
  const distinctVisits = Number((await readPool.query('SELECT count(*) FROM visits WHERE session_id=$1', [s.id])).rows[0].count);
  if (!u) {
   return {
    user: null,
    distinctVisits,
    config: { ...authConfig(), passwordAuth: true },
    limits: { guestVisits: 4, freeFavorites: FREE_FAVORITES_LIMIT },
   };
  }

  const favLimit = u.pro ? 200 : FREE_FAVORITES_LIMIT;
  const histLimit = u.pro ? 100 : 15;

  const [favRes, histRes, prefRes, trialRes, colRes, noteRes, passkeyRes, sessCountRes] = await Promise.all([
   readPool.query(
    `SELECT r.id, r.name, r.address, r.city_slug, r.primary_group, r.image_url, r.popularity_badge, r.lat, r.lng, f.created_at
     FROM favorites f JOIN restaurants r ON r.id = f.restaurant_id
     WHERE f.account_id = $1 AND r.active
     ORDER BY f.created_at DESC LIMIT $2`,
    [u.id, favLimit],
   ),
   readPool.query(
    `SELECT r.id, r.name, r.address, r.city_slug, r.primary_group, r.image_url, max(v.created_at) AS chosen_at
     FROM visits v JOIN restaurants r ON r.id = v.restaurant_id
     WHERE v.account_id = $1 AND r.active
     GROUP BY r.id ORDER BY chosen_at DESC LIMIT $2`,
    [u.id, histLimit],
   ),
   readPool.query('SELECT excluded_groups, default_area, pro_boost FROM account_preferences WHERE account_id = $1', [u.id]),
   readPool.query('SELECT 1 FROM pro_trials WHERE account_id = $1', [u.id]),
   readPool.query(
    `SELECT c.id, c.name, c.icon, c.created_at,
            coalesce(
             json_agg(
              json_build_object('id', r.id, 'name', r.name, 'address', r.address, 'primary_group', r.primary_group, 'image_url', r.image_url)
              ORDER BY ci.created_at DESC
             ) FILTER (WHERE r.id IS NOT NULL),
             '[]'::json
            ) AS items
     FROM collections c
     LEFT JOIN collection_items ci ON ci.collection_id = c.id
     LEFT JOIN restaurants r ON r.id = ci.restaurant_id AND r.active
     WHERE c.account_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC LIMIT 20`,
    [u.id],
   ),
   readPool.query(
    `SELECT n.restaurant_id, r.name AS restaurant_name, r.primary_group, n.note, n.updated_at
     FROM place_notes n JOIN restaurants r ON r.id = n.restaurant_id
     WHERE n.account_id = $1 AND r.active
     ORDER BY n.updated_at DESC LIMIT 100`,
    [u.id],
   ),
   readPool.query(
    'SELECT credential_id, device_label, created_at, last_used_at FROM passkey_credentials WHERE account_id = $1 ORDER BY created_at DESC LIMIT 10',
    [u.id],
   ),
   readPool.query(
    "SELECT count(*)::int AS c FROM sessions WHERE account_id = $1 AND last_seen > now() - interval '30 minutes' AND created_at > now() - interval '24 hours'",
    [u.id],
   ),
  ]);

  return {
   user: u,
   distinctVisits,
   config: { ...authConfig(), passwordAuth: true },
   trialAvailable: !trialRes.rowCount,
   limits: { freeFavorites: FREE_FAVORITES_LIMIT },
   preferences: prefRes.rows[0] || { excluded_groups: [], default_area: null, pro_boost: true },
   favorites: favRes.rows,
   history: histRes.rows,
   collections: colRes.rows,
   notes: noteRes.rows,
   passkeys: passkeyRes.rows,
   activeSessions: sessCountRes.rows[0]?.c ?? 1,
  };
 }

 async updateProfile(s: Session, body: unknown) {
  const u = await this.requireUser(s);
  const b = z.object({ displayName: z.string().trim().min(2).max(50) }).strict().parse(body);
  await pool.query('UPDATE users SET display_name = $2 WHERE id = (SELECT user_id FROM accounts WHERE id = $1)', [u.id, b.displayName]);
  return { ok: true, user: await this.user(s) };
 }

 async updatePreferences(s: Session, body: unknown) {
  const u = await this.requireUser(s);
  const b = z
   .object({
    default_area: z.string().max(40).nullable().optional(),
    excluded_groups: z.array(z.string().max(80)).max(20).optional(),
    pro_boost: z.boolean().optional(),
   })
   .strict()
   .parse(body);

  if ((b.excluded_groups !== undefined || b.pro_boost !== undefined) && !u.pro) {
   fail('Hồ sơ Né món & Ưu tiên quán đỉnh dành riêng cho tài khoản Quán Ngon · Pro.', 403);
  }

  const validExcluded = b.excluded_groups
   ? [...new Set(b.excluded_groups.filter((g) => allFoodGroups.includes(g as any)))]
   : undefined;

  const current = (await pool.query('SELECT excluded_groups, default_area, pro_boost FROM account_preferences WHERE account_id = $1', [u.id])).rows[0] || {
   excluded_groups: [],
   default_area: null,
   pro_boost: true,
  };

  const nextExcluded = validExcluded !== undefined ? validExcluded : current.excluded_groups;
  const nextArea = b.default_area !== undefined ? b.default_area : current.default_area;
  const nextBoost = b.pro_boost !== undefined ? b.pro_boost : current.pro_boost;

  await pool.query(
   `INSERT INTO account_preferences(account_id, excluded_groups, default_area, pro_boost, updated_at)
    VALUES($1, $2, $3, $4, now())
    ON CONFLICT (account_id) DO UPDATE SET
     excluded_groups = EXCLUDED.excluded_groups,
     default_area = EXCLUDED.default_area,
     pro_boost = EXCLUDED.pro_boost,
     updated_at = now()`,
   [u.id, nextExcluded, nextArea, nextBoost],
  );
  return { ok: true, preferences: { excluded_groups: nextExcluded, default_area: nextArea, pro_boost: nextBoost } };
 }

 async claimProTrial(s: Session) {
  const u = await this.requireUser(s);
  if (!u.verified) {
   fail('Vui lòng xác thực địa chỉ email (hoặc đăng nhập Google / Số điện thoại) trước khi kích hoạt dùng thử Pro 14 ngày.', 403);
  }
  await this.rate('protrial:' + u.id, 5, 3600);
  await transaction(async (c) => {
   const claimed = await c.query('INSERT INTO pro_trials(account_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING account_id', [u.id]);
   if (!claimed.rowCount) {
    fail('Tài khoản của bạn đã sử dụng lượt dùng thử Pro 14 ngày trước đó.', 409);
   }
   await c.query(
    `INSERT INTO subscriptions(account_id, expires_at, source)
     VALUES($1, now() + interval '14 days', 'trial-14d')
     ON CONFLICT (account_id) DO UPDATE SET
      expires_at = GREATEST(subscriptions.expires_at, now()) + interval '14 days',
      source = 'trial-14d'`,
    [u.id],
   );
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'pro-trial-14d', $1)", [u.id]);
  });
  return { ok: true, user: await this.user(s) };
 }

 async createCollection(s: Session, body: unknown) {
  const u = await this.requireUser(s, true);
  const b = z
   .object({
    name: z.string().trim().min(1).max(60),
    icon: z.string().trim().min(1).max(8).default('📌'),
   })
   .strict()
   .parse(body);
  const count = Number((await pool.query('SELECT count(*) FROM collections WHERE account_id = $1', [u.id])).rows[0].count);
  if (count >= 20) fail('Bạn có thể tạo tối đa 20 bộ sưu tập.', 400);
  const id = randomUUID();
  await pool.query('INSERT INTO collections(id, account_id, name, icon) VALUES($1, $2, $3, $4)', [id, u.id, b.name, b.icon]);
  return { id, name: b.name, icon: b.icon, items: [] };
 }

 async deleteCollection(s: Session, collectionId: string) {
  const u = await this.requireUser(s, true);
  uuid.parse(collectionId);
  const r = await pool.query('DELETE FROM collections WHERE id = $1 AND account_id = $2 RETURNING id', [collectionId, u.id]);
  if (!r.rowCount) fail('Không tìm thấy bộ sưu tập.', 404);
  return { ok: true };
 }

 async toggleCollectionItem(s: Session, collectionId: string, restaurantId: string, add: boolean) {
  const u = await this.requireUser(s, true);
  uuid.parse(collectionId);
  uuid.parse(restaurantId);
  const owns = await pool.query('SELECT 1 FROM collections WHERE id = $1 AND account_id = $2', [collectionId, u.id]);
  if (!owns.rowCount) fail('Không tìm thấy bộ sưu tập.', 404);
  if (add) {
   await this.detail(restaurantId);
   await pool.query('INSERT INTO collection_items(collection_id, restaurant_id) VALUES($1, $2) ON CONFLICT DO NOTHING', [collectionId, restaurantId]);
  } else {
   await pool.query('DELETE FROM collection_items WHERE collection_id = $1 AND restaurant_id = $2', [collectionId, restaurantId]);
  }
  return { ok: true };
 }

 async saveNote(s: Session, restaurantId: string, body: unknown) {
  const u = await this.requireUser(s, true);
  await this.detail(restaurantId);
  const b = z.object({ note: z.string().trim().min(1).max(500) }).strict().parse(body);
  await pool.query(
   `INSERT INTO place_notes(account_id, restaurant_id, note, updated_at)
    VALUES($1, $2, $3, now())
    ON CONFLICT (account_id, restaurant_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now()`,
   [u.id, restaurantId, b.note],
  );
  return { ok: true, note: b.note };
 }

 async deleteNote(s: Session, restaurantId: string) {
  const u = await this.requireUser(s, true);
  uuid.parse(restaurantId);
  await pool.query('DELETE FROM place_notes WHERE account_id = $1 AND restaurant_id = $2', [u.id, restaurantId]);
  return { ok: true };
 }

 async directory(raw: Record<string, unknown>) {
  return directoryPage(raw, (r) => this.publicRestaurant(r));
 }

 private async globalReviewPrior(): Promise<number | null> {
  const fetchPrior = async () => {
   const r = await readPool.query("SELECT CASE WHEN count(*)>=10 THEN avg(score)::float ELSE NULL END AS prior FROM reviews WHERE status='approved'");
   return r.rows[0]?.prior ?? null;
  };
  if (process.env.NODE_ENV === 'test') return fetchPrior();
  return priorCache.getOrCompute('prior', 30_000, fetchPrior);
 }

 async restaurants(raw: Record<string, unknown>) {
  const f = searchSchema.parse(raw);
  const selected = f.tags ? f.tags.split(',') : [];
  for (const tag of selected) z.enum(tags).parse(tag);
  const excluded = f.exclude ? f.exclude.split(',').map((x) => uuid.parse(x)) : [];
  const localNow = new Date(Date.now() + 7 * 3600000);
  const args: any[] = [
   f.lng,
   f.lat,
   f.radius,
   f.group ?? null,
   f.budget ?? null,
   JSON.stringify(selected),
   excluded,
   f.open === 'true',
   localNow.getUTCDay(),
   localNow.getUTCHours() * 60 + localNow.getUTCMinutes(),
  ];
  const terms = searchTerms(f.q);
  let termSql = '';
  if (terms.length > 1) {
   args.push(terms.join(' '));
   termSql = ` AND r.search_tokens @@ plainto_tsquery('simple',$${args.length})`;
  } else if (terms.length) {
   args.push('%' + escapeLike(terms[0]) + '%');
   termSql = ` AND r.search_text LIKE $${args.length} ESCAPE '\\'`;
  }
  const lic = licenseSql('r');

  const [r, prior] = await Promise.all([
   readPool.query(
    `SELECT r.*, r.review_count AS count, r.review_avg AS average,
            ST_Distance(r.location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance,
            count(*) OVER()::int AS match_total
     FROM restaurants r
     WHERE r.active AND ST_DWithin(r.location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3)${lic}
     AND NOT(r.id=ANY($7::uuid[])) AND ($4::text IS NULL OR r.food_groups @> ARRAY[$4]::text[])
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.dishes) d WHERE ($4::text IS NULL OR d->>'group'=$4) AND d->'tags' @> $6::jsonb AND ($5::int IS NULL OR (d->>'price')::int<=$5))
     AND (NOT $8::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.hours) h WHERE
      ((h->>'close')::int>(h->>'open')::int AND (h->>'day')::int=$9 AND $10>=(h->>'open')::int AND $10<(h->>'close')::int)
      OR ((h->>'close')::int<(h->>'open')::int AND (((h->>'day')::int=$9 AND $10>=(h->>'open')::int) OR (((h->>'day')::int+1)%7=$9 AND $10<(h->>'close')::int)))))
     ${termSql} ORDER BY (r.import_record_id IS NOT NULL) DESC,r.demo,distance,r.id LIMIT 120`,
    args,
   ),
   this.globalReviewPrior(),
  ]);

  const now = new Date();
  const query = normalize(f.q);
  const rows = r.rows
   .flatMap((row) => {
    if (excluded.includes(row.id)) return [];
    const open = isOpen(row.hours, now);
    if (f.open === 'true' && open !== true) return [];
    const dishes = (row.dishes as Dish[]).filter(
     (d) =>
      (!f.group || d.group === f.group) &&
      selected.every((t) => d.tags.includes(t as any)) &&
      (f.budget === undefined || (d.price !== null && d.price <= f.budget)),
    );
    if (!dishes.length) return [];
    const score = rankScore(
     row.distance,
     f.radius,
     row.average ?? null,
     row.count || 0,
     prior,
     query || selected.length || f.group ? 1 : 0.7,
     (now.getTime() - row.updated_at.getTime()) / 86400000,
    );
    return [
     {
      ...this.publicRestaurant(row),
      open,
      distance: Math.round(row.distance),
      matchedDishes: dishes,
      score,
      reasons: [
       `Cách khoảng ${Math.round(row.distance)} m đường thẳng`,
       ...(f.budget !== undefined ? ['Có món trong ngân sách'] : []),
       ...(selected.length || f.group || query ? ['Khớp món và khẩu vị bạn chọn'] : ['Một lựa chọn để đổi vị']),
       ...(!row.count ? ['Quán chưa có đánh giá nội bộ'] : []),
      ],
     },
    ];
   })
   .sort(
    (a, b) =>
     Number(!!b.import_record_id) - Number(!!a.import_record_id) ||
     Number(a.demo) - Number(b.demo) ||
     b.score - a.score ||
     a.id.localeCompare(b.id),
   );

  return {
   items: rows.slice(0, 60),
   total: r.rows[0]?.match_total ?? 0,
   hasMore: (r.rows[0]?.match_total ?? 0) > 60,
   emptySuggestion: rows.length ? null : 'Không có quán khớp đầy đủ. Bạn có thể chủ động tăng bán kính hoặc đổi bộ lọc.',
   ranking: {
    sourcePriority: ['user_import', 'non_demo', 'demo'],
    candidateLimit: 120,
    weights: { distance: 35, quality: 25, match: 20, interest: 0, freshness: 10 },
    interestDisabled: true,
   },
   location: { lat: f.lat, lng: f.lng },
  };
 }

 publicRestaurant(row: any) {
  const {
   location,
   prior,
   score,
   search_text,
   search_tokens,
   name_norm,
   match_total,
   foody_id,
   external_url,
   review_count,
   review_avg,
   image_checked_at,
   popularity_rating,
   ...r
  } = row;
  const safeSource = typeof r.source === 'string' && /foody/i.test(r.source)
   ? 'Danh mục địa điểm tổng hợp · chưa xác minh thực đơn & hoạt động'
   : r.source;
  return {
   ...r,
   image_url: r.image_url ?? null,
   popularity_badge: r.popularity_badge ?? null,
   popularity_saves: Number(r.popularity_saves || 0),
   popularity_reviews: Number(r.popularity_reviews || 0),
   popularity_score: Math.round(Number(r.popularity_score || 0) * 10) / 10,
   source: safeSource,
   count: row.count ?? review_count ?? 0,
   average: row.average ?? review_avg ?? null,
  };
 }

 async detail(id: string) {
  uuid.parse(id);
  const [r, reviews] = await Promise.all([
   readPool.query(
    `SELECT r.*, r.review_count AS count, r.review_avg AS average FROM restaurants r WHERE r.id=$1 AND r.active${licenseSql('r')}`,
    [id],
   ),
   readPool.query(
    "SELECT r.id,r.taste,r.value,r.service,r.space,r.score,r.body,r.self_confirmed,r.demo,r.updated_at,u.display_name FROM reviews r JOIN accounts a ON a.id=r.account_id JOIN users u ON u.id=a.user_id WHERE r.restaurant_id=$1 AND r.status='approved' ORDER BY r.updated_at DESC LIMIT 50",
    [id],
   ),
  ]);
  if (!r.rows[0]) fail('Không tìm thấy quán.', 404);
  return { ...this.publicRestaurant(r.rows[0]), open: isOpen(r.rows[0].hours), reviews: reviews.rows };
 }

 async visit(s: Session, id: string) {
  uuid.parse(id);
  return transaction(async (c) => {
   const locked = await c.query(
    "SELECT * FROM sessions WHERE id=$1 AND last_seen>now()-interval '30 minutes' AND created_at>now()-interval '24 hours' FOR UPDATE",
    [s.id],
   );
   const current = locked.rows[0];
   if (!current) fail('Phiên đã hết hạn, vui lòng tải lại.', 401);
   const restaurant = (await c.query('SELECT * FROM restaurants WHERE id=$1 AND active', [id])).rows[0];
   if (!restaurant) fail('Không tìm thấy quán.', 404);
   const prior = await c.query('SELECT 1 FROM visits WHERE session_id=$1 AND restaurant_id=$2', [s.id, id]);
   const count = Number((await c.query('SELECT count(*) FROM visits WHERE session_id=$1', [s.id])).rows[0].count);
   if (!current.account_id && !prior.rowCount && count >= 4) {
    await c.query('UPDATE sessions SET pending_restaurant=$2,pending_at=now() WHERE id=$1', [s.id, id]);
    return {
     requiresLogin: true,
     restaurantId: id,
     message: 'Bạn đã mở chỉ đường 4 quán miễn phí trong phiên này. Đăng nhập hoặc tạo tài khoản Thường (0đ) để mở không giới hạn!',
    };
   }
   await c.query('INSERT INTO visits(session_id,restaurant_id,account_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
    s.id,
    id,
    current.account_id,
   ]);
   await c.query('UPDATE sessions SET pending_restaurant=NULL,pending_at=NULL WHERE id=$1', [s.id]);
   return {
    requiresLogin: false,
    url: mapsUrl(restaurant),
    restaurantId: id,
    message: 'Đây là ý định ghé thăm, không xác minh bạn đã đến quán.',
   };
  });
 }

 async login(s: Session, req: Request, res: Response) {
  await this.rate('login:' + hash(clientIp(req)), 12, 60);
  const body = z
   .object({ provider: z.enum(['development', 'google', 'phone', 'facebook']), token: z.string().max(12000).optional() })
   .strict()
   .parse(req.body);
  let identity: { subject: string; name: string };
  if (body.provider === 'development') {
   if (!devAuthEnabled()) fail('Đăng nhập development bị tắt.', 403);
   identity = { subject: randomUUID(), name: 'Bạn thử nghiệm' };
  } else {
   try {
    identity = await verifyIdentity(body.provider, body.token || '');
   } catch (e) {
    if (e instanceof HttpException) throw e;
    fail('Token đăng nhập không hợp lệ hoặc đã hết hạn.', 401);
   }
  }
  const accountId = await transaction(async (c) => {
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [body.provider + ':' + identity.subject]);
   let account = (await c.query('SELECT account_id FROM auth_identities WHERE provider=$1 AND subject=$2', [body.provider, identity.subject])).rows[0]?.account_id;
   if (!account) {
    account = randomUUID();
    const userId = randomUUID();
    await c.query('INSERT INTO users(id,display_name) VALUES($1,$2)', [userId, identity.name]);
    await c.query('INSERT INTO accounts(id,user_id) VALUES($1,$2)', [account, userId]);
    await c.query('INSERT INTO auth_identities VALUES($1,$2,$3)', [body.provider, identity.subject, account]);
    await c.query('INSERT INTO account_preferences(account_id) VALUES($1) ON CONFLICT DO NOTHING', [account]);
   }
   return account as string;
  });
  const { next, continuation } = await this.rotateSessionToAccount(s.id, accountId, res);
  return { user: await this.user(next), continuation };
 }

 async logout(s: Session, res: Response) {
  await pool.query("UPDATE sessions SET last_seen=now()-interval '25 hours',account_id=NULL WHERE id=$1", [s.id]);
  res.clearCookie(COOKIE, { path: '/' });
  res.clearCookie(PROD_COOKIE, { path: '/', secure: true });
  return { ok: true };
 }

 async library(s: Session) {
  const u = await this.requireUser(s);
  const [favorites, history, filters] = await Promise.all([
   readPool.query('SELECT r.id,r.name,r.address,r.primary_group,r.image_url FROM favorites f JOIN restaurants r ON r.id=f.restaurant_id WHERE account_id=$1 AND active ORDER BY f.created_at DESC LIMIT 200', [u.id]),
   readPool.query('SELECT r.id,r.name,max(v.created_at) AS chosen_at FROM visits v JOIN restaurants r ON r.id=v.restaurant_id WHERE v.account_id=$1 AND active GROUP BY r.id ORDER BY chosen_at DESC LIMIT 50', [u.id]),
   readPool.query('SELECT id,name,filters FROM saved_filters WHERE account_id=$1 LIMIT 50', [u.id]),
  ]);
  return { favorites: favorites.rows, history: history.rows, filters: filters.rows };
 }

 async favorite(s: Session, id: string, on: boolean) {
  const u = await this.requireUser(s);
  await this.detail(id);
  if (on) {
   if (!u.pro) {
    const existing = await pool.query('SELECT 1 FROM favorites WHERE account_id=$1 AND restaurant_id=$2', [u.id, id]);
    if (!existing.rowCount) {
     const count = Number((await pool.query('SELECT count(*) FROM favorites WHERE account_id=$1', [u.id])).rows[0].count);
     if (count >= FREE_FAVORITES_LIMIT) {
      fail(`Tài khoản Thường lưu tối đa ${FREE_FAVORITES_LIMIT} quán yêu thích. Nâng cấp Pro để lưu không giới hạn và tạo Bộ sưu tập!`, 403);
     }
    }
   }
   await pool.query('INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING', [u.id, id]);
  } else {
   await pool.query('DELETE FROM favorites WHERE account_id=$1 AND restaurant_id=$2', [u.id, id]);
  }
  return { ok: true };
 }

 async saveFilter(s: Session, body: unknown) {
  const u = await this.requireUser(s, true);
  const b = z
   .object({ name: z.string().trim().min(1).max(60), filters: searchSchema.omit({ lat: true, lng: true, exclude: true }) })
   .strict()
   .parse(body);
  await this.rate('filters:' + u.id, 20, 3600);
  await pool.query('INSERT INTO saved_filters VALUES($1,$2,$3,$4)', [randomUUID(), u.id, b.name, JSON.stringify(b.filters)]);
  return { ok: true };
 }

 async compare(s: Session, raw: Record<string, unknown>) {
  await this.requireUser(s, true);
  const b = z.object({ ids: z.string().max(180), group: z.enum(allFoodGroups as [string, ...string[]]).optional() }).parse(raw);
  const ids = [...new Set(b.ids.split(',').map((x) => uuid.parse(x)))];
  if (ids.length < 2 || ids.length > 4) fail('Chọn 2–4 quán để so sánh.');
  const items = await Promise.all(ids.map((id) => this.detail(id)));
  if (b.group) {
   if (items.some((r) => !r.dishes.some((d: Dish) => d.group === b.group))) fail('Các quán phải có cùng nhóm món cụ thể.');
   return { group: b.group, items: items.map((r) => ({ ...r, dishes: r.dishes.filter((d: Dish) => d.group === b.group) })) };
  }
  return { group: null, items };
 }

 async eligibility(s: Session, id: string) {
  const u = await this.requireUser(s);
  uuid.parse(id);
  const [visitRes, reviewRes] = await Promise.all([
   readPool.query('SELECT min(created_at) AS at FROM visits WHERE account_id=$1 AND restaurant_id=$2', [u.id, id]),
   readPool.query('SELECT * FROM reviews WHERE account_id=$1 AND restaurant_id=$2', [u.id, id]),
  ]);
  const v = visitRes.rows[0].at;
  const wait = v ? Math.max(0, 30 * 60000 - (Date.now() - v.getTime())) : null;
  return {
   pro: u.pro,
   hasIntent: !!v,
   waitSeconds: wait === null ? null : Math.ceil(wait / 1000),
   canReview: u.pro && wait === 0,
   explanation: 'Chờ 30 phút sau ý định ghé thăm và tự xác nhận đã ăn. Đây không phải lượt đến đã xác minh.',
   myReview: reviewRes.rows[0] || null,
  };
 }

 async review(s: Session, id: string, body: unknown) {
  const u = await this.requireUser(s, true);
  await this.detail(id);
  const b = z
   .object({
    taste: z.number().int().min(1).max(5),
    value: z.number().int().min(1).max(5),
    service: z.number().int().min(1).max(5),
    space: z.number().int().min(1).max(5),
    body: z.string().trim().min(10).max(2000),
    self_confirmed: z.literal(true),
   })
   .strict()
   .parse(body);
  await this.rate('review:' + u.id, 6, 3600);
  const result = await transaction(async (c) => {
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [u.id + ':' + id]);
   const active = await c.query('SELECT 1 FROM subscriptions WHERE account_id=$1 AND expires_at>now() FOR UPDATE', [u.id]);
   if (!active.rowCount) fail('Pro đã hết hạn.', 403);
   const v = await c.query(
    "SELECT 1 FROM visits WHERE account_id=$1 AND restaurant_id=$2 AND created_at<=now()-interval '30 minutes' LIMIT 1",
    [u.id, id],
   );
   if (!v.rowCount) fail('Cần ý định ghé thăm trước ít nhất 30 phút.', 403);
   const old = (await c.query('SELECT * FROM reviews WHERE account_id=$1 AND restaurant_id=$2 FOR UPDATE', [u.id, id])).rows[0];
   if (old) await c.query('INSERT INTO review_history(review_id,snapshot) VALUES($1,$2)', [old.id, JSON.stringify(old)]);
   const demo = (await c.query('SELECT demo FROM restaurants WHERE id=$1', [id])).rows[0].demo;
   const r = await c.query(
    "INSERT INTO reviews(id,account_id,restaurant_id,taste,value,service,space,body,self_confirmed,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9) ON CONFLICT(account_id,restaurant_id) DO UPDATE SET taste=EXCLUDED.taste,value=EXCLUDED.value,service=EXCLUDED.service,space=EXCLUDED.space,body=EXCLUDED.body,status='pending',updated_at=now() RETURNING id,status",
    [randomUUID(), u.id, id, b.taste, b.value, b.service, b.space, b.body, demo],
   );
   await c.query('INSERT INTO audit(actor,action,target) VALUES($1,$2,$3)', [u.id, old ? 'review-edit' : 'review-create', r.rows[0].id]);
   return r.rows[0];
  });
  priorCache.clear();
  invalidateCatalogueCache();
  return result;
 }

 async report(s: Session, id: string, body: unknown) {
  await this.detail(id);
  const b = z.object({ body: z.string().trim().min(10).max(1000), review_id: uuid.nullable().optional() }).strict().parse(body);
  await this.rate('report:' + s.id, 5, 3600);
  if (b.review_id) {
   const r = await pool.query('SELECT 1 FROM reviews WHERE id=$1 AND restaurant_id=$2', [b.review_id, id]);
   if (!r.rowCount) fail('Đánh giá không thuộc quán này.');
  }
  await pool.query('INSERT INTO reports(id,session_id,restaurant_id,review_id,body) VALUES($1,$2,$3,$4,$5)', [
   randomUUID(),
   s.id,
   id,
   b.review_id || null,
   b.body,
  ]);
  return { ok: true };
 }

 async adminList(req: Request) {
  this.admin(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const terms = searchTerms(q);
  const rArgs: any[] = [];
  let rWhere = '';
  if (terms.length > 1) {
   rArgs.push(terms.join(' '));
   rWhere = `WHERE search_tokens @@ plainto_tsquery('simple',$1)`;
  } else if (terms.length) {
   rArgs.push('%' + escapeLike(terms[0]) + '%');
   rWhere = `WHERE search_text LIKE $1 ESCAPE '\\'`;
  }
  rArgs.push(limit, offset);
  const [restaurants, reviews, reports, audit] = await Promise.all([
   readPool.query(`SELECT id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo,active,branch_of,data_license,updated_at FROM restaurants ${rWhere} ORDER BY updated_at DESC, name LIMIT $${rArgs.length - 1} OFFSET $${rArgs.length}`, rArgs),
   readPool.query('SELECT * FROM reviews ORDER BY updated_at DESC LIMIT 100'),
   readPool.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100'),
   readPool.query('SELECT * FROM audit ORDER BY id DESC LIMIT 100'),
  ]);
  return { restaurants: restaurants.rows, reviews: reviews.rows, reports: reports.rows, audit: audit.rows };
 }

 async adminRestaurant(req: Request, id?: string) {
  this.admin(req);
  if (id) uuid.parse(id);
  const b = restaurantSchema.parse(req.body);
  const target = id || randomUUID();
  const dataLicense = b.demo ? 'demo' : 'first_party';
  await transaction(async (c) => {
   await c.query(
    `INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo,branch_of,data_license) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,lat=EXCLUDED.lat,lng=EXCLUDED.lng,dishes=EXCLUDED.dishes,hours=EXCLUDED.hours,price_min=EXCLUDED.price_min,price_max=EXCLUDED.price_max,source=EXCLUDED.source,demo=EXCLUDED.demo,branch_of=EXCLUDED.branch_of,data_license=EXCLUDED.data_license,updated_at=now() RETURNING id`,
    [
     target,
     b.name,
     b.address,
     b.lat,
     b.lng,
     JSON.stringify(b.dishes),
     b.hours === null ? null : JSON.stringify(b.hours),
     b.price_min,
     b.price_max,
     b.source,
     b.demo,
     b.branch_of || null,
     dataLicense,
    ],
   );
   await c.query("INSERT INTO audit(actor,action,target,detail) VALUES('admin',$1,$2,$3)", [
    id ? 'restaurant-update' : 'restaurant-create',
    target,
    JSON.stringify({ name: b.name }),
   ]);
  });
  invalidateCatalogueCache();
  return { id: target };
 }

 async adminDelete(req: Request, id: string) {
  this.admin(req);
  uuid.parse(id);
  await transaction(async (c) => {
   const r = await c.query('UPDATE restaurants SET active=false,updated_at=now() WHERE id=$1 RETURNING id', [id]);
   if (!r.rowCount) fail('Không có quán.', 404);
   await c.query("INSERT INTO audit(actor,action,target) VALUES('admin','restaurant-archive',$1)", [id]);
  });
  invalidateCatalogueCache();
  return { ok: true };
 }

 async moderate(req: Request, id: string) {
  this.admin(req);
  uuid.parse(id);
  const b = z.object({ status: z.enum(['approved', 'rejected', 'pending']), reason: z.string().trim().min(3).max(500) }).strict().parse(req.body);
  await transaction(async (c) => {
   const r = (await c.query('SELECT * FROM reviews WHERE id=$1 FOR UPDATE', [id])).rows[0];
   if (!r) fail('Không có đánh giá.', 404);
   await c.query('INSERT INTO review_history(review_id,snapshot) VALUES($1,$2)', [id, JSON.stringify(r)]);
   await c.query('UPDATE reviews SET status=$2 WHERE id=$1', [id, b.status]);
   await c.query("INSERT INTO audit(actor,action,target,detail) VALUES('admin','review-moderation',$1,$2)", [id, JSON.stringify(b)]);
  });
  priorCache.clear();
  invalidateCatalogueCache();
  return { ok: true };
 }

 async resolve(req: Request, id: string) {
  this.admin(req);
  uuid.parse(id);
  await transaction(async (c) => {
   const r = await c.query("UPDATE reports SET status='resolved' WHERE id=$1 RETURNING id", [id]);
   if (!r.rowCount) fail('Không có báo cáo.', 404);
   await c.query("INSERT INTO audit(actor,action,target) VALUES('admin','report-resolve',$1)", [id]);
  });
  return { ok: true };
 }

 async geocode(req: Request, publicSession?: Session) {
  if (publicSession) {
   await this.rate('geocode-user:' + publicSession.id, 5, 600);
   await this.rate('geocode-ip:' + hash(clientIp(req)), 10, 600);
  } else {
   this.admin(req);
   await this.rate('geocode-admin', 10, 60);
  }
  const b = z.object({ address: z.string().trim().min(5).max(300) }).strict().parse(req.body);
  if (publicSession) {
   const terms = searchTerms(b.address);
   if (!terms.length) {
    return { status: 'ZERO_RESULTS', candidates: [], provenance: 'Dữ liệu quán đã tra tọa độ', storage: 'Tra dữ liệu cục bộ, không gọi API Google hoặc dịch vụ ngoài.' };
   }
   const sql = terms.length > 1
    ? `SELECT name,address,lat,lng,location_source FROM restaurants WHERE active AND lat IS NOT NULL AND search_tokens @@ plainto_tsquery('simple',$1)${licenseSql('restaurants')} ORDER BY (import_record_id IS NOT NULL) DESC, name LIMIT 5`
    : `SELECT name,address,lat,lng,location_source FROM restaurants WHERE active AND lat IS NOT NULL AND search_text LIKE $1 ESCAPE '\\'${licenseSql('restaurants')} ORDER BY (import_record_id IS NOT NULL) DESC, name LIMIT 5`;
   const param = terms.length > 1 ? terms.join(' ') : '%' + escapeLike(terms[0]) + '%';
   const rows = (await readPool.query(sql, [param])).rows;
   const candidates = rows.map((r) => ({
    coordinates: { lat: r.lat, lng: r.lng },
    label: r.name + ' · ' + r.address,
    provider: r.location_source.startsWith('osm') ? 'OpenStreetMap' : 'Tọa độ hồ sơ',
    partial: true,
   }));
   return {
    status: candidates.length > 1 ? 'AMBIGUOUS' : candidates.length ? 'OK' : 'ZERO_RESULTS',
    candidates,
    provenance: 'Dữ liệu quán đã tra tọa độ',
    storage: 'Tra dữ liệu cục bộ, không gọi API Google hoặc dịch vụ ngoài.',
   };
  }
  const key = process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
  if (!key) fail('Geocoding quản trị chưa được cấu hình.', 503);
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', b.address);
  url.searchParams.set('region', 'vn');
  url.searchParams.set('key', key!);
  for (let attempt = 0; attempt < 2; attempt++) {
   let response: globalThis.Response;
   try {
    response = await fetch(url, { signal: AbortSignal.timeout(4000) });
   } catch {
    if (attempt === 0) continue;
    return fail('Geocoding tạm thời không kết nối được.', 502);
   }
   if (response.status >= 500 && attempt === 0) continue;
   if (!response.ok) fail('Dịch vụ Geocoding không sẵn sàng.', 502);
   const data = (await response.json()) as any;
   if (data.status === 'ZERO_RESULTS') return { status: 'ZERO_RESULTS', candidates: [] };
   if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') fail('Geocoding đã chạm giới hạn.', 429);
   if (data.status === 'REQUEST_DENIED') fail('Cấu hình Geocoding bị từ chối.', 503);
   if (data.status === 'UNKNOWN_ERROR' && attempt === 0) continue;
   if (data.status !== 'OK') fail('Địa chỉ không xử lý được.', 502);
   const candidates = data.results.slice(0, 5).map((r: any) => ({ coordinates: coordinate.parse(r.geometry.location), partial: !!r.partial_match }));
   return {
    status: candidates.length > 1 || candidates.some((x: any) => x.partial) ? 'AMBIGUOUS' : 'OK',
    candidates,
    provenance: 'Google Maps',
    storage: 'Không lưu kết quả. Chỉ sử dụng tạm thời cho truy vấn; không sao chép vào hồ sơ quán lâu dài.',
   };
  }
  return fail('Geocoding tạm thời không sẵn sàng.', 502);
 }

 async webhook(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) fail('Thanh toán chưa được cấu hình.', 503);
  const timestamp = String(req.headers['x-payment-timestamp'] || '');
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) fail('Webhook đã hết hạn.', 401);
  const signature = String(req.headers['x-payment-signature'] || '');
  const raw = (req as any).rawBody as Buffer | undefined;
  if (!raw) fail('Thiếu raw body.', 400);
  const expected = createHmac('sha256', secret!).update(timestamp + '.').update(raw!).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) fail('Chữ ký webhook không hợp lệ.', 401);
  const b = z.object({ id: z.string().min(8).max(100), account_id: uuid, expires_at: z.iso.datetime() }).strict().parse(req.body);
  const expires = new Date(b.expires_at);
  if (expires <= new Date() || expires.getTime() > Date.now() + 2 * 366 * 86400000) fail('Hạn subscription không hợp lệ.');
  return transaction(async (c) => {
   const r = await c.query('INSERT INTO payment_events(id,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id', [b.id, hash(raw!.toString())]);
   if (!r.rowCount) {
    const existing = (await c.query('SELECT payload_hash FROM payment_events WHERE id=$1', [b.id])).rows[0];
    if (existing.payload_hash !== hash(raw!.toString())) fail('Event ID có nội dung khác.', 409);
    return { ok: true, duplicate: true };
   }
   await c.query(
    "INSERT INTO subscriptions VALUES($1,$2,'webhook-adapter') ON CONFLICT(account_id) DO UPDATE SET expires_at=GREATEST(subscriptions.expires_at,EXCLUDED.expires_at),source=EXCLUDED.source",
    [b.account_id, expires],
   );
   await c.query("INSERT INTO audit(actor,action,target) VALUES('webhook','subscription',$1)", [b.account_id]);
   return { ok: true, duplicate: false };
  });
 }
}
