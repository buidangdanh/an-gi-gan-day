'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '../brand-logo';
import './admin.css';

const CITY_LABELS: Record<string, string> = {
 'ha-noi': 'Hà Nội',
 'ho-chi-minh': 'TP. Hồ Chí Minh',
 'da-nang': 'Đà Nẵng',
 'hai-phong': 'Hải Phòng',
 'can-tho': 'Cần Thơ',
 hue: 'Huế',
 'nha-trang': 'Nha Trang',
 'da-lat': 'Đà Lạt',
 'vung-tau': 'Vũng Tàu',
 'ha-long': 'Hạ Long',
};

const BADGE_LABELS: Record<string, string> = {
 top_fav: '🔥 Rất được yêu thích',
 popular: '❤️ Nhiều người ưa chuộng',
 good_rating: '⭐ Đánh giá tốt',
 worth_try: '✨ Quán đáng thử',
};

const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const EVENT_LABELS: Record<string, { text: string; cls: string }> = {
 created: { text: '🟢 Tạo mới', cls: 'is-active' },
 updated: { text: '🔵 Chỉnh sửa', cls: 'is-verified' },
 deleted: { text: '🔴 Đã xóa (ẩn)', cls: 'is-deleted' },
 restored: { text: '♻️ Khôi phục', cls: 'is-active' },
 hard_deleted: { text: '⚠️ Xóa vĩnh viễn', cls: 'is-deleted' },
};

type DishDraft = {
 name: string;
 group: string;
 tags: string[];
 price: number | null;
 bestsellerSource: string | null;
};

type HourDraft = {
 day: number;
 open: number;
 close: number;
};

type FullRestaurantRecord = {
 id: string;
 name: string;
 address: string;
 city_slug: string;
 lat: number | null;
 lng: number | null;
 location_source: string;
 location_checked_at: string | null;
 primary_group: string;
 food_groups: string[];
 classification_source: string;
 dishes: DishDraft[];
 hours: HourDraft[] | null;
 price_min: number | null;
 price_max: number | null;
 image_url: string | null;
 image_checked_at: string | null;
 popularity_badge: string | null;
 popularity_saves: number;
 popularity_reviews: number;
 popularity_rating: number | null;
 popularity_score: number;
 review_count: number;
 review_avg: number | null;
 source: string;
 data_license: string;
 verification_status: string;
 active: boolean;
 demo: boolean;
 branch_of: string | null;
 foody_id: number | null;
 external_url: string | null;
 import_record_id: string | null;
 name_norm: string;
 search_text: string;
 created_at: string;
 updated_at: string;
 deleted_at: string | null;
 live_favorites_count?: number;
 live_visits_count?: number;
 live_notes_count?: number;
 open_reports_count?: number;
};

type EditorDraft = {
 name: string;
 address: string;
 city_slug: string;
 lat: string;
 lng: string;
 location_source: string;
 primary_group: string;
 food_groups_text: string;
 classification_source: string;
 dishes: DishDraft[];
 hours: HourDraft[] | null;
 price_min: string;
 price_max: string;
 image_url: string;
 popularity_badge: string;
 popularity_saves: string;
 popularity_reviews: string;
 popularity_rating: string;
 popularity_score: string;
 source: string;
 data_license: string;
 verification_status: string;
 active: boolean;
 demo: boolean;
 branch_of: string;
 foody_id: string;
 external_url: string;
 import_record_id: string;
};

function emptyEditorDraft(): EditorDraft {
 return {
  name: '',
  address: '',
  city_slug: 'ha-noi',
  lat: '',
  lng: '',
  location_source: 'manual',
  primary_group: 'phở',
  food_groups_text: 'phở',
  classification_source: 'admin_manual',
  dishes: [{ name: 'Phở bò', group: 'phở', tags: ['nước', 'nóng'], price: 45000, bestsellerSource: null }],
  hours: null,
  price_min: '',
  price_max: '',
  image_url: '',
  popularity_badge: 'worth_try',
  popularity_saves: '0',
  popularity_reviews: '0',
  popularity_rating: '',
  popularity_score: '35',
  source: 'Quản trị viên Tìm quán ngon',
  data_license: 'first_party',
  verification_status: 'verified',
  active: true,
  demo: false,
  branch_of: '',
  foody_id: '',
  external_url: '',
  import_record_id: '',
 };
}

function recordToDraft(r: FullRestaurantRecord): EditorDraft {
 return {
  name: r.name || '',
  address: r.address || '',
  city_slug: r.city_slug || 'ha-noi',
  lat: r.lat === null || r.lat === undefined ? '' : String(r.lat),
  lng: r.lng === null || r.lng === undefined ? '' : String(r.lng),
  location_source: r.location_source || 'manual',
  primary_group: r.primary_group || 'chưa phân nhóm',
  food_groups_text: (r.food_groups || []).join(', '),
  classification_source: r.classification_source || 'admin_manual',
  dishes: Array.isArray(r.dishes)
   ? r.dishes.map((d) => ({
      name: d.name || '',
      group: d.group || r.primary_group || 'chưa phân nhóm',
      tags: Array.isArray(d.tags) ? [...d.tags] : [],
      price: d.price ?? null,
      bestsellerSource: d.bestsellerSource ?? null,
     }))
   : [],
  hours: Array.isArray(r.hours) ? r.hours.map((h) => ({ day: h.day, open: h.open, close: h.close })) : null,
  price_min: r.price_min === null || r.price_min === undefined ? '' : String(r.price_min),
  price_max: r.price_max === null || r.price_max === undefined ? '' : String(r.price_max),
  image_url: r.image_url || '',
  popularity_badge: r.popularity_badge || '',
  popularity_saves: String(r.popularity_saves ?? 0),
  popularity_reviews: String(r.popularity_reviews ?? 0),
  popularity_rating: r.popularity_rating === null || r.popularity_rating === undefined ? '' : String(r.popularity_rating),
  popularity_score: String(Math.round((r.popularity_score ?? 0) * 100) / 100),
  source: r.source || 'Quản trị viên Tìm quán ngon',
  data_license: r.data_license || 'first_party',
  verification_status: r.verification_status || 'verified',
  active: Boolean(r.active),
  demo: Boolean(r.demo),
  branch_of: r.branch_of || '',
  foody_id: r.foody_id === null || r.foody_id === undefined ? '' : String(r.foody_id),
  external_url: r.external_url || '',
  import_record_id: r.import_record_id || '',
 };
}

function draftToPayload(d: EditorDraft) {
 const parseNum = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
 };
 const parseIntVal = (s: string, fallback: number | null = null) => {
  const n = parseNum(s);
  return n === null ? fallback : Math.round(n);
 };
 const groups = d.food_groups_text
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

 return {
  name: d.name.trim(),
  address: d.address.trim(),
  city_slug: d.city_slug,
  lat: parseNum(d.lat),
  lng: parseNum(d.lng),
  location_source: d.location_source.trim() || 'manual',
  primary_group: d.primary_group.trim() || 'chưa phân nhóm',
  food_groups: groups,
  classification_source: d.classification_source.trim() || 'admin_manual',
  dishes: d.dishes.map((dish) => ({
   name: dish.name.trim() || d.primary_group.trim() || 'Món ăn',
   group: dish.group.trim() || d.primary_group.trim() || 'chưa phân nhóm',
   tags: dish.tags,
   price: dish.price === null || Number.isNaN(Number(dish.price)) ? null : Math.round(Number(dish.price)),
   bestsellerSource: dish.bestsellerSource?.trim() ? dish.bestsellerSource.trim() : null,
  })),
  hours: d.hours,
  price_min: parseIntVal(d.price_min, null),
  price_max: parseIntVal(d.price_max, null),
  image_url: d.image_url.trim() || null,
  popularity_badge: d.popularity_badge || null,
  popularity_saves: Math.max(0, parseIntVal(d.popularity_saves, 0) ?? 0),
  popularity_reviews: Math.max(0, parseIntVal(d.popularity_reviews, 0) ?? 0),
  popularity_rating: parseNum(d.popularity_rating),
  popularity_score: Math.max(0, Math.min(100, parseNum(d.popularity_score) ?? 0)),
  source: d.source.trim() || 'Quản trị viên Tìm quán ngon',
  data_license: d.data_license,
  verification_status: d.verification_status,
  active: d.active,
  demo: d.demo,
  branch_of: d.branch_of.trim() || null,
  foody_id: parseIntVal(d.foody_id, null),
  external_url: d.external_url.trim() || null,
  import_record_id: d.import_record_id.trim() || null,
 };
}

function fmtDateTime(val?: string | null): string {
 if (!val) return '—';
 const dt = new Date(val);
 if (Number.isNaN(dt.getTime())) return String(val);
 return dt.toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
 });
}

function minToTime(min: number): string {
 const clamped = Math.max(0, Math.min(1440, Math.floor(min || 0)));
 if (clamped === 1440) return '23:59';
 const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
 const mm = String(clamped % 60).padStart(2, '0');
 return `${hh}:${mm}`;
}

function timeToMin(t: string, isClose = false): number {
 if (!t || !t.includes(':')) return isClose ? 1320 : 420;
 const [h, m] = t.split(':').map((x) => Number(x));
 if (!Number.isFinite(h) || !Number.isFinite(m)) return isClose ? 1320 : 420;
 if (isClose && h === 23 && m === 59) return 1440;
 return Math.max(0, Math.min(1439, h * 60 + m));
}

function formatHoursSummary(hours: HourDraft[] | null): string {
 if (hours === null || hours === undefined) return 'Chưa cập nhật (null)';
 if (hours.length === 0) return 'Đóng cửa cả tuần ([])';
 return hours
  .map((h) => `${DAY_NAMES[h.day] || `Ngày ${h.day}`}: ${minToTime(h.open)}–${h.close === 1440 ? '24:00' : minToTime(h.close)}`)
  .join(' · ');
}

function formatVnd(n: number | null | undefined): string {
 if (n === null || n === undefined) return '—';
 return `${Number(n).toLocaleString('vi-VN')} đ`;
}

async function cmsApi<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
 const res = await fetch('/api' + path, {
  method,
  credentials: 'same-origin',
  cache: 'no-store',
  headers: method === 'GET' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' },
  body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
 });
 let data: any = null;
 try {
  data = await res.json();
 } catch {
  throw new Error('Máy chủ chưa sẵn sàng. Vui lòng thử lại.');
 }
 if (!res.ok) {
  throw new Error(data?.message || 'Yêu cầu không thành công.');
 }
 return data as T;
}

function loadGisSdk(): Promise<void> {
 return new Promise((resolve, reject) => {
  if (typeof window === 'undefined') return resolve();
  if ((window as any).google?.accounts?.id) return resolve();
  const existing = document.getElementById('google-gis-admin-sdk') as HTMLScriptElement | null;
  if (existing) {
   existing.addEventListener('load', () => resolve(), { once: true });
   existing.addEventListener('error', () => reject(new Error('Không tải được Google Sign-In SDK.')), { once: true });
   return;
  }
  const s = document.createElement('script');
  s.id = 'google-gis-admin-sdk';
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.defer = true;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error('Không tải được Google Sign-In SDK.'));
  document.head.appendChild(s);
 });
}

