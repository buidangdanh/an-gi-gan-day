import { z } from 'zod';
import { readPool } from './db';
import { coordinate, normalize, groups, isOpen } from './domain';
import { extraGroups } from './food-classifier';
import { nearbySuggestionPage } from './nearby-suggestions';
import { LruCache, escapeLike, quantizePoint } from './cache';
import { hydrateMissingImages } from './foody-images';
import { attachWeatherToItems } from './weather';

export const allFoodGroups = [...groups, ...extraGroups];

export const VALID_CITY_SLUGS = [
 'ha-noi',
 'ho-chi-minh',
 'da-nang',
 'hai-phong',
 'can-tho',
 'hue',
 'nha-trang',
 'da-lat',
 'vung-tau',
 'ha-long',
] as const;

export type CitySlug = (typeof VALID_CITY_SLUGS)[number];
const CITY_SLUG_ENUM = z.enum(VALID_CITY_SLUGS);

export const DRINK_GROUPS = [
 'cà phê',
 'cà phê trứng',
 'trà sữa',
 'trà & đồ uống',
 'bar & bia',
] as const;

export const EXCLUDED_FROM_FOOD_ALL = [
 'chưa phân nhóm',
 'nhà hàng',
 'quán ăn',
 'đồ uống & tráng miệng',
 ...DRINK_GROUPS,
];

export const SUGGESTION_MOODS = {
 all: null,
 nuoc: [
  'phở bò', 'phở gà', 'phở', 'bún bò huế', 'hủ tiếu', 'bánh canh', 'mì quảng & cao lầu',
  'bánh đa cua', 'bún riêu cua', 'bún thang', 'bún ốc', 'bún', 'miến lươn', 'miến',
  'mì & hủ tiếu', 'cháo sườn', 'cháo',
 ],
 kho: [
  'cơm tấm', 'cơm', 'bún chả', 'bún đậu mắm tôm', 'chả cá lã vọng', 'chả cá',
  'phở cuốn', 'bánh cuốn nóng', 'bánh cuốn', 'xôi xéo', 'xôi', 'bánh xèo & nem lụi',
  'gà', 'vịt & ngan', 'bò',
 ],
 nhanh: [
  'bánh mì', 'bánh mì sốt vang', 'cơm tấm', 'xôi xéo', 'xôi', 'bánh giò',
  'bánh cuốn nóng', 'bánh cuốn', 'burger & đồ ăn nhanh', 'phở cuốn', 'nộm bò khô',
 ],
 tu_tap: [
  'lẩu', 'nướng', 'hải sản', 'chả cá lã vọng', 'chả cá',
  'ẩm thực Hàn', 'ẩm thực Nhật', 'ẩm thực Trung Hoa', 'pizza & mì Ý',
 ],
 an_vat: [
  'ăn vặt', 'nem chua rán', 'bánh tôm hồ tây', 'nộm bò khô',
  'bánh ngọt', 'chè & tráng miệng', 'kem tràng tiền', 'kem',
 ],
 chay: ['chay'],

 drink_all: [...DRINK_GROUPS],
 ca_phe: ['cà phê', 'cà phê trứng'],
 tra_sua: ['trà sữa'],
 tra_ep: ['trà & đồ uống'],
 bar_bia: ['bar & bia'],
} as const;

export type SuggestionMood = keyof typeof SUGGESTION_MOODS;

const MOOD_ENUM = z.enum([
 'all', 'nuoc', 'kho', 'nhanh', 'tu_tap', 'an_vat', 'chay',
 'drink_all', 'ca_phe', 'tra_sua', 'tra_ep', 'bar_bia',
]);

const APPROVED_LICENSES = ['first_party', 'odbl', 'cdla_permissive', 'cc0', 'partner_licensed'];

const statsCache = new LruCache<any>(24);
const suggestionCache = new LruCache<any>(4000);
const searchCache = new LruCache<any>(2000);

const isCacheEnabled = () => process.env.NODE_ENV !== 'test';
export const strictLicenseMode = () => process.env.STRICT_LICENSE_MODE === 'true';

export function invalidateCatalogueCache() {
 statsCache.clear();
 suggestionCache.clear();
 searchCache.clear();
}

export function licenseSql(alias = 'r') {
 return strictLicenseMode()
  ? ` AND ${alias}.data_license = ANY(ARRAY[${APPROVED_LICENSES.map((l) => `'${l}'`).join(',')}]::text[])`
  : '';
}

