import sharp from 'sharp';
import { pool, readPool } from './db';

const ALLOWED_IMAGE_HOSTS = new Set([
 'down-vn.img.susercontent.com',
 'mms.img.susercontent.com',
 'images.foody.vn',
 'media.foody.vn',
]);

const GENERIC_PLACEHOLDER_PATTERNS = /foody-avatar|default-avatar|no-image|logo-foody|foody_default/i;

// 16x10x3 RGB perceptual fingerprints of ShopeeFood & Foody.vn generic placeholder banners
const PLACEHOLDER_TEMPLATES_B64 = [
 // ShopeeFood solid orange bag
 '7k4u7k4u7k4u7k4u7k4u7k4u7k4u7ksq7ksq7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7kws7k4u71o971g57kws7k0t7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4v7Usq+MK39bKk98e99amZ7UQi7lAw7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k8v7kwr71g6+dPL98/F+L2x+L6y7Uko7k8v7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k0s71k697er8pqJ84x29aub7Uop7lAw7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4v7ksq7kws+MC1+MC0+Mm+9qqa7T4c7k0t7k4v7k4u7k4u7k4u7k4u7k4u7k4v7kwr7mdL7mVI8HBW8HJZ8Ylz8Htj72JG72JG7kwr7k4v7k4u7k4u7k4u7k4u7k8v7ksr7mlP7npi7nxk7nhh73hf73hg8I14725U7kop7k8v7k4u7k4u7k4u7k4u7k4u7k4u7koq7kko7k0s7koq7kkp7kko7kcm7kop7k4v7k4u7k4u7k4u7k4v7k4v7k4v7k4v7k8w7k8w7k8w7lAw7k8w7lAw7lAx7k8w7k4v7k4v7k4v7k4v',
 // ShopeeFood muted orange bag
 '3Fk73Fk73Fk73Fk73Fk73Fk73Fk721Y321Y33Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fg63Fg53mNH3mRI3Fk63Fg63Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fs92k8w7a6f8MS57r2x8MO421M03Fo83Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fo821M08sa79NrS77qu9M/G3F1A3Fg63Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fs921U37rWo6aiY5Y147rao3F5B3Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk73Fk62k0s7bKk8sa888vC8L2x21Mz21Y33Fk83Fk73Fk73Fk73Fk73Fk73Fk83FY43mtQ3nBX4HRa4Xtj5It15It33mtQ33BW3Fc53Fk73Fk73Fk73Fk73Fk73Fk83FY43mtR4YJr4YJs4IBp4YBp4YBp45J+4YFq21U23Fo83Fk73Fk73Fk73Fk73Fk73Fk73Fc43FQ13Fc53FY43FU221Q221M021Q13Fk83Fk73Fk73Fk73Fk83Fk83Fk83Fk83Fo93Fs93Fo93Fo93Fs93Fs93Fs93Fo93Fk83Fk83Fk83Fk8',
 // ShopeeFood orange confetti banner
 '6Dg53EJC7VA37lUt7k0u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u608w4lU071As8DAp1VY361Uu708t7lAw7k4u7lAw7k4u7k8v7k8v7k8v7k8v7k4u7Uwv7Fgs71wo/SsY6VMg5Fky8Eor7Ugn7kws7Ucl7k0t7koq7kop7kko7kko7U0t8E8u40wx5kww/DIR/VUP8VEl7lk+9qyc9aaW9ZqI72hM8HVc72VJ72pO72pP7lIz7k0t7k8u7U8u/jQM+1oU7Ukk8XFY+drT9req+Lms8YBp8X9o8HZd8Hli8INt71w+7ksq7k4u7Uwt9Ucf61Qv60cn8W5U9r2x9aOS9qWU9aeX85J+8oNs8X9o9JuJ8GlO7Ucl7lAw71oz8E8v5VM16U0s8Fs+9aGQ9aaW9JF98G5T8Xtj85aD8pB89J2L719C7Uop93Zb+GZD6U0w7Uwu704u7U0t7kcn7Ucm7kko7koq7kkp7kko7kko7Uko7Eop8l5A8G5T60co5E0v6lIt700t7k0t7k8v7k8u7k8v7k4u7k4u7k4v7k8v7k8v708v9Fw86Ekp5EUl8FIx71Yw7VAy7VEy7VEy7VEy7VEy7VEy7VEy7VEy7VEy4kUn30Mk2UAbzkQm3kss',
 // ShopeeFood zoomed orange banner
 '7k4u7k0u7UYk7UYk7UYl7k4u7Uoq7k0t7k8w7k8w7k8w7k8w7k4v7U4u8k4tz0o27k0t7lAw8nRb8nVc8XFX7lAw8GJF71M07kcm7Uko7Ucm7UYl7kws7k4u7k4u7U4u7UMh9Ix3/enl96WV/e3p9INt835n9I968nhf835o84Bp9Idy8F9C7Usq7k8v7k4u7UIg9Z6M/erm+cO4+9TN9ZSA8nJZ84Nt84Jq9JOA84dy9I968GNG7Uop7k8v7k4u7UIg9ZeE+LOl8nxk9Ip19puJ9qGR8XNa7lAx8F1B7kko8XJZ8W9V7Ugm7lAw7k0s7UEf9ZeE+ca8+b2x+srB9ZyK96qb9p+O966g96qa96yd+Lqu8ndf7Ucl7k0t7lU27UUk8nxk+LSn+K2f966g84Js8W9V8W9V9qGQ9ZiG9ZeE96WV8W5U7UYl8FY4/YFo7k4u7kws7kwr7kwr7k0s7kwr7kwr7k0t7kws7k4t7U0s7ksr7k8v7k8v7Ugo8m9U9HRZ7k4u7k8v7k4u7k4u7k4u7k8v7k4u7k8v7k4u7k4u7k8v7k4u7k4u7k0t93FU51o77k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7k4u7Uws9Fk7+F0+6EQk',
 // Foody.vn red logo on white background
 '//7+/////////////////////////////////////////////////////////////vv7+tPU+LW4+tDT//////39//7+//7+//7+/vv7//7///7+////////////////+cTG8nZ79I2R+cPG//////39//z8////+sbJ+Lq9//////z8//////7+//39//7++L/B84CF+Lq99qer+s3P9qGl+MDC+L/B8nZ89qWo+Lq9+Lu9//////7+/////////vLz9IqP9IuP+Li78W1y96yv8oSI9I+T+LG09Zaa9pqe96qt////+cvN97W3/OHi+9na9ZSZ9puf9qWp9JKW9Zab9aGl84SI84GF84GG8np/9JOY97/C85aa8oaK+L3A/evs/OHj/ejo+b7A/fHx+Lm8/e7v+cTF+snL+Lu971Zc+LW4+9nb+tTW+97g++Pk//////7+//////////7+//////7+//////39+M7P9IuP/vPz//////7+//7+//////7+//7+//7+//39//7+//z8//7+//z8////+93e+cfJ//////z8//39//7+//7+////////////////////////////////////////////////////////////////',
].map((b64) => Buffer.from(b64, 'base64'));

