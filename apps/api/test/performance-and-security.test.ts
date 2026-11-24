import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LruCache, MemoryRateLimiter, quantizePoint, escapeLike } from '../src/cache';
import { FoodService } from '../src/service';
import { sanitizeFoodyImageUrl } from '../src/foody-images';
import { DRINK_GROUPS, EXCLUDED_FROM_FOOD_ALL, SUGGESTION_MOODS } from '../src/catalogue';
import { describeWeatherMood } from '../src/weather';

test('LruCache evicts oldest entry, respects TTL, and deduplicates concurrent misses (single-flight)', async () => {
 const cache = new LruCache<number>(2);
 cache.set('a', 1, 5000);
 cache.set('b', 2, 5000);
 assert.equal(cache.get('a'), 1);
 cache.set('c', 3, 5000);
 assert.equal(cache.get('b'), undefined);
 assert.equal(cache.get('a'), 1);
 assert.equal(cache.get('c'), 3);

 let calls = 0;
 const work = async () => {
  calls++;
  await new Promise((r) => setTimeout(r, 15));
  return 42;
 };
 const results = await Promise.all(Array.from({ length: 20 }, () => cache.getOrCompute('sf', 5000, work)));
 assert.equal(calls, 1);
 assert.ok(results.every((v) => v === 42));
});

test('MemoryRateLimiter enforces burst limit cleanly without DB writes', () => {
 const limiter = new MemoryRateLimiter(100);
 for (let i = 0; i < 5; i++) assert.equal(limiter.check('ip:1', 5, 60).allowed, true);
 assert.equal(limiter.check('ip:1', 5, 60).allowed, false);
 assert.equal(limiter.check('ip:2', 5, 60).allowed, true);
});

test('quantizePoint groups nearby coordinates (~150m) into the same cache cell', () => {
 const p1 = quantizePoint(21.02851, 105.85421);
 const p2 = quantizePoint(21.02855, 105.85425);
 const far = quantizePoint(21.045, 105.82);
 assert.equal(p1.cell, p2.cell);
 assert.notEqual(p1.cell, far.cell);
});

test('escapeLike neutralizes SQL LIKE wildcards', () => {
 assert.equal(escapeLike('100%_phở\\'), '100\\%\\_phở\\\\');
});

test('sanitizeFoodyImageUrl allows trusted CDN HTTPS images and blocks untrusted domains', () => {
 assert.equal(
  sanitizeFoodyImageUrl('https://down-vn.img.susercontent.com/vn-11134259-7r98o-lwavdnvwzlcp0f'),
  'https://down-vn.img.susercontent.com/vn-11134259-7r98o-lwavdnvwzlcp0f@resize_ss640x400',
 );
 assert.equal(sanitizeFoodyImageUrl('http://down-vn.img.susercontent.com/abc'), null);
 assert.equal(sanitizeFoodyImageUrl('https://evil.example/a.jpg'), null);
});

test('Food and Drink suggestion moods are 100% disjoint', () => {
 const drinkSet = new Set<string>(DRINK_GROUPS);
 for (const d of DRINK_GROUPS) {
  assert.ok(EXCLUDED_FROM_FOOD_ALL.includes(d));
 }
 for (const foodMood of ['nuoc', 'kho', 'nhanh', 'tu_tap', 'an_vat', 'chay'] as const) {
  for (const g of SUGGESTION_MOODS[foodMood]) {
   assert.equal(drinkSet.has(g), false, `Food mood ${foodMood} must not contain drink group ${g}`);
  }
 }
 for (const drinkMood of ['drink_all', 'ca_phe', 'tra_sua', 'tra_ep', 'bar_bia'] as const) {
  for (const g of SUGGESTION_MOODS[drinkMood]) {
   assert.equal(drinkSet.has(g), true, `Drink mood ${drinkMood} must only contain drink groups, got ${g}`);
  }
 }
});

test('publicRestaurant exposes image_url while stripping internal search fields and third-party scraped identifiers/URLs', () => {
 const svc = new FoodService();
 const clean = svc.publicRestaurant({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Phở Bò Test',
  address: '10 Hàng Trống, Hà Nội',
  source: 'Foody.vn · dữ liệu nguồn; chưa xác minh',
  foody_id: 123456,
  external_url: 'https://www.foody.vn/ha-noi/pho-bo-test',
  image_url: 'https://down-vn.img.susercontent.com/abc@resize_ss640x400',
  image_checked_at: new Date(),
  search_text: 'pho bo test',
  search_tokens: "'pho':1",
  name_norm: 'pho bo test',
  review_count: 3,
  review_avg: 4.5,
 });
 assert.equal((clean as any).foody_id, undefined);
 assert.equal((clean as any).external_url, undefined);
 assert.equal((clean as any).image_checked_at, undefined);
 assert.equal(clean.image_url, 'https://down-vn.img.susercontent.com/abc@resize_ss640x400');
 assert.equal(clean.count, 3);
 assert.equal(clean.average, 4.5);
});

test('describeWeatherMood generates tailored Vietnamese dining vibes by weather and dish type', () => {
 const rainySoup = describeWeatherMood({ tempC: 21, apparentC: 21, humidity: 90, precipitation: 0.5, code: 61, isDay: false }, 'phở bò');
 assert.equal(rainySoup.aura, 'rain');
 assert.equal(rainySoup.tempC, 21);
 assert.match(rainySoup.vibe, /nóng/);

 const hotDrink = describeWeatherMood({ tempC: 34, apparentC: 37, humidity: 65, precipitation: 0, code: 1, isDay: true }, 'trà sữa');
 assert.equal(hotDrink.aura, 'warm');
 assert.match(hotDrink.vibe, /giải nhiệt/);
});
