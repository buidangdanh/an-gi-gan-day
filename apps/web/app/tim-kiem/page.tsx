'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 AccountHubData,
 api,
 CITY_STORAGE_KEY,
 CitySlug,
 getCityMeta,
 MAJOR_CITIES,
 POPULAR_SEARCH_GROUPS,
 Restaurant,
} from '../api';
import { CardActionSheet, ProCompareModal, SuggestionCard } from '../suggestion-card';
import { HeaderBar, loadSavedPlaces, SavedPlace, SAVED_PLACES_KEY, toggleLocalSavedPlace } from '../header-bar';
import { withMapTab } from '../map-tab';

type Directory = {
 items: Restaurant[];
 groups: { name: string; count: number }[];
 cities?: { slug: string; count: number }[];
 total: number;
 hasMore: boolean;
};

type AreaOrigin = { lat: number; lng: number; label: string };
const pageSize = 8;

export default function FoodSearch() {
 const [city, setCity] = useState<CitySlug | ''>('');
 const [query, setQuery] = useState('');
 const [debouncedQuery, setDebouncedQuery] = useState('');
 const [group, setGroup] = useState('');
 const [page, setPage] = useState(0);
 const [groups, setGroups] = useState<Directory['groups']>([]);
 const [cityCounts, setCityCounts] = useState<Record<string, number>>({});
 const [data, setData] = useState<Directory | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [gate, setGate] = useState('');
 const [busy, setBusy] = useState(false);
 const [retry, setRetry] = useState(0);
 const [origin, setOrigin] = useState<AreaOrigin | null>(null);
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

 useEffect(() => {
  const sp = new URLSearchParams(window.location.search);
  const initialQ = sp.get('q') || '';
  const initialGroup = sp.get('group') || '';
  const urlCity = sp.get('city');
  if (initialQ) {
   setQuery(initialQ);
   setDebouncedQuery(initialQ);
  }
  if (initialGroup) setGroup(initialGroup);

  if (urlCity === 'all') {
   setCity('');
  } else if (urlCity && MAJOR_CITIES.some((c) => c.slug === urlCity)) {
   setCity(urlCity as CitySlug);
  } else {
   try {
    const saved = window.localStorage.getItem(CITY_STORAGE_KEY);
    if (saved && MAJOR_CITIES.some((c) => c.slug === saved)) {
     setCity(saved as CitySlug);
    }
   } catch {}
  }

  setLocalSaved(loadSavedPlaces());
  refreshHub();
  setInitialized(true);
 }, [refreshHub]);

 const activeCityMeta = useMemo(() => (city ? getCityMeta(city) : null), [city]);
 const popularChips = activeCityMeta ? activeCityMeta.popularGroups : POPULAR_SEARCH_GROUPS;
 const districtChips = activeCityMeta ? activeCityMeta.districts : MAJOR_CITIES[0].districts.slice(0, 4).concat(MAJOR_CITIES[1].districts.slice(0, 4));

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

 const hasCriteria = Boolean(group || debouncedQuery || city || origin);

 useEffect(() => {
  if (!initialized) return;
  const seq = ++seqRef.current;
  setLoading(true);
  setError('');
  setGate('');

  const params = new URLSearchParams({
   limit: String(hasCriteria ? pageSize : 1),
   offset: String(page * pageSize),
  });
  if (city) params.set('city', city);
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
    if (result.cities?.length) {
     const map: Record<string, number> = {};
     for (const c of result.cities) map[c.slug] = c.count;
     setCityCounts((prev) => (Object.keys(prev).length ? prev : map));
    }
    setData(hasCriteria ? result : null);
   })
   .catch((e) => {
    if (seq === seqRef.current) setError((e as Error).message);
   })
   .finally(() => {
    if (seq === seqRef.current) setLoading(false);
   });
 }, [initialized, city, group, debouncedQuery, hasCriteria, page, origin, retry]);

 function handleSelectCity(nextCity: CitySlug | '') {
  setCity(nextCity);
  setOrigin(null);
  setPage(0);
  if (nextCity) {
   try {
    window.localStorage.setItem(CITY_STORAGE_KEY, nextCity);
   } catch {}
  }
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
    <div className="city-quick-strip" role="tablist" aria-label="Lọc theo thành phố">
     <span className="city-strip-label" aria-hidden="true">📍 Thành phố:</span>
     <button
      type="button"
      role="tab"
      aria-selected={city === ''}
      className={`city-pill${city === '' ? ' is-active' : ''}`}
      onClick={() => handleSelectCity('')}
     >
      Tất cả (10 TP)
     </button>
     {MAJOR_CITIES.map((c) => (
      <button
       key={c.slug}
       type="button"
       role="tab"
       aria-selected={city === c.slug}
       className={`city-pill${city === c.slug ? ' is-active' : ''}`}
       onClick={() => handleSelectCity(c.slug)}
      >
       {c.label}
      </button>
     ))}
    </div>

    <div className="discovery-prompt-row">
     <div>
      <h1 className="discovery-heading">
       Tìm theo món, quán <em>hoặc tên phố</em>
      </h1>
      <p className="discovery-sub">
       {activeCityMeta ? `Đang tìm tại ${activeCityMeta.label}` : 'Đang tìm trên toàn bộ 10 thành phố lớn'} · Gõ có dấu hay không dấu đều được.
      </p>
     </div>
    </div>

    <div className="search-controls-card">
     <div className="search-controls-row is-three-col">
      <label className="search-field-group" htmlFor="food-search-input">
       <span>Từ khóa (món ăn, đồ uống, tên quán, đường phố)</span>
       <input
        id="food-search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={120}
        placeholder={
         activeCityMeta
          ? activeCityMeta.sampleFoodSearch
          : 'Ví dụ: cơm tấm, phở bò, mì Quảng, bún bò Huế, Nguyễn Trãi…'
        }
       />
      </label>

      <label className="search-field-group" htmlFor="food-city-select">
       <span>Thành phố</span>
       <select
        id="food-city-select"
        value={city}
        onChange={(e) => handleSelectCity(e.target.value as CitySlug | '')}
       >
        <option value="">Tất cả 10 thành phố lớn</option>
        {MAJOR_CITIES.map((c) => (
         <option key={c.slug} value={c.slug}>
          {c.label}{cityCounts[c.slug] ? ` (${cityCounts[c.slug].toLocaleString('vi-VN')} quán)` : ''}
         </option>
        ))}
       </select>
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
      {popularChips.map((g) => (
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

     <div className="popular-chips" role="group" aria-label="Xếp gần khu vực">
      <span className="popular-chips-label">Xếp gần:</span>
      {districtChips.slice(0, 8).map((p) => (
       <button
        key={p.id}
        type="button"
        className={`popular-chip${origin?.label === p.label ? ' is-selected' : ''}`}
        onClick={() => {
         if (origin?.label === p.label) {
          setOrigin(null);
         } else {
          if (p.city !== city) setCity(p.city);
          setOrigin({ lat: p.lat, lng: p.lng, label: p.label });
         }
         setPage(0);
        }}
       >
        {p.label.split(' · ')[0]}
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

   {!hasCriteria && !error && (
    <div className="food-search-empty">
     <span aria-hidden="true">✦</span>
     <p>Chọn một thành phố, nhóm món hoặc gõ từ khóa ở trên để xem danh sách quán được yêu thích.</p>
    </div>
   )}

   {hasCriteria && loading && !data && (
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
       {activeCityMeta ? ` tại ${activeCityMeta.label}` : ' trên 10 thành phố'}
       {group ? ` · ${group}` : ''}
       {debouncedQuery ? ` · “${debouncedQuery}”` : ''}
      </b>
      <span>
       {origin ? `Xếp gần → xa quanh ${origin.label}` : 'Ưu tiên quán nhiều lượt lưu yêu thích'}
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
       <p>Chưa thấy quán nào khớp. Thử gõ từ khóa ngắn hơn hoặc chuyển sang “Tất cả (10 TP)”.</p>
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
    <span>Ăn gì đây? · 10 thành phố lớn kèm nhãn độ yêu thích & thời tiết thực tế tại quán.</span>
    <div className="discovery-footer-links">
     <a href={city ? `/?city=${city}` : '/'}>← Về Gợi ý</a>
     <a href="/about">Về dữ liệu</a>
     <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
      © OpenStreetMap · ODbL
     </a>
    </div>
   </footer>
  </main>
 );
}