export async function isThirdPartyPlaceholderBuffer(buf: Buffer): Promise<boolean> {
 if (!buf || buf.length < 800) return true;
 try {
  const vec = await sharp(buf).resize(16, 10, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  if (vec.length !== 480) return false;
  for (const tpl of PLACEHOLDER_TEMPLATES_B64) {
   let diff = 0;
   for (let i = 0; i < 480; i++) diff += Math.abs(vec[i] - tpl[i]);
   if (diff / 480 <= 20) return true;
  }
  return false;
 } catch {
  return true;
 }
}

export async function isRealVenueImageUrl(imageUrl: string, timeoutMs = 4500): Promise<boolean> {
 try {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  return !(await isThirdPartyPlaceholderBuffer(buf));
 } catch {
  return false;
 }
}

export function sanitizeFoodyImageUrl(raw: string | null | undefined): string | null {
 if (!raw || typeof raw !== 'string') return null;
 const trimmed = raw.trim();
 try {
  const u = new URL(trimmed);
  if (u.protocol !== 'https:') return null;
  if (!ALLOWED_IMAGE_HOSTS.has(u.hostname)) return null;
  if (GENERIC_PLACEHOLDER_PATTERNS.test(u.pathname)) return null;
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
  const candidate = extractOgImage(html);
  if (!candidate) return null;
  const real = await isRealVenueImageUrl(candidate, timeoutMs);
  return real ? candidate : null;
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
