import { createHash } from 'node:crypto';
import { pool, transaction } from '../apps/api/src/db';
import { classifyFood } from '../apps/api/src/food-classifier';
import { sanitizeFoodyImageUrl } from '../apps/api/src/foody-images';

// All 30 Hanoi districts from Foody's public filter bar
const DISTRICT_IDS = [
 '20', '690', '21', '22', '23', '24', '25', '26', '27', '945', '28', '29',
 '692', '674', '675', '676', '677', '678', '679', '680', '681', '682',
 '683', '684', '685', '686', '687', '688', '689', '691',
];

const uid = (n: number) => {
 const h = createHash('sha256').update('foody.vn:' + n).digest('hex');
 return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

async function fetchPublicList(districtId: string, type: string, isReputation = '') {
 const u = new URL('https://www.foody.vn/__get/Place/HomeListPlace');
 u.searchParams.set('lat', '21.0285');
 u.searchParams.set('lon', '105.8542');
 u.searchParams.set('count', '500');
 u.searchParams.set('page', '1');
 u.searchParams.set('districtId', districtId);
 u.searchParams.set('type', type);
 if (isReputation) u.searchParams.set('isReputation', isReputation);
 u.searchParams.set('t', String(Date.now()));

 try {
  const res = await fetch(u, {
   headers: {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://www.foody.vn/ha-noi',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
   },
   signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const txt = (await res.text()).replace(/^\uFEFF/, '').trim();
  if (!txt.startsWith('{')) return [];
  const data = JSON.parse(txt);
  if (data.CityId !== 218 || !Array.isArray(data.Items)) return [];
  return data.Items;
 } catch {
  return [];
 }
}

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

async function main() {
 const collected = new Map<number, any>();

 // Query public district lists (Newest type=1 + Reputation + Proximity type=3) within public anonymous bounds
 for (const dId of DISTRICT_IDS) {
  const [newest, rep] = await Promise.all([
   fetchPublicList(dId, '1', ''),
   fetchPublicList(dId, '1', 'true'),
  ]);
  for (const item of [...newest, ...rep]) {
   if (Number.isSafeInteger(item.Id) && item.Id > 0 && item.Name?.trim() && item.Address?.trim()) {
    const prev = collected.get(item.Id);
    if (!prev || (item.TotalSaves || 0) >= (prev.TotalSaves || 0)) {
     collected.set(item.Id, item);
    }
   }
  }
 }

 console.log(JSON.stringify({ phase: 'public_scan', uniqueItemsScanned: collected.size }));

 const existingRes = await pool.query('SELECT foody_id FROM foody_import_records');
 const existingSet = new Set<number>(existingRes.rows.map((r) => Number(r.foody_id)));

 const newItems: any[] = [];
 const enrichItems: any[] = [];

 for (const [id, x] of collected.entries()) {
  const saves = Math.max(0, Number(x.TotalSaves || x.TotalFavourites || 0));
  const reviews = Math.max(0, Number(x.TotalReviews || 0));
  const pics = Math.max(0, Number(x.TotalPictures || 0));
  const rating = Number(x.AvgRating) > 0 ? Number(x.AvgRating) : null;
  const imageUrl = sanitizeFoodyImageUrl(x.PhotoUrl);
  const score = computeScore(rating, reviews, saves, pics);
  const badge = computeBadge(rating, reviews, saves, pics);

  if (!existingSet.has(id)) {
   const cls = classifyFood(x.Name, [Number(x.MainCategoryId)].filter(Boolean));
   const valid =
    Number.isFinite(x.Latitude) &&
    Number.isFinite(x.Longitude) &&
    x.Latitude !== 0 &&
    x.Longitude !== 0 &&
    x.Latitude >= 20.5 &&
    x.Latitude <= 21.5 &&
    x.Longitude >= 105.2 &&
    x.Longitude <= 106.1;
   const url = typeof x.Url === 'string' && x.Url.startsWith('/ha-noi/') ? 'https://www.foody.vn' + x.Url : null;
   newItems.push({
    id: uid(id),
    foody_id: id,
    name: x.Name.trim().replace(/\s+/g, ' '),
    address: x.Address.trim().replace(/\s+/g, ' '),
    lat: valid ? x.Latitude : null,
    lng: valid ? x.Longitude : null,
    dishes: cls.groups.map((g) => ({ name: g, group: g, tags: [], price: null, bestsellerSource: null })),
    source: 'Danh mục địa điểm tổng hợp · chưa xác minh thực đơn & hoạt động',
    external_url: url,
    classification_source: cls.source,
    groups: cls.groups,
    coordinate_status: valid ? 'source_coordinates' : 'missing_or_outside_box',
    image_url: imageUrl,
    popularity_saves: saves,
    popularity_reviews: reviews,
    popularity_rating: rating,
    popularity_score: score,
    popularity_badge: badge,
    payload: x,
   });
  } else {
   enrichItems.push({
    foody_id: id,
    image_url: imageUrl,
    popularity_saves: saves,
    popularity_reviews: reviews,
    popularity_rating: rating,
    popularity_score: score,
    popularity_badge: badge,
   });
  }
 }

 let insertedNew = 0;
 if (newItems.length) {
  await transaction(async (c) => {
   await c.query('SET LOCAL statement_timeout = 0');
   for (const item of newItems) {
    const ins = await c.query(
     `INSERT INTO restaurants(
       id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo,active,
       foody_id,external_url,classification_source,location_source,location_checked_at,
       verification_status,image_url,image_checked_at,popularity_saves,popularity_reviews,
       popularity_rating,popularity_score,popularity_badge
      ) VALUES (
       $1,$2,$3,$4,$5,$6,NULL,NULL,NULL,$7,false,true,
       $8,$9,$10,$11,now(),'unverified',$12,CASE WHEN $12::text IS NOT NULL THEN now() ELSE NULL END,
       $13,$14,$15,$16,$17
      )
      ON CONFLICT (foody_id) DO NOTHING RETURNING id`,
     [
      item.id,
      item.name,
      item.address,
      item.lat,
      item.lng,
      JSON.stringify(item.dishes),
      item.source,
      item.foody_id,
      item.external_url,
      item.classification_source,
      item.lat === null ? 'none' : 'foody_source',
      item.image_url,
      item.popularity_saves,
      item.popularity_reviews,
      item.popularity_rating,
      item.popularity_score,
      item.popularity_badge,
     ],
    );
    const rId = ins.rows[0]?.id;
    if (rId) {
     insertedNew++;
     await c.query(
      `INSERT INTO foody_import_records(foody_id,restaurant_id,source_payload,classification,classification_source,coordinate_status)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (foody_id) DO NOTHING`,
      [item.foody_id, rId, JSON.stringify(item.payload), item.groups, item.classification_source, item.coordinate_status],
     );
    }
   }
  });
 }

 let enrichedCount = 0;
 for (let i = 0; i < enrichItems.length; i += 1000) {
  const chunk = enrichItems.slice(i, i + 1000);
  const r = await pool.query(
   `UPDATE restaurants r
    SET
     image_url = coalesce(r.image_url, x.image_url),
     image_checked_at = CASE WHEN r.image_url IS NULL AND x.image_url IS NOT NULL THEN now() ELSE r.image_checked_at END,
     popularity_saves = GREATEST(r.popularity_saves, x.popularity_saves),
     popularity_reviews = GREATEST(r.popularity_reviews, x.popularity_reviews),
     popularity_rating = coalesce(x.popularity_rating, r.popularity_rating),
     popularity_score = GREATEST(r.popularity_score, x.popularity_score),
     popularity_badge = coalesce(x.popularity_badge, r.popularity_badge)
    FROM jsonb_to_recordset($1::jsonb) AS x(
     foody_id bigint,
     image_url text,
     popularity_saves int,
     popularity_reviews int,
     popularity_rating float8,
     popularity_score float8,
     popularity_badge text
    )
    WHERE r.foody_id = x.foody_id`,
   [JSON.stringify(chunk)],
  );
  enrichedCount += r.rowCount || 0;
 }

 const summary = (
  await pool.query(
   `SELECT
     count(*)::int AS total_public,
     count(image_url)::int AS with_image,
     count(popularity_badge)::int AS with_badge,
     count(*) FILTER (WHERE popularity_badge = 'top_fav')::int AS top_fav,
     count(*) FILTER (WHERE popularity_badge = 'popular')::int AS popular,
     count(*) FILTER (WHERE popularity_badge = 'good_rating')::int AS good_rating,
     count(*) FILTER (WHERE popularity_badge = 'worth_try')::int AS worth_try,
     count(*) FILTER (WHERE popularity_saves > 0)::int AS with_saves
    FROM restaurants WHERE active AND NOT demo`,
  )
 ).rows[0];

 console.log(JSON.stringify({ insertedNew, enrichedCount, summary }, null, 2));
}

main()
 .catch((e) => {
  console.error(e);
  process.exitCode = 1;
 })
 .finally(() => pool.end());
