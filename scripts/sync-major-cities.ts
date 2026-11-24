import { createHash } from 'node:crypto';
import { pool, transaction } from '../apps/api/src/db';
import { classifyFood } from '../apps/api/src/food-classifier';
import { sanitizeFoodyImageUrl } from '../apps/api/src/foody-images';

type CityTarget = {
 slug: string;
 name: string;
 floc: number;
 latMin: number;
 latMax: number;
 lngMin: number;
 lngMax: number;
 points: { lat: number; lon: number }[];
 categories: string[];
 maxPages: number;
};

const CITIES: CityTarget[] = [
 {
  slug: 'ho-chi-minh',
  name: 'TP. Hồ Chí Minh',
  floc: 217,
  latMin: 10.35,
  latMax: 11.2,
  lngMin: 106.35,
  lngMax: 107.05,
  points: [
   { lat: 10.7769, lon: 106.7009 }, // Q1
   { lat: 10.7845, lon: 106.6845 }, // Q3
   { lat: 10.7540, lon: 106.6634 }, // Q5
   { lat: 10.7992, lon: 106.7091 }, // Bình Thạnh / Phú Nhuận
   { lat: 10.7324, lon: 106.7215 }, // Q7
   { lat: 10.8006, lon: 106.7418 }, // Thảo Điền / Thủ Đức
  ],
  categories: ['', '3', '2', '1', '11', '4', '54', '56', '6'],
  maxPages: 3,
 },
 {
  slug: 'da-nang',
  name: 'Đà Nẵng',
  floc: 219,
  latMin: 15.9,
  latMax: 16.25,
  lngMin: 107.95,
  lngMax: 108.35,
  points: [
   { lat: 16.0678, lon: 108.2208 }, // Hải Châu
   { lat: 16.0610, lon: 108.2425 }, // Sơn Trà / Mỹ Khê
  ],
  categories: ['', '3', '2', '1', '11', '4', '56'],
  maxPages: 2,
 },
 {
  slug: 'hai-phong',
  name: 'Hải Phòng',
  floc: 220,
  latMin: 20.65,
  latMax: 21.05,
  lngMin: 106.5,
  lngMax: 107.1,
  points: [{ lat: 20.8449, lon: 106.6881 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
 {
  slug: 'can-tho',
  name: 'Cần Thơ',
  floc: 221,
  latMin: 9.9,
  latMax: 10.25,
  lngMin: 105.5,
  lngMax: 105.9,
  points: [{ lat: 10.0341, lon: 105.7875 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
 {
  slug: 'nha-trang',
  name: 'Nha Trang',
  floc: 248,
  latMin: 11.8,
  latMax: 12.6,
  lngMin: 108.9,
  lngMax: 109.4,
  points: [{ lat: 12.2388, lon: 109.1967 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
 {
  slug: 'da-lat',
  name: 'Đà Lạt',
  floc: 254,
  latMin: 11.5,
  latMax: 12.2,
  lngMin: 108.2,
  lngMax: 108.7,
  points: [{ lat: 11.9404, lon: 108.4583 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
 {
  slug: 'hue',
  name: 'Huế',
  floc: 273,
  latMin: 16.25,
  latMax: 16.65,
  lngMin: 107.4,
  lngMax: 107.8,
  points: [{ lat: 16.4637, lon: 107.5909 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
 {
  slug: 'vung-tau',
  name: 'Vũng Tàu',
  floc: 223,
  latMin: 10.3,
  latMax: 10.65,
  lngMin: 107.0,
  lngMax: 107.35,
  points: [{ lat: 10.3460, lon: 107.0843 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
 {
  slug: 'ha-long',
  name: 'Hạ Long',
  floc: 265,
  latMin: 20.85,
  latMax: 21.25,
  lngMin: 106.9,
  lngMax: 107.4,
  points: [{ lat: 20.9517, lon: 107.0748 }],
  categories: ['', '3', '2', '1', '11', '4'],
  maxPages: 2,
 },
];

const uid = (n: number) => {
 const h = createHash('sha256').update('foody.vn:' + n).digest('hex');
 return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function computeBadge(rating: number | null, reviews: number, saves: number, pics: number): string | null {
 const r = rating || 0;
 if ((r >= 7.2 && reviews >= 40) || saves >= 40 || reviews >= 120) return 'top_fav';
 if ((r >= 6.8 && reviews >= 12) || saves >= 10) return 'popular';
 if (r >= 7.2 && reviews >= 3) return 'good_rating';
 if (reviews >= 3 || pics >= 10 || saves >= 3) return 'worth_try';
 return null;
}

function computeScore(rating: number | null, reviews: number, saves: number, pics: number): number {
 return Math.min(
  100,
  (rating || 0) * 6 +
   Math.log(1 + Math.max(0, reviews)) * 7 +
   Math.log(1 + Math.max(0, saves)) * 8 +
   Math.log(1 + Math.max(0, pics)) * 2,
 );
}

async function fetchCityPage(floc: number, lat: number, lon: number, cateId: string, type: string, page: number) {
 const u = new URL('https://www.foody.vn/__get/Place/HomeListPlace');
 u.searchParams.set('lat', String(lat));
 u.searchParams.set('lon', String(lon));
 u.searchParams.set('count', '300');
 u.searchParams.set('page', String(page));
 u.searchParams.set('cateId', cateId);
 u.searchParams.set('type', type);
 u.searchParams.set('t', String(Date.now()));

 try {
  const res = await fetch(u, {
   headers: {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://www.foody.vn/',
    'Cookie': `flg=vn; floc=${floc}; gcat=food`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
   },
   signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return [];
  const txt = (await res.text()).replace(/^\uFEFF/, '').trim();
  if (!txt.startsWith('{')) return [];
  const data = JSON.parse(txt);
  if (data.CityId !== floc || !Array.isArray(data.Items)) return [];
  return data.Items;
 } catch {
  return [];
 }
}

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
 const results: T[] = new Array(tasks.length);
 let idx = 0;
 await Promise.all(
  Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
   while (idx < tasks.length) {
    const i = idx++;
    results[i] = await tasks[i]();
   }
  }),
 );
 return results;
}

async function syncCity(city: CityTarget) {
 const tasks: (() => Promise<any[]>)[] = [];

 // Type 1 (Newest/Active with TotalSaves) across categories & pages
 for (const cat of city.categories) {
  for (let p = 1; p <= city.maxPages; p++) {
   tasks.push(() => fetchCityPage(city.floc, city.points[0].lat, city.points[0].lon, cat, '1', p));
  }
 }

 // Type 3 (Proximity around major district hubs)
 for (const pt of city.points) {
  for (const cat of ['', '2', '3']) {
   tasks.push(() => fetchCityPage(city.floc, pt.lat, pt.lon, cat, '3', 1));
  }
 }

 const batches = await runPool(tasks, 6);
 const byId = new Map<number, any>();
 for (const list of batches) {
  for (const item of list) {
   if (Number.isSafeInteger(item.Id) && item.Id > 0 && item.Name?.trim() && item.Address?.trim()) {
    const prev = byId.get(item.Id);
    if (!prev || (item.TotalSaves || 0) >= (prev.TotalSaves || 0)) {
     byId.set(item.Id, item);
    }
   }
  }
 }

 const rows = [...byId.values()].map((x) => {
  const catIds = [Number(x.MainCategoryId)].filter((n) => n > 0);
  const cls = classifyFood(x.Name, catIds);
  const validCoord =
   Number.isFinite(x.Latitude) &&
   Number.isFinite(x.Longitude) &&
   x.Latitude !== 0 &&
   x.Longitude !== 0 &&
   x.Latitude >= city.latMin &&
   x.Latitude <= city.latMax &&
   x.Longitude >= city.lngMin &&
   x.Longitude <= city.lngMax;

  const saves = Math.max(0, Number(x.TotalSaves || x.TotalFavourites || 0));
  const reviews = Math.max(0, Number(x.TotalReviews || 0));
  const pics = Math.max(0, Number(x.TotalPictures || 0));
  const rating = Number(x.AvgRating) > 0 ? Number(x.AvgRating) : null;
  const imageUrl = sanitizeFoodyImageUrl(x.PhotoUrl);
  const extUrl = typeof x.Url === 'string' && x.Url.startsWith('/') ? 'https://www.foody.vn' + x.Url : null;

  return {
   id: uid(x.Id),
   foody_id: x.Id,
   city_slug: city.slug,
   name: x.Name.trim().replace(/\s+/g, ' '),
   address: x.Address.trim().replace(/\s+/g, ' '),
   lat: validCoord ? x.Latitude : null,
   lng: validCoord ? x.Longitude : null,
   dishes: cls.groups.map((g) => ({ name: g, group: g, tags: [], price: null, bestsellerSource: null })),
   source: `Danh mục ${city.name} · chưa xác minh thực đơn & hoạt động`,
   external_url: extUrl,
   classification_source: cls.source,
   groups: cls.groups,
   coordinate_status: validCoord ? 'source_coordinates' : 'missing_or_outside_box',
   image_url: imageUrl,
   popularity_saves: saves,
   popularity_reviews: reviews,
   popularity_rating: rating,
   popularity_score: computeScore(rating, reviews, saves, pics),
   popularity_badge: computeBadge(rating, reviews, saves, pics),
   payload: x,
  };
 });

 let upserted = 0;
 await transaction(async (c) => {
  await c.query('SET LOCAL statement_timeout = 0');
  await c.query(
   `CREATE TEMP TABLE incoming_city(
     id uuid, foody_id bigint, city_slug text, name text, address text,
     lat float8, lng float8, dishes jsonb, source text, external_url text,
     classification_source text, groups text[], coordinate_status text,
     image_url text, popularity_saves int, popularity_reviews int,
     popularity_rating float8, popularity_score float8, popularity_badge text,
     payload jsonb
    ) ON COMMIT DROP`,
  );

  for (let i = 0; i < rows.length; i += 500) {
   await c.query(
    'INSERT INTO incoming_city SELECT * FROM jsonb_populate_recordset(NULL::incoming_city, $1::jsonb)',
    [JSON.stringify(rows.slice(i, i + 500))],
   );
  }

  const ins = await c.query(
   `INSERT INTO restaurants(
     id, name, address, lat, lng, dishes, hours, price_min, price_max,
     source, demo, active, foody_id, external_url, classification_source,
     location_source, location_checked_at, verification_status,
     city_slug, image_url, image_checked_at,
     popularity_saves, popularity_reviews, popularity_rating, popularity_score, popularity_badge
    )
    SELECT
     i.id, i.name, i.address, i.lat, i.lng, i.dishes, NULL, NULL, NULL,
     i.source, false, true, i.foody_id, i.external_url, i.classification_source,
     CASE WHEN i.lat IS NULL THEN 'none' ELSE 'foody_source' END, now(), 'unverified',
     i.city_slug, i.image_url, CASE WHEN i.image_url IS NOT NULL THEN now() ELSE NULL END,
     i.popularity_saves, i.popularity_reviews, i.popularity_rating, i.popularity_score, i.popularity_badge
    FROM incoming_city i
    ON CONFLICT (foody_id) DO UPDATE SET
     city_slug = EXCLUDED.city_slug,
     image_url = coalesce(restaurants.image_url, EXCLUDED.image_url),
     popularity_saves = GREATEST(restaurants.popularity_saves, EXCLUDED.popularity_saves),
     popularity_reviews = GREATEST(restaurants.popularity_reviews, EXCLUDED.popularity_reviews),
     popularity_rating = coalesce(EXCLUDED.popularity_rating, restaurants.popularity_rating),
     popularity_score = GREATEST(restaurants.popularity_score, EXCLUDED.popularity_score),
     popularity_badge = coalesce(EXCLUDED.popularity_badge, restaurants.popularity_badge)
    RETURNING id, foody_id`,
  );
  upserted = ins.rowCount || 0;

  await c.query(
   `INSERT INTO foody_import_records(foody_id, restaurant_id, source_payload, classification, classification_source, coordinate_status)
    SELECT i.foody_id, r.id, i.payload, i.groups, i.classification_source, i.coordinate_status
    FROM incoming_city i
    JOIN restaurants r ON r.foody_id = i.foody_id
    ON CONFLICT (foody_id) DO NOTHING`,
  );
 });

 console.log(JSON.stringify({ city: city.slug, name: city.name, harvested: rows.length, upserted }));
}

async function main() {
 for (const city of CITIES) {
  await syncCity(city);
 }
 await pool.query('ANALYZE restaurants');
 const report = await pool.query(
  `SELECT city_slug, count(*)::int AS total, count(image_url)::int AS photos, count(popularity_badge)::int AS badged
   FROM restaurants WHERE active AND NOT demo
   GROUP BY city_slug ORDER BY total DESC`,
 );
 console.log(JSON.stringify({ byCity: report.rows }, null, 2));
}

main()
 .catch((e) => {
  console.error(e);
  process.exitCode = 1;
 })
 .finally(() => pool.end());
