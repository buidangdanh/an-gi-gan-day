'use client';

import React, { useEffect, useState } from 'react';
import {
 AccountHubData,
 AccountPreferences,
 api,
 EXCLUDABLE_GROUPS,
 PopularityBadgeKind,
 Restaurant,
} from './api';
import { siteName } from './brand';

export type SavedPlace = {
 id: string;
 name: string;
 address: string;
 primary_group?: string;
 image_url?: string | null;
 popularity_badge?: PopularityBadgeKind | null;
};

export const SAVED_PLACES_KEY = 'ag_saved_places_v1';
const COLLECTION_ICONS = ['📌', '🍜', '☕', '💑', '🏢', '🌧️', '🔥', '🍰'];

export function loadSavedPlaces(): SavedPlace[] {
 if (typeof window === 'undefined') return [];
 try {
  const raw = window.localStorage.getItem(SAVED_PLACES_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
 } catch {
  return [];
 }
}

export function toggleLocalSavedPlace(list: SavedPlace[], r: Restaurant): SavedPlace[] {
 const exists = list.some((x) => x.id === r.id);
 const next = exists
  ? list.filter((x) => x.id !== r.id)
  : [
     {
      id: r.id,
      name: r.name,
      address: r.address,
      primary_group: r.primary_group || r.dishes?.[0]?.group || 'Quán ngon',
      image_url: r.image_url ?? null,
      popularity_badge: r.popularity_badge ?? null,
     },
     ...list,
    ].slice(0, 10); // Guest local limit = 10
 try {
  window.localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
 } catch {}
 return next;
}

type HubTab = 'profile' | 'saved' | 'personalize' | 'plans';

type HeaderProps = {
 activeTab: 'suggest' | 'search';
 hub: AccountHubData | null;
 localSaved: SavedPlace[];
 externalOpenTab?: HubTab | null;
 onClearExternalOpen?: () => void;
 onRefreshHub: () => Promise<AccountHubData | null>;
 onRemoveLocalSaved: (id: string) => void;
 onVisitPlaceId: (id: string) => void;
 onPreferencesChanged?: (prefs: AccountPreferences) => void;
};

export function HeaderBar({
 activeTab,
 hub,
 localSaved,
 externalOpenTab,
 onClearExternalOpen,
 onRefreshHub,
 onRemoveLocalSaved,
 onVisitPlaceId,
 onPreferencesChanged,
}: HeaderProps) {
 const [open, setOpen] = useState(false);
 const [tab, setTab] = useState<HubTab>('profile');
 const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
 const [displayName, setDisplayName] = useState('');
 const [username, setUsername] = useState('');
 const [password, setPassword] = useState('');
 const [editName, setEditName] = useState('');
 const [editingName, setEditingName] = useState(false);

 const [newColName, setNewColName] = useState('');
 const [newColIcon, setNewColIcon] = useState('📌');

 const [busy, setBusy] = useState(false);
 const [notice, setNotice] = useState('');
 const [err, setErr] = useState('');

 useEffect(() => {
  if (externalOpenTab) {
   setTab(externalOpenTab);
   setErr('');
   setNotice('');
   setOpen(true);
   if (onClearExternalOpen) onClearExternalOpen();
  }
 }, [externalOpenTab, onClearExternalOpen]);

 useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') setOpen(false);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [open]);

 const user = hub?.user ?? null;
 const isPro = Boolean(user?.pro);
 const cloudFavs = hub?.favorites ?? [];
 const displayedFavs = user ? cloudFavs : localSaved;
 const favCount = displayedFavs.length;
 const prefs = hub?.preferences || { excluded_groups: [], default_area: null, pro_boost: true };

 async function submitAuth(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   const endpoint = authMode === 'register' ? '/auth/register' : '/auth/password-login';
   const payload = authMode === 'register' ? { displayName, username, password } : { username, password };
   const res = await api(endpoint, 'POST', payload);
   // Sync any guest local favorites to the newly logged-in account
   for (const item of localSaved.slice(0, 10)) {
    await api('/restaurants/' + item.id + '/favorite', 'POST').catch(() => {});
   }
   const updated = await onRefreshHub();
   if (updated?.preferences && onPreferencesChanged) onPreferencesChanged(updated.preferences);
   setPassword('');
   setNotice(authMode === 'register' ? 'Chào mừng bạn! Tài khoản Thường (0đ) đã sẵn sàng.' : 'Đăng nhập thành công!');
   if (res.continuation?.url) {
    window.open(res.continuation.url, '_blank', 'noopener,noreferrer');
   }
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleLogout() {
  setBusy(true);
  setErr('');
  try {
   await api('/auth/logout', 'POST');
   await onRefreshHub();
   setNotice('Đã đăng xuất tài khoản.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleSaveProfile(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setErr('');
  try {
   await api('/account/profile', 'PATCH', { displayName: editName });
   await onRefreshHub();
   setEditingName(false);
   setNotice('Đã cập nhật tên hiển thị.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleClaimTrial() {
  if (!user) {
   setTab('profile');
   setAuthMode('register');
   setNotice('Hãy tạo tài khoản miễn phí (10 giây) trước để nhận 14 ngày Pro!');
   return;
  }
  setBusy(true);
  setErr('');
  setNotice('');
  try {
   await api('/pro/trial', 'POST');
   const updated = await onRefreshHub();
   if (updated?.preferences && onPreferencesChanged) onPreferencesChanged(updated.preferences);
   setNotice('🎉 Đã kích hoạt Ăn gì · Pro 14 ngày miễn phí! Mọi đặc quyền Pro đã mở khóa.');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleRemoveFav(id: string) {
  if (!user) {
   onRemoveLocalSaved(id);
   return;
  }
  setBusy(true);
  try {
   await api('/restaurants/' + id + '/favorite', 'DELETE');
   await onRefreshHub();
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleCreateCollection(e: React.FormEvent) {
  e.preventDefault();
  if (!newColName.trim()) return;
  setBusy(true);
  setErr('');
  try {
   await api('/collections', 'POST', { name: newColName.trim(), icon: newColIcon });
   setNewColName('');
   await onRefreshHub();
   setNotice('Đã tạo bộ sưu tập mới!');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleDeleteCollection(colId: string) {
  setBusy(true);
  setErr('');
  try {
   await api('/collections/' + colId, 'DELETE');
   await onRefreshHub();
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function handleRemoveFromCollection(colId: string, restaurantId: string) {
  setBusy(true);
  try {
   await api(`/collections/${colId}/items/${restaurantId}`, 'DELETE');
   await onRefreshHub();
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 async function updatePrefPatch(patch: Partial<AccountPreferences>) {
  setBusy(true);
  setErr('');
  try {
   const res = await api('/account/preferences', 'PUT', patch);
   await onRefreshHub();
   if (onPreferencesChanged && res.preferences) onPreferencesChanged(res.preferences);
   setNotice('Đã lưu thiết lập cá nhân hóa!');
  } catch (e) {
   setErr((e as Error).message);
  } finally {
   setBusy(false);
  }
 }

 function toggleExcludedGroup(g: string) {
  if (!isPro) {
   setTab('plans');
   return;
  }
  const exists = prefs.excluded_groups.includes(g);
  const next = exists ? prefs.excluded_groups.filter((x) => x !== g) : [...prefs.excluded_groups, g];
  updatePrefPatch({ excluded_groups: next });
 }

 return (
  <>
   <header className="discovery-topbar">
    <div className="topbar-left">
     {/* Tài khoản đứng TRƯỚC Ăn gì đây? */}
     <button
      type="button"
      className={`account-first-btn${isPro ? ' is-pro-member' : ''}`}
      onClick={() => {
       setErr('');
       setNotice('');
       setOpen(true);
      }}
      aria-label="Mở trung tâm Tài khoản Thường & Pro"
     >
      <span className="account-avatar-dot" aria-hidden="true">
       {user ? user.display_name.slice(0, 1).toUpperCase() : '👤'}
      </span>
      <span className="account-btn-label">{user ? user.display_name : 'Tài khoản'}</span>
      {isPro && <span className="pro-mini-pill">PRO</span>}
      {favCount > 0 && (
       <span className="account-saved-count" title="Số quán yêu thích">
        ♥ {favCount}
       </span>
      )}
     </button>

     <a href="/" className="discovery-brand">
      <span className="discovery-brand-mark" aria-hidden="true">ă.</span>
      <span className="discovery-brand-text">
       <span className="discovery-brand-name">
        {siteName.replace('?', '')}
        <em>?</em>
       </span>
      </span>
     </a>
    </div>

    <nav className="discovery-nav" aria-label="Điều hướng chính">
     <a href="/" className={activeTab === 'suggest' ? 'is-active' : ''} aria-current={activeTab === 'suggest' ? 'page' : undefined}>
      Gợi ý
     </a>
     <a href="/tim-kiem" className={activeTab === 'search' ? 'is-active' : ''} aria-current={activeTab === 'search' ? 'page' : undefined}>
      Tìm món
     </a>
    </nav>
   </header>

   {open && (
    <div className="action-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Trung tâm Tài khoản Thường & Pro" onClick={() => setOpen(false)}>
     <div className="account-sheet-card is-wide-hub" onClick={(e) => e.stopPropagation()}>
      <div className="account-sheet-head">
       <div className="account-sheet-user">
        <span className={`account-sheet-avatar${isPro ? ' is-pro' : ''}`} aria-hidden="true">
         {user ? user.display_name.slice(0, 1).toUpperCase() : '👤'}
        </span>
        <div>
         <div className="hub-title-row">
          <h2>{user ? user.display_name : 'Khách đang dạo quán'}</h2>
          <span className={`tier-badge ${isPro ? 'is-pro' : user ? 'is-free' : 'is-guest'}`}>
           {isPro ? '✦ PRO' : user ? 'THƯỜNG · 0đ' : 'KHÁCH'}
          </span>
         </div>
         <p>
          {isPro && user?.expires_at
           ? `Đặc quyền Pro hiệu lực đến ${new Date(user.expires_at).toLocaleDateString('vi-VN')}`
           : user
            ? `@${user.username || 'thanh-vien'} · Mở bản đồ không giới hạn`
            : `Đã mở ${hub?.distinctVisits ?? 0}/4 lượt chỉ đường miễn phí trong phiên`}
         </p>
        </div>
       </div>
       <button type="button" className="action-sheet-close is-static" onClick={() => setOpen(false)} aria-label="Đóng">
        ×
       </button>
      </div>

      {/* 4 Hub Navigation Tabs */}
      <div className="hub-tabs" role="tablist">
       <button type="button" role="tab" aria-selected={tab === 'profile'} className={`hub-tab${tab === 'profile' ? ' is-active' : ''}`} onClick={() => setTab('profile')}>
        Tài khoản
       </button>
       <button type="button" role="tab" aria-selected={tab === 'saved'} className={`hub-tab${tab === 'saved' ? ' is-active' : ''}`} onClick={() => setTab('saved')}>
        Đã lưu ({favCount})
       </button>
       <button type="button" role="tab" aria-selected={tab === 'personalize'} className={`hub-tab${tab === 'personalize' ? ' is-active' : ''}`} onClick={() => setTab('personalize')}>
        Khẩu vị Pro
       </button>
       <button type="button" role="tab" aria-selected={tab === 'plans'} className={`hub-tab${tab === 'plans' ? ' is-active' : ''}`} onClick={() => setTab('plans')}>
        Thường vs Pro
       </button>
      </div>

      {err && <p className="hub-alert is-err" role="alert">{err}</p>}
      {notice && <p className="hub-alert is-ok" role="status">{notice}</p>}

      <div className="account-sheet-body">
       {/* TAB 1: PROFILE / LOGIN / REGISTER */}
       {tab === 'profile' && (
        <>
         {!user ? (
          <div className="auth-card-box">
           <div className="auth-mode-switch">
            <button type="button" className={authMode === 'login' ? 'is-active' : ''} onClick={() => { setAuthMode('login'); setErr(''); }}>
             Đăng nhập
            </button>
            <button type="button" className={authMode === 'register' ? 'is-active' : ''} onClick={() => { setAuthMode('register'); setErr(''); }}>
             Tạo tài khoản (0đ)
            </button>
           </div>

           <form className="auth-form" onSubmit={submitAuth}>
            {authMode === 'register' && (
             <label>
              <span>Tên hiển thị của bạn</span>
              <input
               required
               minLength={2}
               maxLength={50}
               value={displayName}
               onChange={(e) => setDisplayName(e.target.value)}
               placeholder="Ví dụ: Minh Anh"
              />
             </label>
            )}
            <label>
             <span>Tên đăng nhập hoặc Email</span>
             <input
              required
              minLength={3}
              maxLength={120}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ví dụ: minhanh@gmail.com"
             />
            </label>
            <label>
             <span>Mật khẩu (tối thiểu 8 ký tự)</span>
             <input
              type="password"
              required
              minLength={authMode === 'register' ? 8 : 1}
              maxLength={128}
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
             />
            </label>
            <button type="submit" className="account-primary-btn" disabled={busy}>
             {busy ? 'Đang xử lý…' : authMode === 'register' ? 'Tạo tài khoản Thường miễn phí' : 'Đăng nhập ngay'}
            </button>
           </form>

           <div className="guest-perks-note">
            <b>Quyền lợi ngay khi tạo tài khoản Thường (0đ):</b>
            <ul>
             <li>Mở chỉ đường Google Maps <b>không giới hạn</b> (bỏ giới hạn 4 quán/phiên).</li>
             <li>Đồng bộ tối đa <b>30 quán yêu thích</b> và xem lại <b>15 quán vừa ghé</b>.</li>
             <li>Nhận ngay <b>14 ngày dùng thử Ăn gì · Pro miễn phí</b>!</li>
            </ul>
           </div>
          </div>
         ) : (
          <div className="logged-profile-box">
           <div className="hub-stats-grid">
            <div className="hub-stat-tile">
             <b>{cloudFavs.length}{!isPro ? '/30' : ''}</b>
             <span>Quán yêu thích</span>
            </div>
            <div className="hub-stat-tile">
             <b>{hub?.collections?.length ?? 0}</b>
             <span>Bộ sưu tập Pro</span>
            </div>
            <div className="hub-stat-tile">
             <b>{hub?.history?.length ?? 0}</b>
             <span>Lịch sử đã ghé</span>
            </div>
           </div>

           {!isPro && hub?.trialAvailable && (
            <div className="pro-promo-banner">
             <div>
              <b>🎁 Trải nghiệm Ăn gì · Pro 14 ngày (0đ)</b>
              <p>Mở khóa Bộ sưu tập quán ruột, Ghi chú bí kíp từng quán, Tự động né món không ăn & So sánh quán!</p>
             </div>
             <button type="button" className="pro-cta-btn" disabled={busy} onClick={handleClaimTrial}>
              Kích hoạt dùng thử ngay ✦
             </button>
            </div>
           )}

           {editingName ? (
            <form className="inline-edit-row" onSubmit={handleSaveProfile}>
             <input
              required
              minLength={2}
              maxLength={50}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
             />
             <button type="submit" className="saved-go-btn" disabled={busy}>Lưu</button>
             <button type="button" className="account-secondary-btn is-auto" onClick={() => setEditingName(false)}>Hủy</button>
            </form>
           ) : (
            <div className="profile-actions-row">
             <button
              type="button"
              className="account-secondary-btn"
              onClick={() => {
               setEditName(user.display_name);
               setEditingName(true);
              }}
             >
              ✎ Đổi tên hiển thị
             </button>
             <button type="button" className="account-secondary-btn is-danger" disabled={busy} onClick={handleLogout}>
              Đăng xuất
             </button>
            </div>
           )}

           {(hub?.history?.length ?? 0) > 0 && (
            <div className="hub-subblock">
             <div className="account-section-title">🕒 Quán bạn vừa mở bản đồ gần đây</div>
             <div className="saved-places-list">
              {hub!.history!.slice(0, 8).map((h) => (
               <div className="saved-place-row" key={h.id}>
                <div className="saved-place-info">
                 <span className="saved-place-tag">{h.primary_group || 'Đã xem'}</span>
                 <b>{h.name}</b>
                 <small>{new Date(h.chosen_at).toLocaleDateString('vi-VN')}</small>
                </div>
                <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(h.id)}>
                 Chỉ đường ↗
                </button>
               </div>
              ))}
             </div>
            </div>
           )}
          </div>
         )}
        </>
       )}

       {/* TAB 2: FAVORITES & PRO COLLECTIONS */}
       {tab === 'saved' && (
        <>
         <div className="account-section-title">
          <span>❤️ Quán yêu thích ({favCount}{!user ? '/10 trên máy' : !isPro ? '/30 gói Thường' : ' · Không giới hạn'})</span>
         </div>

         {displayedFavs.length === 0 ? (
          <div className="account-empty-box">
           Chưa có quán yêu thích. Hãy bấm <b>♡</b> trên thẻ quán bất kỳ để lưu lại!
          </div>
         ) : (
          <div className="saved-places-list">
           {displayedFavs.map((p) => (
            <div className="saved-place-row" key={p.id}>
             <div className="saved-place-info">
              <span className="saved-place-tag">{p.primary_group || 'Quán ngon'}</span>
              <b>{p.name}</b>
              <small>{p.address}</small>
             </div>
             <div className="saved-place-actions">
              <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(p.id)}>
               Chỉ đường ↗
              </button>
              <button type="button" className="saved-remove-btn" onClick={() => handleRemoveFav(p.id)} aria-label={`Bỏ lưu ${p.name}`}>
               ×
              </button>
             </div>
            </div>
           ))}
          </div>
         )}

         <div className="hub-subblock">
          <div className="account-section-title">
           <span>📌 Bộ sưu tập cá nhân</span>
           <span className="pro-mini-pill">PRO</span>
          </div>

          {!isPro ? (
           <div className="pro-locked-card">
            <p>Gom quán theo chủ đề riêng: <b>“Ăn trưa văn phòng”</b>, <b>“Hẹn hò cuối tuần”</b>, <b>“Cà phê chạy deadline”</b>…</p>
            <button type="button" className="pro-cta-btn" onClick={() => (user && hub?.trialAvailable ? handleClaimTrial() : setTab('plans'))}>
             {user && hub?.trialAvailable ? 'Mở khóa miễn phí 14 ngày ✦' : 'Xem quyền lợi Pro ✦'}
            </button>
           </div>
          ) : (
           <>
            <form className="collection-create-form" onSubmit={handleCreateCollection}>
             <select value={newColIcon} onChange={(e) => setNewColIcon(e.target.value)} aria-label="Biểu tượng bộ sưu tập">
              {COLLECTION_ICONS.map((ic) => (
               <option key={ic} value={ic}>{ic}</option>
              ))}
             </select>
             <input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              maxLength={60}
              placeholder="Tên bộ sưu tập mới (VD: Quán ruột trưa)…"
             />
             <button type="submit" className="saved-go-btn" disabled={busy}>＋ Tạo</button>
            </form>

            {(hub?.collections?.length ?? 0) === 0 ? (
             <div className="account-empty-box">
              Tạo bộ sưu tập đầu tiên ở trên, sau đó chạm vào thẻ quán bất kỳ để thêm quán vào!
             </div>
            ) : (
             <div className="collections-stack">
              {hub!.collections!.map((col) => (
               <details className="collection-box" key={col.id}>
                <summary>
                 <span><b>{col.icon} {col.name}</b> ({col.items.length} quán)</span>
                 <button
                  type="button"
                  className="text-danger-mini"
                  onClick={(e) => {
                   e.preventDefault();
                   handleDeleteCollection(col.id);
                  }}
                 >
                  Xóa
                 </button>
                </summary>
                <div className="collection-items-body">
                 {col.items.length === 0 ? (
                  <small className="muted">Chưa có quán nào trong bộ sưu tập này.</small>
                 ) : (
                  col.items.map((item) => (
                   <div className="saved-place-row" key={item.id}>
                    <div className="saved-place-info">
                     <span className="saved-place-tag">{item.primary_group}</span>
                     <b>{item.name}</b>
                     <small>{item.address}</small>
                    </div>
                    <div className="saved-place-actions">
                     <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(item.id)}>Mở Maps ↗</button>
                     <button type="button" className="saved-remove-btn" onClick={() => handleRemoveFromCollection(col.id, item.id)}>×</button>
                    </div>
                   </div>
                  ))
                 )}
                </div>
               </details>
              ))}
             </div>
            )}
           </>
          )}
         </div>

         {isPro && (hub?.notes?.length ?? 0) > 0 && (
          <div className="hub-subblock">
           <div className="account-section-title">📝 Ghi chú bí kíp riêng của bạn ({hub!.notes!.length})</div>
           <div className="saved-places-list">
            {hub!.notes!.map((n) => (
             <div className="saved-place-row" key={n.restaurant_id}>
              <div className="saved-place-info">
               <b>{n.restaurant_name}</b>
               <small>“{n.note}”</small>
              </div>
              <button type="button" className="saved-go-btn" onClick={() => onVisitPlaceId(n.restaurant_id)}>Chỉ đường ↗</button>
             </div>
            ))}
           </div>
          </div>
         )}
        </>
       )}

       {/* TAB 3: PERSONALIZE (PRO BOOST + DIETARY BLACKLIST) */}
       {tab === 'personalize' && (
        <>
         <div className="hub-subblock">
          <div className="account-section-title">
           <span>⚡ Ưu tiên quán Top Yêu thích</span>
           <span className="pro-mini-pill">PRO</span>
          </div>
          <p className="hub-desc">
           Kết hợp khoảng cách gần với điểm yêu thích cao từ cộng đồng để 4 thẻ luôn ưu tiên quán nổi tiếng, đông khách lưu.
          </p>
          {isPro ? (
           <label className="pro-toggle-box">
            <input
             type="checkbox"
             checked={prefs.pro_boost}
             onChange={(e) => updatePrefPatch({ pro_boost: e.target.checked })}
            />
            <span>Đang bật ưu tiên quán được yêu thích nhất trên trang Gợi ý</span>
           </label>
          ) : (
           <button type="button" className="pro-cta-btn" onClick={() => (user && hub?.trialAvailable ? handleClaimTrial() : setTab('plans'))}>
            Mở khóa với Ăn gì · Pro ✦
           </button>
          )}
         </div>

         <div className="hub-subblock">
          <div className="account-section-title">
           <span>🚫 Tự động ẩn các món không ăn / dị ứng</span>
           <span className="pro-mini-pill">PRO</span>
          </div>
          <p className="hub-desc">
           Chọn các nhóm món bạn muốn né — hệ thống sẽ loại hoàn toàn khỏi mọi lượt đổi 4 thẻ!
          </p>
          <div className="area-chips">
           {EXCLUDABLE_GROUPS.map((g) => {
            const active = prefs.excluded_groups.includes(g);
            return (
             <button
              key={g}
              type="button"
              className={`area-chip is-exclude-chip${active ? ' is-excluded' : ''}`}
              onClick={() => toggleExcludedGroup(g)}
             >
              {active ? `✕ Đã ẩn: ${g}` : g}
             </button>
            );
           })}
          </div>
         </div>
        </>
       )}

       {/* TAB 4: DETAILED TIER COMPARISON (THƯỜNG VS PRO) */}
       {tab === 'plans' && (
        <div className="plans-grid">
         <div className="plan-card">
          <span className="tier-badge is-free">GÓI THƯỜNG</span>
          <h3>0đ <small>/ mãi mãi</small></h3>
          <p>Đủ gọn nhẹ cho nhu cầu tìm quán hằng ngày.</p>
          <ul>
           <li>✓ Đổi 4 thẻ gợi ý Ăn / Uống không giới hạn</li>
           <li>✓ Xem ảnh quán, thời tiết & nhãn yêu thích</li>
           <li>✓ Mở chỉ đường Google Maps <b>không giới hạn</b></li>
           <li>✓ Lưu đồng bộ tối đa <b>30 quán yêu thích</b></li>
           <li>✓ Xem lại <b>15 quán</b> mở bản đồ gần nhất</li>
           <li>✓ Tự động gợi ý quán gần vị trí của bạn</li>
          </ul>
          {!user && (
           <button type="button" className="account-secondary-btn" onClick={() => { setTab('profile'); setAuthMode('register'); }}>
            Đăng ký Thường miễn phí
           </button>
          )}
         </div>

         <div className="plan-card is-pro-plan">
          <div className="plan-head-row">
           <span className="tier-badge is-pro">✦ ĂN GÌ · PRO</span>
           <span className="save-tag">Tiết kiệm 45% gói năm</span>
          </div>
          <h3>29.000đ <small>/ tháng · hoặc 199k/năm</small></h3>
          <p>Trợ lý ẩm thực cá nhân hóa trọn vẹn cho người sành ăn.</p>
          <ul>
           <li>✦ Toàn bộ quyền lợi gói Thường</li>
           <li>✦ <b>Ưu tiên quán Top Yêu thích</b> trong bán kính gần</li>
           <li>✦ Lưu yêu thích <b>không giới hạn</b> + <b>20 Bộ sưu tập riêng</b></li>
           <li>✦ <b>Tự động ẩn món không ăn / dị ứng</b> khỏi 4 thẻ</li>
           <li>✦ <b>Ghi chú bí kíp riêng</b> trên từng quán ăn</li>
           <li>✦ <b>Khay So sánh trực quan 2–4 quán</b> cùng lúc</li>
           <li>✦ Lịch sử <b>100 quán</b> + Viết đánh giá & Huy hiệu PRO</li>
          </ul>
          {isPro ? (
           <div className="pro-active-pill">✓ Bạn đang sử dụng gói Ăn gì · Pro</div>
          ) : hub?.trialAvailable !== false ? (
           <button type="button" className="pro-cta-btn is-full" disabled={busy} onClick={handleClaimTrial}>
            🎁 Dùng thử miễn phí 14 ngày (0đ)
           </button>
          ) : (
           <p className="account-auth-hint">Liên hệ cổng thanh toán đối tác để gia hạn gói Pro chính thức.</p>
          )}
         </div>
        </div>
       )}
      </div>
     </div>
    </div>
   )}
  </>
 );
}
