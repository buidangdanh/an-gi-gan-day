'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 AccountHubData,
 AccountPreferences,
 api,
 CategoryKind,
 CITY_STORAGE_KEY,
 DRINK_MOOD_OPTIONS,
 FOOD_MOOD_OPTIONS,
 groups as ALL_STATIC_GROUPS,
 POPULAR_SEARCH_GROUPS,
 Restaurant,
 SuggestionMood,
} from '../api';
import { currentDistanceMeters } from '../current-distance';
import { CardActionSheet, ProCompareModal, SuggestionCard } from '../suggestion-card';
import { HeaderBar, loadSavedPlaces, SavedPlace, SAVED_PLACES_KEY, toggleLocalSavedPlace } from '../header-bar';
import { siteName } from '../brand';
import { withMapTab } from '../map-tab';

type CatalogueResponse = {
 items: Restaurant[];
 hasMore: boolean;
 total?: number;
 page?: number;
 mood?: SuggestionMood;
 groups?: { name: string; count: number }[];
};

type OriginState = { lat: number; lng: number; label: string };

const SEARCH_PAGE_SIZE = 8;
const DRINK_QUICK_CHIPS = ['cà phê', 'trà sữa', 'trà & đồ uống'];
const FOOD_QUICK_CHIPS = POPULAR_SEARCH_GROUPS.filter(
 (g) => !['cà phê', 'cà phê trứng', 'trà sữa', 'trà & đồ uống', 'bar & bia'].includes(g),
).slice(0, 3);

function quantizeForQuery(lat: number, lng: number) {
 const qLat = Math.round(lat / 0.00135) * 0.00135;
 const qLng = Math.round(lng / 0.00145) * 0.00145;
 return { lat: Number(qLat.toFixed(4)), lng: Number(qLng.toFixed(4)) };
}

function getMealGreeting(hour: number, kind: CategoryKind): { heading: string; accent: string } {
 if (kind === 'drink') {
  if (hour >= 5 && hour < 11) return { heading: 'Sáng nay uống gì', accent: 'cho tỉnh táo?' };
  if (hour >= 11 && hour < 17) return { heading: 'Trưa chiều uống gì', accent: 'mát lạnh ngay?' };
  return { heading: 'Tối nay ngồi đâu', accent: 'nhâm nhi trò chuyện?' };
 }
 if (hour >= 5 && hour < 10) return { heading: 'Sáng nay ăn gì', accent: 'ấm bụng đây?' };
 if (hour >= 10 && hour < 14) return { heading: 'Trưa nay ăn gì', accent: 'đỡ phải nghĩ?' };
 if (hour >= 14 && hour < 17) return { heading: 'Chiều hơi đói,', accent: 'ăn nhẹ món gì?' };
 if (hour >= 17 && hour < 21) return { heading: 'Tối nay đổi vị', accent: 'món ngon nào?' };
 return { heading: 'Đêm muộn rồi,', accent: 'ăn gì ấm bụng?' };
}

function popularityBand(r: Restaurant, dist: number | null): number {
 const beloved = r.popularity_badge === 'top_fav' || r.popularity_badge === 'popular' || (r.popularity_saves ?? 0) >= 10;
 const rated = r.popularity_badge != null || (r.popularity_saves ?? 0) >= 1;
 if (dist === null) return beloved ? 4 : 5;
 if (dist <= 10000) {
  if (beloved) return 0;
  if (rated) return 1;
  return 2;
 }
 return beloved ? 3 : 4;
}

function buildSuggestionsUrl(
 page: number,
 mood: SuggestionMood,
 ref: OriginState | null,
 excludedGroups: string[],
 proBoost: boolean,
) {
 const params = new URLSearchParams({ suggestions: 'true', page: String(page), mood });
 if (excludedGroups.length) params.set('excludeGroups', excludedGroups.join(','));
 if (proBoost) params.set('proBoost', 'true');
 if (ref) {
  const q = quantizeForQuery(ref.lat, ref.lng);
  params.set('lat', String(q.lat));
  params.set('lng', String(q.lng));
 }
 return '/directory?' + params.toString();
}

