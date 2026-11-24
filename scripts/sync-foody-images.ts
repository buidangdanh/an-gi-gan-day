import { pool } from '../apps/api/src/db';
import { fetchFoodyPageImage, sanitizeFoodyImageUrl } from '../apps/api/src/foody-images';

const POINTS = [
 { label: 'Hoan Kiem', lat: 21.0285, lon: 105.8542 },
 { label: 'Dong Da', lat: 21.0153, lon: 105.8277 },
 { label: 'Cau Giay', lat: 21.0307, lon: 105.7905 },
 { label: 'Ba Dinh', lat: 21.0355, lon: 105.8190 },
 { label: 'Hai Ba Trung', lat: 21.0074, lon: 105.8562 },
 { label: 'Tay Ho', lat: 21.0694, lon: 105.8240 },
];

// Foody category IDs: '' (all), '2' (drinks/cafe/tea), '3' (street food), '1' (restaurants), '11' (snacks), '4' (bar/beer)
const CATE_IDS = ['', '2', '3', '11', '4'];

async function fetchHomeListPage(lat: number, lon: number, cateId: string, page: number) {
 const u = new URL('https://www.foody.vn/__get/Place/HomeListPlace');
 u.searchParams.set('lat', String(lat));
 u.searchParams.set('lon', String(lon));
 u.searchParams.set('count', '200');
 u.searchParams.set('page', String(page));
 u.searchParams.set('cateId', cateId);
 u.searchParams.set('type', '3');
 u.searchParams.set('t', String(Date.now()));

 try {
  const res = await fetch(u, {
   headers: {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://www.foody.vn/ha-noi',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
   },
   signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
  return Array.isArray(data.Items) ? data.Items : [];
 } catch {
  return [];
 }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
 let cursor = 0;
 await Promise.all(
  Array.from({ length: Math.min(concurrency, items.length) }, async () => {
   while (cursor < items.length) {
    const idx = cursor++;
    await worker(items[idx]);
   }
  }),
 );
}

async function main() {
 // Phase 1: Harvest bulk PhotoUrls from Foody HomeListPlace across Hanoi districts & categories
 const photoByFoodyId = new Map<number, string>();
 for (const pt of POINTS) {
  for (const cateId of CATE_IDS) {
   for (let page = 1; page <= 2; page++) {
    const items = await fetchHomeListPage(pt.lat, pt.lon, cateId, page);
    for (const item of items) {
     const clean = sanitizeFoodyImageUrl(item.PhotoUrl);
     if (Number.isSafeInteger(item.Id) && clean) {
      photoByFoodyId.set(item.Id, clean);
     }
    }
   }
  }
 }

 const bulkEntries = [...photoByFoodyId.entries()].map(([foody_id, image_url]) => ({ foody_id, image_url }));
 let bulkUpdated = 0;
 for (let i = 0; i < bulkEntries.length; i += 1000) {
  const chunk = bulkEntries.slice(i, i + 1000);
  const r = await pool.query(
   `UPDATE restaurants r
    SET image_url = x.image_url, image_checked_at = now()
    FROM jsonb_to_recordset($1::jsonb) AS x(foody_id bigint, image_url text)
    WHERE r.foody_id = x.foody_id AND r.image_url IS NULL`,
   [JSON.stringify(chunk)],
  );
  bulkUpdated += r.rowCount || 0;
 }
 console.log(JSON.stringify({ phase: 'bulk_home_list', harvestedIds: bulkEntries.length, updatedRows: bulkUpdated }));

 // Phase 2: Pre-warm top restaurants per primary_group (both Food & Drink) via og:image so every category has photos immediately
 const topPerGroup = await pool.query(
  `SELECT id, external_url FROM (
    SELECT id, external_url, row_number() OVER (PARTITION BY primary_group ORDER BY (lat IS NOT NULL) DESC, name, id) AS rn
    FROM restaurants
    WHERE active AND NOT demo AND image_url IS NULL AND external_url IS NOT NULL
   ) sub WHERE rn <= 8`,
 );

 let ogUpdated = 0;
 await runWithConcurrency(topPerGroup.rows, 8, async (row) => {
  const img = await fetchFoodyPageImage(row.external_url, 4000);
  await pool.query('UPDATE restaurants SET image_url = $2, image_checked_at = now() WHERE id = $1', [row.id, img]);
  if (img) ogUpdated++;
 });
 console.log(JSON.stringify({ phase: 'top_per_group_og', checked: topPerGroup.rows.length, updatedRows: ogUpdated }));

 // Phase 3: Match the 400 user-imported Hanoi restaurants to similar Foody venues and attach/fetch photos
 const userImports = await pool.query(
  `SELECT id, name_norm, primary_group
   FROM restaurants
   WHERE active AND NOT demo AND import_record_id IS NOT NULL AND image_url IS NULL`,
 );

 let matchedUserImports = 0;
 await runWithConcurrency(userImports.rows, 8, async (row) => {
  const peerRes = await pool.query(
   `SELECT id, external_url, image_url, similarity(name_norm, $1) AS sim
    FROM restaurants
    WHERE active AND NOT demo AND external_url IS NOT NULL
      AND (name_norm % $1 OR (primary_group = $2 AND similarity(name_norm, $1) >= 0.28))
    ORDER BY (primary_group = $2) DESC, sim DESC
    LIMIT 1`,
   [row.name_norm, row.primary_group || ''],
  );
  const peer = peerRes.rows[0];
  if (!peer) return;
  let img: string | null = peer.image_url;
  if (!img && peer.external_url) {
   img = await fetchFoodyPageImage(peer.external_url, 4000);
   if (img) {
    await pool.query('UPDATE restaurants SET image_url = $2, image_checked_at = now() WHERE id = $1', [peer.id, img]);
   }
  }
  if (img) {
   await pool.query('UPDATE restaurants SET image_url = $2, image_checked_at = now() WHERE id = $1', [row.id, img]);
   matchedUserImports++;
  }
 });

 const totals = await pool.query(
  `SELECT count(*)::int AS total_public,
          count(image_url)::int AS with_image,
          count(*) FILTER (WHERE import_record_id IS NOT NULL AND image_url IS NOT NULL)::int AS user_imports_with_image
   FROM restaurants WHERE active AND NOT demo`,
 );
 console.log(JSON.stringify({ phase: 'summary', matchedUserImports, ...totals.rows[0] }));
}

main()
 .catch((e) => {
  console.error(e);
  process.exitCode = 1;
 })
 .finally(() => pool.end());