export function searchTerms(q: string) {
 return normalize(q).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 8);
}

export async function catalogueStats(city?: CitySlug) {
 const compute = async () => {
  const lic = licenseSql('r');
  const cityArgs = city ? [city] : [];
  const cityClause = city ? ' AND r.city_slug = $1' : '';
  const [totals, groupCounts, primaryCounts, cityCounts] = await Promise.all([
   readPool.query(`SELECT count(*)::int AS total, count(r.lat)::int AS located FROM restaurants r WHERE r.active AND NOT r.demo${cityClause}${lic}`, cityArgs),
   readPool.query(`SELECT g AS name, count(*)::int AS count FROM restaurants r CROSS JOIN LATERAL unnest(r.food_groups) g WHERE r.active AND NOT r.demo${cityClause}${lic} GROUP BY g ORDER BY count DESC, g`, cityArgs),
   readPool.query(`SELECT r.primary_group AS name, count(*)::int AS count FROM restaurants r WHERE r.active AND NOT r.demo${cityClause}${lic} GROUP BY r.primary_group`, cityArgs),
   readPool.query(`SELECT r.city_slug AS slug, count(*)::int AS count FROM restaurants r WHERE r.active AND NOT r.demo${lic} GROUP BY r.city_slug ORDER BY count DESC`),
  ]);
  return { ...totals.rows[0], groups: groupCounts.rows, primaryGroups: primaryCounts.rows, cities: cityCounts.rows };
 };

 if (!isCacheEnabled()) return compute();
 return statsCache.getOrCompute(`stats:${strictLicenseMode() ? 'strict' : 'all'}:${city || 'all'}`, 30_000, compute);
}

async function hydrateRestaurants(ids: string[]) {
 if (!ids.length) return new Map<string, any>();
 const result = await readPool.query(
  `SELECT r.*, r.review_count AS count, r.review_avg AS average FROM restaurants r WHERE r.id = ANY($1::uuid[])`,
  [ids],
 );
 await hydrateMissingImages(result.rows);
 return new Map(result.rows.map((r) => [r.id, r]));
}

