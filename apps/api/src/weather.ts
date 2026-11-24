import { LruCache } from './cache';

export type RawWeather = {
 tempC: number;
 apparentC: number;
 humidity: number;
 precipitation: number;
 code: number;
 isDay: boolean;
};

export type SpotWeather = {
 tempC: number;
 condition: string;
 vibe: string;
 icon: string;
 aura: 'rain' | 'cool' | 'chilly' | 'warm' | 'clear';
 isDay: boolean;
};

export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
 'ha-noi': { lat: 21.0285, lng: 105.8542 },
 'ho-chi-minh': { lat: 10.7769, lng: 106.7009 },
 'da-nang': { lat: 16.0544, lng: 108.2022 },
 'hai-phong': { lat: 20.8449, lng: 106.6881 },
 'can-tho': { lat: 10.0452, lng: 105.7469 },
 'hue': { lat: 16.4637, lng: 107.5909 },
 'nha-trang': { lat: 12.2388, lng: 109.1967 },
 'da-lat': { lat: 11.9404, lng: 108.4583 },
 'vung-tau': { lat: 10.3460, lng: 107.0843 },
 'ha-long': { lat: 20.9517, lng: 107.0748 },
};

const weatherCellCache = new LruCache<RawWeather | null>(256);

function weatherCellKey(lat: number, lng: number) {
 const rLat = (Math.round(lat * 20) / 20).toFixed(2);
 const rLng = (Math.round(lng * 20) / 20).toFixed(2);
 return `${rLat},${rLng}`;
}

async function fetchCellWeather(lat: number, lng: number): Promise<RawWeather | null> {
 if (process.env.NODE_ENV === 'test' || process.env.DISABLE_LIVE_WEATHER === 'true') return null;
 const key = weatherCellKey(lat, lng);
 return weatherCellCache.getOrCompute(key, 10 * 60_000, async () => {
  try {
   const u = new URL('https://api.open-meteo.com/v1/forecast');
   u.searchParams.set('latitude', lat.toFixed(3));
   u.searchParams.set('longitude', lng.toFixed(3));
   u.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day');
   u.searchParams.set('timezone', 'Asia/Ho_Chi_Minh');
   const res = await fetch(u, { signal: AbortSignal.timeout(1800) });
   if (!res.ok) return null;
   const data = (await res.json()) as any;
   const c = data?.current;
   if (!c || typeof c.temperature_2m !== 'number') return null;
   return {
    tempC: Math.round(c.temperature_2m),
    apparentC: Math.round(c.apparent_temperature ?? c.temperature_2m),
    humidity: Number(c.relative_humidity_2m ?? 70),
    precipitation: Number(c.precipitation ?? 0),
    code: Number(c.weather_code ?? 0),
    isDay: Boolean(c.is_day),
   };
  } catch {
   return null;
  }
 });
}

export function describeWeatherMood(w: RawWeather, groupName = ''): SpotWeather {
 const g = groupName.toLowerCase();
 const isDrink = /cà phê|trà|đồ uống|bia|bar|kem|chè/.test(g);
 const isHotSoupOrPot = /phở|bún|miến|cháo|lẩu|nướng|sốt vang|hủ tiếu|bánh canh|bánh đa|mì quảng/.test(g);

 const isStorm = w.code >= 95;
 const isRain = isStorm || (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82) || w.precipitation > 0.15;
 const isFog = w.code === 45 || w.code === 48;

 if (isRain) {
  const cond = isStorm ? 'Có dông mưa' : w.precipitation >= 2 ? 'Đang mưa' : 'Mưa nhẹ';
  const vibe = isDrink
   ? 'Ngồi quán trú mưa ấm áp'
   : isHotSoupOrPot
    ? 'Trời mưa hợp món nóng hổi'
    : 'Mưa dịu mát · tiện ghé quán';
  return { tempC: w.tempC, condition: cond, vibe, icon: isStorm ? '⛈️' : '🌧️', aura: 'rain', isDay: w.isDay };
 }

 if (w.tempC <= 19) {
  const vibe = isDrink
   ? 'Se lạnh · hợp đồ uống ấm'
   : isHotSoupOrPot
    ? 'Se lạnh · xì xụp bát nóng quá chuẩn'
    : 'Trời se lạnh dễ chịu';
  return { tempC: w.tempC, condition: 'Trời se lạnh', vibe, icon: w.isDay ? '🌥️' : '❄️', aura: 'chilly', isDay: w.isDay };
 }

 if (w.tempC >= 32) {
  const vibe = isDrink
   ? 'Oi nóng · giải nhiệt cực đã'
   : 'Trời nóng · ưu tiên quán mát';
  return { tempC: w.tempC, condition: w.isDay ? 'Trời nắng nóng' : 'Khá oi', vibe, icon: w.isDay ? '☀️' : '🌡️', aura: 'warm', isDay: w.isDay };
 }

 if (w.tempC <= 26) {
  const cond = isFog ? 'Sương nhẹ' : w.isDay ? 'Trời mát mẻ' : 'Đêm mát dịu';
  const vibe = isDrink
   ? 'Thời tiết đẹp để ngồi chill'
   : 'Tiết trời mát · đi ăn rất hợp';
  return {
   tempC: w.tempC,
   condition: cond,
   vibe,
   icon: w.isDay ? (w.code <= 2 ? '🌤️' : '⛅') : '🌙',
   aura: 'cool',
   isDay: w.isDay,
  };
 }

 return {
  tempC: w.tempC,
  condition: w.isDay ? 'Nắng dịu' : 'Trời thoáng đãng',
  vibe: isDrink ? 'Làm cốc mát lạnh sảng khoái' : 'Thời tiết thuận lợi ghé quán',
  icon: w.isDay ? '⛅' : '🌙',
  aura: 'clear',
  isDay: w.isDay,
 };
}

export async function attachWeatherToItems<
 T extends { lat?: number | null; lng?: number | null; city_slug?: string; primary_group?: string },
>(items: T[]): Promise<(T & { weather: SpotWeather | null })[]> {
 if (!items.length) return [];
 const uniqueCells = new Map<string, { lat: number; lng: number }>();
 for (const item of items) {
  const fallback = CITY_CENTERS[item.city_slug || 'ha-noi'] || CITY_CENTERS['ha-noi'];
  const lat = typeof item.lat === 'number' ? item.lat : fallback.lat;
  const lng = typeof item.lng === 'number' ? item.lng : fallback.lng;
  uniqueCells.set(weatherCellKey(lat, lng), { lat, lng });
 }

 const cellWeather = new Map<string, RawWeather | null>();
 await Promise.all(
  [...uniqueCells.entries()].map(async ([cell, coords]) => {
   cellWeather.set(cell, await fetchCellWeather(coords.lat, coords.lng));
  }),
 );

 return items.map((item) => {
  const fallback = CITY_CENTERS[item.city_slug || 'ha-noi'] || CITY_CENTERS['ha-noi'];
  const lat = typeof item.lat === 'number' ? item.lat : fallback.lat;
  const lng = typeof item.lng === 'number' ? item.lng : fallback.lng;
  const raw = cellWeather.get(weatherCellKey(lat, lng)) ?? null;
  return {
   ...item,
   weather: raw ? describeWeatherMood(raw, item.primary_group || '') : null,
  };
 });
}