function buildSearchUrl(
 page: number,
 qText: string,
 group: string,
 mood: SuggestionMood,
 ref: OriginState | null,
 excludedGroups: string[],
) {
 const params = new URLSearchParams({
  limit: String(SEARCH_PAGE_SIZE),
  offset: String(page * SEARCH_PAGE_SIZE),
 });
 if (qText) params.set('q', qText);
 if (group) params.set('group', group);
 // Only constrain mood in search when user hasn't typed a free-text query and hasn't chosen a specific dish
 if (!qText && !group && mood !== 'all') params.set('mood', mood);
 if (excludedGroups.length) params.set('excludeGroups', excludedGroups.join(','));
 if (ref) {
  const q = quantizeForQuery(ref.lat, ref.lng);
  params.set('lat', String(q.lat));
  params.set('lng', String(q.lng));
 }
 return '/directory?' + params.toString();
}

export default function UnifiedDiscovery() {
 const [kind, setKind] = useState<CategoryKind>('food');
 const [mood, setMood] = useState<SuggestionMood>('all');
 const [query, setQuery] = useState('');
 const [debouncedQuery, setDebouncedQuery] = useState('');
 const [selectedGroup, setSelectedGroup] = useState('');
 const [groupCounts, setGroupCounts] = useState<{ name: string; count: number }[]>([]);

 const [data, setData] = useState<CatalogueResponse | null>(null);
 const [page, setPage] = useState(0);
 const [hour, setHour] = useState(12);

 const [exactGps, setExactGps] = useState<{ lat: number; lng: number } | null>(null);
 const [origin, setOrigin] = useState<OriginState | null>(null);
 const [gpsState, setGpsState] = useState<'locating' | 'ready' | 'denied'>('locating');
 const [gpsResolved, setGpsResolved] = useState(false);

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
 const watchId = useRef<number | undefined>(undefined);
 const requestSeq = useRef(0);
 const prefetchCache = useRef<Map<string, CatalogueResponse>>(new Map());
 const searchInputRef = useRef<HTMLInputElement>(null);

 const isSearchMode = Boolean(debouncedQuery || selectedGroup);

 const refreshHub = useCallback(async () => {
  try {
   const h = await api<AccountHubData>('/account/hub');
   setHub(h);
   return h;
  } catch {
   return null;
  }
 }, []);

 useEffect(() => {
  setHour(new Date().getHours());
  setLocalSaved(loadSavedPlaces());
  try {
   window.localStorage.removeItem(CITY_STORAGE_KEY);
   const sp = new URLSearchParams(window.location.search);
   const initialQ = sp.get('q') || '';
   const initialGroup = sp.get('group') || '';
   if (initialQ) {
    setQuery(initialQ);
    setDebouncedQuery(initialQ);
   }
   if (initialGroup) setSelectedGroup(initialGroup);
  } catch {}
  refreshHub();
  fetch('/api/analytics/visit', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ path: window.location.pathname || '/' }),
   keepalive: true,
  }).catch(() => {});
 }, [refreshHub]);

 useEffect(() => {
  const t = window.setTimeout(() => {
   setDebouncedQuery((prev) => {
    const next = query.trim();
    if (prev !== next) setPage(0);
    return next;
   });
  }, 200);
  return () => window.clearTimeout(t);
 }, [query]);

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

 const guestLikedIdSet = useMemo(() => {
  if (hub?.user) return new Set<string>();
  return new Set(localSaved.map((f) => f.id));
 }, [hub?.user, localSaved]);

 const withEffectiveSaves = useCallback(
  (r: Restaurant): Restaurant => {
   const item = r as Restaurant & { _guestBoosted?: boolean };
   const guestLiked = guestLikedIdSet.has(item.id);
   if (guestLiked && !item._guestBoosted) {
    const nextSaves = (item.popularity_saves ?? 0) + 1;
    return {
     ...item,
     popularity_saves: nextSaves,
     popularity_badge: item.popularity_badge ?? 'worth_try',
     _guestBoosted: true,
    } as Restaurant;
   }
   if (!guestLiked && item._guestBoosted) {
    return {
     ...item,
     popularity_saves: Math.max(0, (item.popularity_saves ?? 0) - 1),
     _guestBoosted: false,
    } as Restaurant;
   }
   return item;
  },
  [guestLikedIdSet],
 );

 const patchRestaurantSaves = useCallback(
  (id: string, computeNext: (prev: number) => number, exact?: boolean) => {
   const patchItem = (raw: Restaurant): Restaurant => {
    if (raw.id !== id) return raw;
    const item = raw as Restaurant & { _guestBoosted?: boolean };
    const baseSaves = item._guestBoosted && exact ? Math.max(0, (item.popularity_saves ?? 0) - 1) : item.popularity_saves ?? 0;
    const nextSaves = Math.max(0, computeNext(baseSaves));
    return {
     ...item,
     popularity_saves: nextSaves,
     popularity_badge: nextSaves > 0 ? (item.popularity_badge ?? 'worth_try') : item.popularity_badge,
     _guestBoosted: false,
    } as Restaurant;
   };
   setData((prev) => (prev ? { ...prev, items: prev.items.map(patchItem) } : prev));
   setActiveCard((prev) => (prev && prev.restaurant.id === id ? { ...prev, restaurant: patchItem(prev.restaurant) } : prev));
   setCompareItems((prev) => prev.map((x) => (x.restaurant.id === id ? { ...x, restaurant: patchItem(x.restaurant) } : x)));
   for (const [k, v] of prefetchCache.current.entries()) {
    if (v.items.some((it) => it.id === id)) {
     prefetchCache.current.set(k, { ...v, items: v.items.map(patchItem) });
    }
   }
  },
  [],
 );

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
   const delta = currentlyLiked ? -1 : 1;
   setHub((prev) => {
    if (!prev) return prev;
    const prevFavs = prev.favorites ?? [];
    const nextFavs = currentlyLiked
     ? prevFavs.filter((f) => f.id !== r.id)
     : [
        {
         id: r.id,
         name: r.name,
         address: r.address,
         city_slug: r.city_slug,
         primary_group: r.primary_group,
         image_url: r.image_url,
         popularity_badge: r.popularity_badge ?? 'worth_try',
        },
        ...prevFavs,
       ];
    return { ...prev, favorites: nextFavs };
   });
   patchRestaurantSaves(r.id, (prev) => prev + delta);
   try {
    const res = await api<{ ok: boolean; popularity_saves?: number }>(
     '/restaurants/' + r.id + '/favorite',
     currentlyLiked ? 'DELETE' : 'POST',
    );
    if (typeof res?.popularity_saves === 'number') {
     patchRestaurantSaves(r.id, () => res.popularity_saves!, true);
    }
    await refreshHub();
   } catch (e) {
    patchRestaurantSaves(r.id, (prev) => prev - delta);
    await refreshHub();
    setError((e as Error).message);
    setOpenHubTab('plans');
   }
  },
  [hub, patchRestaurantSaves, refreshHub],
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

 const handlePrefsChanged = useCallback((_prefs: AccountPreferences) => {
  prefetchCache.current.clear();
  setPage(0);
 }, []);

 const applyCoords = useCallback((lat: number, lng: number, forceUpdate = false) => {
  const next = { lat, lng };
  setExactGps(next);
  setGpsState('ready');
  setGpsResolved(true);
  const current = originRef.current;
  if (!current || forceUpdate || (currentDistanceMeters(current, next) ?? 0) >= 120) {
   const nextOrigin: OriginState = { lat, lng, label: 'Vị trí của bạn' };
   originRef.current = nextOrigin;
   setOrigin(nextOrigin);
   setPage(0);
  }
 }, []);

 const requestGps = useCallback(
  (forceRefresh = false) => {
   if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
    setGpsState('denied');
    setGpsResolved(true);
    return;
   }
   setGpsState('locating');

   navigator.geolocation.getCurrentPosition(
    (p) => applyCoords(p.coords.latitude, p.coords.longitude, forceRefresh),
    () => {
     if (!originRef.current) setGpsState('denied');
     setGpsResolved(true);
    },
    { enableHighAccuracy: false, timeout: 6000, maximumAge: forceRefresh ? 0 : 60000 },
   );

   if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
   watchId.current = navigator.geolocation.watchPosition(
    (p) => applyCoords(p.coords.latitude, p.coords.longitude, false),
    () => {
     if (!originRef.current) setGpsState('denied');
     setGpsResolved(true);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
   );
  },
  [applyCoords],
 );

 useEffect(() => {
  const fallbackTimer = window.setTimeout(() => {
   setGpsResolved(true);
  }, 3000);
  requestGps(false);
  return () => {
   window.clearTimeout(fallbackTimer);
   if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
  };
 }, [requestGps]);

 useEffect(() => {
  if (!gpsResolved) return;
  const seq = ++requestSeq.current;
  const url = isSearchMode
   ? buildSearchUrl(page, debouncedQuery, selectedGroup, mood, origin, activeExcluded)
   : buildSuggestionsUrl(page, mood, origin, activeExcluded, activeProBoost);

  setPickedIdx(null);
  setHighlightIdx(null);
  setError('');

  const cached = prefetchCache.current.get(url);
  if (cached) {
   setData(cached);
   if (cached.groups?.length) setGroupCounts(cached.groups);
   setLoading(false);
   setGate('');
  } else {
   setLoading(true);
  }

  const loadCurrent = cached
   ? Promise.resolve(cached)
   : api<CatalogueResponse>(url).then((result) => {
      prefetchCache.current.set(url, result);
      return result;
     });

  loadCurrent
   .then((result) => {
    if (seq !== requestSeq.current) return;
    setData(result);
    if (result.groups?.length) setGroupCounts(result.groups);
    setGate('');
    setLoading(false);

    if (result.hasMore) {
     const nextUrl = isSearchMode
      ? buildSearchUrl(page + 1, debouncedQuery, selectedGroup, mood, origin, activeExcluded)
      : buildSuggestionsUrl(page + 1, mood, origin, activeExcluded, activeProBoost);
     if (!prefetchCache.current.has(nextUrl)) {
      api<CatalogueResponse>(nextUrl)
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
 }, [gpsResolved, isSearchMode, page, mood, debouncedQuery, selectedGroup, origin, activeExcluded, activeProBoost, retry]);

 // Compute exact live distance from device GPS and enforce strict nearest-to-farthest order
 const displayedCards = useMemo(() => {
  if (!data?.items) return [];
  const refPoint = exactGps || origin;
  const withDist = data.items.map((raw) => {
   const r = withEffectiveSaves(raw);
   return {
    restaurant: r,
    distance: refPoint ? currentDistanceMeters(refPoint, r) ?? r.distance ?? null : null,
   };
  });

  if (!refPoint) return withDist;

  if (!isSearchMode) {
   // 4 distinct suggestion cards: strictly sort from nearest to farthest on screen
   return [...withDist].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }

  // Search mode: preserve beloved-first priority bands, strictly nearest-to-farthest inside each band
  return [...withDist].sort((a, b) => {
   const bandDiff = popularityBand(a.restaurant, a.distance) - popularityBand(b.restaurant, b.distance);
   if (bandDiff !== 0) return bandDiff;
   const distDiff = (a.distance ?? Infinity) - (b.distance ?? Infinity);
   if (distDiff !== 0) return distDiff;
   return (b.restaurant.popularity_saves ?? 0) - (a.restaurant.popularity_saves ?? 0);
  });
 }, [data?.items, exactGps, origin, isSearchMode]);

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
   if (!isSearchMode && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault();
    nextFour();
   } else if (e.key === '/') {
    e.preventDefault();
    searchInputRef.current?.focus();
   }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
 }, [nextFour, activeCard, compareOpen, isSearchMode]);

 function resetToFourSuggestions() {
  setQuery('');
  setDebouncedQuery('');
  setSelectedGroup('');
  setPage(0);
  setPickedIdx(null);
 }

 function switchKind(nextKind: CategoryKind) {
  if (nextKind === kind && !isSearchMode) return;
  setKind(nextKind);
  setMood(nextKind === 'drink' ? 'drink_all' : 'all');
  setSelectedGroup('');
  setPage(0);
  setPickedIdx(null);
 }

 function chooseMood(nextMood: SuggestionMood) {
  setMood(nextMood);
  setSelectedGroup('');
  setQuery('');
  setDebouncedQuery('');
  setPage(0);
  setPickedIdx(null);
 }

 function toggleGroupChip(g: string) {
  setSelectedGroup((prev) => (prev === g ? '' : g));
  setPage(0);
  setPickedIdx(null);
 }

 function quickDecide() {
  if (!displayedCards.length || picking || loading) return;
  setPicking(true);
  setPickedIdx(null);
  const winner = Math.floor(Math.random() * displayedCards.length);
  let step = 0;
  const totalSteps = 8 + winner;
  const timer = window.setInterval(() => {
   setHighlightIdx(step % displayedCards.length);
   step++;
   if (step > totalSteps) {
    window.clearInterval(timer);
    setHighlightIdx(null);
    setPickedIdx(winner);
    setPicking(false);
    const chosen = displayedCards[winner];
    setActiveCard({ restaurant: chosen.restaurant, distance: chosen.distance });
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

 function handleSearchSubmit(e: React.FormEvent) {
  e.preventDefault();
  setDebouncedQuery(query.trim());
  setPage(0);
  searchInputRef.current?.blur();
 }

 const greeting = getMealGreeting(hour, kind);
 const moodList = kind === 'drink' ? DRINK_MOOD_OPTIONS : FOOD_MOOD_OPTIONS;
 const quickChips = (kind === 'drink' ? DRINK_QUICK_CHIPS : FOOD_QUICK_CHIPS).slice(0, 3);

 return (
  <main className="discovery-shell">
   <HeaderBar
    hub={hub}
    localSaved={localSaved}
    externalOpenTab={openHubTab}
    onClearExternalOpen={() => setOpenHubTab(null)}
    onRefreshHub={refreshHub}
    onRemoveLocalSaved={removeLocalSaved}
    onFavoriteChanged={(id, exactSaves) =>
     patchRestaurantSaves(id, (prev) => (typeof exactSaves === 'number' ? exactSaves : prev - 1), typeof exactSaves === 'number')
    }
    onVisitPlaceId={visitById}
    onPreferencesChanged={handlePrefsChanged}
    onResetHome={resetToFourSuggestions}
   />

   <section className="discovery-hero" aria-label="Gợi ý và tìm kiếm quán ăn uống gần bạn">
    <div className="discovery-prompt-row">
     <div>
      <h1 className="discovery-heading">
       {greeting.heading} <em>{greeting.accent}</em>
      </h1>
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
       onClick={() => requestGps(true)}
       title="Cập nhật vị trí hiện tại của bạn"
      >
       <span className="location-dot" aria-hidden="true" />
       <span>
        {origin
         ? 'Vị trí của bạn'
         : gpsState === 'locating'
          ? 'Đang lấy vị trí…'
          : 'Lấy vị trí của bạn'}
       </span>
      </button>
     </div>
    </div>

    {/* Unified Instant Search + Specific Dish Filter */}
    <form className="unified-search-row" onSubmit={handleSearchSubmit} role="search" aria-label="Tìm trực tiếp món ăn, đồ uống, quán hoặc tên đường">
     <div className="unified-search-input-wrap">
      <span className="unified-search-icon" aria-hidden="true">🔎</span>
      <input
       ref={searchInputRef}
       type="search"
       value={query}
       onChange={(e) => setQuery(e.target.value)}
       maxLength={120}
       placeholder={
        kind === 'drink'
         ? 'Gõ tìm cà phê, trà sữa, tên quán hoặc tên đường gần bạn…'
         : 'Gõ tìm phở bò, cơm tấm, bún chả, hủ tiếu, tên quán hoặc đường…'
       }
       aria-label="Tìm trực tiếp món ăn, đồ uống, tên quán hoặc tên đường"
      />
      {query && (
       <button
        type="button"
        className="search-clear-btn"
        onClick={() => {
         setQuery('');
         setDebouncedQuery('');
         setPage(0);
         searchInputRef.current?.focus();
        }}
        aria-label="Xóa từ khóa tìm kiếm"
       >
        ×
       </button>
      )}
     </div>
    </form>

    {/* Mood Tabs (4-card modes) */}
    <div className="mood-strip" role="tablist" aria-label={kind === 'drink' ? 'Nhóm đồ uống' : 'Nhóm món ăn'}>
     {moodList.map((m) => (
      <button
       key={m.id}
       type="button"
       role="tab"
       aria-selected={!isSearchMode && mood === m.id}
       className={`mood-chip${kind === 'drink' ? ' is-drink' : ''}${!isSearchMode && mood === m.id ? ' is-active' : ''}`}
       onClick={() => chooseMood(m.id)}
      >
       {m.label}
      </button>
     ))}
    </div>

    {/* One-tap Popular Dish Filter Chips */}
    <div className="popular-chips is-compact" role="group" aria-label="Chọn nhanh món yêu thích">
     <span className="popular-chips-label">Tìm nhanh:</span>
     {quickChips.map((g) => (
      <button
       key={g}
       type="button"
       className={`popular-chip${selectedGroup === g ? ' is-selected' : ''}`}
       onClick={() => toggleGroupChip(g)}
      >
       {g}
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
    <div className="food-grid" aria-label="Đang tải danh sách quán">
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
      {isSearchMode && (
       <div className="food-search-caption" role="status">
        <div className="search-caption-left">
         <b>
          {(data.total ?? displayedCards.length).toLocaleString('vi-VN')} quán
          {selectedGroup ? ` · ${selectedGroup}` : ''}
          {debouncedQuery ? ` · “${debouncedQuery}”` : ''}
         </b>
         <button type="button" className="back-to-four-btn" onClick={resetToFourSuggestions}>
          ← Về 4 gợi ý
         </button>
        </div>
        <span>
         {origin
          ? '🔥 Ưu tiên nhiều lượt yêu thích · Xếp gần → xa'
          : '🔥 Ưu tiên nhiều lượt yêu thích · Bật vị trí để xếp gần → xa'}
        </span>
       </div>
      )}

      <div
       className="food-grid"
       aria-label={isSearchMode ? 'Kết quả tìm kiếm quán' : kind === 'drink' ? 'Bốn gợi ý đồ uống' : 'Bốn gợi ý món ăn'}
       aria-busy={loading}
      >
       {displayedCards.map(({ restaurant: r, distance }, i) => (
        <SuggestionCard
         key={r.id}
         restaurant={r}
         index={!isSearchMode ? i : page * SEARCH_PAGE_SIZE + i < 9 ? page * SEARCH_PAGE_SIZE + i : undefined}
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
       ))}
      </div>

      {displayedCards.length === 0 && !loading && (
       <div className="food-search-empty" role="status">
        <span aria-hidden="true">✦</span>
        <p>
         {isSearchMode
          ? 'Chưa thấy quán nào khớp từ khóa này. Thử gõ ngắn hơn hoặc quay về 4 gợi ý.'
          : 'Chưa có đủ quán cho thiết lập hiện tại. Bạn có thể chọn nhóm món khác ở trên.'}
        </p>
        {isSearchMode && (
         <button type="button" className="back-to-four-btn" onClick={resetToFourSuggestions}>
          ← Quay về 4 gợi ý
         </button>
        )}
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

      {isSearchMode ? (
       (page > 0 || data.hasMore) && (
        <nav className="food-search-pager" aria-label="Phân trang kết quả tìm kiếm">
         <button type="button" className="secondary" disabled={page === 0 || loading} onClick={() => setPage((v) => v - 1)}>
          ← Trang trước
         </button>
         <span>Trang {page + 1}</span>
         <button type="button" className="secondary" disabled={!data.hasMore || loading} onClick={() => setPage((v) => v + 1)}>
          Xem tiếp gần → xa →
         </button>
        </nav>
       )
      ) : (
       <>
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
          disabled={loading || busy || picking || !displayedCards.length}
          onClick={quickDecide}
         >
          <span aria-hidden="true">✦</span>
          <span>{picking ? 'Đang chọn…' : kind === 'drink' ? 'Chốt hộ 1 quán' : 'Chốt hộ 1 món'}</span>
         </button>
        </div>

        <div className="round-meta">
         <span>
          Lượt {page + 1} · Ưu tiên nhiều lượt yêu thích · Xếp từ gần đến xa
         </span>
         <span className="kbd-hint">
          Phím tắt: <kbd>R</kbd> đổi 4 quán · <kbd>/</kbd> gõ tìm ngay
         </span>
        </div>
       </>
      )}
     </>
    )
   )}

   <CardActionSheet
    restaurant={activeCard ? withEffectiveSaves(activeCard.restaurant) : null}
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
     items={compareItems.map((x) => ({ ...x, restaurant: withEffectiveSaves(x.restaurant) }))}
     notesById={notesById}
     onClose={() => setCompareOpen(false)}
     onRemove={(id) => setCompareItems((prev) => prev.filter((x) => x.restaurant.id !== id))}
     onVisit={(rest) => visitById(rest.id)}
    />
   )}

   <footer className="discovery-footer">
    <span>{siteName} · Ưu tiên quán nhiều lượt yêu thích, sắp xếp từ gần đến xa.</span>
    <div className="discovery-footer-links">
     <a href="/about">Về dữ liệu</a>
     <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
      © OpenStreetMap · ODbL
     </a>
    </div>
   </footer>
  </main>
 );
}
