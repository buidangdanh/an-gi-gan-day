'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
 AccountHubData,
 AccountPreferences,
 api,
 AreaPreset,
 CategoryKind,
 CITY_STORAGE_KEY,
 CitySlug,
 DRINK_MOOD_OPTIONS,
 FOOD_MOOD_OPTIONS,
 getCityMeta,
 MAJOR_CITIES,
 nearestCityFromCoords,
 parseSavedDefaultLocation,
 Restaurant,
 SuggestionMood,
} from '../api';
import { currentDistanceMeters } from '../current-distance';
import { CardActionSheet, ProCompareModal, SuggestionCard } from '../suggestion-card';
import { HeaderBar, loadSavedPlaces, SavedPlace, SAVED_PLACES_KEY, toggleLocalSavedPlace } from '../header-bar';
import { siteName } from '../brand';
import { withMapTab } from '../map-tab';

type Catalogue = { items: Restaurant[]; hasMore: boolean; page?: number; mood?: SuggestionMood };
type OriginState = { lat: number; lng: number; label: string; mode: 'gps' | 'preset'; presetId?: string };

function quantizeForQuery(lat: number, lng: number) {
 const qLat = Math.round(lat / 0.00135) * 0.00135;
 const qLng = Math.round(lng / 0.00145) * 0.00145;
 return { lat: Number(qLat.toFixed(4)), lng: Number(qLng.toFixed(4)) };
}

function getMealGreeting(hour: number, kind: CategoryKind): { heading: string; accent: string; hint: string } {
 if (kind === 'drink') {
  if (hour >= 5 && hour < 11) return { heading: 'Sáng nay uống gì', accent: 'cho tỉnh táo?', hint: '4 quán đồ uống hoàn toàn tách biệt với đồ ăn.' };
  if (hour >= 11 && hour < 17) return { heading: 'Trưa chiều uống gì', accent: 'mát lạnh ngay?', hint: 'Cà phê, trà sữa, trà trái cây — 4 gợi ý thuần đồ uống.' };
  return { heading: 'Tối nay ngồi đâu', accent: 'nhâm nhi trò chuyện?', hint: '4 gợi ý thuần đồ uống kèm thời tiết quanh quán.' };
 }
 if (hour >= 5 && hour < 10) return { heading: 'Sáng nay ăn gì', accent: 'ấm bụng đây?', hint: '4 món ăn khác nhau — không lẫn đồ uống.' };
 if (hour >= 10 && hour < 14) return { heading: 'Trưa nay ăn gì', accent: 'đỡ phải nghĩ?', hint: '4 món ăn khác hẳn nhau, ưu tiên quán được yêu thích.' };
 if (hour >= 14 && hour < 17) return { heading: 'Chiều hơi đói,', accent: 'ăn nhẹ món gì?', hint: 'Chạm vào bất kỳ thẻ nào để mở tùy chọn nhanh.' };
 if (hour >= 17 && hour < 21) return { heading: 'Tối nay đổi vị', accent: 'món ngon nào?', hint: '4 món ăn tách biệt rõ ràng — bấm là đi ngay.' };
 return { heading: 'Đêm muộn rồi,', accent: 'ăn gì ấm bụng?', hint: 'Đổi nhanh 4 món khác nếu chưa đúng ý.' };
}

function buildUrl(
 city: CitySlug,
 page: number,
 mood: SuggestionMood,
 ref: OriginState | null,
 excludedGroups: string[],
 proBoost: boolean,
) {
 const params = new URLSearchParams({ suggestions: 'true', city, page: String(page), mood });
 if (excludedGroups.length) params.set('excludeGroups', excludedGroups.join(','));
 if (proBoost) params.set('proBoost', 'true');
 if (ref) {
  const q = quantizeForQuery(ref.lat, ref.lng);
  params.set('lat', String(q.lat));
  params.set('lng', String(q.lng));
 }
 return '/directory?' + params.toString();
}

