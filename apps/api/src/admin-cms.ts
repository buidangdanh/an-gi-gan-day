import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, readPool, transaction } from './db';
import { verifyIdentity, VerifiedIdentity } from './auth';
import { VALID_CITY_SLUGS, allFoodGroups, invalidateCatalogueCache } from './catalogue';
import { searchTerms } from './catalogue';
import { escapeLike } from './cache';
import { tags as defaultDishTags } from './domain';

function fail(message: string, status = 400): never {
 throw new HttpException(message, status);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const uuid = z.string().uuid();

export function getAllowedAdminEmail(): string {
 return (process.env.ADMIN_GOOGLE_EMAIL || 'hnverynice@gmail.com').trim().toLowerCase();
}

export type AdminSessionRow = {
 id: string;
 account_id: string | null;
 pending_restaurant: string | null;
 pending_at: Date | null;
 auth_method?: string | null;
};

export type AdminCmsDeps = {
 clientIp: (req: Request) => string;
 readRate: (key: string, limit: number, seconds: number) => void;
 rate: (key: string, limit: number, seconds: number) => Promise<void>;
 rotateSessionToAccount: (
  oldSessionId: string,
  accountId: string,
  res: Response,
  authMethod?: string,
 ) => Promise<{ next: AdminSessionRow; continuation: any }>;
 clearPriorCache: () => void;
 verifyGoogleToken?: (token: string) => Promise<VerifiedIdentity>;
};

const DATA_LICENSES = [
 'first_party',
 'odbl',
 'cdla_permissive',
 'cc0',
 'partner_licensed',
 'demo',
 'unverified_import',
] as const;

const POPULARITY_BADGES = ['top_fav', 'popular', 'good_rating', 'worth_try'] as const;

const VERIFICATION_STATUSES = ['verified', 'unverified', 'pending_verification', 'rejected'] as const;

const adminDishSchema = z
 .object({
  name: z.string().trim().min(1, 'Tên món không được để trống').max(160),
  group: z.string().trim().min(1, 'Nhóm món không được để trống').max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  price: z.number().int().min(0).max(50_000_000).nullable().default(null),
  bestsellerSource: z.string().trim().max(300).nullable().default(null),
 })
 .strict();

const adminHourSchema = z
 .object({
  day: z.number().int().min(0).max(6),
  open: z.number().int().min(0).max(1439),
  close: z.number().int().min(0).max(1440),
 })
 .strict()
 .refine((x) => x.open !== x.close, { message: 'Giờ mở và đóng phải khác nhau' });

export const adminRestaurantFullSchema = z
 .object({
  name: z.string().trim().min(1, 'Tên quán không được để trống').max(200),
  address: z.string().trim().min(2, 'Địa chỉ quá ngắn').max(400),
  city_slug: z.enum(VALID_CITY_SLUGS).default('ha-noi'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  location_source: z.string().trim().min(1).max(80).default('manual'),
  location_checked_at: z
   .string()
   .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Thời gian kiểm tra tọa độ không hợp lệ' })
   .nullable()
   .optional(),
  primary_group: z.string().trim().min(1).max(80).default('chưa phân nhóm'),
  food_groups: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  classification_source: z.string().trim().min(1).max(80).default('admin_manual'),
  dishes: z.array(adminDishSchema).max(150).default([]),
  hours: z.array(adminHourSchema).max(70).nullable().default(null),
  price_min: z.number().int().min(0).max(50_000_000).nullable().default(null),
  price_max: z.number().int().min(0).max(50_000_000).nullable().default(null),
  image_url: z
   .string()
   .trim()
   .max(1000)
   .refine((v) => v === '' || /^https:\/\/[a-zA-Z0-9.-]+\//.test(v), {
    message: 'Ảnh đại diện phải là đường dẫn HTTPS hợp lệ (https://...)',
   })
   .nullable()
   .default(null),
  popularity_badge: z.enum(POPULARITY_BADGES).nullable().default(null),
  popularity_saves: z.number().int().min(0).max(10_000_000).default(0),
  popularity_reviews: z.number().int().min(0).max(10_000_000).default(0),
  popularity_rating: z.number().min(0).max(10).nullable().default(null),
  popularity_score: z.number().min(0).max(100).default(0),
  source: z.string().trim().min(1, 'Nguồn dữ liệu không được để trống').max(400).default('Quản trị viên Tìm quán ngon'),
  data_license: z.enum(DATA_LICENSES).default('first_party'),
  verification_status: z.enum(VERIFICATION_STATUSES).default('verified'),
  active: z.boolean().default(true),
  demo: z.boolean().default(false),
  branch_of: z.string().uuid().nullable().default(null),
  foody_id: z
   .preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable())
   .optional()
   .default(null),
  external_url: z.string().trim().max(1000).nullable().optional().default(null),
  import_record_id: z.string().trim().max(200).nullable().optional().default(null),
 })
 .refine((r) => (r.lat === null) === (r.lng === null), {
  message: 'Vĩ độ (lat) và Kinh độ (lng) phải cùng có giá trị hoặc cùng để trống.',
 })
 .refine((r) => r.price_min === null || r.price_max === null || r.price_max >= r.price_min, {
  message: 'Giá cao nhất phải lớn hơn hoặc bằng giá thấp nhất.',
 });

const TRACKED_RESTAURANT_FIELDS = [
 'name',
 'address',
 'city_slug',
 'lat',
 'lng',
 'location_source',
 'primary_group',
 'food_groups',
 'classification_source',
 'dishes',
 'hours',
 'price_min',
 'price_max',
 'image_url',
 'popularity_badge',
 'popularity_saves',
 'popularity_reviews',
 'popularity_rating',
 'popularity_score',
 'source',
 'data_license',
 'verification_status',
 'active',
 'demo',
 'branch_of',
 'foody_id',
 'external_url',
 'import_record_id',
] as const;

const FULL_RESTAURANT_SELECT = `
 r.id,
 r.name,
 r.address,
 r.city_slug,
 r.lat,
 r.lng,
 r.location_source,
 r.location_checked_at,
 r.primary_group,
 r.food_groups,
 r.classification_source,
 r.dishes,
 r.hours,
 r.price_min,
 r.price_max,
 r.image_url,
 r.image_checked_at,
 r.popularity_badge,
 r.popularity_saves,
 r.popularity_reviews,
 r.popularity_rating,
 r.popularity_score,
 r.review_count,
 r.review_avg,
 r.source,
 r.data_license,
 r.verification_status,
 r.active,
 r.demo,
 r.branch_of,
 r.foody_id,
 r.external_url,
 r.import_record_id,
 r.name_norm,
 r.search_text,
 r.created_at,
 r.updated_at,
 r.deleted_at
`;