export async function fourSuggestions(
 page: number,
 publicRestaurant: (r: any) => any,
 origin?: { lat: number; lng: number },
 mood: SuggestionMood = 'all',
 excludedGroups: string[] = [],
 proBoost = false,
 city?: CitySlug,
) {
 const rawMoodGroups = SUGGESTION_MOODS[mood];
 const excludedUserSet = new Set(excludedGroups);
 const moodGroups = rawMoodGroups ? rawMoodGroups.filter((g) => !excludedUserSet.has(g)) : null;
 const lic = licenseSql('r');

 if (rawMoodGroups && moodGroups && moodGroups.length === 0) {
  return { items: [], hasMore: false, page, mood };
 }

 const isNarrowGroupMood = moodGroups !== null && moodGroups.length < 4;

 const compute = async () => {
  if (isNarrowGroupMood && moodGroups) {
   if (origin) {
    const point = isCacheEnabled() ? quantizePoint(origin.lat, origin.lng) : { lat: origin.lat, lng: origin.lng, cell: '' };
    const args: any[] = [point.lng, point.lat, [...moodGroups], page * 4];
    const cityFilter = city ? (() => { args.push(city); return ` AND r.city_slug = $${args.length}`; })() : '';
    const res = await readPool.query(
     `WITH near_pool AS (
       SELECT r.*, r.review_count AS count, r.review_avg AS average,
              ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance
       FROM restaurants r
       WHERE r.active AND NOT r.demo AND r.location IS NOT NULL
         AND r.primary_group = ANY($3::text[])${cityFilter}${lic}
       ORDER BY r.location <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
       LIMIT 800
      )
      SELECT * FROM near_pool
      ORDER BY
       CASE
        WHEN distance <= 8000 AND (popularity_badge = 'top_fav' OR popularity_saves >= 40) THEN 0
        WHEN distance <= 8000 AND (popularity_badge = 'popular' OR popularity_saves >= 10) THEN 1
        WHEN distance <= 8000 AND (popularity_badge IS NOT NULL OR popularity_saves >= 1) THEN 2
        WHEN distance <= 8000 THEN 3
        ELSE 4
       END ASC,
       distance ASC,
       popularity_saves DESC,
       popularity_score DESC,
       id
      LIMIT 5 OFFSET $4`,
     args,
    );
    const slice = res.rows.slice(0, 4);
    await hydrateMissingImages(slice);
    const items = slice
     .map((r) => ({ ...publicRestaurant(r), open: isOpen(r.hours), distance: Math.round(r.distance) }))
     .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return {
     items,
     hasMore: res.rows.length > 4,
     page,
     mood,
     reference: origin,
    };
   }

   const args: any[] = [[...moodGroups], page * 4];
   const cityFilter = city ? (() => { args.push(city); return ` AND r.city_slug = $${args.length}`; })() : '';
   const res = await readPool.query(
    `SELECT r.*, r.review_count AS count, r.review_avg AS average
     FROM restaurants r
     WHERE r.active AND NOT r.demo AND r.primary_group = ANY($1::text[])${cityFilter}${lic}
     ORDER BY (r.popularity_badge = 'top_fav') DESC, r.popularity_saves DESC, r.popularity_score DESC, (r.image_url IS NOT NULL) DESC, r.name, r.id
     LIMIT 5 OFFSET $2`,
    args,
   );
   const slice = res.rows.slice(0, 4);
   await hydrateMissingImages(slice);
   return {
    items: slice.map((r) => ({ ...publicRestaurant(r), open: isOpen(r.hours), distance: null })),
    hasMore: res.rows.length > 4,
    page,
    mood,
   };
  }

  if (origin) {
   const point = isCacheEnabled() ? quantizePoint(origin.lat, origin.lng) : { lat: origin.lat, lng: origin.lng, cell: '' };
   const knnLimit = Math.min(2400, Math.max(600, (page + 2) * 150));

   const knnParams: any[] = [point.lng, point.lat, knnLimit];
   const allExcluded = [...EXCLUDED_FROM_FOOD_ALL, ...excludedGroups];
   const groupFilter = moodGroups
    ? (() => { knnParams.push([...moodGroups]); return ` AND r.primary_group = ANY($${knnParams.length}::text[])`; })()
    : (() => { knnParams.push(allExcluded); return ` AND NOT (r.primary_group = ANY($${knnParams.length}::text[]))`; })();
   const cityFilter = city ? (() => { knnParams.push(city); return ` AND r.city_slug = $${knnParams.length}`; })() : '';

   const knn = await readPool.query(
    `SELECT r.id, r.primary_group, r.popularity_badge, r.popularity_saves, r.popularity_score,
            ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS real_distance
     FROM restaurants r
     WHERE r.active AND NOT r.demo AND r.location IS NOT NULL
       AND r.primary_group NOT IN ('chưa phân nhóm','nhà hàng','quán ăn','đồ uống & tráng miệng')${groupFilter}${cityFilter}${lic}
     ORDER BY r.location <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
     LIMIT $3`,
    knnParams,
   );

   const toEffectiveDistance = (row: any) => {
    const d = Number(row.real_distance);
    const saves = Number(row.popularity_saves || 0);
    const score = Number(row.popularity_score || 0);
    const badge = row.popularity_badge as string | null;
    const boostBonus = proBoost ? score * 8 : Math.min(80, Math.log1p(saves) * 12);
    if (d <= 6000) {
     if (badge === 'top_fav' || saves >= 40) return Math.max(0, d - boostBonus);
     if (badge === 'popular' || saves >= 10) return 10_000 + Math.max(0, d - boostBonus);
     if (badge !== null || saves >= 1) return 25_000 + d;
     return 50_000 + d;
    }
    if (d <= 20_000 && (badge === 'top_fav' || badge === 'popular' || saves >= 10)) {
     return 70_000 + d;
    }
    return 100_000 + d;
   };

   const candidates = knn.rows.map((row) => ({
    id: row.id as string,
    primary_group: row.primary_group as string,
    real_distance: Number(row.real_distance),
    distance: toEffectiveDistance(row),
   }));

   let selected = nearbySuggestionPage(candidates, page);
   if (selected.items.length < 4 && knn.rows.length === knnLimit) {
    const stats = await catalogueStats(city);
    const excluded = new Set(allExcluded);
    const targetGroups: string[] = moodGroups
     ? [...moodGroups]
     : stats.primaryGroups.filter((g: any) => g.count > 0 && !excluded.has(g.name)).map((g: any) => g.name);

    if (targetGroups.length) {
     const perGroupLimit = Math.min(60, page + 4);
     const latArgs: any[] = [point.lng, point.lat, targetGroups, perGroupLimit];
     const latCityFilter = city ? (() => { latArgs.push(city); return ` AND r.city_slug = $${latArgs.length}`; })() : '';
     const lateral = await readPool.query(
      `SELECT sub.id, sub.primary_group, sub.popularity_badge, sub.popularity_saves, sub.popularity_score, sub.real_distance
       FROM unnest($3::text[]) AS g(grp)
       CROSS JOIN LATERAL (
        SELECT r.id, r.primary_group, r.popularity_badge, r.popularity_saves, r.popularity_score,
               ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS real_distance
        FROM restaurants r
        WHERE r.active AND NOT r.demo AND r.location IS NOT NULL AND r.primary_group = g.grp${latCityFilter}${lic}
        ORDER BY r.location <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
        LIMIT $4
       ) sub`,
      latArgs,
     );
     selected = nearbySuggestionPage(
      lateral.rows.map((x) => ({
       id: x.id,
       primary_group: x.primary_group,
       real_distance: Number(x.real_distance),
       distance: toEffectiveDistance(x),
      })),
      page,
     );
    }
   }

   if (!selected.items.length) return { ...selected, page, mood, reference: origin };
   const byId = await hydrateRestaurants(selected.items.map((r) => r.id));
   const orderedItems = selected.items
    .map((candidate) => {
     const r = byId.get(candidate.id);
     if (!r) return null;
     return { ...publicRestaurant(r), open: isOpen(r.hours), distance: Math.round(candidate.real_distance) };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

   return {
    items: orderedItems,
    hasMore: selected.hasMore,
    page,
    mood,
    reference: origin,
   };
  }

  const stats = await catalogueStats(city);
  const priorityByCity: Record<string, string[]> = {
   'ho-chi-minh': ['cơm tấm', 'hủ tiếu', 'bánh mì', 'bún bò huế', 'lẩu', 'nướng', 'cơm', 'ăn vặt', 'hải sản'],
   'da-nang': ['mì quảng & cao lầu', 'hải sản', 'bánh xèo & nem lụi', 'bún bò huế', 'cơm', 'bánh mì', 'lẩu'],
   'hai-phong': ['bánh đa cua', 'hải sản', 'bánh mì', 'bún', 'cháo', 'ăn vặt', 'lẩu'],
   'hue': ['bún bò huế', 'bánh xèo & nem lụi', 'cơm', 'chè & tráng miệng', 'bánh canh', 'bún'],
   'nha-trang': ['hải sản', 'bánh canh', 'bánh xèo & nem lụi', 'bún', 'cơm', 'nướng'],
   'da-lat': ['lẩu', 'nướng', 'bánh mì', 'bánh xèo & nem lụi', 'phở', 'ăn vặt'],
   'can-tho': ['hủ tiếu', 'lẩu', 'cơm tấm', 'bánh xèo & nem lụi', 'nướng', 'bún'],
   'vung-tau': ['hải sản', 'bánh xèo & nem lụi', 'hủ tiếu', 'lẩu', 'cơm tấm', 'nướng'],
  };
  const priority = mood.startsWith('drink')
   ? ['cà phê', 'trà sữa', 'trà & đồ uống', 'cà phê trứng', 'bar & bia']
   : (city && priorityByCity[city]) || ['phở bò', 'bún chả', 'cơm', 'bánh mì', 'lẩu', 'phở gà', 'bún đậu mắm tôm', 'bánh cuốn', 'xôi', 'cháo', 'ăn vặt'];
  const excluded = new Set([...EXCLUDED_FROM_FOOD_ALL, ...excludedGroups]);
  const moodSet = moodGroups ? new Set<string>(moodGroups) : null;

  const available = stats.primaryGroups
   .filter((g: any) => g.count > 0 && (moodSet ? moodSet.has(g.name) : !excluded.has(g.name)))
   .sort((a: any, b: any) => {
    const ai = priority.indexOf(a.name), bi = priority.indexOf(b.name);
    return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi) || a.name.localeCompare(b.name, 'vi');
   });

  if (!available.length) return { items: [], hasMore: false, page, mood };

  const picks = Array.from({ length: Math.min(4, available.length) }, (_, i) => {
   const index = page * 4 + i;
   const group = available[index % available.length];
   const offset = Math.floor(index / available.length) % group.count;
   return { group: group.name, offset };
  });

  const rawRows = (
   await Promise.all(
    picks.map(async ({ group, offset }) => {
     const qArgs: any[] = [group, offset];
     const cFilter = city ? (() => { qArgs.push(city); return ` AND r.city_slug = $3`; })() : '';
     const result = await readPool.query(
      `SELECT r.*, r.review_count AS count, r.review_avg AS average
       FROM restaurants r
       WHERE r.active AND NOT r.demo AND r.primary_group = $1${cFilter}${lic}
       ORDER BY (r.popularity_badge = 'top_fav') DESC, r.popularity_saves DESC, r.popularity_score DESC, (r.image_url IS NOT NULL) DESC, r.name, r.id LIMIT 1 OFFSET $2`,
      qArgs,
     );
     return result.rows[0] || null;
    }),
   )
  ).filter(Boolean);

  await hydrateMissingImages(rawRows);

  const totalInMood = available.reduce((sum: number, g: any) => sum + g.count, 0);
  return {
   items: rawRows.map((r) => ({ ...publicRestaurant(r), open: isOpen(r.hours), distance: null })),
   hasMore: totalInMood > 4,
   page,
   mood,
  };
 };

 if (!isCacheEnabled()) return compute();
 const cell = origin ? quantizePoint(origin.lat, origin.lng).cell : 'nogps';
 const exKey = excludedGroups.length ? [...excludedGroups].sort().join(',') : '';
 const cacheKey = `sug:${strictLicenseMode() ? 's' : 'a'}:${city || 'all'}:${mood}:${proBoost ? 'p' : 'n'}:${exKey}:${cell}:${page}`;
 return suggestionCache.getOrCompute(cacheKey, 30_000, compute);
}

export async function directoryPage(raw: Record<string, unknown>, publicRestaurant: (r: any) => any) {
 if (raw.suggestions === 'true') {
  const f = z
   .object({
    page: z.coerce.number().int().min(0).max(500).default(0),
    mood: MOOD_ENUM.default('all'),
    city: CITY_SLUG_ENUM.optional(),
    excludeGroups: z.string().max(600).default(''),
    proBoost: z.enum(['true', 'false']).default('false'),
    lat: coordinate.shape.lat.optional(),
    lng: coordinate.shape.lng.optional(),
   })
   .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Cần cung cấp đủ cặp tọa độ.' })
   .parse(raw);

  const excludedGroups = f.excludeGroups
   ? f.excludeGroups
      .split(',')
      .map((s) => s.trim())
      .filter((s) => allFoodGroups.includes(s as any))
      .slice(0, 20)
   : [];

  const base = await fourSuggestions(
   f.page,
   publicRestaurant,
   f.lat === undefined ? undefined : { lat: f.lat, lng: f.lng! },
   f.mood,
   excludedGroups,
   f.proBoost === 'true',
   f.city,
  );
  return { ...base, items: await attachWeatherToItems(base.items) };
 }

 const f = z
  .object({
   lat: coordinate.shape.lat.optional(),
   lng: coordinate.shape.lng.optional(),
   city: CITY_SLUG_ENUM.optional(),
   mood: MOOD_ENUM.optional(),
   excludeGroups: z.string().max(600).default(''),
   q: z.string().max(120).default(''),
   group: z.string().max(80).optional(),
   limit: z.coerce.number().int().min(1).max(60).default(24),
   offset: z.coerce.number().int().min(0).max(200000).default(0),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Cần cung cấp đủ cặp tọa độ.' })
  .parse(raw);

 const excludedGroups = f.excludeGroups
  ? f.excludeGroups
     .split(',')
     .map((s) => s.trim())
     .filter((s) => allFoodGroups.includes(s as any))
     .slice(0, 20)
  : [];

 const compute = async () => {
  const countArgs: any[] = [];
  const bindCount = (v: any) => { countArgs.push(v); return '$' + countArgs.length; };
  const where = ['r.active', 'NOT r.demo'];
  if (strictLicenseMode()) {
   where.push(`r.data_license = ANY(ARRAY[${APPROVED_LICENSES.map((l) => `'${l}'`).join(',')}]::text[])`);
  }
  if (f.city) where.push(`r.city_slug = ${bindCount(f.city)}`);
  if (f.group) where.push(`r.food_groups @> ARRAY[${bindCount(f.group)}]::text[]`);
  if (f.mood && SUGGESTION_MOODS[f.mood]) {
   where.push(`r.primary_group = ANY(${bindCount([...SUGGESTION_MOODS[f.mood]!])}::text[])`);
  }
  if (excludedGroups.length) {
   where.push(`NOT (r.primary_group = ANY(${bindCount(excludedGroups)}::text[]))`);
  }

  const terms = searchTerms(f.q);
  if (terms.length > 1) {
   where.push(`r.search_tokens @@ plainto_tsquery('simple', ${bindCount(terms.join(' '))})`);
  } else if (terms.length) {
   where.push(`r.search_text LIKE ${bindCount('%' + escapeLike(terms[0]) + '%')} ESCAPE '\\'`);
  }

  const filter = where.join(' AND ');
  const rowArgs = [...countArgs];
  const bindRow = (v: any) => { rowArgs.push(v); return '$' + rowArgs.length; };

  const lng = bindRow(f.lng ?? null);
  const lat = bindRow(f.lat ?? null);
  const limit = bindRow(f.limit);
  const offset = bindRow(f.offset);
  const relevance = terms.length
   ? `CASE WHEN r.name_norm LIKE ${bindRow('%' + escapeLike(terms.join(' ')) + '%')} ESCAPE '\\' THEN 0 ELSE 1 END,`
   : '';

  const geoOrder = f.lat !== undefined
   ? `CASE
       WHEN r.location IS NULL THEN 5
       WHEN ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(${lng}::float8,${lat}::float8),4326)::geography, 10000)
            AND (r.popularity_badge IN ('top_fav', 'popular') OR r.popularity_saves >= 10) THEN 0
       WHEN ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(${lng}::float8,${lat}::float8),4326)::geography, 10000)
            AND (r.popularity_badge IS NOT NULL OR r.popularity_saves >= 1) THEN 1
       WHEN ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(${lng}::float8,${lat}::float8),4326)::geography, 10000) THEN 2
       WHEN (r.popularity_badge IN ('top_fav', 'popular') OR r.popularity_saves >= 10) THEN 3
       ELSE 4
      END ASC,
      distance ASC NULLS LAST,
      ${relevance}
      r.popularity_saves DESC,
      r.popularity_score DESC,`
   : `${relevance}
      (r.popularity_badge = 'top_fav') DESC,
      r.popularity_saves DESC,
      r.popularity_score DESC,
      (r.image_url IS NOT NULL) DESC,`;

  const order = geoOrder + (f.group ? 'r.name,r.id' : 'r.primary_group,r.name,r.id');

  const [count, result, stats] = await Promise.all([
   readPool.query(`SELECT count(*)::int AS total FROM restaurants r WHERE ${filter}`, countArgs),
   readPool.query(
    `SELECT r.*, r.review_count AS count, r.review_avg AS average,
            CASE WHEN ${lng}::float8 IS NOT NULL AND r.location IS NOT NULL
                 THEN ST_Distance(r.location, ST_SetSRID(ST_MakePoint(${lng}::float8,${lat}::float8),4326)::geography)
                 ELSE NULL END AS distance
     FROM restaurants r
     WHERE ${filter}
     ORDER BY ${order}
     LIMIT ${limit} OFFSET ${offset}`,
    rowArgs,
   ),
   catalogueStats(f.city),
  ]);

  await hydrateMissingImages(result.rows);

  return {
   items: result.rows.map((r) => ({
    ...publicRestaurant(r),
    distance: r.distance === null ? null : Math.round(r.distance),
    open: isOpen(r.hours),
   })),
   total: count.rows[0].total,
   datasetTotal: stats.total,
   located: stats.located,
   missing: stats.total - stats.located,
   groups: stats.groups,
   cities: stats.cities,
   limit: f.limit,
   offset: f.offset,
   hasMore: f.offset + result.rows.length < count.rows[0].total,
   reference: f.lat === undefined ? null : { lat: f.lat, lng: f.lng },
   notice: 'Nhóm món được phân loại từ tên/danh mục công khai; chưa xác minh thực đơn, giá bán và trạng thái hoạt động.',
  };
 };

 if (!isCacheEnabled()) {
  const res = await compute();
  return { ...res, items: await attachWeatherToItems(res.items) };
 }
 const cell = f.lat !== undefined ? quantizePoint(f.lat, f.lng!).cell : 'nogps';
 const exKey = excludedGroups.length ? [...excludedGroups].sort().join(',') : '';
 const cacheKey = `dir:${strictLicenseMode() ? 's' : 'a'}:${f.city || 'all'}:${f.mood || ''}:${exKey}:${cell}:${f.group || ''}:${normalize(f.q)}:${f.limit}:${f.offset}`;
 const cached = await searchCache.getOrCompute(cacheKey, 20_000, compute);
 return { ...cached, items: await attachWeatherToItems(cached.items) };
}
