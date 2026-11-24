import { pool, closePools } from '../apps/api/src/db';
import { isThirdPartyPlaceholderBuffer } from '../apps/api/src/foody-images';

async function main() {
 const res = await pool.query<{ image_url: string }>(
  'SELECT DISTINCT image_url FROM restaurants WHERE image_url IS NOT NULL',
 );
 const urls = res.rows.map((r) => r.image_url);
 console.log(`Scanning ${urls.length} distinct image URLs for ShopeeFood / Foody placeholders...`);

 const badUrls: string[] = [];
 let idx = 0;
 const CONCURRENCY = 120;

 async function worker() {
  while (true) {
   const i = idx++;
   if (i >= urls.length) break;
   const u = urls[i];
   try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
     badUrls.push(u);
     continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (await isThirdPartyPlaceholderBuffer(buf)) {
     badUrls.push(u);
    }
   } catch {
    // transient network timeout, keep existing
   }
   if (i > 0 && i % 5000 === 0) {
    console.log(`Progress: ${i}/${urls.length} (found ${badUrls.length} placeholder URLs so far)`);
   }
  }
 }

 await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

 console.log(`Total placeholder/broken distinct URLs detected: ${badUrls.length}`);

 let updatedRows = 0;
 for (let i = 0; i < badUrls.length; i += 500) {
  const chunk = badUrls.slice(i, i + 500);
  const uRes = await pool.query(
   'UPDATE restaurants SET image_url = NULL, image_checked_at = now() WHERE image_url = ANY($1::text[])',
   [chunk],
  );
  updatedRows += uRes.rowCount || 0;
 }

 const checkQuanVan = await pool.query(
  "SELECT name, image_url FROM restaurants WHERE name ILIKE '%Quân Vân%' LIMIT 3",
 );
 console.log(JSON.stringify({ distinctPlaceholderUrlsRemoved: badUrls.length, restaurantsClearedToNull: updatedRows, quanVanAfter: checkQuanVan.rows }, null, 2));

 await closePools();
}

main().catch((err) => {
 console.error(err);
 process.exit(1);
});
