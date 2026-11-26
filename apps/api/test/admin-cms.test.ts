import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { VerifiedIdentity } from '../src/auth';

let app: INestApplication;
let db: Pool;
let adminDb: Pool;
let base: string;
let dbName: string;
let serviceRef: any;
let mockGoogleTokens: Record<string, VerifiedIdentity> = {};

const origin = 'http://127.0.0.1:3100';

async function call(
 path: string,
 {
  method = 'GET',
  body,
  cookie = '',
  headers = {},
 }: { method?: string; body?: any; cookie?: string; headers?: Record<string, string> } = {},
) {
 const r = await fetch(base + '/api' + path, {
  method,
  headers: {
   Origin: origin,
   ...(method === 'GET' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
   ...(cookie ? { Cookie: cookie } : {}),
   ...headers,
  },
  body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
 });
 let data: any = null;
 try {
  data = await r.json();
 } catch {}
 return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] || cookie };
}

before(async () => {
 for (const key of ['TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY']) {
  delete process.env[key];
 }
 process.env.NODE_ENV = 'test';
 process.env.ENABLE_DEV_AUTH = 'true';
 process.env.WEB_ORIGIN = origin;
 process.env.ADMIN_GOOGLE_EMAIL = 'hnverynice@gmail.com';

 const connection = process.env.DATABASE_URL || 'postgresql://angiday:local_demo_only@127.0.0.1:55439/angiday';
 if (!['127.0.0.1', 'localhost'].includes(new URL(connection).hostname)) {
  throw Error('Test chỉ chạy trên DB local');
 }
 adminDb = new Pool({ connectionString: connection });
 dbName = 'angiday_cms_test_' + randomUUID().replace(/-/g, '');
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
 // Inject deterministic Google token verifier for offline integration testing
 (serviceRef.adminCms as any).deps.verifyGoogleToken = async (tok: string) => {
  const found = mockGoogleTokens[tok];
  if (!found) throw new Error('Invalid Google token');
  return found;
 };

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

test('Trang quản lý chỉ cho phép đăng nhập duy nhất bằng Google hnverynice@gmail.com; chặn mọi email và kênh khác', async () => {
 const guest = (await call('/session')).cookie;

 // 1. Guest cannot access overview or restaurants
 assert.equal((await call('/admin/cms/overview', { cookie: guest })).status, 401);
 assert.equal((await call('/admin/cms/restaurants', { cookie: guest })).status, 401);

 // 2. Another Google user (intruder@gmail.com) is strictly rejected (403)
 mockGoogleTokens['tok_intruder_google'] = {
  subject: 'google-sub-intruder-999',
  name: 'Intruder',
  email: 'intruder@gmail.com',
  emailVerified: true,
 };
 const deniedGoogle = await call('/admin/cms/auth/google', {
  method: 'POST',
  cookie: guest,
  body: { token: 'tok_intruder_google' },
 });
 assert.equal(deniedGoogle.status, 403);

 // 3. Unverified email claim for hnverynice@gmail.com is rejected (403)
 mockGoogleTokens['tok_unverified_admin'] = {
  subject: 'google-sub-unver',
  name: 'Unverified',
  email: 'hnverynice@gmail.com',
  emailVerified: false,
 };
 assert.equal(
  (await call('/admin/cms/auth/google', { method: 'POST', cookie: guest, body: { token: 'tok_unverified_admin' } })).status,
  403,
 );

 // 4. Password-registered account (even if someone registered password) cannot access /admin/cms/*
 const pwReg = await call('/auth/register', {
  method: 'POST',
  cookie: guest,
  body: { displayName: 'User Thường', email: 'normaluser@gmail.com', password: 'Password123!' },
 });
 assert.equal(pwReg.status, 200);
 assert.equal((await call('/admin/cms/overview', { cookie: pwReg.cookie })).status, 403);

 // 5. Verified Google login as hnverynice@gmail.com succeeds (200)
 mockGoogleTokens['tok_owner_google_valid'] = {
  subject: 'google-sub-hnverynice-001',
  name: 'Admin Tìm Quán Ngon',
  email: 'hnverynice@gmail.com',
  emailVerified: true,
 };
 const okLogin = await call('/admin/cms/auth/google', {
  method: 'POST',
  cookie: guest,
  body: { token: 'tok_owner_google_valid' },
 });
 assert.equal(okLogin.status, 200);
 assert.equal(okLogin.data.admin.email, 'hnverynice@gmail.com');

 const sess = await call('/admin/cms/session', { cookie: okLogin.cookie });
 assert.equal(sess.status, 200);
 assert.equal(sess.data.authorized, true);
});

test('Bộ đếm lượt ghé thăm website, đầy đủ 100% thông tin quán và mốc thời gian Tạo · Sửa · Xóa', async () => {
 const guest = (await call('/session')).cookie;
 mockGoogleTokens['tok_owner_2'] = {
  subject: 'google-sub-hnverynice-001',
  name: 'Admin Tìm Quán Ngon',
  email: 'hnverynice@gmail.com',
  emailVerified: true,
 };
 const adminCookie = (
  await call('/admin/cms/auth/google', { method: 'POST', cookie: guest, body: { token: 'tok_owner_2' } })
 ).cookie;

 // 1. Record website visits & verify counter in overview
 const ovBefore = (await call('/admin/cms/overview', { cookie: adminCookie })).data;
 const pvBefore = ovBefore.analytics.totalPageviews;

 await call('/analytics/visit', {
  method: 'POST',
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0' },
  body: { path: '/ha-noi' },
 });
 await call('/analytics/visit', {
  method: 'POST',
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0' },
  body: { path: '/about' },
 });

 const ovAfter = (await call('/admin/cms/overview', { cookie: adminCookie })).data;
 assert.equal(ovAfter.analytics.totalPageviews, pvBefore + 2);
 assert.ok(ovAfter.analytics.todayPageviews >= 2);
 assert.ok(ovAfter.analytics.onlineNow >= 1);

 // 2. Create a restaurant with full fields & verify created_at, updated_at, and all attributes
 const createdRes = await call('/admin/cms/restaurants', {
  method: 'POST',
  cookie: adminCookie,
  body: {
   name: 'Phở Bát Đàn Gia Truyền CMS',
   address: '49 Bát Đàn, Quận Hoàn Kiếm, Hà Nội',
   city_slug: 'ha-noi',
   lat: 21.0336,
   lng: 105.8463,
   location_source: 'manual',
   primary_group: 'phở bò',
   food_groups: ['phở bò', 'phở'],
   classification_source: 'admin_manual',
   dishes: [
    { name: 'Phở tái nạm', group: 'phở bò', tags: ['nước', 'nóng', 'sáng'], price: 60000, bestsellerSource: 'Thực đơn tại quán' },
   ],
   hours: [{ day: 1, open: 360, close: 1320 }],
   price_min: 50000,
   price_max: 80000,
   image_url: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43',
   popularity_badge: 'top_fav',
   popularity_saves: 88,
   popularity_reviews: 45,
   popularity_rating: 8.9,
   popularity_score: 91.5,
   source: 'Quản trị viên Tìm quán ngon xác minh trực tiếp',
   data_license: 'first_party',
   verification_status: 'verified',
   active: true,
   demo: false,
   branch_of: null,
   foody_id: 9998887,
   external_url: 'https://timquanngon.com/ha-noi',
   import_record_id: 'cms-manual-001',
  },
 });
 assert.equal(createdRes.status, 200);
 const restId = createdRes.data.restaurant.id;
 assert.ok(createdRes.data.restaurant.created_at);
 assert.ok(createdRes.data.restaurant.updated_at);
 assert.equal(createdRes.data.restaurant.deleted_at, null);
 assert.equal(createdRes.data.restaurant.popularity_saves, 88);
 assert.equal(createdRes.data.restaurant.primary_group, 'phở bò');

 // 3. Verify list endpoint returns 100% full fields on every single record
 const listRes = await call('/admin/cms/restaurants?q=' + encodeURIComponent(restId), { cookie: adminCookie });
 assert.equal(listRes.status, 200);
 assert.equal(listRes.data.items.length, 1);
 const fullRec = listRes.data.items[0];
 for (const key of [
  'id', 'name', 'address', 'city_slug', 'lat', 'lng', 'location_source', 'primary_group', 'food_groups',
  'classification_source', 'dishes', 'hours', 'price_min', 'price_max', 'image_url', 'popularity_badge',
  'popularity_saves', 'popularity_reviews', 'popularity_rating', 'popularity_score', 'source', 'data_license',
  'verification_status', 'active', 'demo', 'foody_id', 'external_url', 'import_record_id',
  'created_at', 'updated_at', 'deleted_at',
 ]) {
  assert.ok(key in fullRec, `Missing field ${key} on restaurant record`);
 }

 // 4. Edit restaurant & verify updated_at advances while created_at stays unchanged
 const updatedRes = await call('/admin/cms/restaurants/' + restId, {
  method: 'PUT',
  cookie: adminCookie,
  body: {
   ...fullRec,
   name: 'Phở Bát Đàn Gia Truyền (Đã cập nhật)',
   popularity_saves: 125,
  },
 });
 assert.equal(updatedRes.status, 200);
 assert.equal(updatedRes.data.restaurant.name, 'Phở Bát Đàn Gia Truyền (Đã cập nhật)');
 assert.equal(updatedRes.data.restaurant.popularity_saves, 125);
 assert.equal(updatedRes.data.restaurant.created_at, fullRec.created_at);

 // 5. Soft-delete restaurant & verify deleted_at is stamped and active becomes false
 const delRes = await call('/admin/cms/restaurants/' + restId, { method: 'DELETE', cookie: adminCookie });
 assert.equal(delRes.status, 200);
 assert.equal(delRes.data.restaurant.active, false);
 assert.ok(delRes.data.restaurant.deleted_at);

 // 6. Restore restaurant & verify deleted_at is cleared back to null
 const restRes = await call(`/admin/cms/restaurants/${restId}/restore`, { method: 'POST', cookie: adminCookie });
 assert.equal(restRes.status, 200);
 assert.equal(restRes.data.restaurant.active, true);
 assert.equal(restRes.data.restaurant.deleted_at, null);

 // 7. Hard-delete restaurant & verify lifecycle timeline preserves created, updated, deleted, restored & hard_deleted timestamps
 const hardDel = await call(`/admin/cms/restaurants/${restId}?permanent=true`, { method: 'DELETE', cookie: adminCookie });
 assert.equal(hardDel.status, 200);

 const lifeRes = await call('/admin/cms/lifecycle', { cookie: adminCookie });
 assert.equal(lifeRes.status, 200);
 const types = lifeRes.data.items.filter((e: any) => e.restaurant_id === restId).map((e: any) => e.event_type);
 for (const expected of ['created', 'updated', 'deleted', 'restored', 'hard_deleted']) {
  assert.ok(types.includes(expected), `Expected lifecycle event ${expected}`);
 }

 // 8. Verify visiting-city priority: records in the accessing city (via GPS or Cloudflare IP geo) appear BEFORE newer records in other cities
 const hanoiRes = await call('/admin/cms/restaurants', {
  method: 'POST',
  cookie: adminCookie,
  body: {
   name: 'Bún Chả Hàng Mành Ưu Tiên HN',
   address: '1 Hàng Mành, Hoàn Kiếm, Hà Nội',
   city_slug: 'ha-noi',
   lat: 21.031,
   lng: 105.848,
   primary_group: 'bún chả',
   source: 'Test ưu tiên thành phố',
  },
 });
 assert.equal(hanoiRes.status, 200);

 const danangRes = await call('/admin/cms/restaurants', {
  method: 'POST',
  cookie: adminCookie,
  body: {
   name: 'Mì Quảng 1A Ưu Tiên ĐN',
   address: '1A Hải Phòng, Hải Châu, Đà Nẵng',
   city_slug: 'da-nang',
   lat: 16.071,
   lng: 108.22,
   primary_group: 'mì quảng & cao lầu',
   source: 'Test ưu tiên thành phố',
  },
 });
 assert.equal(danangRes.status, 200);

 // Even though Đà Nẵng was created AFTER Hà Nội, accessing from Hà Nội GPS puts Hà Nội first!
 const fromHanoiGps = await call('/admin/cms/restaurants?lat=21.0285&lng=105.8542', { cookie: adminCookie });
 assert.equal(fromHanoiGps.status, 200);
 assert.equal(fromHanoiGps.data.preferredCity, 'ha-noi');
 assert.equal(fromHanoiGps.data.items[0].city_slug, 'ha-noi');

 // Accessing with Cloudflare Da Nang IP header puts Đà Nẵng first!
 const fromDanangIp = await call('/admin/cms/restaurants', {
  cookie: adminCookie,
  headers: { 'cf-ipcity': 'Da Nang' },
 });
 assert.equal(fromDanangIp.status, 200);
 assert.equal(fromDanangIp.data.preferredCity, 'da-nang');
 assert.equal(fromDanangIp.data.items[0].city_slug, 'da-nang');
});