function currentVietnamDate(): string {
 return new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
 }).format(new Date());
}

export class AdminCmsService {
 constructor(private readonly deps: AdminCmsDeps) {}

 private async inspectAdminSession(s: AdminSessionRow) {
  const allowedEmail = getAllowedAdminEmail();
  if (!s.account_id) {
   return {
    authorized: false,
    allowedEmail,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    currentUser: null,
    reason: null as string | null,
   };
  }

  const row = (
   await readPool.query(
    `SELECT a.id, u.display_name, a.email, a.email_verified_at,
            EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.account_id = a.id AND ai.provider = 'google') AS has_google
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [s.account_id],
   )
  ).rows[0];

  if (!row) {
   return {
    authorized: false,
    allowedEmail,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    currentUser: null,
    reason: null as string | null,
   };
  }

  const email = (row.email || '').trim().toLowerCase();
  const isGoogleSession = s.auth_method === 'google';
  const hasGoogle = Boolean(row.has_google);
  const emailMatches = email === allowedEmail && Boolean(row.email_verified_at);
  const authorized = Boolean(emailMatches && hasGoogle && isGoogleSession);

  let reason: string | null = null;
  if (!authorized) {
   if (email !== allowedEmail) {
    reason = `Tài khoản hiện tại (${row.email || row.display_name}) không có quyền truy cập. Trang quản lý chỉ cho phép duy nhất ${allowedEmail} (Google).`;
   } else if (!isGoogleSession || !hasGoogle) {
    reason = `Vui lòng đăng nhập trực tiếp qua nút Google với tài khoản ${allowedEmail} để xác thực quyền quản trị.`;
   } else {
    reason = `Email ${allowedEmail} chưa hoàn tất xác thực Google.`;
   }
  }

  return {
   authorized,
   allowedEmail,
   googleClientId: process.env.GOOGLE_CLIENT_ID || null,
   currentUser: {
    id: row.id as string,
    displayName: row.display_name as string,
    email: (row.email as string | null) || null,
    authMethod: s.auth_method || null,
   },
   reason,
  };
 }

 async sessionStatus(s: AdminSessionRow) {
  return this.inspectAdminSession(s);
 }

 async requireGoogleAdmin(s: AdminSessionRow): Promise<{ accountId: string; email: string; displayName: string }> {
  const info = await this.inspectAdminSession(s);
  if (!info.currentUser) {
   fail(`Vui lòng đăng nhập bằng Google (${info.allowedEmail}) để quản lý dữ liệu.`, 401);
  }
  if (!info.authorized) {
   fail(info.reason || `Chỉ tài khoản Google ${info.allowedEmail} mới có quyền truy cập.`, 403);
  }
  return {
   accountId: info.currentUser.id,
   email: info.allowedEmail,
   displayName: info.currentUser.displayName,
  };
 }

 async googleLogin(s: AdminSessionRow, req: Request, res: Response) {
  const ip = this.deps.clientIp(req);
  this.deps.readRate('admin-gauth-burst:' + ip, 12, 60);
  await this.deps.rate('admin-gauth:' + sha256(ip), 20, 300);

  const b = z.object({ token: z.string().min(10).max(6000) }).strict().parse(req.body);
  const verifier = this.deps.verifyGoogleToken || ((tok: string) => verifyIdentity('google', tok));

  let identity: VerifiedIdentity;
  try {
   identity = await verifier(b.token);
  } catch (e) {
   if (e instanceof HttpException) throw e;
   fail('Xác thực Google không hợp lệ hoặc phiên đã hết hạn. Vui lòng thử lại.', 401);
  }

  const allowedEmail = getAllowedAdminEmail();
  const email = (identity.email || '').trim().toLowerCase();

  if (!identity.emailVerified || email !== allowedEmail) {
   await pool
    .query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'admin-login-denied', 'admin-cms', $2)", [
     email || 'unknown',
     JSON.stringify({ attemptedEmail: email || null, emailVerified: Boolean(identity.emailVerified) }),
    ])
    .catch(() => {});
   fail(
    `Từ chối truy cập: Tài khoản ${email || 'này'} không được phép vào trang quản lý. Chỉ chấp nhận ${allowedEmail} (Google).`,
    403,
   );
  }

  const accountId = await transaction(async (c) => {
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`google:${identity.subject}`]);
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`email:${allowedEmail}`]);

   let accId = (
    await c.query("SELECT account_id FROM auth_identities WHERE provider = 'google' AND subject = $1", [
     identity.subject,
    ])
   ).rows[0]?.account_id as string | undefined;

   if (!accId) {
    const existingByEmail = (
     await c.query('SELECT id, email_verified_at FROM accounts WHERE lower(email) = $1 FOR UPDATE', [allowedEmail])
    ).rows[0];

    if (existingByEmail) {
     accId = existingByEmail.id as string;
     if (!existingByEmail.email_verified_at) {
      await c.query('DELETE FROM account_credentials WHERE account_id = $1', [accId]);
      await c.query(
       "UPDATE sessions SET last_seen = now() - interval '25 hours', account_id = NULL WHERE account_id = $1 AND id <> $2",
       [accId, s.id],
      );
     }
     await c.query('UPDATE accounts SET email = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [
      accId,
      allowedEmail,
     ]);
     await c.query(
      "INSERT INTO auth_identities(provider, subject, account_id) VALUES('google', $1, $2) ON CONFLICT DO NOTHING",
      [identity.subject, accId],
     );
    }
   } else {
    await c.query('UPDATE accounts SET email = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [
     accId,
     allowedEmail,
    ]);
   }

   if (!accId) {
    accId = randomUUID();
    const userId = randomUUID();
    await c.query('INSERT INTO users(id, display_name) VALUES($1, $2)', [userId, identity.name || 'Quản trị viên']);
    await c.query('INSERT INTO accounts(id, user_id, email, email_verified_at) VALUES($1, $2, $3, now())', [
     accId,
     userId,
     allowedEmail,
    ]);
    await c.query("INSERT INTO auth_identities(provider, subject, account_id) VALUES('google', $1, $2)", [
     identity.subject,
     accId,
    ]);
    await c.query('INSERT INTO account_preferences(account_id) VALUES($1) ON CONFLICT DO NOTHING', [accId]);
   }

   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'admin-google-login', $2, $3)", [
    allowedEmail,
    accId,
    JSON.stringify({ ip: sha256(ip).slice(0, 12) }),
   ]);
   return accId;
  });

  await this.deps.rotateSessionToAccount(s.id, accountId, res, 'google');
  return {
   ok: true,
   admin: {
    id: accountId,
    email: allowedEmail,
    displayName: identity.name,
   },
  };
 }

 /**
  * Public lightweight website visit tracker (called on page load of public pages)
  */
 async recordWebsiteVisit(req: Request) {
  const ua = String(req.headers['user-agent'] || '');
  if (/(bot|crawl|spider|slurp|curl|wget|headless|lighthouse|python-requests)/i.test(ua)) {
   return { ok: true, skipped: true };
  }

  const ip = this.deps.clientIp(req);
  try {
   this.deps.readRate('site-visit-pv:' + ip, 30, 60);
  } catch {
   return { ok: true, throttled: true };
  }

  const b = z
   .object({
    path: z.string().trim().max(200).optional(),
   })
   .passthrough()
   .parse(req.body || {});

  const day = currentVietnamDate();
  const visitorHash = sha256(`${day}:${ip}:${ua.slice(0, 160)}`);
  const cleanPath = (b.path || '/').slice(0, 120);

  await pool.query(
   `WITH ins_unique AS (
     INSERT INTO site_daily_uniques(day, visitor_hash, first_path, last_seen)
     VALUES ($1::date, $2, $3, now())
     ON CONFLICT (day, visitor_hash) DO UPDATE SET last_seen = now()
     RETURNING (xmax = 0) AS is_new
    ),
    upd_daily AS (
     INSERT INTO site_daily_visits(day, pageviews, unique_visitors, updated_at)
     SELECT $1::date, 1, CASE WHEN is_new THEN 1 ELSE 0 END, now()
     FROM ins_unique
     ON CONFLICT (day) DO UPDATE SET
      pageviews = site_daily_visits.pageviews + 1,
      unique_visitors = site_daily_visits.unique_visitors + EXCLUDED.unique_visitors,
      updated_at = now()
    )
    UPDATE site_visit_totals
    SET total_pageviews = total_pageviews + 1,
        total_unique_visitors = total_unique_visitors + (SELECT CASE WHEN is_new THEN 1 ELSE 0 END FROM ins_unique),
        updated_at = now()
    WHERE id = 1`,
   [day, visitorHash, cleanPath],
  );

  if (Math.random() < 0.01) {
   pool.query("DELETE FROM site_daily_uniques WHERE last_seen < now() - interval '35 days'").catch(() => {});
  }

  return { ok: true };
 }

 async overview(s: AdminSessionRow) {
  await this.requireGoogleAdmin(s);
  const today = currentVietnamDate();

  const [
   totalsRes,
   onlineRes,
   windowsRes,
   dailyRes,
   placeVisitsRes,
   restSummaryRes,
   cityBreakdownRes,
   sysCountsRes,
   lifecycleRes,
  ] = await Promise.all([
   readPool.query('SELECT * FROM site_visit_totals WHERE id = 1'),
   readPool.query("SELECT count(*)::int AS c FROM site_daily_uniques WHERE last_seen >= now() - interval '5 minutes'"),
   readPool.query(
    `SELECT
      COALESCE(SUM(pageviews) FILTER (WHERE day = $1::date), 0)::bigint AS today_pv,
      COALESCE(SUM(unique_visitors) FILTER (WHERE day = $1::date), 0)::bigint AS today_uv,
      COALESCE(SUM(pageviews) FILTER (WHERE day >= ($1::date - 6)), 0)::bigint AS d7_pv,
      COALESCE(SUM(unique_visitors) FILTER (WHERE day >= ($1::date - 6)), 0)::bigint AS d7_uv,
      COALESCE(SUM(pageviews) FILTER (WHERE day >= ($1::date - 29)), 0)::bigint AS d30_pv,
      COALESCE(SUM(unique_visitors) FILTER (WHERE day >= ($1::date - 29)), 0)::bigint AS d30_uv
     FROM site_daily_visits`,
    [today],
   ),
   readPool.query(
    `SELECT day::text AS day, pageviews::bigint AS pageviews, unique_visitors::bigint AS unique_visitors
     FROM site_daily_visits
     ORDER BY day DESC
     LIMIT 14`,
   ),
   readPool.query('SELECT count(*)::bigint AS c FROM visits'),
   readPool.query(
    `SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE active)::int AS active,
      count(*) FILTER (WHERE NOT active OR deleted_at IS NOT NULL)::int AS deleted,
      count(*) FILTER (WHERE demo)::int AS demo,
      count(*) FILTER (WHERE verification_status = 'verified' AND active)::int AS verified,
      count(*) FILTER (WHERE image_url IS NOT NULL AND active)::int AS with_images,
      count(*) FILTER (WHERE lat IS NOT NULL AND active)::int AS with_coords
     FROM restaurants`,
   ),
   readPool.query(
    `SELECT city_slug,
            count(*)::int AS total,
            count(*) FILTER (WHERE active)::int AS active,
            count(*) FILTER (WHERE NOT active)::int AS deleted
     FROM restaurants
     GROUP BY city_slug
     ORDER BY total DESC`,
   ),
   readPool.query(
    `SELECT
      (SELECT count(*)::int FROM favorites) AS favorites,
      (SELECT count(*)::int FROM accounts) AS accounts,
      (SELECT count(*)::int FROM subscriptions WHERE expires_at > now()) AS pro_accounts,
      (SELECT count(*)::int FROM reviews WHERE status = 'pending') AS pending_reviews,
      (SELECT count(*)::int FROM reports WHERE status = 'open') AS open_reports`,
   ),
   readPool.query(
    `SELECT id, restaurant_id, restaurant_name, city_slug, event_type, actor_email, changed_fields, occurred_at
     FROM restaurant_lifecycle_events
     ORDER BY occurred_at DESC
     LIMIT 15`,
   ),
  ]);

  const tot = totalsRes.rows[0] || { total_pageviews: 0, total_unique_visitors: 0, manual_offset_pageviews: 0 };
  const win = windowsRes.rows[0] || {};
  const rs = restSummaryRes.rows[0] || {};
  const sc = sysCountsRes.rows[0] || {};

  const rawPv = Number(tot.total_pageviews || 0);
  const offsetPv = Number(tot.manual_offset_pageviews || 0);

  return {
   analytics: {
    totalPageviews: Math.max(0, rawPv + offsetPv),
    rawPageviews: rawPv,
    manualOffsetPageviews: offsetPv,
    totalUniqueVisitors: Number(tot.total_unique_visitors || 0),
    onlineNow: Number(onlineRes.rows[0]?.c || 0),
    todayPageviews: Number(win.today_pv || 0),
    todayUniqueVisitors: Number(win.today_uv || 0),
    last7dPageviews: Number(win.d7_pv || 0),
    last7dUniqueVisitors: Number(win.d7_uv || 0),
    last30dPageviews: Number(win.d30_pv || 0),
    last30dUniqueVisitors: Number(win.d30_uv || 0),
    totalDirectionsClicks: Number(placeVisitsRes.rows[0]?.c || 0),
    dailySeries: dailyRes.rows
     .map((d) => ({
      day: d.day as string,
      pageviews: Number(d.pageviews),
      uniqueVisitors: Number(d.unique_visitors),
     }))
     .reverse(),
   },
   counts: {
    totalRestaurants: Number(rs.total || 0),
    activeRestaurants: Number(rs.active || 0),
    deletedRestaurants: Number(rs.deleted || 0),
    demoRestaurants: Number(rs.demo || 0),
    verifiedRestaurants: Number(rs.verified || 0),
    withImages: Number(rs.with_images || 0),
    withCoordinates: Number(rs.with_coords || 0),
    totalFavorites: Number(sc.favorites || 0),
    totalAccounts: Number(sc.accounts || 0),
    proAccounts: Number(sc.pro_accounts || 0),
    pendingReviews: Number(sc.pending_reviews || 0),
    openReports: Number(sc.open_reports || 0),
   },
   cities: cityBreakdownRes.rows,
   recentLifecycle: lifecycleRes.rows,
   meta: {
    cities: VALID_CITY_SLUGS,
    foodGroups: allFoodGroups,
    dishTags: defaultDishTags,
    licenses: DATA_LICENSES,
    badges: POPULARITY_BADGES,
    verificationStatuses: VERIFICATION_STATUSES,
   },
  };
 }

 async adjustAnalytics(s: AdminSessionRow, body: unknown) {
  const admin = await this.requireGoogleAdmin(s);
  const b = z
   .object({
    manualOffsetPageviews: z.number().int().min(-10_000_000).max(100_000_000),
   })
   .strict()
   .parse(body);

  await transaction(async (c) => {
   await c.query(
    'UPDATE site_visit_totals SET manual_offset_pageviews = $1, updated_at = now() WHERE id = 1',
    [b.manualOffsetPageviews],
   );
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'analytics-offset-update', 'site_visit_totals', $2)", [
    admin.email,
    JSON.stringify(b),
   ]);
  });
  return { ok: true };
 }

 async listRestaurants(s: AdminSessionRow, rawQuery: Record<string, unknown>) {
  await this.requireGoogleAdmin(s);

  const q = typeof rawQuery.q === 'string' ? rawQuery.q.trim().slice(0, 160) : '';
  const city = typeof rawQuery.city === 'string' && (VALID_CITY_SLUGS as readonly string[]).includes(rawQuery.city) ? rawQuery.city : '';
  const group = typeof rawQuery.group === 'string' ? rawQuery.group.trim().slice(0, 80) : '';
  const status = typeof rawQuery.status === 'string' ? rawQuery.status : 'all';
  const hasImage = typeof rawQuery.hasImage === 'string' ? rawQuery.hasImage : 'all';
  const hasCoords = typeof rawQuery.hasCoords === 'string' ? rawQuery.hasCoords : 'all';
  const badge = typeof rawQuery.badge === 'string' ? rawQuery.badge : 'all';
  const sort = typeof rawQuery.sort === 'string' ? rawQuery.sort : 'updated_desc';
  const limit = Math.min(100, Math.max(1, Number(rawQuery.limit || 20)));
  const offset = Math.max(0, Number(rawQuery.offset || 0));

  const clauses: string[] = [];
  const args: any[] = [];

  if (q) {
   if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
    args.push(q);
    clauses.push(`r.id = $${args.length}::uuid`);
   } else if (/^\d{4,15}$/.test(q)) {
    args.push(Number(q), '%' + escapeLike(q) + '%');
    clauses.push(`(r.foody_id = $${args.length - 1} OR r.search_text LIKE $${args.length} ESCAPE '\\')`);
   } else {
    const terms = searchTerms(q);
    if (terms.length > 1) {
     args.push(terms.join(' '));
     clauses.push(`r.search_tokens @@ plainto_tsquery('simple', $${args.length})`);
    } else if (terms.length === 1) {
     args.push('%' + escapeLike(terms[0]) + '%');
     clauses.push(`r.search_text LIKE $${args.length} ESCAPE '\\'`);
    }
   }
  }

  if (city) {
   args.push(city);
   clauses.push(`r.city_slug = $${args.length}`);
  }
  if (group) {
   args.push(group);
   clauses.push(`(r.primary_group = $${args.length} OR $${args.length} = ANY(r.food_groups))`);
  }
  if (status === 'active') clauses.push('r.active = true AND NOT r.demo');
  else if (status === 'deleted') clauses.push('r.active = false');
  else if (status === 'demo') clauses.push('r.demo = true');
  else if (status === 'verified') clauses.push("r.verification_status = 'verified'");
  else if (status === 'unverified') clauses.push("r.verification_status <> 'verified'");

  if (hasImage === 'yes') clauses.push('r.image_url IS NOT NULL');
  else if (hasImage === 'no') clauses.push('r.image_url IS NULL');

  if (hasCoords === 'yes') clauses.push('r.lat IS NOT NULL');
  else if (hasCoords === 'no') clauses.push('r.lat IS NULL');

  if (badge === 'none') clauses.push('r.popularity_badge IS NULL');
  else if ((POPULARITY_BADGES as readonly string[]).includes(badge)) {
   args.push(badge);
   clauses.push(`r.popularity_badge = $${args.length}`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  let orderSql = 'r.updated_at DESC, r.id';
  if (sort === 'created_desc') orderSql = 'r.created_at DESC, r.id';
  else if (sort === 'deleted_desc') orderSql = 'r.deleted_at DESC NULLS LAST, r.updated_at DESC, r.id';
  else if (sort === 'saves_desc') orderSql = 'r.popularity_saves DESC, r.popularity_score DESC, r.id';
  else if (sort === 'score_desc') orderSql = 'r.popularity_score DESC, r.popularity_saves DESC, r.id';
  else if (sort === 'name_asc') orderSql = 'r.name ASC, r.id';

  const countArgs = [...args];
  args.push(limit, offset);

  const [countRes, rowsRes] = await Promise.all([
   readPool.query(`SELECT count(*)::int AS total FROM restaurants r ${whereSql}`, countArgs),
   readPool.query(
    `SELECT ${FULL_RESTAURANT_SELECT},
            (SELECT count(*)::int FROM favorites f WHERE f.restaurant_id = r.id) AS live_favorites_count,
            (SELECT count(*)::int FROM visits v WHERE v.restaurant_id = r.id) AS live_visits_count,
            (SELECT count(*)::int FROM place_notes n WHERE n.restaurant_id = r.id) AS live_notes_count,
            (SELECT count(*)::int FROM reports rp WHERE rp.restaurant_id = r.id AND rp.status = 'open') AS open_reports_count
     FROM restaurants r
     ${whereSql}
     ORDER BY ${orderSql}
     LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
   ),
  ]);

  return {
   items: rowsRes.rows,
   total: Number(countRes.rows[0]?.total || 0),
   limit,
   offset,
  };
 }

 async getRestaurant(s: AdminSessionRow, id: string) {
  await this.requireGoogleAdmin(s);
  uuid.parse(id);

  const [restRes, lifeRes, revRes, repRes, impRes] = await Promise.all([
   readPool.query(
    `SELECT ${FULL_RESTAURANT_SELECT},
            (SELECT count(*)::int FROM favorites f WHERE f.restaurant_id = r.id) AS live_favorites_count,
            (SELECT count(*)::int FROM visits v WHERE v.restaurant_id = r.id) AS live_visits_count,
            (SELECT count(*)::int FROM place_notes n WHERE n.restaurant_id = r.id) AS live_notes_count,
            (SELECT count(*)::int FROM reports rp WHERE rp.restaurant_id = r.id AND rp.status = 'open') AS open_reports_count
     FROM restaurants r
     WHERE r.id = $1`,
    [id],
   ),
   readPool.query(
    `SELECT id, event_type, actor_email, changed_fields, before_snapshot, after_snapshot, occurred_at
     FROM restaurant_lifecycle_events
     WHERE restaurant_id = $1
     ORDER BY occurred_at DESC
     LIMIT 30`,
    [id],
   ),
   readPool.query(
    `SELECT rv.*, u.display_name AS author_name, a.email AS author_email
     FROM reviews rv
     JOIN accounts a ON a.id = rv.account_id
     JOIN users u ON u.id = a.user_id
     WHERE rv.restaurant_id = $1
     ORDER BY rv.updated_at DESC
     LIMIT 50`,
    [id],
   ),
   readPool.query(
    'SELECT * FROM reports WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 50',
    [id],
   ),
   readPool.query(
    'SELECT foody_id, classification, classification_source, coordinate_status, imported_at FROM foody_import_records WHERE restaurant_id = $1 LIMIT 5',
    [id],
   ),
  ]);

  if (!restRes.rows[0]) fail('Không tìm thấy bản ghi quán ăn.', 404);
  return {
   restaurant: restRes.rows[0],
   lifecycleEvents: lifeRes.rows,
   reviews: revRes.rows,
   reports: repRes.rows,
   importRecords: impRes.rows,
  };
 }

 async saveRestaurant(s: AdminSessionRow, id: string | null, rawBody: unknown) {
  const admin = await this.requireGoogleAdmin(s);
  if (id) uuid.parse(id);

  // Normalize empty image_url / external_url / branch_of strings to null before Zod parse
  const pre = typeof rawBody === 'object' && rawBody !== null ? { ...(rawBody as Record<string, any>) } : {};
  if (pre.image_url === '') pre.image_url = null;
  if (pre.external_url === '') pre.external_url = null;
  if (pre.import_record_id === '') pre.import_record_id = null;
  if (pre.branch_of === '') pre.branch_of = null;

  const b = adminRestaurantFullSchema.parse(pre);
  const targetId = id || randomUUID();

  // Keep dishes, primary_group, and food_groups cohesive
  const normalizedDishes = b.dishes.length
   ? b.dishes.map((d, idx) => (idx === 0 && b.primary_group && b.dishes.length === 1 && d.name === d.group ? { ...d, group: b.primary_group } : d))
   : b.primary_group && b.primary_group !== 'chưa phân nhóm'
     ? [{ name: b.primary_group, group: b.primary_group, tags: [], price: b.price_min ?? null, bestsellerSource: null }]
     : [];

  const mergedGroups = Array.from(
   new Set([
    ...(b.primary_group && b.primary_group !== 'chưa phân nhóm' ? [b.primary_group] : []),
    ...b.food_groups,
    ...normalizedDishes.map((d) => d.group),
   ].map((g) => g.trim()).filter(Boolean)),
  );

  const saved = await transaction(async (c) => {
   const oldRow = id
    ? (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1 FOR UPDATE`, [id])).rows[0]
    : null;
   if (id && !oldRow) fail('Không tìm thấy quán ăn để cập nhật.', 404);

   const imageChanged = !oldRow || oldRow.image_url !== b.image_url;
   const coordsChanged = !oldRow || oldRow.lat !== b.lat || oldRow.lng !== b.lng;
   const nextImageCheckedAt = b.image_url ? (imageChanged ? new Date() : oldRow?.image_checked_at || new Date()) : null;
   const nextLocCheckedAt = b.location_checked_at
    ? new Date(b.location_checked_at)
    : b.lat !== null
      ? coordsChanged
        ? new Date()
        : oldRow?.location_checked_at || new Date()
      : null;

   const nextDeletedAt = b.active ? null : oldRow?.deleted_at || new Date();

   const upsertRes = await c.query(
    `INSERT INTO restaurants (
      id, name, address, city_slug, lat, lng, location_source, location_checked_at,
      primary_group, food_groups, classification_source, dishes, hours,
      price_min, price_max, image_url, image_checked_at,
      popularity_badge, popularity_saves, popularity_reviews, popularity_rating, popularity_score,
      source, data_license, verification_status, active, demo, branch_of,
      foody_id, external_url, import_record_id, created_at, updated_at, deleted_at
     ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12::jsonb, $13::jsonb,
      $14, $15, $16, $17,
      $18, $19, $20, $21, $22,
      $23, $24, $25, $26, $27, $28,
      $29, $30, $31, now(), now(), $32
     )
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      city_slug = EXCLUDED.city_slug,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      location_source = EXCLUDED.location_source,
      location_checked_at = EXCLUDED.location_checked_at,
      primary_group = EXCLUDED.primary_group,
      food_groups = EXCLUDED.food_groups,
      classification_source = EXCLUDED.classification_source,
      dishes = EXCLUDED.dishes,
      hours = EXCLUDED.hours,
      price_min = EXCLUDED.price_min,
      price_max = EXCLUDED.price_max,
      image_url = EXCLUDED.image_url,
      image_checked_at = EXCLUDED.image_checked_at,
      popularity_badge = EXCLUDED.popularity_badge,
      popularity_saves = EXCLUDED.popularity_saves,
      popularity_reviews = EXCLUDED.popularity_reviews,
      popularity_rating = EXCLUDED.popularity_rating,
      popularity_score = EXCLUDED.popularity_score,
      source = EXCLUDED.source,
      data_license = EXCLUDED.data_license,
      verification_status = EXCLUDED.verification_status,
      active = EXCLUDED.active,
      demo = EXCLUDED.demo,
      branch_of = EXCLUDED.branch_of,
      foody_id = EXCLUDED.foody_id,
      external_url = EXCLUDED.external_url,
      import_record_id = EXCLUDED.import_record_id,
      updated_at = now(),
      deleted_at = EXCLUDED.deleted_at
     RETURNING id`,
    [
     targetId,
     b.name,
     b.address,
     b.city_slug,
     b.lat,
     b.lng,
     b.location_source,
     nextLocCheckedAt,
     b.primary_group,
     mergedGroups,
     b.classification_source,
     JSON.stringify(normalizedDishes),
     b.hours === null ? null : JSON.stringify(b.hours),
     b.price_min,
     b.price_max,
     b.image_url,
     nextImageCheckedAt,
     b.popularity_badge,
     b.popularity_saves,
     b.popularity_reviews,
     b.popularity_rating,
     b.popularity_score,
     b.source,
     b.data_license,
     b.verification_status,
     b.active,
     b.demo,
     b.branch_of,
     b.foody_id ?? null,
     b.external_url ?? null,
     b.import_record_id ?? null,
     nextDeletedAt,
    ],
   );

   // Enforce exact admin-selected primary_group & food_groups even after food_search_update trigger
   await c.query(
    'UPDATE restaurants SET primary_group = $2, food_groups = $3 WHERE id = $1',
    [upsertRes.rows[0].id, b.primary_group, mergedGroups],
   );

   const newRow = (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1`, [targetId])).rows[0];

   const changedFields: string[] = [];
   if (oldRow) {
    for (const key of TRACKED_RESTAURANT_FIELDS) {
     if (JSON.stringify(oldRow[key]) !== JSON.stringify(newRow[key])) {
      changedFields.push(key);
     }
    }
   }

   const eventType = !oldRow
    ? 'created'
    : oldRow.active && !newRow.active
      ? 'deleted'
      : !oldRow.active && newRow.active
        ? 'restored'
        : 'updated';

   await c.query(
    `INSERT INTO restaurant_lifecycle_events (
      restaurant_id, restaurant_name, city_slug, event_type, actor_email, changed_fields, before_snapshot, after_snapshot, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
     targetId,
     newRow.name,
     newRow.city_slug,
     eventType,
     admin.email,
     changedFields,
     oldRow ? JSON.stringify(oldRow) : null,
     JSON.stringify(newRow),
    ],
   );

   await c.query('INSERT INTO audit(actor, action, target, detail) VALUES($1, $2, $3, $4)', [
    admin.email,
    `cms-restaurant-${eventType}`,
    targetId,
    JSON.stringify({ name: newRow.name, changedFields }),
   ]);

   return newRow;
  });

  invalidateCatalogueCache();
  return { ok: true, restaurant: saved };
 }

 async deleteRestaurant(s: AdminSessionRow, id: string, permanent = false) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);

  if (permanent) {
   await transaction(async (c) => {
    const oldRow = (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1 FOR UPDATE`, [id])).rows[0];
    if (!oldRow) fail('Không tìm thấy quán ăn.', 404);

    await c.query('UPDATE sessions SET pending_restaurant = NULL, pending_at = NULL WHERE pending_restaurant = $1', [id]);
    await c.query('UPDATE restaurants SET branch_of = NULL WHERE branch_of = $1', [id]);
    await c.query('DELETE FROM favorites WHERE restaurant_id = $1', [id]);
    await c.query('DELETE FROM visits WHERE restaurant_id = $1', [id]);
    await c.query('DELETE FROM reports WHERE restaurant_id = $1', [id]);
    await c.query('DELETE FROM reviews WHERE restaurant_id = $1', [id]);
    await c.query('DELETE FROM foody_import_records WHERE restaurant_id = $1', [id]);
    await c.query('DELETE FROM restaurants WHERE id = $1', [id]);

    const snapshotWithDeletedAt = { ...oldRow, active: false, deleted_at: new Date().toISOString() };
    await c.query(
     `INSERT INTO restaurant_lifecycle_events (
       restaurant_id, restaurant_name, city_slug, event_type, actor_email, changed_fields, before_snapshot, after_snapshot, occurred_at
      ) VALUES ($1, $2, $3, 'hard_deleted', $4, $5, $6, NULL, now())`,
     [id, oldRow.name, oldRow.city_slug, admin.email, ['hard_deleted'], JSON.stringify(snapshotWithDeletedAt)],
    );
    await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-restaurant-hard-delete', $2, $3)", [
     admin.email,
     id,
     JSON.stringify({ name: oldRow.name }),
    ]);
   });

   this.deps.clearPriorCache();
   invalidateCatalogueCache();
   return { ok: true, hardDeleted: true, id };
  }

  const updated = await transaction(async (c) => {
   const oldRow = (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1 FOR UPDATE`, [id])).rows[0];
   if (!oldRow) fail('Không tìm thấy quán ăn.', 404);

   await c.query('UPDATE restaurants SET active = false, deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
   const newRow = (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1`, [id])).rows[0];

   await c.query(
    `INSERT INTO restaurant_lifecycle_events (
      restaurant_id, restaurant_name, city_slug, event_type, actor_email, changed_fields, before_snapshot, after_snapshot, occurred_at
     ) VALUES ($1, $2, $3, 'deleted', $4, $5, $6, $7, now())`,
    [id, newRow.name, newRow.city_slug, admin.email, ['active', 'deleted_at'], JSON.stringify(oldRow), JSON.stringify(newRow)],
   );
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-restaurant-delete', $2, $3)", [
    admin.email,
    id,
    JSON.stringify({ name: newRow.name }),
   ]);
   return newRow;
  });

  invalidateCatalogueCache();
  return { ok: true, restaurant: updated };
 }

 async restoreRestaurant(s: AdminSessionRow, id: string) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);

  const updated = await transaction(async (c) => {
   const oldRow = (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1 FOR UPDATE`, [id])).rows[0];
   if (!oldRow) fail('Không tìm thấy quán ăn.', 404);

   await c.query('UPDATE restaurants SET active = true, deleted_at = NULL, updated_at = now() WHERE id = $1', [id]);
   const newRow = (await c.query(`SELECT ${FULL_RESTAURANT_SELECT} FROM restaurants r WHERE r.id = $1`, [id])).rows[0];

   await c.query(
    `INSERT INTO restaurant_lifecycle_events (
      restaurant_id, restaurant_name, city_slug, event_type, actor_email, changed_fields, before_snapshot, after_snapshot, occurred_at
     ) VALUES ($1, $2, $3, 'restored', $4, $5, $6, $7, now())`,
    [id, newRow.name, newRow.city_slug, admin.email, ['active', 'deleted_at'], JSON.stringify(oldRow), JSON.stringify(newRow)],
   );
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-restaurant-restore', $2, $3)", [
    admin.email,
    id,
    JSON.stringify({ name: newRow.name }),
   ]);
   return newRow;
  });

  invalidateCatalogueCache();
  return { ok: true, restaurant: updated };
 }

 async listLifecycle(s: AdminSessionRow, rawQuery: Record<string, unknown>) {
  await this.requireGoogleAdmin(s);
  const type = typeof rawQuery.type === 'string' ? rawQuery.type : 'all';
  const limit = Math.min(100, Math.max(1, Number(rawQuery.limit || 50)));
  const offset = Math.max(0, Number(rawQuery.offset || 0));

  const args: any[] = [];
  let whereSql = '';
  if (['created', 'updated', 'deleted', 'restored', 'hard_deleted'].includes(type)) {
   args.push(type);
   whereSql = 'WHERE event_type = $1';
  }
  const countArgs = [...args];
  args.push(limit, offset);

  const [cnt, rows] = await Promise.all([
   readPool.query(`SELECT count(*)::int AS total FROM restaurant_lifecycle_events ${whereSql}`, countArgs),
   readPool.query(
    `SELECT id, restaurant_id, restaurant_name, city_slug, event_type, actor_email, changed_fields, before_snapshot, after_snapshot, occurred_at
     FROM restaurant_lifecycle_events
     ${whereSql}
     ORDER BY occurred_at DESC
     LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
   ),
  ]);

  return { items: rows.rows, total: Number(cnt.rows[0]?.total || 0), limit, offset };
 }

 async listAccounts(s: AdminSessionRow, rawQuery: Record<string, unknown>) {
  await this.requireGoogleAdmin(s);
  const q = typeof rawQuery.q === 'string' ? rawQuery.q.trim().toLowerCase().slice(0, 120) : '';
  const limit = Math.min(100, Math.max(1, Number(rawQuery.limit || 50)));
  const offset = Math.max(0, Number(rawQuery.offset || 0));

  const args: any[] = [];
  let whereSql = '';
  if (q) {
   args.push(`%${escapeLike(q)}%`);
   whereSql = `WHERE lower(coalesce(a.email,'')) LIKE $1 ESCAPE '\\' OR lower(u.display_name) LIKE $1 ESCAPE '\\' OR coalesce(a.phone,'') LIKE $1 ESCAPE '\\'`;
  }
  const countArgs = [...args];
  args.push(limit, offset);

  const [cnt, rows] = await Promise.all([
   readPool.query(`SELECT count(*)::int AS total FROM accounts a JOIN users u ON u.id = a.user_id ${whereSql}`, countArgs),
   readPool.query(
    `SELECT a.id, u.display_name, a.email, a.email_verified_at, a.phone, a.phone_verified_at, a.created_at,
            c.username,
            COALESCE((SELECT array_agg(provider ORDER BY provider) FROM auth_identities ai WHERE ai.account_id = a.id), '{}'::text[]) AS providers,
            COALESCE(p.expires_at > now(), false) AS pro,
            p.expires_at AS pro_expires_at,
            p.source AS pro_source,
            (SELECT count(*)::int FROM favorites f WHERE f.account_id = a.id) AS favorites_count
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN account_credentials c ON c.account_id = a.id
     LEFT JOIN subscriptions p ON p.account_id = a.id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
   ),
  ]);

  return { items: rows.rows, total: Number(cnt.rows[0]?.total || 0), limit, offset };
 }

 async updateAccount(s: AdminSessionRow, id: string, rawBody: unknown) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);

  const b = z
   .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    emailVerified: z.boolean().optional(),
    grantProDays: z.number().int().min(0).max(3650).optional(),
   })
   .strict()
   .parse(rawBody);

  await transaction(async (c) => {
   const acc = (await c.query('SELECT id, user_id, email FROM accounts WHERE id = $1 FOR UPDATE', [id])).rows[0];
   if (!acc) fail('Không tìm thấy tài khoản.', 404);

   if (b.displayName !== undefined) {
    await c.query('UPDATE users SET display_name = $2 WHERE id = $1', [acc.user_id, b.displayName]);
   }
   if (b.emailVerified !== undefined) {
    await c.query(
     'UPDATE accounts SET email_verified_at = CASE WHEN $2 THEN COALESCE(email_verified_at, now()) ELSE NULL END WHERE id = $1',
     [id, b.emailVerified],
    );
   }
   if (b.grantProDays !== undefined) {
    if (b.grantProDays === 0) {
     await c.query('DELETE FROM subscriptions WHERE account_id = $1', [id]);
    } else {
     await c.query(
      `INSERT INTO subscriptions(account_id, expires_at, source)
       VALUES ($1, now() + ($2 || ' days')::interval, 'admin_grant')
       ON CONFLICT (account_id) DO UPDATE SET
        expires_at = now() + ($2 || ' days')::interval,
        source = 'admin_grant'`,
      [id, String(b.grantProDays)],
     );
    }
   }
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-account-update', $2, $3)", [
    admin.email,
    id,
    JSON.stringify(b),
   ]);
  });

  return { ok: true };
 }

 async deleteAccount(s: AdminSessionRow, id: string) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);
  if (id === admin.accountId) fail('Không thể tự xóa tài khoản quản trị đang đăng nhập.', 400);

  await transaction(async (c) => {
   const acc = (await c.query('SELECT id, user_id, email FROM accounts WHERE id = $1 FOR UPDATE', [id])).rows[0];
   if (!acc) fail('Không tìm thấy tài khoản.', 404);
   await c.query('DELETE FROM accounts WHERE id = $1', [id]);
   await c.query('DELETE FROM users WHERE id = $1', [acc.user_id]);
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-account-delete', $2, $3)", [
    admin.email,
    id,
    JSON.stringify({ email: acc.email }),
   ]);
  });
  return { ok: true };
 }

 async listReviewsAndReports(s: AdminSessionRow) {
  await this.requireGoogleAdmin(s);
  const [reviews, reports, audit] = await Promise.all([
   readPool.query(
    `SELECT rv.*, r.name AS restaurant_name, u.display_name AS author_name, a.email AS author_email
     FROM reviews rv
     LEFT JOIN restaurants r ON r.id = rv.restaurant_id
     LEFT JOIN accounts a ON a.id = rv.account_id
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY rv.updated_at DESC
     LIMIT 100`,
   ),
   readPool.query(
    `SELECT rp.*, r.name AS restaurant_name
     FROM reports rp
     LEFT JOIN restaurants r ON r.id = rp.restaurant_id
     ORDER BY rp.created_at DESC
     LIMIT 100`,
   ),
   readPool.query('SELECT * FROM audit ORDER BY id DESC LIMIT 100'),
  ]);

  return {
   reviews: reviews.rows,
   reports: reports.rows,
   audit: audit.rows,
  };
 }

 async updateReview(s: AdminSessionRow, id: string, rawBody: unknown) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);
  const b = z
   .object({
    status: z.enum(['approved', 'rejected', 'pending']).optional(),
    body: z.string().trim().min(3).max(2000).optional(),
    taste: z.number().int().min(1).max(5).optional(),
    value: z.number().int().min(1).max(5).optional(),
    service: z.number().int().min(1).max(5).optional(),
    space: z.number().int().min(1).max(5).optional(),
   })
   .strict()
   .parse(rawBody);

  await transaction(async (c) => {
   const old = (await c.query('SELECT * FROM reviews WHERE id = $1 FOR UPDATE', [id])).rows[0];
   if (!old) fail('Không tìm thấy đánh giá.', 404);
   await c.query('INSERT INTO review_history(review_id, snapshot) VALUES($1, $2)', [id, JSON.stringify(old)]);
   await c.query(
    `UPDATE reviews SET
      status = COALESCE($2, status),
      body = COALESCE($3, body),
      taste = COALESCE($4, taste),
      value = COALESCE($5, value),
      service = COALESCE($6, service),
      space = COALESCE($7, space),
      updated_at = now()
     WHERE id = $1`,
    [id, b.status ?? null, b.body ?? null, b.taste ?? null, b.value ?? null, b.service ?? null, b.space ?? null],
   );
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-review-update', $2, $3)", [
    admin.email,
    id,
    JSON.stringify(b),
   ]);
  });

  this.deps.clearPriorCache();
  invalidateCatalogueCache();
  return { ok: true };
 }

 async deleteReview(s: AdminSessionRow, id: string) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);
  await transaction(async (c) => {
   const r = await c.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);
   if (!r.rowCount) fail('Không tìm thấy đánh giá.', 404);
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'cms-review-delete', $2)", [admin.email, id]);
  });
  this.deps.clearPriorCache();
  invalidateCatalogueCache();
  return { ok: true };
 }

 async updateReport(s: AdminSessionRow, id: string, rawBody: unknown) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);
  const b = z
   .object({
    status: z.enum(['open', 'resolved']).optional(),
    body: z.string().trim().min(3).max(1000).optional(),
   })
   .strict()
   .parse(rawBody);

  await transaction(async (c) => {
   const r = await c.query(
    'UPDATE reports SET status = COALESCE($2, status), body = COALESCE($3, body) WHERE id = $1 RETURNING id',
    [id, b.status ?? null, b.body ?? null],
   );
   if (!r.rowCount) fail('Không tìm thấy báo sai.', 404);
   await c.query("INSERT INTO audit(actor, action, target, detail) VALUES($1, 'cms-report-update', $2, $3)", [
    admin.email,
    id,
    JSON.stringify(b),
   ]);
  });
  return { ok: true };
 }

 async deleteReport(s: AdminSessionRow, id: string) {
  const admin = await this.requireGoogleAdmin(s);
  uuid.parse(id);
  await transaction(async (c) => {
   const r = await c.query('DELETE FROM reports WHERE id = $1 RETURNING id', [id]);
   if (!r.rowCount) fail('Không tìm thấy báo sai.', 404);
   await c.query("INSERT INTO audit(actor, action, target) VALUES($1, 'cms-report-delete', $2)", [admin.email, id]);
  });
  return { ok: true };
 }
}
