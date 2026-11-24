'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 AccountHubData,
 api,
 POPULAR_SEARCH_GROUPS,
 Restaurant,
} from '../api';
import { CardActionSheet, ProCompareModal, SuggestionCard } from '../suggestion-card';
import { HeaderBar, loadSavedPlaces, SavedPlace, SAVED_PLACES_KEY, toggleLocalSavedPlace } from '../header-bar';
import { withMapTab } from '../map-tab';

type Directory = {
 items: Restaurant[];
 groups: { name: string; count: number }[];
 total: number;
 hasMore: boolean;
};

type AreaOrigin = { lat: number; lng: number; label: string };
const pageSize = 8;

export default function FoodSearch() {
 const [query, setQuery] = useState('');
 const [debouncedQuery, setDebouncedQuery] = useState('');
 const [group, setGroup] = useState('');
 const [page, setPage] = useState(0);
 const [groups, setGroups] = useState<Directory['groups']>([]);
 const [data, setData] = useState<Directory | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [gate, setGate] = useState('');
 const [busy, setBusy] = useState(false);
 const [retry, setRetry] = useState(0);
 const [origin, setOrigin] = useState<AreaOrigin | null>(null);
 const [gpsState, setGpsState] = useState<'locating' | 'ready' | 'denied'>('locating');
 const [gpsResolved, setGpsResolved] = useState(false);
 const [initialized, setInitialized] = useState(false);

 const [hub, setHub] = useState<AccountHubData | null>(null);
 const [openHubTab, setOpenHubTab] = useState<'profile' | 'saved' | 'personalize' | 'plans' | null>(null);
 const [localSaved, setLocalSaved] = useState<SavedPlace[]>([]);

 const [activeCard, setActiveCard] = useState<{ restaurant: Restaurant; distance: number | null } | null>(null);
 const [compareItems, setCompareItems] = useState<{ restaurant: Restaurant; distance: number | null }[]>([]);
 const [compareOpen, setCompareOpen] = useState(false);

 const seqRef = useRef(0);

 const refreshHub = useCallback(async () => {
  try {
   const h = await api<AccountHubData>('/account/hub');
   setHub(h);
   return h;
  } catch {
   return null;
  }
 }, []);

 const requestGps = useCallback((forceRefresh = false) => {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
   setGpsState('denied');
   setGpsResolved(true);
   return;
  }
  setGpsState('locating');
  navigator.geolocation.getCurrentPosition(
   (p) => {
    setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Vị trí của bạn' });
    setGpsState('ready');
    setGpsResolved(true);
   },
   () => {
    setGpsState('denied');
    setGpsResolved(true);
   },
   { enableHighAccuracy: false, timeout: 6000, maximumAge: forceRefresh ? 0 : 60000 },
  );
 }, []);

 useEffect(() => {
  const sp = new URLSearchParams(window.location.search);
  const initialQ = sp.get('q') || '';
  const initialGroup = sp.get('group') || '';
  if (initialQ) {
   setQuery(initialQ);
   setDebouncedQuery(initialQ);
  }
  if (initialGroup) setGroup(initialGroup);
  setLocalSaved(loadSavedPlaces());
  refreshHub();
  setInitialized(true);

  const fallbackTimer = window.setTimeout(() => setGpsResolved(true), 3000);
  requestGps(false);
  return () => window.clearTimeout(fallbackTimer);
 }, [refreshHub, requestGps]);

 const isPro = Boolean(hub?.user?.pro);

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

 useEffect(() => {
  const t = window.setTimeout(() => {
   setDebouncedQuery(query.trim());
   setPage(0);
  }, 220);
  return () => window.clearTimeout(t);
 }, [query]);

 const hasCriteria = Boolean(group || debouncedQuery || origin);

 useEffect(() => {
  if (!initialized || !gpsResolved) return;
  const seq = ++seqRef.current;
  setLoading(true);
  setError('');
  setGate('');

  const params = new URLSearchParams({
   limit: String(hasCriteria ? pageSize : 1),
   offset: String(page * pageSize),
  });
  if (group) params.set('group', group);
  if (debouncedQuery) params.set('q', debouncedQuery);
  if (origin) {
   params.set('lat', String(origin.lat));
   params.set('lng', String(origin.lng));
  }

  api<Directory>('/directory?' + params.toString())
   .then((result) => {
    if (seq !== seqRef.current) return;
    setGroups(result.groups);
    setData(hasCriteria ? result : null);
   })
   .catch((e) => {
    if (seq === seqRef.current) setError((e as Error).message);
   })
   .finally(() => {
    if (seq === seqRef.current) setLoading(false);
   });
 }, [initialized, gpsResolved, group, debouncedQuery, hasCriteria, page, origin, retry]);

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

 return (
  <main className="discovery-shell">
   <HeaderBar
    activeTab="search"
    hub={hub}
    localSaved={localSaved}
    externalOpenTab={openHubTab}
    onClearExternalOpen={() => setOpenHubTab(null)}
    onRefreshHub={refreshHub}
    onRemoveLocalSaved={removeLocalSaved}
    onVisitPlaceId={visitById}
   />

   <section className="discovery-hero">
    <div className="discovery-prompt-row">
     <div>
      <h1 className="discovery-heading">
       Tìm theo món, quán <em>hoặc tên đường</em>
      </h1>
     </div>

     <div className="top-controls-right">
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

    <div className="search-controls-card">
     <div className="search-controls-row">
      <label className="search-field-group" htmlFor="food-search-input">
       <span>Từ khóa (món ăn, đồ uống, tên quán, đường phố)</span>
       <input
        id="food-search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={120}
        placeholder="Ví dụ: phở bò, cơm tấm, bún chả, hủ tiếu, mì Quảng…"
       />
      </label>

      <label className="search-field-group" htmlFor="food-group">
       <span>Nhóm món / đồ uống</span>
       <select
        id="food-group"
        value={group}
        disabled={!groups.length}
        onChange={(e) => {
         setGroup(e.target.value);
         setPage(0);
        }}
       >
        <option value="">Tất cả nhóm</option>
        {groups.map((g) => (
         <option key={g.name} value={g.name}>
          {g.name} ({g.count.toLocaleString('vi-VN')} quán)
         </option>
        ))}
       </select>
      </label>
     </div>

     <div className="popular-chips" role="group" aria-label="Chọn nhanh món phổ biến">
      <span className="popular-chips-label">Hay tìm:</span>
      {POPULAR_SEARCH_GROUPS.map((g) => (
       <button
        key={g}
        type="button"
        className={`popular-chip${group === g ? ' is-selected' : ''}`}
        onClick={() => {
         setGroup(group === g ? '' : g);
         setPage(0);
        }}
       >
        {g}
       </button>
      ))}
     </div>
    </div>
   </section>

   {error && (
    <div className="message error" role="alert">
     <span>{error}</span>
     <button type="button" className="text-button" onClick={() => setRetry((v) => v + 1)}>Thử lại</button>
    </div>
   )}

   {gate && <p className="message" role="status">{gate}</p>}

   {!hasCriteria && !loading && !error && (
    <div className="food-search-empty">
     <span aria-hidden="true">✦</span>
     <p>Gõ tên món / tên đường hoặc bật vị trí của bạn để xem ngay các quán gần nhất.</p>
    </div>
   )}

   {(loading && !data) && (
    <div className="food-grid" aria-label="Đang tìm quán">
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
   )}

   {data && hasCriteria && (
    <>
     <div className="food-search-caption" role="status">
      <b>
       {data.total.toLocaleString('vi-VN')} quán
       {group ? ` · ${group}` : ''}
       {debouncedQuery ? ` · “${debouncedQuery}”` : ''}
      </b>
      <span>
       {origin ? 'Xếp gần → xa từ vị trí của bạn' : 'Ưu tiên quán được yêu thích · Bấm “Lấy vị trí của bạn” để xếp gần nhất'}
      </span>
     </div>

     <div className="food-grid" aria-label="Kết quả tìm kiếm quán" aria-busy={loading}>
      {data.items.map((r, i) => (
       <SuggestionCard
        key={r.id}
        restaurant={r}
        index={page * pageSize + i < 9 ? page * pageSize + i : undefined}
        distance={origin ? r.distance ?? null : null}
        busy={busy}
        loading={loading}
        liked={likedIdSet.has(r.id)}
        note={notesById[r.id]}
        onToggleLike={toggleLike}
        onSelectCard={(rest, dist) => setActiveCard({ restaurant: rest, distance: dist })}
        onVisit={(rest) => visitById(rest.id)}
       />
      ))}
     </div>

     {!data.items.length && !loading && (
      <div className="food-search-empty">
       <span aria-hidden="true">…</span>
       <p>Chưa thấy quán nào khớp. Thử gõ từ khóa ngắn hơn hoặc bỏ bớt bộ lọc nhóm.</p>
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

     {(page > 0 || data.hasMore) && (
      <nav className="food-search-pager" aria-label="Phân trang kết quả">
       <button type="button" className="secondary" disabled={page === 0 || loading} onClick={() => setPage((v) => v - 1)}>
        ← Trang trước
       </button>
       <span>Trang {page + 1}</span>
       <button type="button" className="secondary" disabled={!data.hasMore || loading} onClick={() => setPage((v) => v + 1)}>
        Trang sau →
       </button>
      </nav>
     )}
    </>
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
    <span>Ăn gì đây? · Gắn nhãn độ yêu thích & thời tiết thực tế tại quán.</span>
    <div className="discovery-footer-links">
     <a href="/">← Về Gợi ý</a>
     <a href="/about">Về dữ liệu</a>
     <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
      © OpenStreetMap · ODbL
     </a>
    </div>
   </footer>
  </main>
 );
}