export default function AdminManagementPage() {
 const [authLoading, setAuthLoading] = useState(true);
 const [sessionInfo, setSessionInfo] = useState<{
  authorized: boolean;
  allowedEmail: string;
  googleClientId: string | null;
  currentUser: { id: string; displayName: string; email: string | null; authMethod: string | null } | null;
  reason: string | null;
 } | null>(null);

 const [tab, setTab] = useState<'restaurants' | 'lifecycle' | 'accounts' | 'moderation'>('restaurants');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');

 // Dashboard & Analytics state
 const [overview, setOverview] = useState<any>(null);
 const [offsetModalOpen, setOffsetModalOpen] = useState(false);
 const [offsetInput, setOffsetInput] = useState('0');

 // Restaurant list & filters
 const [q, setQ] = useState('');
 const [debouncedQ, setDebouncedQ] = useState('');
 const [cityFilter, setCityFilter] = useState('');
 const [groupFilter, setGroupFilter] = useState('');
 const [statusFilter, setStatusFilter] = useState('all');
 const [imageFilter, setImageFilter] = useState('all');
 const [coordsFilter, setCoordsFilter] = useState('all');
 const [badgeFilter, setBadgeFilter] = useState('all');
 const [sortBy, setSortBy] = useState('updated_desc');
 const [pageSize, setPageSize] = useState(20);
 const [page, setPage] = useState(0);

 const [restData, setRestData] = useState<{ items: FullRestaurantRecord[]; total: number }>({ items: [], total: 0 });
 const [listLoading, setListLoading] = useState(false);
 const [copiedId, setCopiedId] = useState<string | null>(null);

 // Detail Popup Modal (shows 100% full info of 1 restaurant when clicked)
 const [detailRecord, setDetailRecord] = useState<FullRestaurantRecord | null>(null);

 // Editor Modal
 const [editorOpen, setEditorOpen] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [editingTimestamps, setEditingTimestamps] = useState<{
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
 } | null>(null);
 const [draft, setDraft] = useState<EditorDraft>(() => emptyEditorDraft());
 const [jsonMode, setJsonMode] = useState(false);
 const [rawJsonText, setRawJsonText] = useState('');

 // Single-Restaurant Lifecycle History Modal
 const [historyModal, setHistoryModal] = useState<{
  restaurant: FullRestaurantRecord;
  events: any[];
 } | null>(null);

 // Global Lifecycle Tab state
 const [lifeType, setLifeType] = useState('all');
 const [lifePage, setLifePage] = useState(0);
 const [lifeData, setLifeData] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });
 const [snapshotModal, setSnapshotModal] = useState<any | null>(null);

 // Accounts Tab state
 const [accQ, setAccQ] = useState('');
 const [accData, setAccData] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });

 // Moderation Tab state
 const [modData, setModData] = useState<{ reviews: any[]; reports: any[]; audit: any[] }>({
  reviews: [],
  reports: [],
  audit: [],
 });

 const googleBtnRef = useRef<HTMLDivElement | null>(null);

 const checkSession = useCallback(async () => {
  setAuthLoading(true);
  try {
   const info = await cmsApi('/admin/cms/session');
   setSessionInfo(info);
   return info;
  } catch (e) {
   setError((e as Error).message);
   return null;
  } finally {
   setAuthLoading(false);
  }
 }, []);

 useEffect(() => {
  checkSession();
 }, [checkSession]);

 // Render official Google Sign-In button when unauthorized
 useEffect(() => {
  if (authLoading || !sessionInfo || sessionInfo.authorized || !sessionInfo.googleClientId) return;
  let cancelled = false;
  loadGisSdk()
   .then(() => {
    if (cancelled || !googleBtnRef.current) return;
    const win = window as any;
    win.google.accounts.id.initialize({
     client_id: sessionInfo.googleClientId,
     callback: async (resp: { credential?: string }) => {
      if (!resp?.credential) return;
      setBusy(true);
      setError('');
      setNotice('');
      try {
       await cmsApi('/admin/cms/auth/google', 'POST', { token: resp.credential });
       setNotice(`Đăng nhập quản trị thành công với ${sessionInfo.allowedEmail}!`);
       await checkSession();
      } catch (errObj) {
       setError((errObj as Error).message);
      } finally {
       setBusy(false);
      }
     },
    });
    googleBtnRef.current.innerHTML = '';
    win.google.accounts.id.renderButton(googleBtnRef.current, {
     theme: 'filled_blue',
     size: 'large',
     text: 'signin_with',
     shape: 'pill',
     width: 320,
     locale: 'vi',
    });
   })
   .catch((e) => setError((e as Error).message));
  return () => {
   cancelled = true;
  };
 }, [authLoading, sessionInfo, checkSession]);

 const loadOverview = useCallback(async () => {
  if (!sessionInfo?.authorized) return;
  try {
   const ov = await cmsApi('/admin/cms/overview');
   setOverview(ov);
   setOffsetInput(String(ov?.analytics?.manualOffsetPageviews ?? 0));
  } catch (e) {
   setError((e as Error).message);
  }
 }, [sessionInfo?.authorized]);

 const loadRestaurants = useCallback(async () => {
  if (!sessionInfo?.authorized) return;
  setListLoading(true);
  try {
   const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(page * pageSize),
    sort: sortBy,
    status: statusFilter,
    hasImage: imageFilter,
    hasCoords: coordsFilter,
    badge: badgeFilter,
   });
   if (debouncedQ) params.set('q', debouncedQ);
   if (cityFilter) params.set('city', cityFilter);
   if (groupFilter) params.set('group', groupFilter);
   const res = await cmsApi(`/admin/cms/restaurants?${params.toString()}`);
   setRestData({ items: res.items || [], total: res.total || 0 });
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setListLoading(false);
  }
 }, [
  sessionInfo?.authorized,
  pageSize,
  page,
  sortBy,
  statusFilter,
  imageFilter,
  coordsFilter,
  badgeFilter,
  debouncedQ,
  cityFilter,
  groupFilter,
 ]);

 const loadLifecycle = useCallback(async () => {
  if (!sessionInfo?.authorized) return;
  try {
   const params = new URLSearchParams({
    type: lifeType,
    limit: '40',
    offset: String(lifePage * 40),
   });
   const res = await cmsApi(`/admin/cms/lifecycle?${params.toString()}`);
   setLifeData({ items: res.items || [], total: res.total || 0 });
  } catch (e) {
   setError((e as Error).message);
  }
 }, [sessionInfo?.authorized, lifeType, lifePage]);

 const loadAccounts = useCallback(async () => {
  if (!sessionInfo?.authorized) return;
  try {
   const params = new URLSearchParams({ limit: '50', offset: '0' });
   if (accQ.trim()) params.set('q', accQ.trim());
   const res = await cmsApi(`/admin/cms/accounts?${params.toString()}`);
   setAccData({ items: res.items || [], total: res.total || 0 });
  } catch (e) {
   setError((e as Error).message);
  }
 }, [sessionInfo?.authorized, accQ]);

 const loadModeration = useCallback(async () => {
  if (!sessionInfo?.authorized) return;
  try {
   const res = await cmsApi('/admin/cms/moderation');
   setModData({
    reviews: res.reviews || [],
    reports: res.reports || [],
    audit: res.audit || [],
   });
  } catch (e) {
   setError((e as Error).message);
  }
 }, [sessionInfo?.authorized]);

 useEffect(() => {
  const t = window.setTimeout(() => {
   setDebouncedQ((prev) => {
    const next = q.trim();
    if (prev !== next) setPage(0);
    return next;
   });
  }, 250);
  return () => window.clearTimeout(t);
 }, [q]);

 useEffect(() => {
  if (sessionInfo?.authorized) {
   loadOverview();
  }
 }, [sessionInfo?.authorized, loadOverview]);

 useEffect(() => {
  if (!sessionInfo?.authorized) return;
  if (tab === 'restaurants') loadRestaurants();
  else if (tab === 'lifecycle') loadLifecycle();
  else if (tab === 'accounts') loadAccounts();
  else if (tab === 'moderation') loadModeration();
 }, [sessionInfo?.authorized, tab, loadRestaurants, loadLifecycle, loadAccounts, loadModeration]);

 const allGroups: string[] = useMemo(() => overview?.meta?.foodGroups || ['phở', 'bún', 'cơm', 'cà phê'], [overview]);
 const dishTagsList: string[] = useMemo(
  () => overview?.meta?.dishTags || ['nước', 'khô', 'nóng', 'lạnh', 'ăn nhanh', 'bữa thông thường', 'ngồi lâu', 'sáng', 'trưa', 'tối', 'ăn nhẹ'],
  [overview],
 );

 async function handleLogout() {
  setBusy(true);
  try {
   await cmsApi('/auth/logout', 'POST');
   setOverview(null);
   await checkSession();
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 function openCreateModal() {
  const fresh = emptyEditorDraft();
  setEditingId(null);
  setEditingTimestamps(null);
  setDraft(fresh);
  setJsonMode(false);
  setRawJsonText(JSON.stringify(draftToPayload(fresh), null, 2));
  setEditorOpen(true);
 }

 function openEditModal(r: FullRestaurantRecord) {
  const d = recordToDraft(r);
  setEditingId(r.id);
  setEditingTimestamps({
   created_at: r.created_at,
   updated_at: r.updated_at,
   deleted_at: r.deleted_at,
  });
  setDraft(d);
  setJsonMode(false);
  setRawJsonText(JSON.stringify(draftToPayload(d), null, 2));
  setEditorOpen(true);
 }

 async function openEditById(id: string) {
  setBusy(true);
  setError('');
  try {
   const res = await cmsApi(`/admin/cms/restaurants/${id}`);
   if (res?.restaurant) openEditModal(res.restaurant);
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function openRestaurantHistory(r: FullRestaurantRecord) {
  setBusy(true);
  setError('');
  try {
   const res = await cmsApi(`/admin/cms/restaurants/${r.id}`);
   setHistoryModal({ restaurant: res.restaurant, events: res.lifecycleEvents || [] });
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleSaveRestaurant(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setError('');
  setNotice('');
  try {
   const payload = jsonMode ? JSON.parse(rawJsonText) : draftToPayload(draft);
   const url = editingId ? `/admin/cms/restaurants/${editingId}` : '/admin/cms/restaurants';
   const method = editingId ? 'PUT' : 'POST';
   const res = await cmsApi(url, method, payload);
   setEditorOpen(false);
   if (res?.restaurant && detailRecord?.id === res.restaurant.id) {
    setDetailRecord(res.restaurant);
   }
   setNotice(
    editingId
     ? `Đã lưu chỉnh sửa quán "${res.restaurant?.name}" (lúc ${fmtDateTime(res.restaurant?.updated_at)}).`
     : `Đã tạo mới quán "${res.restaurant?.name}" (lúc ${fmtDateTime(res.restaurant?.created_at)}).`,
   );
   await Promise.all([loadRestaurants(), loadOverview()]);
  } catch (errObj) {
   setError((errObj as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleSoftDelete(r: FullRestaurantRecord) {
  if (!window.confirm(`Xác nhận xóa (ẩn khỏi trang công khai) quán "${r.name}"? Thời gian xóa sẽ được lưu lại và bạn có thể khôi phục bất cứ lúc nào.`)) {
   return;
  }
  setBusy(true);
  setError('');
  try {
   const res = await cmsApi(`/admin/cms/restaurants/${r.id}`, 'DELETE');
   if (res?.restaurant && detailRecord?.id === r.id) {
    setDetailRecord(res.restaurant);
   }
   setNotice(`Đã xóa quán "${r.name}" lúc ${fmtDateTime(res.restaurant?.deleted_at)}.`);
   await Promise.all([loadRestaurants(), loadOverview()]);
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleRestore(r: FullRestaurantRecord) {
  setBusy(true);
  setError('');
  try {
   const res = await cmsApi(`/admin/cms/restaurants/${r.id}/restore`, 'POST');
   if (res?.restaurant && detailRecord?.id === r.id) {
    setDetailRecord(res.restaurant);
   }
   setNotice(`Đã khôi phục quán "${r.name}" lúc ${fmtDateTime(res.restaurant?.updated_at)}.`);
   await Promise.all([loadRestaurants(), loadOverview()]);
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleHardDelete(r: FullRestaurantRecord) {
  if (
   !window.confirm(
    `CẢNH BÁO XÓA VĨNH VIỄN:\nBạn có chắc chắn muốn xóa vĩnh viễn bản ghi "${r.name}" (${r.id}) khỏi bảng dữ liệu không?\n(Thời gian xóa và bản sao lưu vẫn được ghi trong Lịch sử Tạo · Sửa · Xóa).`,
   )
  ) {
   return;
  }
  setBusy(true);
  setError('');
  try {
   await cmsApi(`/admin/cms/restaurants/${r.id}?permanent=true`, 'DELETE');
   if (detailRecord?.id === r.id) {
    setDetailRecord(null);
   }
   setNotice(`Đã xóa vĩnh viễn quán "${r.name}" và lưu dấu thời gian xóa vào lịch sử.`);
   await Promise.all([loadRestaurants(), loadOverview()]);
  } catch (e) {
   setError((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleSaveOffset(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setError('');
  try {
   await cmsApi('/admin/cms/analytics', 'PATCH', {
    manualOffsetPageviews: Math.round(Number(offsetInput || 0)),
   });
   setOffsetModalOpen(false);
   setNotice('Đã cập nhật số hiệu chỉnh bộ đếm lượt ghé thăm website.');
   await loadOverview();
  } catch (errObj) {
   setError((errObj as Error).message);
  } finally {
   setBusy(false);
  }
 }

 function copyUuid(id: string) {
  navigator.clipboard?.writeText(id).catch(() => {});
  setCopiedId(id);
  window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
 }

 // ============================================================================
 // RENDER 1: LOADING / GOOGLE-ONLY AUTH GATE (hnverynice@gmail.com)
 // ============================================================================
 if (authLoading) {
  return (
   <div className="cms-shell">
    <div className="cms-auth-wrap">
     <div className="cms-auth-card">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
       <BrandLogo size="card" />
      </div>
      <h1>Đang kiểm tra quyền quản trị…</h1>
      <p>Xác thực phiên Google chính chủ cho Tìm quán ngon.</p>
     </div>
    </div>
   </div>
  );
 }

 if (!sessionInfo?.authorized) {
  return (
   <div className="cms-shell">
    <header className="cms-topbar">
     <a href="/" className="cms-brand">
      <BrandLogo size="header" />
      <div className="cms-brand-title">
       <strong>Tìm quán ngon</strong>
       <span>Cổng Quản Lý Quán Ăn</span>
      </div>
     </a>
     <a href="/" className="cms-btn">← Về trang chủ tìm quán</a>
    </header>

    <div className="cms-auth-wrap">
     <div className="cms-auth-card">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
       <BrandLogo size="card" />
      </div>
      <span className="cms-auth-badge">🔒 KHU VỰC QUẢN TRỊ RIÊNG</span>
      <h1>Đăng nhập Quản lý Quán ăn</h1>
      <p>
       Trang quản trị chỉ cho phép đăng nhập duy nhất bằng tài khoản Google{' '}
       <b style={{ color: '#0284c7' }}>{sessionInfo?.allowedEmail || 'hnverynice@gmail.com'}</b>. Mọi tài khoản hoặc
       phương thức khác đều bị từ chối tự động.
      </p>

      {sessionInfo?.reason && (
       <div className="cms-alert is-warn" style={{ textAlign: 'left' }}>
        <span>⚠️ {sessionInfo.reason}</span>
       </div>
      )}

      {error && (
       <div className="cms-alert is-error" role="alert" style={{ textAlign: 'left' }}>
        <span>⛔ {error}</span>
       </div>
      )}

      <div className="cms-google-slot">
       <div ref={googleBtnRef} />
       {!sessionInfo?.googleClientId && (
        <p style={{ color: '#b91c1c', fontSize: 13 }}>
         Chưa cấu hình GOOGLE_CLIENT_ID trên máy chủ.
        </p>
       )}
      </div>

      {sessionInfo?.currentUser && (
       <div style={{ marginTop: 14 }}>
        <button type="button" className="cms-btn" disabled={busy} onClick={handleLogout}>
         Đăng xuất phiên hiện tại ({sessionInfo.currentUser.email || sessionInfo.currentUser.displayName})
        </button>
       </div>
      )}
     </div>
    </div>
   </div>
  );
 }

 // ============================================================================
 // RENDER 2: AUTHORIZED ADMIN PORTAL (hnverynice@gmail.com)
 // ============================================================================
 const analytics = overview?.analytics;
 const counts = overview?.counts;
 const dailySeries: { day: string; pageviews: number; uniqueVisitors: number }[] = analytics?.dailySeries || [];
 const maxDailyPv = Math.max(1, ...dailySeries.map((x) => x.pageviews));
 const totalPages = Math.max(1, Math.ceil(restData.total / pageSize));

 return (
  <div className="cms-shell">
   <header className="cms-topbar">
    <div className="cms-brand">
     <BrandLogo size="header" />
     <div className="cms-brand-title">
      <strong>Tìm quán ngon · Quản lý Hệ thống</strong>
      <span>Toàn quyền chỉnh sửa dữ liệu & theo dõi lưu lượng</span>
     </div>
    </div>

    <div className="cms-topbar-right">
     <span className="cms-admin-pill" title="Đã xác thực Google OAuth">
      ✓ Google: {sessionInfo.allowedEmail}
     </span>
     <button
      type="button"
      className="cms-btn"
      disabled={busy}
      onClick={() => {
       loadOverview();
       if (tab === 'restaurants') loadRestaurants();
       if (tab === 'lifecycle') loadLifecycle();
       if (tab === 'accounts') loadAccounts();
       if (tab === 'moderation') loadModeration();
      }}
     >
      ↻ Làm mới
     </button>
     <a href="/" target="_blank" rel="noopener noreferrer" className="cms-btn">
      Xem Website ↗
     </a>
     <button type="button" className="cms-btn is-danger" disabled={busy} onClick={handleLogout}>
      Đăng xuất
     </button>
    </div>
   </header>

   <div className="cms-container">
    {error && (
     <div className="cms-alert is-error" role="alert">
      <span>⛔ {error}</span>
      <button type="button" className="cms-btn" onClick={() => setError('')}>Đóng</button>
     </div>
    )}
    {notice && (
     <div className="cms-alert is-ok" role="status">
      <span>✅ {notice}</span>
      <button type="button" className="cms-btn" onClick={() => setNotice('')}>Đóng</button>
     </div>
    )}

    {/* WEBSITE VISIT COUNTER PANEL */}
    <section className="cms-analytics-panel" aria-label="Bộ đếm lượt ghé thăm website">
     <div className="cms-analytics-head">
      <h2>
       <span>📊 Bộ đếm lượt ghé thăm Website (timquanngon.com)</span>
       <span className="cms-live-dot">● {analytics?.onlineNow ?? 0} khách đang online (5 phút)</span>
      </h2>
      <div style={{ display: 'flex', gap: 8 }}>
       <button
        type="button"
        className="cms-btn"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
        onClick={() => setOffsetModalOpen(true)}
       >
        ⚙️ Hiệu chỉnh số đếm
       </button>
      </div>
     </div>

     <div className="cms-analytics-grid">
      <div className="cms-metric-box">
       <small>Tổng lượt ghé thăm website</small>
       <strong>{(analytics?.totalPageviews ?? 0).toLocaleString('vi-VN')}</strong>
       <span>Tổng khách duy nhất: {(analytics?.totalUniqueVisitors ?? 0).toLocaleString('vi-VN')}</span>
      </div>
      <div className="cms-metric-box">
       <small>Hôm nay (giờ VN)</small>
       <strong>{(analytics?.todayPageviews ?? 0).toLocaleString('vi-VN')}</strong>
       <span>{(analytics?.todayUniqueVisitors ?? 0).toLocaleString('vi-VN')} khách duy nhất</span>
      </div>
      <div className="cms-metric-box">
       <small>7 ngày gần nhất</small>
       <strong>{(analytics?.last7dPageviews ?? 0).toLocaleString('vi-VN')}</strong>
       <span>{(analytics?.last7dUniqueVisitors ?? 0).toLocaleString('vi-VN')} khách · TB {Math.round((analytics?.last7dPageviews ?? 0) / 7).toLocaleString('vi-VN')}/ngày</span>
      </div>
      <div className="cms-metric-box">
       <small>30 ngày gần nhất</small>
       <strong>{(analytics?.last30dPageviews ?? 0).toLocaleString('vi-VN')}</strong>
       <span>{(analytics?.last30dUniqueVisitors ?? 0).toLocaleString('vi-VN')} khách truy cập</span>
      </div>
      <div className="cms-metric-box">
       <small>Lượt mở Google Maps chỉ đường</small>
       <strong>{(analytics?.totalDirectionsClicks ?? 0).toLocaleString('vi-VN')}</strong>
       <span>Tổng lượt khách bấm đi ăn thực tế</span>
      </div>
     </div>

     {dailySeries.length > 0 && (
      <div className="cms-chart-strip">
       <small style={{ color: '#94a3b8', fontSize: 12 }}>
        Lưu lượng theo ngày ({dailySeries.length} ngày gần nhất — di chuột vào cột để xem chi tiết):
       </small>
       <div className="cms-chart-bars">
        {dailySeries.map((d) => {
         const pct = Math.max(6, Math.round((d.pageviews / maxDailyPv) * 100));
         return (
          <div
           key={d.day}
           className="cms-chart-col"
           title={`${d.day}: ${d.pageviews.toLocaleString('vi-VN')} lượt xem · ${d.uniqueVisitors.toLocaleString('vi-VN')} khách duy nhất`}
          >
           <div className="cms-chart-bar" style={{ height: `${pct}%` }} />
           <small>{d.day.slice(5)}</small>
          </div>
         );
        })}
       </div>
      </div>
     )}
    </section>

    {/* DATASET KPI STRIP */}
    <section className="cms-kpi-strip" aria-label="Tổng quan cơ sở dữ liệu">
     <div className="cms-kpi-card">
      <small>Tổng bản ghi quán ăn</small>
      <strong>{(counts?.totalRestaurants ?? 0).toLocaleString('vi-VN')}</strong>
     </div>
     <div className="cms-kpi-card">
      <small>Đang hiển thị công khai</small>
      <strong style={{ color: '#15803d' }}>{(counts?.activeRestaurants ?? 0).toLocaleString('vi-VN')}</strong>
     </div>
     <div className="cms-kpi-card">
      <small>Đã xóa / Đang ẩn</small>
      <strong style={{ color: '#dc2626' }}>{(counts?.deletedRestaurants ?? 0).toLocaleString('vi-VN')}</strong>
     </div>
     <div className="cms-kpi-card">
      <small>Quán có ảnh thật</small>
      <strong>{(counts?.withImages ?? 0).toLocaleString('vi-VN')}</strong>
     </div>
     <div className="cms-kpi-card">
      <small>Quán có tọa độ GPS</small>
      <strong>{(counts?.withCoordinates ?? 0).toLocaleString('vi-VN')}</strong>
     </div>
     <div className="cms-kpi-card">
      <small>Tài khoản / Gói Pro</small>
      <strong>
       {(counts?.totalAccounts ?? 0).toLocaleString('vi-VN')} <span style={{ fontSize: 13, color: '#0284c7' }}>({counts?.proAccounts ?? 0} Pro)</span>
      </strong>
     </div>
     <div className="cms-kpi-card">
      <small>Chờ duyệt / Báo sai</small>
      <strong>
       {counts?.pendingReviews ?? 0} / <span style={{ color: '#dc2626' }}>{counts?.openReports ?? 0}</span>
      </strong>
     </div>
    </section>

    {/* NAVIGATION TABS */}
    <nav className="cms-tabs" aria-label="Chức năng quản trị">
     <button
      type="button"
      className={`cms-tab-btn${tab === 'restaurants' ? ' is-active' : ''}`}
      onClick={() => setTab('restaurants')}
     >
      🍽️ Quản lý Quán ăn ({(counts?.totalRestaurants ?? restData.total).toLocaleString('vi-VN')})
     </button>
     <button
      type="button"
      className={`cms-tab-btn${tab === 'lifecycle' ? ' is-active' : ''}`}
      onClick={() => setTab('lifecycle')}
     >
      🕓 Thời gian Tạo · Sửa · Xóa Quán ăn
     </button>
     <button
      type="button"
      className={`cms-tab-btn${tab === 'accounts' ? ' is-active' : ''}`}
      onClick={() => setTab('accounts')}
     >
      👥 Quản lý Tài khoản ({counts?.totalAccounts ?? 0})
     </button>
     <button
      type="button"
      className={`cms-tab-btn${tab === 'moderation' ? ' is-active' : ''}`}
      onClick={() => setTab('moderation')}
     >
      🛡️ Đánh giá · Báo sai · Nhật ký
     </button>
    </nav>

    {/* ===================================================================== */}
    {/* TAB 1: FULL RESTAURANT MANAGEMENT                                     */}
    {/* ===================================================================== */}
    {tab === 'restaurants' && (
     <>
      <div className="cms-toolbar">
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
         <strong style={{ fontSize: 15 }}>
          Danh sách quán ăn ({restData.total.toLocaleString('vi-VN')} bản ghi khớp bộ lọc)
         </strong>
         <span style={{ fontSize: 12.5, color: '#64748b', marginLeft: 10 }}>
          Hiển thị gọn 1 dòng / quán — bấm vào dòng hoặc nút <b>Xem chi tiết</b> để mở popup đầy đủ thông tin.
         </span>
        </div>
        <button type="button" className="cms-btn is-primary" onClick={openCreateModal}>
         ＋ Thêm quán ăn mới
        </button>
       </div>

       <div className="cms-filter-grid">
        <div className="cms-field">
         <label>Tìm theo Tên quán / Địa chỉ / Món / UUID / Foody ID</label>
         <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Gõ tên quán, đường phố, mã UUID hoặc Foody ID…"
         />
        </div>

        <div className="cms-field">
         <label>Tỉnh / Thành phố</label>
         <select
          value={cityFilter}
          onChange={(e) => {
           setCityFilter(e.target.value);
           setPage(0);
          }}
         >
          <option value="">Tất cả 10 tỉnh/thành</option>
          {Object.entries(CITY_LABELS).map(([slug, label]) => (
           <option key={slug} value={slug}>{label} ({slug})</option>
          ))}
         </select>
        </div>

        <div className="cms-field">
         <label>Nhóm món</label>
         <select
          value={groupFilter}
          onChange={(e) => {
           setGroupFilter(e.target.value);
           setPage(0);
          }}
         >
          <option value="">Tất cả nhóm món</option>
          {allGroups.map((g) => (
           <option key={g} value={g}>{g}</option>
          ))}
         </select>
        </div>

        <div className="cms-field">
         <label>Trạng thái bản ghi</label>
         <select
          value={statusFilter}
          onChange={(e) => {
           setStatusFilter(e.target.value);
           setPage(0);
          }}
         >
          <option value="all">Tất cả (Hoạt động + Đã xóa + Demo)</option>
          <option value="active">Đang hiển thị công khai</option>
          <option value="deleted">Đã xóa / Đang ẩn</option>
          <option value="verified">Đã xác minh (verified)</option>
          <option value="unverified">Chưa xác minh</option>
          <option value="demo">Bản ghi mẫu (demo)</option>
         </select>
        </div>

        <div className="cms-field">
         <label>Ảnh đại diện</label>
         <select
          value={imageFilter}
          onChange={(e) => {
           setImageFilter(e.target.value);
           setPage(0);
          }}
         >
          <option value="all">Tất cả</option>
          <option value="yes">Đã có ảnh HTTPS</option>
          <option value="no">Chưa có ảnh (dùng ảnh bìa mặc định)</option>
         </select>
        </div>

        <div className="cms-field">
         <label>Tọa độ GPS</label>
         <select
          value={coordsFilter}
          onChange={(e) => {
           setCoordsFilter(e.target.value);
           setPage(0);
          }}
         >
          <option value="all">Tất cả</option>
          <option value="yes">Có tọa độ (lat/lng)</option>
          <option value="no">Thiếu tọa độ</option>
         </select>
        </div>

        <div className="cms-field">
         <label>Huy hiệu độ yêu thích</label>
         <select
          value={badgeFilter}
          onChange={(e) => {
           setBadgeFilter(e.target.value);
           setPage(0);
          }}
         >
          <option value="all">Tất cả huy hiệu</option>
          <option value="top_fav">🔥 Rất được yêu thích</option>
          <option value="popular">❤️ Nhiều người ưa chuộng</option>
          <option value="good_rating">⭐ Đánh giá tốt</option>
          <option value="worth_try">✨ Quán đáng thử</option>
          <option value="none">Chưa gắn huy hiệu</option>
         </select>
        </div>

        <div className="cms-field">
         <label>Sắp xếp theo</label>
         <select
          value={sortBy}
          onChange={(e) => {
           setSortBy(e.target.value);
           setPage(0);
          }}
         >
          <option value="updated_desc">🔵 Thời gian sửa gần nhất</option>
          <option value="created_desc">🟢 Thời gian tạo mới nhất</option>
          <option value="deleted_desc">🔴 Thời gian xóa gần nhất</option>
          <option value="saves_desc">❤️ Nhiều lượt thả tim nhất</option>
          <option value="score_desc">🏆 Điểm xếp hạng cao nhất</option>
          <option value="name_asc">🔤 Tên quán A → Z</option>
         </select>
        </div>

        <div className="cms-field">
         <label>Số bản ghi / trang</label>
         <select
          value={String(pageSize)}
          onChange={(e) => {
           setPageSize(Number(e.target.value));
           setPage(0);
          }}
         >
          <option value="10">10 bản ghi</option>
          <option value="20">20 bản ghi</option>
          <option value="50">50 bản ghi</option>
          <option value="100">100 bản ghi</option>
         </select>
        </div>
       </div>
      </div>

      {listLoading ? (
       <div className="cms-kpi-card" style={{ textAlign: 'center', padding: 32 }}>
        Đang tải dữ liệu đầy đủ của các quán ăn…
       </div>
      ) : restData.items.length === 0 ? (
       <div className="cms-kpi-card" style={{ textAlign: 'center', padding: 32 }}>
        Không tìm thấy bản ghi quán ăn nào khớp bộ lọc hiện tại.
       </div>
      ) : (
       <div className="cms-table-wrap">
        <table className="cms-oneline-table">
         <thead>
          <tr>
           <th style={{ width: 52 }}>#</th>
           <th style={{ width: 250 }}>Tên quán ăn</th>
           <th style={{ width: 220 }}>Địa chỉ</th>
           <th style={{ width: 110 }}>Tỉnh / TP</th>
           <th style={{ width: 115 }}>Nhóm món</th>
           <th style={{ width: 78 }}>Lượt ❤️</th>
           <th style={{ width: 112 }}>Trạng thái</th>
           <th style={{ width: 148 }}>Thời gian sửa / xóa</th>
           <th style={{ width: 215 }}>Thao tác</th>
          </tr>
         </thead>
         <tbody>
          {restData.items.map((r, idx) => (
           <tr
            key={r.id}
            className={`cms-oneline-row${!r.active ? ' is-deleted' : ''}`}
            onClick={() => setDetailRecord(r)}
            title="Bấm để xem toàn bộ thông tin chi tiết của quán"
           >
            <td style={{ color: '#64748b', fontWeight: 600 }}>{page * pageSize + idx + 1}</td>
            <td>
             <div className="cms-row-name-cell">
              <div className="cms-row-mini-thumb">
               {r.image_url ? (
                <img src={r.image_url} alt="" referrerPolicy="no-referrer" />
               ) : (
                <span style={{ fontSize: 13 }}>🍜</span>
               )}
              </div>
              <span className="cms-row-name-text" title={r.name}>{r.name}</span>
             </div>
            </td>
            <td title={r.address} style={{ color: '#334155' }}>{r.address}</td>
            <td>
             <span className="cms-badge is-city">{CITY_LABELS[r.city_slug] || r.city_slug}</span>
            </td>
            <td title={(r.food_groups || []).join(', ')}>{r.primary_group}</td>
            <td>
             <b>{r.popularity_saves.toLocaleString('vi-VN')}</b> ❤️
            </td>
            <td>
             <span className={`cms-badge ${r.active ? 'is-active' : 'is-deleted'}`}>
              {r.active ? '● Hoạt động' : '✕ Đã xóa'}
             </span>
            </td>
            <td
             title={`Tạo: ${fmtDateTime(r.created_at)} | Sửa: ${fmtDateTime(r.updated_at)}${r.deleted_at ? ` | Xóa: ${fmtDateTime(r.deleted_at)}` : ''}`}
             style={{ fontSize: 12, color: r.deleted_at ? '#dc2626' : '#475569' }}
            >
             {r.deleted_at ? fmtDateTime(r.deleted_at) : fmtDateTime(r.updated_at)}
            </td>
            <td onClick={(e) => e.stopPropagation()}>
             <div className="cms-row-actions">
              <button
               type="button"
               className="cms-btn is-primary is-xs"
               onClick={() => setDetailRecord(r)}
              >
               Xem chi tiết
              </button>
              <button
               type="button"
               className="cms-btn is-xs"
               onClick={() => openEditModal(r)}
              >
               Sửa
              </button>
              {r.active ? (
               <button
                type="button"
                className="cms-btn is-danger is-xs"
                disabled={busy}
                onClick={() => handleSoftDelete(r)}
               >
                Xóa
               </button>
              ) : (
               <button
                type="button"
                className="cms-btn is-success is-xs"
                disabled={busy}
                onClick={() => handleRestore(r)}
               >
                Khôi phục
               </button>
              )}
             </div>
            </td>
           </tr>
          ))}
         </tbody>
        </table>
       </div>
      )}

      {/* PAGINATION */}
      <div className="cms-pager">
       <span style={{ fontSize: 13, color: '#475569' }}>
        Trang <b>{page + 1}</b> / <b>{totalPages.toLocaleString('vi-VN')}</b> · Hiển thị{' '}
        <b>{restData.items.length}</b> trên tổng <b>{restData.total.toLocaleString('vi-VN')}</b> bản ghi
       </span>
       <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="cms-btn" disabled={page === 0 || listLoading} onClick={() => setPage(0)}>
         ⟪ Đầu
        </button>
        <button type="button" className="cms-btn" disabled={page === 0 || listLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
         ← Trang trước
        </button>
        <button
         type="button"
         className="cms-btn"
         disabled={page + 1 >= totalPages || listLoading}
         onClick={() => setPage((p) => p + 1)}
        >
         Trang tiếp →
        </button>
       </div>
      </div>
     </>
    )}

    {/* ===================================================================== */}
    {/* TAB 2: RESTAURANT CREATE / UPDATE / DELETE TIMELINE                   */}
    {/* ===================================================================== */}
    {tab === 'lifecycle' && (
     <>
      <div className="cms-toolbar">
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
         <strong style={{ fontSize: 15 }}>Nhật ký Thời gian Tạo · Sửa · Xóa Quán ăn ({lifeData.total} sự kiện)</strong>
         <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
          Ghi lại chính xác đến từng giây mọi lần tạo mới, chỉnh sửa trường dữ liệu, xóa ẩn, khôi phục và xóa vĩnh viễn.
         </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
         <select
          value={lifeType}
          onChange={(e) => {
           setLifeType(e.target.value);
           setLifePage(0);
          }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
         >
          <option value="all">Tất cả thao tác</option>
          <option value="created">🟢 Tạo quán mới</option>
          <option value="updated">🔵 Chỉnh sửa quán</option>
          <option value="deleted">🔴 Xóa quán (ẩn)</option>
          <option value="restored">♻️ Khôi phục quán</option>
          <option value="hard_deleted">⚠️ Xóa vĩnh viễn</option>
         </select>
        </div>
       </div>
      </div>

      <div className="cms-table-wrap">
       <table className="cms-table">
        <thead>
         <tr>
          <th>Thời gian thực hiện</th>
          <th>Thao tác</th>
          <th>Quán ăn & Mã UUID</th>
          <th>Thành phố</th>
          <th>Các trường thay đổi</th>
          <th>Người thực hiện</th>
          <th>Chi tiết</th>
         </tr>
        </thead>
        <tbody>
         {lifeData.items.length === 0 ? (
          <tr>
           <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: '#64748b' }}>
            Chưa có sự kiện Tạo / Sửa / Xóa nào được ghi nhận trong bộ lọc này.
           </td>
          </tr>
         ) : (
          lifeData.items.map((ev) => {
           const info = EVENT_LABELS[ev.event_type] || { text: ev.event_type, cls: 'is-city' };
           return (
            <tr key={ev.id}>
             <td><b>{fmtDateTime(ev.occurred_at)}</b></td>
             <td><span className={`cms-badge ${info.cls}`}>{info.text}</span></td>
             <td>
              <b>{ev.restaurant_name}</b>
              <div className="cms-mono" style={{ color: '#64748b' }}>{ev.restaurant_id}</div>
             </td>
             <td>{CITY_LABELS[ev.city_slug] || ev.city_slug || '—'}</td>
             <td>
              {(ev.changed_fields || []).length > 0 ? (ev.changed_fields || []).join(', ') : 'Toàn bộ bản ghi'}
             </td>
             <td>{ev.actor_email}</td>
             <td>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
               <button type="button" className="cms-btn" onClick={() => setSnapshotModal(ev)}>
                Xem Trước/Sau
               </button>
               {ev.event_type !== 'hard_deleted' && (
                <button
                 type="button"
                 className="cms-btn is-primary"
                 onClick={() => {
                  setTab('restaurants');
                  openEditById(ev.restaurant_id);
                 }}
                >
                 Mở sửa quán
                </button>
               )}
              </div>
             </td>
            </tr>
           );
          })
         )}
        </tbody>
       </table>
      </div>
     </>
    )}

    {/* ===================================================================== */}
    {/* TAB 3: ACCOUNTS & PRO SUBSCRIPTIONS                                   */}
    {/* ===================================================================== */}
    {tab === 'accounts' && (
     <>
      <div className="cms-toolbar">
       <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
         value={accQ}
         onChange={(e) => setAccQ(e.target.value)}
         placeholder="Tìm tài khoản theo email, tên hiển thị hoặc SĐT…"
         style={{ flex: 1, minWidth: 260, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <button type="button" className="cms-btn is-primary" onClick={loadAccounts}>Tìm tài khoản</button>
       </div>
      </div>

      <div className="cms-table-wrap">
       <table className="cms-table">
        <thead>
         <tr>
          <th>Tên hiển thị & ID</th>
          <th>Email / SĐT / Kênh</th>
          <th>Gói hiện tại</th>
          <th>Đã lưu</th>
          <th>Ngày tạo</th>
          <th>Chỉnh sửa quyền / dữ liệu</th>
         </tr>
        </thead>
        <tbody>
         {accData.items.map((acc) => (
          <tr key={acc.id}>
           <td>
            <b>{acc.display_name}</b>
            <div className="cms-mono" style={{ color: '#64748b' }}>{acc.id}</div>
           </td>
           <td>
            <div>Email: <b>{acc.email || '—'}</b> {acc.email_verified_at ? '✅' : '⏳'}</div>
            <div>SĐT: {acc.phone || '—'} · Kênh: {(acc.providers || []).join(', ') || (acc.username ? 'password' : 'guest')}</div>
           </td>
           <td>
            {acc.pro ? (
             <span className="cms-badge is-pop">✦ Quán Ngon · Pro (đến {fmtDateTime(acc.pro_expires_at)})</span>
            ) : (
             <span className="cms-badge is-city">Basic</span>
            )}
           </td>
           <td>{acc.favorites_count} ❤️</td>
           <td>{fmtDateTime(acc.created_at)}</td>
           <td>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
             <button
              type="button"
              className="cms-btn"
              onClick={async () => {
               const nextName = window.prompt('Sửa tên hiển thị:', acc.display_name);
               if (!nextName || nextName.trim() === acc.display_name) return;
               await cmsApi(`/admin/cms/accounts/${acc.id}`, 'PATCH', { displayName: nextName.trim() });
               setNotice('Đã cập nhật tên tài khoản.');
               loadAccounts();
              }}
             >
              Đổi tên
             </button>
             {!acc.pro ? (
              <button
               type="button"
               className="cms-btn is-primary"
               onClick={async () => {
                await cmsApi(`/admin/cms/accounts/${acc.id}`, 'PATCH', { grantProDays: 365 });
                setNotice(`Đã cấp Quán Ngon · Pro 365 ngày cho ${acc.email || acc.display_name}.`);
                loadAccounts();
                loadOverview();
               }}
              >
               ＋ Cấp Pro 1 năm
              </button>
             ) : (
              <button
               type="button"
               className="cms-btn"
               onClick={async () => {
                await cmsApi(`/admin/cms/accounts/${acc.id}`, 'PATCH', { grantProDays: 0 });
                setNotice(`Đã chuyển ${acc.email || acc.display_name} về gói Basic.`);
                loadAccounts();
                loadOverview();
               }}
              >
               Hạ về Basic
              </button>
             )}
             {acc.email?.toLowerCase() !== sessionInfo.allowedEmail && (
              <button
               type="button"
               className="cms-btn is-danger"
               onClick={async () => {
                if (!window.confirm(`Xóa tài khoản ${acc.email || acc.display_name}?`)) return;
                await cmsApi(`/admin/cms/accounts/${acc.id}`, 'DELETE');
                setNotice('Đã xóa tài khoản.');
                loadAccounts();
                loadOverview();
               }}
              >
               Xóa
              </button>
             )}
            </div>
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
     </>
    )}

    {/* ===================================================================== */}
    {/* TAB 4: REVIEWS, REPORTS & SYSTEM AUDIT                                */}
    {/* ===================================================================== */}
    {tab === 'moderation' && (
     <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="cms-form-section">
       <h3>⭐ Kiểm duyệt & Chỉnh sửa Đánh giá ({modData.reviews.length})</h3>
       {modData.reviews.length === 0 ? (
        <p style={{ fontSize: 13, color: '#64748b' }}>Chưa có bài đánh giá nào.</p>
       ) : (
        modData.reviews.map((rv) => (
         <div key={rv.id} className="cms-subrow">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
           <div>
            <b>{rv.restaurant_name || rv.restaurant_id}</b> · Người viết: <b>{rv.author_name || rv.author_email}</b> · Điểm:{' '}
            <b>{Number(rv.score).toFixed(2)}/5</b> · Trạng thái: <span className="cms-badge is-city">{rv.status}</span>
            <div style={{ fontSize: 12, color: '#64748b' }}>Tạo: {fmtDateTime(rv.created_at)} · Sửa: {fmtDateTime(rv.updated_at)}</div>
           </div>
           <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
             type="button"
             className="cms-btn is-success"
             onClick={async () => {
              await cmsApi(`/admin/cms/reviews/${rv.id}`, 'PATCH', { status: 'approved' });
              loadModeration();
              loadOverview();
             }}
            >
             Duyệt
            </button>
            <button
             type="button"
             className="cms-btn"
             onClick={async () => {
              const nextBody = window.prompt('Chỉnh sửa nội dung đánh giá:', rv.body);
              if (!nextBody) return;
              await cmsApi(`/admin/cms/reviews/${rv.id}`, 'PATCH', { body: nextBody });
              loadModeration();
             }}
            >
             Sửa nội dung
            </button>
            <button
             type="button"
             className="cms-btn"
             onClick={async () => {
              await cmsApi(`/admin/cms/reviews/${rv.id}`, 'PATCH', { status: 'rejected' });
              loadModeration();
              loadOverview();
             }}
            >
             Ẩn
            </button>
            <button
             type="button"
             className="cms-btn is-danger"
             onClick={async () => {
              if (!window.confirm('Xóa hẳn đánh giá này?')) return;
              await cmsApi(`/admin/cms/reviews/${rv.id}`, 'DELETE');
              loadModeration();
              loadOverview();
             }}
            >
             Xóa
            </button>
           </div>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 13.5 }}>{rv.body}</p>
         </div>
        ))
       )}
      </div>

      <div className="cms-form-section">
       <h3>🚩 Báo sai thông tin từ người dùng ({modData.reports.length})</h3>
       {modData.reports.length === 0 ? (
        <p style={{ fontSize: 13, color: '#64748b' }}>Chưa có báo sai nào.</p>
       ) : (
        modData.reports.map((rp) => (
         <div key={rp.id} className="cms-subrow">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
           <div>
            <b>{rp.restaurant_name || rp.restaurant_id}</b> · Trạng thái:{' '}
            <span className={`cms-badge ${rp.status === 'open' ? 'is-deleted' : 'is-active'}`}>{rp.status}</span> · Lúc:{' '}
            {fmtDateTime(rp.created_at)}
           </div>
           <div style={{ display: 'flex', gap: 6 }}>
            <button
             type="button"
             className="cms-btn is-primary"
             onClick={() => {
              setTab('restaurants');
              openEditById(rp.restaurant_id);
             }}
            >
             Mở sửa quán này
            </button>
            {rp.status === 'open' && (
             <button
              type="button"
              className="cms-btn is-success"
              onClick={async () => {
               await cmsApi(`/admin/cms/reports/${rp.id}`, 'PATCH', { status: 'resolved' });
               loadModeration();
               loadOverview();
              }}
             >
              ✓ Đánh dấu đã xử lý
             </button>
            )}
            <button
             type="button"
             className="cms-btn is-danger"
             onClick={async () => {
              await cmsApi(`/admin/cms/reports/${rp.id}`, 'DELETE');
              loadModeration();
              loadOverview();
             }}
            >
             Xóa
            </button>
           </div>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>{rp.body}</p>
         </div>
        ))
       )}
      </div>

      <div className="cms-form-section">
       <h3>📜 Nhật ký bảo mật & hệ thống gần nhất ({modData.audit.length})</h3>
       <div className="cms-table-wrap">
        <table className="cms-table">
         <thead>
          <tr>
           <th>Thời gian</th>
           <th>Hành động</th>
           <th>Người thực hiện</th>
           <th>Đối tượng</th>
           <th>Chi tiết</th>
          </tr>
         </thead>
         <tbody>
          {modData.audit.map((a) => (
           <tr key={a.id}>
            <td>{fmtDateTime(a.created_at)}</td>
            <td><b>{a.action}</b></td>
            <td>{a.actor}</td>
            <td className="cms-mono">{a.target}</td>
            <td className="cms-mono">{JSON.stringify(a.detail)}</td>
           </tr>
          ))}
         </tbody>
        </table>
       </div>
      </div>
     </div>
    )}
   </div>

   {/* ======================================================================= */}
   {/* MODAL 0: FULL RESTAURANT DETAIL POPUP (100% ALL FIELDS)                 */}
   {/* ======================================================================= */}
   {detailRecord && (
    <div className="cms-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailRecord(null)}>
     <div className="cms-modal-card" onClick={(e) => e.stopPropagation()}>
      <div className="cms-modal-head">
       <div>
        <h2>📋 Chi tiết đầy đủ quán ăn: {detailRecord.name}</h2>
        <small style={{ color: '#64748b' }}>
         UUID: <span className="cms-mono">{detailRecord.id}</span>
        </small>
       </div>
       <button type="button" className="cms-btn" onClick={() => setDetailRecord(null)}>✕ Đóng</button>
      </div>

      <div className="cms-modal-body">
       <div className="cms-record-top" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <div className="cms-record-thumb">
         {detailRecord.image_url ? (
          <img src={detailRecord.image_url} alt={detailRecord.name} referrerPolicy="no-referrer" />
         ) : (
          <div className="cms-record-thumb-empty">
           <BrandLogo size="compact" />
           <span>Ảnh bìa mặc định</span>
          </div>
         )}
        </div>

        <div className="cms-record-title-wrap">
         <h3>
          <span>{detailRecord.name}</span>
          <span className={`cms-badge ${detailRecord.active ? 'is-active' : 'is-deleted'}`}>
           {detailRecord.active ? '● Đang hoạt động' : '✕ Đã xóa (Đang ẩn)'}
          </span>
          {detailRecord.demo && <span className="cms-badge is-demo">Bản ghi Demo</span>}
          <span className="cms-badge is-city">
           {CITY_LABELS[detailRecord.city_slug] || detailRecord.city_slug} ({detailRecord.city_slug})
          </span>
          <span className="cms-badge is-verified">Xác minh: {detailRecord.verification_status}</span>
          {detailRecord.popularity_badge && (
           <span className="cms-badge is-pop">
            {BADGE_LABELS[detailRecord.popularity_badge] || detailRecord.popularity_badge}
           </span>
          )}
         </h3>
         <p style={{ margin: '4px 0 8px', fontSize: 14, color: '#1e293b' }}>
          📍 <b>Địa chỉ:</b> {detailRecord.address}
         </p>
         <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <button
           type="button"
           className="cms-btn is-xs"
           onClick={() => copyUuid(detailRecord.id)}
          >
           {copiedId === detailRecord.id ? '✓ Đã chép UUID' : '📋 Chép UUID'}
          </button>
          {detailRecord.lat !== null && detailRecord.lng !== null && (
           <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${detailRecord.lat},${detailRecord.lng}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cms-btn is-xs"
           >
            🗺️ Xem Google Maps ({detailRecord.lat.toFixed(6)}, {detailRecord.lng.toFixed(6)}) ↗
           </a>
          )}
          {detailRecord.external_url && (
           <a
            href={detailRecord.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="cms-btn is-xs"
           >
            🔗 Nguồn tham chiếu ↗
           </a>
          )}
         </div>
        </div>
       </div>

       <div className="cms-timestamps-bar" style={{ margin: 0 }}>
        <div className="cms-ts-item">
         <span>🟢 Thời gian tạo (created_at)</span>
         <b>{fmtDateTime(detailRecord.created_at)}</b>
        </div>
        <div className="cms-ts-item">
         <span>🔵 Thời gian sửa gần nhất (updated_at)</span>
         <b>{fmtDateTime(detailRecord.updated_at)}</b>
        </div>
        <div className={`cms-ts-item${detailRecord.deleted_at ? ' is-deleted' : ''}`}>
         <span>🔴 Thời gian xóa (deleted_at)</span>
         <b>{detailRecord.deleted_at ? fmtDateTime(detailRecord.deleted_at) : 'Chưa xóa (Đang hoạt động)'}</b>
        </div>
        <div className="cms-ts-item">
         <span>🛰️ Kiểm tra Tọa độ / Ảnh</span>
         <b>GPS: {fmtDateTime(detailRecord.location_checked_at)} · Ảnh: {fmtDateTime(detailRecord.image_checked_at)}</b>
        </div>
       </div>

       <dl className="cms-spec-grid" style={{ marginBottom: 0 }}>
        <div className="cms-spec-box">
         <dt>Phân loại món ăn (primary_group & food_groups)</dt>
         <dd>
          <b>Nhóm chính:</b> {detailRecord.primary_group} <br />
          <b>Tất cả nhóm ({detailRecord.food_groups?.length || 0}):</b> {(detailRecord.food_groups || []).join(', ') || '—'} <br />
          <b>Nguồn phân loại:</b> {detailRecord.classification_source}
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Tọa độ địa lý & Nguồn vị trí (lat, lng, location_source)</dt>
         <dd>
          <b>Vĩ độ (lat):</b> {detailRecord.lat ?? 'null'} · <b>Kinh độ (lng):</b> {detailRecord.lng ?? 'null'} <br />
          <b>Nguồn tọa độ:</b> {detailRecord.location_source} <br />
          <b>Chi nhánh của (branch_of):</b> <span className="cms-mono">{detailRecord.branch_of || 'null (Quán độc lập)'}</span>
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Khoảng giá & Giờ mở cửa (price_min, price_max, hours)</dt>
         <dd>
          <b>Giá tối thiểu:</b> {formatVnd(detailRecord.price_min)} · <b>Giá tối đa:</b> {formatVnd(detailRecord.price_max)} <br />
          <b>Khung giờ:</b> {formatHoursSummary(detailRecord.hours)}
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Độ yêu thích & Điểm xếp hạng (popularity_*)</dt>
         <dd>
          <b>Lượt thả tim:</b> {detailRecord.popularity_saves.toLocaleString('vi-VN')} ❤️ (Tài khoản đang lưu: {detailRecord.live_favorites_count ?? 0}) <br />
          <b>Điểm xếp hạng ưu tiên:</b> {Number(detailRecord.popularity_score || 0).toFixed(2)} / 100 · <b>Huy hiệu:</b> {detailRecord.popularity_badge || 'null'} <br />
          <b>Điểm nguồn tham khảo:</b> {detailRecord.popularity_rating ?? 'null'} / 10 ({detailRecord.popularity_reviews.toLocaleString('vi-VN')} lượt đánh giá nguồn)
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Tương tác người dùng thực tế & Kiểm duyệt</dt>
         <dd>
          <b>Đánh giá nội bộ đã duyệt:</b> {detailRecord.review_count} bài (Điểm TB: {detailRecord.review_avg ? Number(detailRecord.review_avg).toFixed(2) : 'null'}/5) <br />
          <b>Lượt bấm mở Google Maps:</b> {(detailRecord.live_visits_count ?? 0).toLocaleString('vi-VN')} · <b>Ghi chú Pro:</b> {detailRecord.live_notes_count ?? 0} <br />
          <b>Báo sai chưa xử lý:</b>{' '}
          <span style={{ color: (detailRecord.open_reports_count ?? 0) > 0 ? '#dc2626' : 'inherit', fontWeight: 700 }}>
           {detailRecord.open_reports_count ?? 0}
          </span>
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Nguồn gốc, Giấy phép & Đối chiếu ngoài</dt>
         <dd>
          <b>Nguồn (source):</b> {detailRecord.source} <br />
          <b>Giấy phép (data_license):</b> {detailRecord.data_license} · <b>Foody ID:</b> {detailRecord.foody_id ?? 'null'} <br />
          <b>Mã import (import_record_id):</b> {detailRecord.import_record_id || 'null'}
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Đường dẫn Ảnh đại diện & URL tham chiếu</dt>
         <dd className="cms-mono">
          <b>image_url:</b> {detailRecord.image_url || 'null (Hiển thị ảnh bìa Tìm quán ngon)'} <br />
          <b>external_url:</b> {detailRecord.external_url || 'null'}
         </dd>
        </div>

        <div className="cms-spec-box">
         <dt>Chỉ mục tìm kiếm không dấu (name_norm & search_text)</dt>
         <dd className="cms-mono">
          <b>name_norm:</b> {detailRecord.name_norm || '—'} <br />
          <b>search_text:</b> {detailRecord.search_text || '—'}
         </dd>
        </div>
       </dl>

       <div className="cms-dishes-box" style={{ marginTop: 0 }}>
        <strong style={{ fontSize: 12.5, color: '#334155' }}>
         🍜 Danh sách thực đơn chi tiết (`dishes` — {Array.isArray(detailRecord.dishes) ? detailRecord.dishes.length : 0} món):
        </strong>
        {Array.isArray(detailRecord.dishes) && detailRecord.dishes.length > 0 ? (
         <div className="cms-dishes-list">
          {detailRecord.dishes.map((d, dIdx) => (
           <div key={dIdx} className="cms-dish-chip">
            <b>{d.name}</b> <span style={{ color: '#0284c7' }}>({d.group})</span>
            {' · '}Giá: <b>{d.price !== null && d.price !== undefined ? formatVnd(d.price) : 'null'}</b>
            {d.tags?.length ? ` · Nhãn: [${d.tags.join(', ')}]` : ''}
            {d.bestsellerSource ? ` · ★ Bestseller (${d.bestsellerSource})` : ''}
           </div>
          ))}
         </div>
        ) : (
         <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Chưa khai báo món ăn chi tiết ([]).</p>
        )}
       </div>
      </div>

      <div className="cms-modal-foot">
       <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="cms-btn" onClick={() => openRestaurantHistory(detailRecord)}>
         🕓 Lịch sử Tạo / Sửa / Xóa
        </button>
        {detailRecord.active ? (
         <button type="button" className="cms-btn is-danger" disabled={busy} onClick={() => handleSoftDelete(detailRecord)}>
          🗑️ Xóa quán
         </button>
        ) : (
         <button type="button" className="cms-btn is-success" disabled={busy} onClick={() => handleRestore(detailRecord)}>
          ♻️ Khôi phục quán
         </button>
        )}
        <button type="button" className="cms-btn is-danger" disabled={busy} onClick={() => handleHardDelete(detailRecord)}>
         ⚠️ Xóa vĩnh viễn
        </button>
       </div>

       <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="cms-btn" onClick={() => setDetailRecord(null)}>Đóng</button>
        <button
         type="button"
         className="cms-btn is-primary"
         onClick={() => openEditModal(detailRecord)}
        >
         ✏️ Chỉnh sửa tất cả thông tin
        </button>
       </div>
      </div>
     </div>
    </div>
   )}

   {/* ======================================================================= */}
   {/* MODAL 1: FULL-FIELD RESTAURANT EDITOR (ALL COLUMNS)                     */}
   {/* ======================================================================= */}
   {editorOpen && (
    <div className="cms-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEditorOpen(false)}>
     <form className="cms-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveRestaurant}>
      <div className="cms-modal-head">
       <div>
        <h2>{editingId ? `✏️ Chỉnh sửa toàn bộ thông tin quán` : '＋ Tạo bản ghi quán ăn mới'}</h2>
        {editingId && (
         <small style={{ color: '#64748b' }}>
          UUID: <span className="cms-mono">{editingId}</span> · Tạo: {fmtDateTime(editingTimestamps?.created_at)} · Sửa:{' '}
          {fmtDateTime(editingTimestamps?.updated_at)}
          {editingTimestamps?.deleted_at ? ` · Xóa: ${fmtDateTime(editingTimestamps.deleted_at)}` : ''}
         </small>
        )}
       </div>
       <div style={{ display: 'flex', gap: 8 }}>
        <button
         type="button"
         className="cms-btn"
         onClick={() => {
          if (!jsonMode) {
           setRawJsonText(JSON.stringify(draftToPayload(draft), null, 2));
           setJsonMode(true);
          } else {
           try {
            const parsed = JSON.parse(rawJsonText);
            setDraft(recordToDraft({ ...(parsed as any), id: editingId || '', created_at: '', updated_at: '', deleted_at: null }));
            setJsonMode(false);
           } catch (errObj) {
            setError('JSON chưa hợp lệ: ' + (errObj as Error).message);
           }
          }
         }}
        >
         {jsonMode ? '← Quay về Biểu mẫu trực quan' : '{ } Chế độ JSON nâng cao'}
        </button>
        <button type="button" className="cms-btn" onClick={() => setEditorOpen(false)}>✕ Đóng</button>
       </div>
      </div>

      <div className="cms-modal-body">
       {jsonMode ? (
        <div className="cms-field">
         <label>Toàn bộ dữ liệu JSON của bản ghi quán ăn</label>
         <textarea
          rows={24}
          className="cms-mono"
          value={rawJsonText}
          onChange={(e) => setRawJsonText(e.target.value)}
          spellCheck={false}
         />
        </div>
       ) : (
        <>
         {/* SECTION 1: BASIC IDENTITY & STATUS */}
         <div className="cms-form-section">
          <h3>1. Thông tin định danh & Trạng thái hiển thị</h3>
          <div className="cms-form-grid">
           <div className="cms-field" style={{ gridColumn: 'span 2' }}>
            <label>Tên quán ăn *</label>
            <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
           </div>
           <div className="cms-field">
            <label>Tỉnh / Thành phố (city_slug) *</label>
            <select value={draft.city_slug} onChange={(e) => setDraft({ ...draft, city_slug: e.target.value })}>
             {Object.entries(CITY_LABELS).map(([slug, label]) => (
              <option key={slug} value={slug}>{label} ({slug})</option>
             ))}
            </select>
           </div>
           <div className="cms-field">
            <label>Trạng thái xác minh (verification_status)</label>
            <select
             value={draft.verification_status}
             onChange={(e) => setDraft({ ...draft, verification_status: e.target.value })}
            >
             <option value="verified">verified (Đã xác minh)</option>
             <option value="unverified">unverified (Chưa xác minh)</option>
             <option value="pending_verification">pending_verification (Chờ xác minh)</option>
             <option value="rejected">rejected (Từ chối)</option>
            </select>
           </div>
          </div>

          <div className="cms-checkbox-row" style={{ marginTop: 10 }}>
           <label>
            <input
             type="checkbox"
             checked={draft.active}
             onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Đang hoạt động / Hiển thị công khai (`active`)
           </label>
           <label>
            <input
             type="checkbox"
             checked={draft.demo}
             onChange={(e) => setDraft({ ...draft, demo: e.target.checked })}
            />
            Bản ghi mẫu (`demo`)
           </label>
          </div>
         </div>

         {/* SECTION 2: LOCATION & COORDINATES */}
         <div className="cms-form-section">
          <h3>2. Địa chỉ & Tọa độ GPS</h3>
          <div className="cms-form-grid">
           <div className="cms-field" style={{ gridColumn: 'span 2' }}>
            <label>Địa chỉ đầy đủ *</label>
            <input required value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
           </div>
           <div className="cms-field">
            <label>Vĩ độ — Latitude (-90..90, để trống nếu chưa có)</label>
            <input
             type="number"
             step="any"
             value={draft.lat}
             onChange={(e) => setDraft({ ...draft, lat: e.target.value })}
             placeholder="VD: 21.028511"
            />
           </div>
           <div className="cms-field">
            <label>Kinh độ — Longitude (-180..180, để trống nếu chưa có)</label>
            <input
             type="number"
             step="any"
             value={draft.lng}
             onChange={(e) => setDraft({ ...draft, lng: e.target.value })}
             placeholder="VD: 105.854444"
            />
           </div>
           <div className="cms-field">
            <label>Nguồn tọa độ (location_source)</label>
            <input
             value={draft.location_source}
             onChange={(e) => setDraft({ ...draft, location_source: e.target.value })}
            />
           </div>
           <div className="cms-field">
            <label>Là chi nhánh của UUID (branch_of — để trống nếu độc lập)</label>
            <input
             value={draft.branch_of}
             onChange={(e) => setDraft({ ...draft, branch_of: e.target.value })}
             placeholder="UUID quán gốc (tùy chọn)"
            />
           </div>
          </div>
         </div>

         {/* SECTION 3: CLASSIFICATION & PRICING */}
         <div className="cms-form-section">
          <h3>3. Phân loại món ăn & Khoảng giá</h3>
          <div className="cms-form-grid">
           <div className="cms-field">
            <label>Nhóm món chính (primary_group)</label>
            <input
             list="cms-food-groups-datalist"
             value={draft.primary_group}
             onChange={(e) => setDraft({ ...draft, primary_group: e.target.value })}
            />
            <datalist id="cms-food-groups-datalist">
             {allGroups.map((g) => (
              <option key={g} value={g} />
             ))}
            </datalist>
           </div>
           <div className="cms-field">
            <label>Tất cả nhóm món (food_groups — cách nhau dấu phẩy)</label>
            <input
             value={draft.food_groups_text}
             onChange={(e) => setDraft({ ...draft, food_groups_text: e.target.value })}
             placeholder="VD: phở, phở bò, quẩy"
            />
           </div>
           <div className="cms-field">
            <label>Nguồn phân loại (classification_source)</label>
            <input
             value={draft.classification_source}
             onChange={(e) => setDraft({ ...draft, classification_source: e.target.value })}
            />
           </div>
           <div className="cms-field">
            <label>Giá thấp nhất — VNĐ (price_min)</label>
            <input
             type="number"
             min={0}
             value={draft.price_min}
             onChange={(e) => setDraft({ ...draft, price_min: e.target.value })}
             placeholder="VD: 35000"
            />
           </div>
           <div className="cms-field">
            <label>Giá cao nhất — VNĐ (price_max)</label>
            <input
             type="number"
             min={0}
             value={draft.price_max}
             onChange={(e) => setDraft({ ...draft, price_max: e.target.value })}
             placeholder="VD: 65000"
            />
           </div>
          </div>
         </div>

         {/* SECTION 4: IMAGE & POPULARITY / RANKING */}
         <div className="cms-form-section">
          <h3>4. Hình ảnh đại diện & Độ yêu thích / Điểm xếp hạng</h3>
          <div className="cms-form-grid">
           <div className="cms-field" style={{ gridColumn: 'span 2' }}>
            <label>Đường dẫn ảnh đại diện HTTPS (image_url — để trống sẽ hiện ảnh bìa Tìm quán ngon)</label>
            <div style={{ display: 'flex', gap: 8 }}>
             <input
              value={draft.image_url}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              placeholder="https://..."
             />
             {draft.image_url && (
              <button type="button" className="cms-btn is-danger" onClick={() => setDraft({ ...draft, image_url: '' })}>
               Xóa ảnh
              </button>
             )}
            </div>
            {draft.image_url && /^https:\/\/[a-zA-Z0-9.-]+\//.test(draft.image_url.trim()) && (
             <img
              src={draft.image_url.trim()}
              alt="Xem trước"
              referrerPolicy="no-referrer"
              style={{ marginTop: 8, width: 160, height: 108, objectFit: 'cover', borderRadius: 10, border: '1px solid #cbd5e1' }}
             />
            )}
           </div>

           <div className="cms-field">
            <label>Huy hiệu độ yêu thích (popularity_badge)</label>
            <select
             value={draft.popularity_badge}
             onChange={(e) => setDraft({ ...draft, popularity_badge: e.target.value })}
            >
             <option value="">Chưa gắn (null)</option>
             <option value="top_fav">🔥 Rất được yêu thích (top_fav)</option>
             <option value="popular">❤️ Nhiều người ưa chuộng (popular)</option>
             <option value="good_rating">⭐ Đánh giá tốt (good_rating)</option>
             <option value="worth_try">✨ Quán đáng thử (worth_try)</option>
            </select>
           </div>

           <div className="cms-field">
            <label>Số lượt thả tim ❤️ (popularity_saves)</label>
            <input
             type="number"
             min={0}
             value={draft.popularity_saves}
             onChange={(e) => setDraft({ ...draft, popularity_saves: e.target.value })}
            />
           </div>

           <div className="cms-field">
            <label>Điểm ưu tiên xếp hạng 0..100 (popularity_score)</label>
            <input
             type="number"
             step="0.01"
             min={0}
             max={100}
             value={draft.popularity_score}
             onChange={(e) => setDraft({ ...draft, popularity_score: e.target.value })}
            />
           </div>

           <div className="cms-field">
            <label>Điểm tham khảo 0..10 (popularity_rating)</label>
            <input
             type="number"
             step="0.1"
             min={0}
             max={10}
             value={draft.popularity_rating}
             onChange={(e) => setDraft({ ...draft, popularity_rating: e.target.value })}
             placeholder="VD: 8.2"
            />
           </div>

           <div className="cms-field">
            <label>Số review tham khảo (popularity_reviews)</label>
            <input
             type="number"
             min={0}
             value={draft.popularity_reviews}
             onChange={(e) => setDraft({ ...draft, popularity_reviews: e.target.value })}
            />
           </div>
          </div>
         </div>

         {/* SECTION 5: DISHES BUILDER */}
         <div className="cms-form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
           <h3 style={{ margin: 0, border: 'none', padding: 0 }}>5. Thực đơn chi tiết (`dishes` — {draft.dishes.length} món)</h3>
           <button
            type="button"
            className="cms-btn is-primary"
            onClick={() =>
             setDraft({
              ...draft,
              dishes: [
               ...draft.dishes,
               { name: '', group: draft.primary_group || 'phở', tags: [], price: null, bestsellerSource: null },
              ],
             })
            }
           >
            ＋ Thêm món
           </button>
          </div>

          {draft.dishes.map((dish, idx) => (
           <div key={idx} className="cms-subrow">
            <div className="cms-form-grid">
             <div className="cms-field">
              <label>Tên món #{idx + 1}</label>
              <input
               value={dish.name}
               onChange={(e) => {
                const next = [...draft.dishes];
                next[idx] = { ...dish, name: e.target.value };
                setDraft({ ...draft, dishes: next });
               }}
               placeholder="VD: Phở tái nạm"
              />
             </div>
             <div className="cms-field">
              <label>Nhóm món</label>
              <input
               list="cms-food-groups-datalist"
               value={dish.group}
               onChange={(e) => {
                const next = [...draft.dishes];
                next[idx] = { ...dish, group: e.target.value };
                setDraft({ ...draft, dishes: next });
               }}
              />
             </div>
             <div className="cms-field">
              <label>Giá món (VNĐ — để trống nếu chưa rõ)</label>
              <input
               type="number"
               min={0}
               value={dish.price === null ? '' : String(dish.price)}
               onChange={(e) => {
                const next = [...draft.dishes];
                next[idx] = { ...dish, price: e.target.value.trim() ? Number(e.target.value) : null };
                setDraft({ ...draft, dishes: next });
               }}
              />
             </div>
             <div className="cms-field">
              <label>Nguồn Bestseller (tùy chọn)</label>
              <div style={{ display: 'flex', gap: 6 }}>
               <input
                value={dish.bestsellerSource || ''}
                onChange={(e) => {
                 const next = [...draft.dishes];
                 next[idx] = { ...dish, bestsellerSource: e.target.value || null };
                 setDraft({ ...draft, dishes: next });
                }}
                placeholder="Để trống nếu không phải"
               />
               <button
                type="button"
                className="cms-btn is-danger"
                onClick={() => setDraft({ ...draft, dishes: draft.dishes.filter((_, i) => i !== idx) })}
               >
                Xóa
               </button>
              </div>
             </div>
            </div>
            <div className="cms-tag-selector">
             {dishTagsList.map((tg) => {
              const on = dish.tags.includes(tg);
              return (
               <button
                key={tg}
                type="button"
                className={`cms-tag-btn${on ? ' is-on' : ''}`}
                onClick={() => {
                 const next = [...draft.dishes];
                 next[idx] = {
                  ...dish,
                  tags: on ? dish.tags.filter((x) => x !== tg) : [...dish.tags, tg],
                 };
                 setDraft({ ...draft, dishes: next });
                }}
               >
                {tg}
               </button>
              );
             })}
            </div>
           </div>
          ))}
         </div>

         {/* SECTION 6: OPENING HOURS BUILDER */}
         <div className="cms-form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
           <h3 style={{ margin: 0, border: 'none', padding: 0 }}>
            6. Giờ mở cửa (`hours` — {draft.hours === null ? 'Chưa cập nhật (null)' : `${draft.hours.length} ca mở cửa`})
           </h3>
           <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
             type="button"
             className="cms-btn"
             onClick={() =>
              setDraft({
               ...draft,
               hours: Array.from({ length: 7 }, (_, day) => ({ day, open: 420, close: 1320 })),
              })
             }
            >
             Đặt mẫu 07:00–22:00 cả tuần
            </button>
            <button
             type="button"
             className="cms-btn"
             onClick={() => setDraft({ ...draft, hours: [...(draft.hours || []), { day: 1, open: 420, close: 1320 }] })}
            >
             ＋ Thêm ca mở cửa
            </button>
            <button type="button" className="cms-btn" onClick={() => setDraft({ ...draft, hours: null })}>
             Đặt Chưa rõ giờ (null)
            </button>
           </div>
          </div>

          {Array.isArray(draft.hours) &&
           draft.hours.map((h, idx) => (
            <div key={idx} className="cms-subrow" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
             <select
              value={String(h.day)}
              onChange={(e) => {
               const next = [...(draft.hours || [])];
               next[idx] = { ...h, day: Number(e.target.value) };
               setDraft({ ...draft, hours: next });
              }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
             >
              {DAY_NAMES.map((dName, dVal) => (
               <option key={dVal} value={String(dVal)}>{dName}</option>
              ))}
             </select>
             <label style={{ fontSize: 12.5 }}>
              Mở:{' '}
              <input
               type="time"
               value={minToTime(h.open)}
               onChange={(e) => {
                const next = [...(draft.hours || [])];
                next[idx] = { ...h, open: timeToMin(e.target.value, false) };
                setDraft({ ...draft, hours: next });
               }}
              />
             </label>
             <label style={{ fontSize: 12.5 }}>
              Đóng:{' '}
              <input
               type="time"
               value={minToTime(h.close)}
               onChange={(e) => {
                const next = [...(draft.hours || [])];
                next[idx] = { ...h, close: timeToMin(e.target.value, true) };
                setDraft({ ...draft, hours: next });
               }}
              />
             </label>
             <button
              type="button"
              className="cms-btn is-danger"
              onClick={() => setDraft({ ...draft, hours: (draft.hours || []).filter((_, i) => i !== idx) })}
             >
              Xóa ca
             </button>
            </div>
           ))}
         </div>

         {/* SECTION 7: PROVENANCE & EXTERNAL METADATA */}
         <div className="cms-form-section">
          <h3>7. Nguồn gốc dữ liệu, Giấy phép & Liên kết đối chiếu</h3>
          <div className="cms-form-grid">
           <div className="cms-field" style={{ gridColumn: 'span 2' }}>
            <label>Nguồn dữ liệu (source) *</label>
            <input required value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
           </div>
           <div className="cms-field">
            <label>Giấy phép dữ liệu (data_license)</label>
            <select value={draft.data_license} onChange={(e) => setDraft({ ...draft, data_license: e.target.value })}>
             <option value="first_party">first_party (Chính chủ Tìm quán ngon)</option>
             <option value="odbl">odbl (OpenStreetMap ODbL)</option>
             <option value="cdla_permissive">cdla_permissive</option>
             <option value="cc0">cc0</option>
             <option value="partner_licensed">partner_licensed</option>
             <option value="unverified_import">unverified_import</option>
             <option value="demo">demo</option>
            </select>
           </div>
           <div className="cms-field">
            <label>Foody ID (tùy chọn)</label>
            <input
             type="number"
             value={draft.foody_id}
             onChange={(e) => setDraft({ ...draft, foody_id: e.target.value })}
            />
           </div>
           <div className="cms-field">
            <label>URL tham chiếu ngoài (external_url)</label>
            <input
             value={draft.external_url}
             onChange={(e) => setDraft({ ...draft, external_url: e.target.value })}
             placeholder="https://..."
            />
           </div>
           <div className="cms-field">
            <label>Mã bản ghi import (import_record_id)</label>
            <input
             value={draft.import_record_id}
             onChange={(e) => setDraft({ ...draft, import_record_id: e.target.value })}
            />
           </div>
          </div>
         </div>
        </>
       )}
      </div>

      <div className="cms-modal-foot">
       <span style={{ fontSize: 12.5, color: '#64748b' }}>
        Mọi thay đổi được áp dụng trực tiếp lên timquanngon.com và lưu dấu thời gian tự động.
       </span>
       <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="cms-btn" onClick={() => setEditorOpen(false)}>Hủy</button>
        <button type="submit" className="cms-btn is-primary" disabled={busy}>
         {busy ? 'Đang lưu…' : editingId ? '💾 Lưu toàn bộ thay đổi' : '＋ Tạo quán ăn'}
        </button>
       </div>
      </div>
     </form>
    </div>
   )}

   {/* ======================================================================= */}
   {/* MODAL 2: SINGLE-RESTAURANT LIFECYCLE HISTORY                            */}
   {/* ======================================================================= */}
   {historyModal && (
    <div className="cms-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setHistoryModal(null)}>
     <div className="cms-modal-card" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
      <div className="cms-modal-head">
       <h2>🕓 Lịch sử thời gian: {historyModal.restaurant.name}</h2>
       <button type="button" className="cms-btn" onClick={() => setHistoryModal(null)}>✕ Đóng</button>
      </div>
      <div className="cms-modal-body">
       <div className="cms-timestamps-bar">
        <div className="cms-ts-item">
         <span>🟢 Thời gian tạo</span>
         <b>{fmtDateTime(historyModal.restaurant.created_at)}</b>
        </div>
        <div className="cms-ts-item">
         <span>🔵 Thời gian sửa gần nhất</span>
         <b>{fmtDateTime(historyModal.restaurant.updated_at)}</b>
        </div>
        <div className={`cms-ts-item${historyModal.restaurant.deleted_at ? ' is-deleted' : ''}`}>
         <span>🔴 Thời gian xóa</span>
         <b>{historyModal.restaurant.deleted_at ? fmtDateTime(historyModal.restaurant.deleted_at) : 'Chưa xóa'}</b>
        </div>
       </div>

       {historyModal.events.length === 0 ? (
        <p style={{ fontSize: 13.5, color: '#64748b' }}>
         Bản ghi này chưa phát sinh chỉnh sửa thủ công nào kể từ khi nhập vào hệ thống.
        </p>
       ) : (
        historyModal.events.map((ev) => {
         const info = EVENT_LABELS[ev.event_type] || { text: ev.event_type, cls: 'is-city' };
         return (
          <div key={ev.id} className="cms-subrow">
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
             <span className={`cms-badge ${info.cls}`}>{info.text}</span>{' '}
             <b>{fmtDateTime(ev.occurred_at)}</b> · bởi {ev.actor_email}
            </div>
            <button type="button" className="cms-btn" onClick={() => setSnapshotModal(ev)}>
             Xem dữ liệu Trước / Sau
            </button>
           </div>
           <div style={{ marginTop: 6, fontSize: 12.5, color: '#475569' }}>
            Trường thay đổi: <b>{(ev.changed_fields || []).join(', ') || 'Toàn bộ bản ghi'}</b>
           </div>
          </div>
         );
        })
       )}
      </div>
     </div>
    </div>
   )}

   {/* ======================================================================= */}
   {/* MODAL 3: BEFORE / AFTER SNAPSHOT INSPECTOR                              */}
   {/* ======================================================================= */}
   {snapshotModal && (
    <div className="cms-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSnapshotModal(null)}>
     <div className="cms-modal-card" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
      <div className="cms-modal-head">
       <h2>Ảnh chụp dữ liệu lúc {fmtDateTime(snapshotModal.occurred_at)}</h2>
       <button type="button" className="cms-btn" onClick={() => setSnapshotModal(null)}>✕ Đóng</button>
      </div>
      <div className="cms-modal-body">
       <div className="cms-form-grid">
        <div className="cms-field">
         <label>Trước khi thay đổi (before_snapshot)</label>
         <textarea
          readOnly
          rows={18}
          className="cms-mono"
          value={snapshotModal.before_snapshot ? JSON.stringify(snapshotModal.before_snapshot, null, 2) : 'null (Tạo mới)'}
         />
        </div>
        <div className="cms-field">
         <label>Sau khi thay đổi (after_snapshot)</label>
         <textarea
          readOnly
          rows={18}
          className="cms-mono"
          value={snapshotModal.after_snapshot ? JSON.stringify(snapshotModal.after_snapshot, null, 2) : 'null (Xóa vĩnh viễn)'}
         />
        </div>
       </div>
      </div>
     </div>
    </div>
   )}

   {/* ======================================================================= */}
   {/* MODAL 4: ADJUST WEBSITE VISIT COUNTER OFFSET                            */}
   {/* ======================================================================= */}
   {offsetModalOpen && (
    <div className="cms-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOffsetModalOpen(false)}>
     <form className="cms-modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()} onSubmit={handleSaveOffset}>
      <div className="cms-modal-head">
       <h2>⚙️ Hiệu chỉnh Bộ đếm lượt ghé thăm</h2>
       <button type="button" className="cms-btn" onClick={() => setOffsetModalOpen(false)}>✕</button>
      </div>
      <div className="cms-modal-body">
       <p style={{ margin: 0, fontSize: 13.5, color: '#475569' }}>
        Số lượt xem ghi nhận tự động trong DB hiện là <b>{(analytics?.rawPageviews ?? 0).toLocaleString('vi-VN')}</b>.
        Bạn có thể cộng/trừ thêm một mức cơ sở (`manual_offset_pageviews`) nếu muốn đồng bộ số liệu trước đó.
       </p>
       <div className="cms-field">
        <label>Số cộng thêm vào tổng lượt ghé thăm</label>
        <input type="number" value={offsetInput} onChange={(e) => setOffsetInput(e.target.value)} />
       </div>
      </div>
      <div className="cms-modal-foot">
       <span />
       <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="cms-btn" onClick={() => setOffsetModalOpen(false)}>Hủy</button>
        <button type="submit" className="cms-btn is-primary" disabled={busy}>Lưu hiệu chỉnh</button>
       </div>
      </div>
     </form>
    </div>
   )}
  </div>
 );
}