export default function Hanoi() {
 const router = useRouter();
 const [city, setCity] = useState<CitySlug>('ha-noi');
 const [cityReady, setCityReady] = useState(false);
 const [kind, setKind] = useState<CategoryKind>('food');
 const [mood, setMood] = useState<SuggestionMood>('all');
 const [data, setData] = useState<Catalogue | null>(null);
 const [page, setPage] = useState(0);
 const [quickQuery, setQuickQuery] = useState('');
 const [hour, setHour] = useState(12);

 const [exactGps, setExactGps] = useState<{ lat: number; lng: number } | null>(null);
 const [origin, setOrigin] = useState<OriginState | null>(null);
 const [areaOpen, setAreaOpen] = useState(false);
 const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'ready' | 'denied'>('idle');

 const [error, setError] = useState('');
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [gate, setGate] = useState('');
 const [retry, setRetry] = useState(0);

 // Account Hub (Guest / Thường / Pro)
 const [hub, setHub] = useState<AccountHubData | null>(null);
 const [openHubTab, setOpenHubTab] = useState<'profile' | 'saved' | 'personalize' | 'plans' | null>(null);
 const [localSaved, setLocalSaved] = useState<SavedPlace[]>([]);

 // Active Card Sheet + Pro Compare Tray
 const [activeCard, setActiveCard] = useState<{ restaurant: Restaurant; distance: number | null } | null>(null);
 const [compareItems, setCompareItems] = useState<{ restaurant: Restaurant; distance: number | null }[]>([]);
 const [compareOpen, setCompareOpen] = useState(false);

 // "Chốt hộ 1 món" spotlight state
 const [picking, setPicking] = useState(false);
 const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
 const [pickedIdx, setPickedIdx] = useState<number | null>(null);

 const originRef = useRef<OriginState | null>(null);
 const manualCityPickedRef = useRef(false);
 const watchId = useRef<number | undefined>(undefined);
 const requestSeq = useRef(0);
 const prefetchCache = useRef<Map<string, Catalogue>>(new Map());
 const searchInputRef = useRef<HTMLInputElement>(null);

 const activeCity = useMemo(() => getCityMeta(city), [city]);

 const saveCityChoice = useCallback((nextCity: CitySlug, manual = true) => {
  if (manual) manualCityPickedRef.current = true;
  setCity(nextCity);
  try {
   window.localStorage.setItem(CITY_STORAGE_KEY, nextCity);
  } catch {}
 }, []);

 const refreshHub = useCallback(async () => {
  try {
   const h = await api<AccountHubData>('/account/hub');
   setHub(h);
   if (h?.preferences?.default_area && !originRef.current && !manualCityPickedRef.current) {
    const parsed = parseSavedDefaultLocation(h.preferences.default_area);
    if (parsed) {
     setCity(parsed.city);
     if (parsed.preset) {
      const nextOrigin: OriginState = {
       lat: parsed.preset.lat,
       lng: parsed.preset.lng,
       label: parsed.preset.label,
       mode: 'preset',
       presetId: parsed.preset.id,
      };
      originRef.current = nextOrigin;
      setOrigin(nextOrigin);
     }
    }
   }
   return h;
  } catch {
   return null;
  }
 }, []);

 useEffect(() => {
  setHour(new Date().getHours());
  setLocalSaved(loadSavedPlaces());
  try {
   const sp = new URLSearchParams(window.location.search);
   const urlCity = sp.get('city');
   const storedCity = window.localStorage.getItem(CITY_STORAGE_KEY);
   if (urlCity && MAJOR_CITIES.some((c) => c.slug === urlCity)) {
    manualCityPickedRef.current = true;
    setCity(urlCity as CitySlug);
    window.localStorage.setItem(CITY_STORAGE_KEY, urlCity);
   } else if (storedCity && MAJOR_CITIES.some((c) => c.slug === storedCity)) {
    manualCityPickedRef.current = true;
    setCity(storedCity as CitySlug);
   }
  } catch {}
  setCityReady(true);
  refreshHub();
 }, [refreshHub]);

 const isPro = Boolean(hub?.user?.pro);
 const activeExcluded = useMemo(
  () => (isPro ? hub?.preferences?.excluded_groups ?? [] : []),
  [isPro, hub?.preferences?.excluded_groups],
 );
 const activeProBoost = Boolean(isPro && (hub?.preferences?.pro_boost ?? true));

 const likedIdSet = useMemo(() => {
  if (hub?.user) return new Set((hub.favorites ?? []).map((f) => f.id));
  return new Set(localSaved.map((f) => f.id));
 }, [hub?.user, hub?.favorites, localSaved]);

 const notesById = useMemo(() => {
  const map: Record<string, string> = {};
  for (const n of hub?.notes ?? []) map[n.restaurant_id] = n.note;
  return map;
 }, [hub?.notes]);

 const toggleLike = useCallback(
  async (r: Restaurant) => {
   if (!hub?.user) {
    setLocalSaved((prev) => toggleLocalSavedPlace(prev, r));
    return;
   }
   const currentlyLiked = (hub.favorites ?? []).some((f) => f.id === r.id);
   try {
    await api('/restaurants/' + r.id + '/favorite', currentlyLiked ? 'DELETE' : 'POST');
    await refreshHub();
   } catch (e) {
    setError((e as Error).message);
    setOpenHubTab('plans');
   }
  },
  [hub, refreshHub],
 );

 const removeLocalSaved = useCallback((id: string) => {
  setLocalSaved((prev) => {
   const next = prev.filter((x) => x.id !== id);
   try {
    window.localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
   } catch {}
   return next;
  });
 }, []);

 const toggleCompare = useCallback((r: Restaurant, dist: number | null = null) => {
  setCompareItems((prev) => {
   if (prev.some((x) => x.restaurant.id === r.id)) {
    return prev.filter((x) => x.restaurant.id !== r.id);
   }
   if (prev.length >= 4) return prev;
   return [...prev, { restaurant: r, distance: dist }];
  });
 }, []);

 const handlePrefsChanged = useCallback(
  (prefs: AccountPreferences) => {
   prefetchCache.current.clear();
   setPage(0);
   if (prefs.default_area) {
    const parsed = parseSavedDefaultLocation(prefs.default_area);
    if (parsed) {
     saveCityChoice(parsed.city, true);
     if (parsed.preset) {
      const nextOrigin: OriginState = {
       lat: parsed.preset.lat,
       lng: parsed.preset.lng,
       label: parsed.preset.label,
       mode: 'preset',
       presetId: parsed.preset.id,
      };
      originRef.current = nextOrigin;
      setOrigin(nextOrigin);
     } else {
      originRef.current = null;
      setOrigin(null);
     }
    }
   }
  },
  [saveCityChoice],
 );

 const requestGps = useCallback(
  (silent = false) => {
   if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
    if (!silent) setGpsState('denied');
    return;
   }
   setGpsState('locating');
   if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
   watchId.current = navigator.geolocation.watchPosition(
    (p) => {
     const next = { lat: p.coords.latitude, lng: p.coords.longitude };
     setExactGps(next);
     setGpsState('ready');
     const detectedCity = nearestCityFromCoords(next.lat, next.lng);
     const current = originRef.current;
     if (!silent || (!manualCityPickedRef.current && !current)) {
      if (detectedCity) saveCityChoice(detectedCity.slug, !silent);
      const nextOrigin: OriginState = { ...next, label: 'Gần vị trí của bạn', mode: 'gps' };
      originRef.current = nextOrigin;
      setOrigin(nextOrigin);
      setPage(0);
     } else if (current?.mode === 'gps' && (currentDistanceMeters(current, next) ?? 0) >= 120) {
      if (detectedCity && !manualCityPickedRef.current) setCity(detectedCity.slug);
      const nextOrigin: OriginState = { ...next, label: 'Gần vị trí của bạn', mode: 'gps' };
      originRef.current = nextOrigin;
      setOrigin(nextOrigin);
      setPage(0);
     }
    },
    () => {
     setGpsState('denied');
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 },
   );
  },
  [saveCityChoice],
 );

 useEffect(() => {
  requestGps(true);
  return () => {
   if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
  };
 }, [requestGps]);

 useEffect(() => {
  if (!cityReady) return;
  const seq = ++requestSeq.current;
  const url = buildUrl(city, page, mood, origin, activeExcluded, activeProBoost);
  setPickedIdx(null);
  setHighlightIdx(null);
  setError('');

  const cached = prefetchCache.current.get(url);
  if (cached) {
   setData(cached);
   setLoading(false);
   setGate('');
  } else {
   setLoading(true);
  }

  const loadCurrent = cached
   ? Promise.resolve(cached)
   : api<Catalogue>(url).then((result) => {
      prefetchCache.current.set(url, result);
      return result;
     });

  loadCurrent
   .then((result) => {
    if (seq !== requestSeq.current) return;
    setData(result);
    setGate('');
    setLoading(false);

    if (result.hasMore) {
     const nextUrl = buildUrl(city, page + 1, mood, origin, activeExcluded, activeProBoost);
     if (!prefetchCache.current.has(nextUrl)) {
      api<Catalogue>(nextUrl)
       .then((nextResult) => {
        if (prefetchCache.current.size > 80) prefetchCache.current.clear();
        prefetchCache.current.set(nextUrl, nextResult);
       })
       .catch(() => {});
     }
    }
   })
   .catch((e) => {
    if (seq === requestSeq.current) {
     setError((e as Error).message);
     setLoading(false);
    }
   });

  return () => {
   requestSeq.current++;
  };
 }, [cityReady, city, page, mood, origin, activeExcluded, activeProBoost, retry]);

 const nextFour = useCallback(() => {
  if (loading || busy || picking) return;
  if (data?.hasMore) setPage((p) => p + 1);
  else setPage(0);
 }, [loading, busy, picking, data?.hasMore]);

 useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
   const target = e.target as HTMLElement | null;
   if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
   if (activeCard || compareOpen) return;
   if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    nextFour();
   } else if (e.key === '/') {
    e.preventDefault();
    searchInputRef.current?.focus();
   }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
 }, [nextFour, activeCard, compareOpen]);

 function switchCity(nextCity: CitySlug) {
  if (nextCity === city) {
   setAreaOpen((v) => !v);
   return;
  }
  saveCityChoice(nextCity, true);
  originRef.current = null;
  setOrigin(null);
  setPage(0);
  setPickedIdx(null);
 }

 function switchKind(nextKind: CategoryKind) {
  if (nextKind === kind) return;
  setKind(nextKind);
  setMood(nextKind === 'drink' ? 'drink_all' : 'all');
  setPage(0);
  setPickedIdx(null);
 }

 function chooseMood(nextMood: SuggestionMood) {
  if (nextMood === mood) return;
  setMood(nextMood);
  setPage(0);
  setPickedIdx(null);
 }

 function chooseAreaPreset(preset: AreaPreset) {
  if (preset.city !== city) saveCityChoice(preset.city, true);
  const nextOrigin: OriginState = {
   lat: preset.lat,
   lng: preset.lng,
   label: preset.label,
   mode: 'preset',
   presetId: preset.id,
  };
  originRef.current = nextOrigin;
  setOrigin(nextOrigin);
  setPage(0);
  setAreaOpen(false);
 }

 function useDeviceGps() {
  if (exactGps) {
   const detected = nearestCityFromCoords(exactGps.lat, exactGps.lng);
   if (detected) saveCityChoice(detected.slug, true);
   const nextOrigin: OriginState = { ...exactGps, label: 'Gần vị trí của bạn', mode: 'gps' };
   originRef.current = nextOrigin;
   setOrigin(nextOrigin);
   setPage(0);
   setAreaOpen(false);
  } else {
   requestGps(false);
   setAreaOpen(false);
  }
 }

 function clearLocation() {
  originRef.current = null;
  setOrigin(null);
  setPage(0);
  setAreaOpen(false);
 }

 function quickDecide() {
  const items = data?.items ?? [];
  if (!items.length || picking || loading) return;
  setPicking(true);
  setPickedIdx(null);
  const winner = Math.floor(Math.random() * items.length);
  let step = 0;
  const totalSteps = 8 + winner;
  const timer = window.setInterval(() => {
   setHighlightIdx(step % items.length);
   step++;
   if (step > totalSteps) {
    window.clearInterval(timer);
    setHighlightIdx(null);
    setPickedIdx(winner);
    setPicking(false);
    const chosen = items[winner];
    const refPoint = origin?.mode === 'gps' && exactGps ? exactGps : origin;
    const dist = refPoint ? currentDistanceMeters(refPoint, chosen) ?? chosen.distance ?? null : null;
    setActiveCard({ restaurant: chosen, distance: dist });
   }
  }, 55);
 }

 async function visitById(id: string) {
  setBusy(true);
  setError('');
  try {
   const result = await withMapTab(
    () => api('/restaurants/' + id + '/visit', 'POST'),
    (res) => (res.requiresLogin ? undefined : res.url),
   );
   await refreshHub();
   if (result.requiresLogin) {
    setActiveCard(null);
    setGate(result.message);
    setOpenHubTab('profile');
   }
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 function submitQuickSearch(e: React.FormEvent) {
  e.preventDefault();
  const q = quickQuery.trim();
  const params = new URLSearchParams({ city });
  if (q) params.set('q', q);
  router.push('/tim-kiem?' + params.toString());
 }

 const greeting = getMealGreeting(hour, kind);
 const moodList = kind === 'drink' ? DRINK_MOOD_OPTIONS : FOOD_MOOD_OPTIONS;
 const activeMoodObj = moodList.find((m) => m.id === mood) || moodList[0];

 return (
  <main className="discovery-shell">
   <HeaderBar
    activeTab="suggest"
    hub={hub}
    localSaved={localSaved}
    externalOpenTab={openHubTab}
    onClearExternalOpen={() => setOpenHubTab(null)}
    onRefreshHub={refreshHub}
    onRemoveLocalSaved={removeLocalSaved}
    onVisitPlaceId={visitById}
    onPreferencesChanged={handlePrefsChanged}
   />

   <section className="discovery-hero" aria-label="Bắt đầu chọn món">
    {/* 1-tap City Selector Strip across 10 Major Cities */}
    <div className="city-quick-strip" role="tablist" aria-label="Chọn thành phố">
     <span className="city-strip-label" aria-hidden="true">📍 Thành phố:</span>
     {MAJOR_CITIES.map((c) => (
      <button
       key={c.slug}
       type="button"
       role="tab"
       aria-selected={city === c.slug}
       className={`city-pill${city === c.slug ? ' is-active' : ''}`}
       onClick={() => switchCity(c.slug)}
      >
       {c.label}
      </button>
     ))}
    </div>

    <div className="discovery-prompt-row">
     <div>
      <h1 className="discovery-heading">
       {greeting.heading} <em>{greeting.accent}</em>
      </h1>
      <p className="discovery-sub">
       <b>{activeCity.label}</b> · {activeMoodObj.hint}
       {activeProBoost ? ' · ⚡ Ưu tiên quán Top Yêu thích (Pro)' : ` · ${greeting.hint}`}
       {activeExcluded.length > 0 ? ` · Đang ẩn ${activeExcluded.length} món` : ''}
      </p>
     </div>

     <div className="top-controls-right">
      <div className="kind-switch" role="tablist" aria-label="Chọn Ăn hoặc Uống">
       <button
        type="button"
        role="tab"
        aria-selected={kind === 'food'}
        className={`kind-switch-btn${kind === 'food' ? ' is-active' : ''}`}
        onClick={() => switchKind('food')}
       >
        <span aria-hidden="true">🍜</span>
        <span>Món ăn</span>
       </button>
       <button
        type="button"
        role="tab"
        aria-selected={kind === 'drink'}
        className={`kind-switch-btn is-drink${kind === 'drink' ? ' is-active' : ''}`}
        onClick={() => switchKind('drink')}
       >
        <span aria-hidden="true">🧋</span>
        <span>Đồ uống</span>
       </button>
      </div>

      <button
       type="button"
       className={`location-pill-btn${origin ? ' is-located' : ''}`}
       aria-expanded={areaOpen}
       onClick={() => setAreaOpen((v) => !v)}
      >
       <span className="location-dot" aria-hidden="true" />
       <span>
        {origin
         ? `${activeCity.shortLabel} · ${origin.label.split(' · ')[0]}`
         : gpsState === 'locating'
          ? `${activeCity.shortLabel} · Đang định vị…`
          : `Quận / Khu vực · ${activeCity.shortLabel}`}
       </span>
       <span aria-hidden="true">{areaOpen ? '▴' : '▾'}</span>
      </button>
     </div>
    </div>

    {areaOpen && (
     <div className="area-drawer" role="region" aria-label="Chọn quận hoặc khu vực gần bạn">
      <div className="area-drawer-head">
       <span>Xếp 4 gợi ý gần quận / khu vực nào tại <b>{activeCity.label}</b>?</span>
       <button type="button" className="text-button" onClick={() => setAreaOpen(false)}>Đóng</button>
      </div>
      <div className="area-chips">
       <button
        type="button"
        className={`area-chip${!origin ? ' is-selected' : ''}`}
        onClick={clearLocation}
       >
        ✦ Toàn {activeCity.label}
       </button>
       <button
        type="button"
        className={`area-chip${origin?.mode === 'gps' ? ' is-selected' : ''}`}
        onClick={useDeviceGps}
       >
        ◎ Vị trí hiện tại (GPS)
       </button>
       {activeCity.districts.map((p) => (
        <button
         key={p.id}
         type="button"
         className={`area-chip${origin?.presetId === p.id || origin?.label === p.label ? ' is-selected' : ''}`}
         onClick={() => chooseAreaPreset(p)}
        >
         {p.label}
        </button>
       ))}
      </div>
      <p className="area-privacy-note">
       Riêng tư: Khoảng cách tính ngay trên thiết bị; tọa độ gửi tìm kiếm chỉ làm tròn theo ô ~150 m.
      </p>
     </div>
    )}

    <form className="quick-search-bar" onSubmit={submitQuickSearch} role="search" aria-label="Tìm nhanh món hoặc tên phố">
     <input
      ref={searchInputRef}
      type="search"
      value={quickQuery}
      onChange={(e) => setQuickQuery(e.target.value)}
      maxLength={120}
      placeholder={kind === 'drink' ? activeCity.sampleDrinkSearch : activeCity.sampleFoodSearch}
      aria-label="Tìm nhanh món ăn, đồ uống, tên quán hoặc tên phố"
     />
     <button type="submit">Tìm món ↗</button>
    </form>

    <div className="mood-strip" role="tablist" aria-label={kind === 'drink' ? 'Nhóm đồ uống' : 'Nhóm món ăn'}>
     {moodList.map((m) => (
      <button
       key={m.id}
       type="button"
       role="tab"
       aria-selected={mood === m.id}
       className={`mood-chip${kind === 'drink' ? ' is-drink' : ''}${mood === m.id ? ' is-active' : ''}`}
       onClick={() => chooseMood(m.id)}
      >
       {m.label}
      </button>
     ))}
    </div>
   </section>

   {error && (
    <div className="message error" role="alert">
     <span>{error}</span>
     <button type="button" className="text-button" onClick={() => setRetry((x) => x + 1)}>Thử lại</button>
    </div>
   )}

   {gate && <p className="message" role="status">{gate}</p>}

   {loading && !data ? (
    <div className="food-grid" aria-label="Đang tải bốn gợi ý">
     {[0, 1, 2, 3].map((i) => (
      <div className="skeleton-card" key={i} aria-hidden="true">
       <div className="skeleton-media" />
       <div className="skeleton-body">
        <div className="skeleton-line is-title" />
        <div className="skeleton-line is-sub" />
        <div className="skeleton-line is-btn" />
       </div>
      </div>
     ))}
    </div>
   ) : (
    !error &&
    data && (
     <>
      <div className="food-grid" aria-label={kind === 'drink' ? 'Bốn gợi ý đồ uống' : 'Bốn gợi ý món ăn'} aria-busy={loading}>
       {data.items.map((r, i) => {
        const refPoint = origin?.mode === 'gps' && exactGps ? exactGps : origin;
        const distance = refPoint ? currentDistanceMeters(refPoint, r) ?? r.distance ?? null : null;
        return (
         <SuggestionCard
          key={r.id}
          restaurant={r}
          index={i}
          distance={distance}
          busy={busy}
          loading={loading}
          highlighted={highlightIdx === i}
          picked={pickedIdx === i}
          liked={likedIdSet.has(r.id)}
          note={notesById[r.id]}
          onToggleLike={toggleLike}
          onSelectCard={(rest, dist) => setActiveCard({ restaurant: rest, distance: dist })}
          onVisit={(rest) => visitById(rest.id)}
         />
        );
       })}
      </div>

      {data.items.length === 0 && (
       <div className="food-search-empty" role="status">
        <span aria-hidden="true">✦</span>
        <p>Chưa có đủ quán cho thiết lập hiện tại tại {activeCity.label}. Bạn có thể chọn nhóm món khác hoặc đổi thành phố ở trên.</p>
       </div>
      )}

      {compareItems.length > 0 && (
       <div className="pro-compare-dock" role="region" aria-label="Khay so sánh quán Pro">
        <span>⚖️ Đã chọn <b>{compareItems.length}/4</b> quán để so sánh</span>
        <div className="pro-compare-dock-btns">
         <button
          type="button"
          className="pro-compare-open-btn"
          disabled={compareItems.length < 2}
          onClick={() => setCompareOpen(true)}
         >
          {compareItems.length < 2 ? 'Chọn thêm 1 quán' : 'Mở bảng so sánh ↗'}
         </button>
         <button type="button" className="pro-compare-clear-btn" onClick={() => setCompareItems([])}>
          Xóa
         </button>
        </div>
       </div>
      )}

      <div className="decision-bar">
       <button
        type="button"
        className={`shuffle-btn${kind === 'drink' ? ' is-drink' : ''}`}
        disabled={loading || busy || picking}
        onClick={nextFour}
       >
        <span>
         {loading
          ? 'Đang đổi gợi ý…'
          : data.hasMore
           ? kind === 'drink'
             ? 'Đổi 4 quán uống khác'
             : 'Đổi 4 quán ăn khác'
           : 'Quay lại từ đầu'}
        </span>
        <span aria-hidden="true">↻</span>
       </button>

       <button
        type="button"
        className="quick-pick-btn"
        disabled={loading || busy || picking || !data.items.length}
        onClick={quickDecide}
       >
        <span aria-hidden="true">✦</span>
        <span>{picking ? 'Đang chọn…' : kind === 'drink' ? 'Chốt hộ 1 quán' : 'Chốt hộ 1 món'}</span>
       </button>
      </div>

      <div className="round-meta">
       <span>
        {activeCity.label} · Lượt {page + 1} · {kind === 'drink' ? 'Thuần đồ uống' : 'Thuần món ăn'} · Chạm vào thẻ để mở nhanh các tùy chọn.
       </span>
       <span className="kbd-hint">
        Phím tắt: <kbd>R</kbd> đổi 4 quán · <kbd>/</kbd> tìm nhanh
       </span>
      </div>
     </>
    )
   )}

   <CardActionSheet
    restaurant={activeCard?.restaurant ?? null}
    distance={activeCard?.distance ?? null}
    liked={activeCard ? likedIdSet.has(activeCard.restaurant.id) : false}
    isPro={isPro}
    collections={hub?.collections ?? []}
    existingNote={activeCard ? notesById[activeCard.restaurant.id] : ''}
    inCompare={activeCard ? compareItems.some((x) => x.restaurant.id === activeCard.restaurant.id) : false}
    busy={busy}
    onClose={() => setActiveCard(null)}
    onVisit={(rest) => visitById(rest.id)}
    onToggleLike={toggleLike}
    onToggleCompare={(rest) => toggleCompare(rest, activeCard?.distance ?? null)}
    onOpenProPlans={() => setOpenHubTab('plans')}
    onRefreshHub={refreshHub}
   />

   {compareOpen && (
    <ProCompareModal
     items={compareItems}
     notesById={notesById}
     onClose={() => setCompareOpen(false)}
     onRemove={(id) => setCompareItems((prev) => prev.filter((x) => x.restaurant.id !== id))}
     onVisit={(rest) => visitById(rest.id)}
    />
   )}

   <footer className="discovery-footer">
    <span>{siteName} · 10 thành phố lớn kèm nhãn độ yêu thích & thời tiết thực tế tại quán.</span>
    <div className="discovery-footer-links">
     <a href={`/tim-kiem?city=${city}`}>Tìm món</a>
     <a href="/about">Về dữ liệu</a>
     <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
      © OpenStreetMap · ODbL
     </a>
    </div>
   </footer>
  </main>
 );
}
