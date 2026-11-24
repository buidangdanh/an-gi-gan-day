import { pool, readPool } from './db';

const ALLOWED_IMAGE_HOSTS = new Set([
 'down-vn.img.susercontent.com',
 'mms.img.susercontent.com',
 'images.foody.vn',
 'media.foody.vn',
]);

const GENERIC_PLACEHOLDER_PATTERNS = /foody-avatar|default-avatar|no-image|logo-foody|foody_default/i;

export function sanitizeFoodyImageUrl(raw: string | null | undefined): string | null {
 if (!raw || typeof raw !== 'string') return null;
 const trimmed = raw.trim();
 try {
  const u = new URL(trimmed);
  if (u.protocol !== 'https:') return null;
  if (!ALLOWED_IMAGE_HOSTS.has(u.hostname)) return null;
  if (GENERIC_PLACEHOLDER_PATTERNS.test(u.pathname)) return null;
  // Normalize large ShopeeFood/Foody image to fast 640x400 card crop if unresized
  if (u.hostname.endsWith('susercontent.com') && !u.pathname.includes('@resize_')) {
   return `${u.origin}${u.pathname}@resize_ss640x400`;
  }
  return u.toString();
 } catch {
  return null;
 }
}

export function extractOgImage(html: string): string | null {
 const match =
  html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
  html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
 return sanitizeFoodyImageUrl(match?.[1]);
}

export async function fetchFoodyPageImage(externalUrl: string, timeoutMs = 2400): Promise<string | null> {
 if (!externalUrl.startsWith('https://www.foody.vn/')) return null;
 try {
  const res = await fetch(externalUrl, {
   headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'vi-VN,vi;q=0.9',
   },
   signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return extractOgImage(html);
 } catch {
  return null;
 }
}

const inflightById = new Map<string, Promise<string | null>>();

async function resolveImageForRow(row: any): Promise<string | null> {
 if (row.image_url) return row.image_url;
 if (row.demo) return null;

 const existingPromise = inflightById.get(row.id);
 if (existingPromise) return existingPromise;

 const work = (async (): Promise<string | null> => {
  try {
   let targetExternalUrl: string | null = row.external_url || null;
   let matchedPeerId: string | null = null;

   // If this record has no direct Foody URL (e.g. 400 user-imported Hanoi venues),
   // look for a similar restaurant in our 71k Foody dataset by normalized name & dish group.
   if (!targetExternalUrl && row.name_norm) {
    const similar = await readPool.query(
     `SELECT id, external_url, image_url, similarity(name_norm, $1) AS sim
      FROM restaurants
      WHERE active AND NOT demo AND external_url IS NOT NULL
        AND (name_norm % $1 OR (primary_group = $2 AND similarity(name_norm, $1) >= 0.28))
      ORDER BY (primary_group = $2) DESC, sim DESC
      LIMIT 1`,
     [row.name_norm, row.primary_group || ''],
    );
    const peer = similar.rows[0];
    if (peer) {
     if (peer.image_url) {
      await pool.query('UPDATE restaurants SET image_url = $2, image_checked_at = now() WHERE id = $1', [row.id, peer.image_url]);
      return peer.image_url;
     }
     targetExternalUrl = peer.external_url;
     matchedPeerId = peer.id;
    }
   }

   if (!targetExternalUrl) {
    await pool.query('UPDATE restaurants SET image_checked_at = now() WHERE id = $1', [row.id]);
    return null;
   }

   const imageUrl = await fetchFoodyPageImage(targetExternalUrl);
   await pool.query('UPDATE restaurants SET image_url = $2, image_checked_at = now() WHERE id = $1', [row.id, imageUrl]);
   if (matchedPeerId && imageUrl) {
    await pool.query('UPDATE restaurants SET image_url = coalesce(image_url, $2), image_checked_at = now() WHERE id = $1', [matchedPeerId, imageUrl]);
   }
   return imageUrl;
  } catch {
   return null;
  }
 })().finally(() => {
  inflightById.delete(row.id);
 });

 inflightById.set(row.id, work);
 return work;
}

/**
 * Hydrates missing Foody images on-the-fly for up to 8 displayed cards
 * and caches them permanently in PostgreSQL. Skipped in automated test runs.
 */
export async function hydrateMissingImages(rows: any[]): Promise<void> {
 if (process.env.NODE_ENV === 'test' || process.env.DISABLE_LIVE_IMAGE_FETCH === 'true') return;
 const unchecked = rows
  .filter((r) => r && !r.demo && !r.image_url && !r.image_checked_at)
  .slice(0, 8);
 if (!unchecked.length) return;

 await Promise.all(
  unchecked.map(async (row) => {
   const img = await resolveImageForRow(row);
   if (img) row.image_url = img;
  }),
 );
}
