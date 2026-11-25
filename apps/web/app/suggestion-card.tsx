'use client';

import React, { useEffect, useState } from 'react';
import { api, PopularityBadgeKind, Restaurant, UserCollection } from './api';
import { BrandLogo } from './brand-logo';

export function getPopularityInfo(
 badge?: PopularityBadgeKind | null,
 saves?: number,
): { icon: string; text: string; cls: string } | null {
 if (!badge) return null;
 const saveSuffix = saves && saves >= 5 ? ` · ${saves.toLocaleString('vi-VN')} lưu` : '';
 if (badge === 'top_fav') return { icon: '🔥', text: `Rất được yêu thích${saveSuffix}`, cls: 'is-top-fav' };
 if (badge === 'popular') return { icon: '❤️', text: `Nhiều người ưa chuộng${saveSuffix}`, cls: 'is-popular' };
 if (badge === 'good_rating') return { icon: '⭐', text: `Đánh giá tốt${saveSuffix}`, cls: 'is-good' };
 if (badge === 'worth_try') return { icon: '✨', text: `Quán đáng thử${saveSuffix}`, cls: 'is-try' };
 return null;
}

type CardProps = {
 restaurant: Restaurant;
 index?: number;
 distance: number | null;
 busy: boolean;
 loading: boolean;
 highlighted?: boolean;
 picked?: boolean;
 liked?: boolean;
 note?: string;
 onSelectCard?: (restaurant: Restaurant, distance: number | null) => void;
 onToggleLike?: (restaurant: Restaurant) => void;
 onVisit: (restaurant: Restaurant) => void;
};

export function dishTone(group: string): { cls: string; glyph: string } {
 const g = group.toLowerCase();
 if (/cà phê/.test(g)) return { cls: 'tone-coffee', glyph: '☕' };
 if (/trà sữa|trà|đồ uống/.test(g)) return { cls: 'tone-tea', glyph: '🧋' };
 if (/bar|bia/.test(g)) return { cls: 'tone-chill', glyph: '🍻' };
 if (/phở|bún|miến|cháo|mì|hủ tiếu|bánh canh|bánh đa/.test(g)) return { cls: 'tone-broth', glyph: '🍜' };
 if (/lẩu|nướng|hải sản|hàn|nhật|trung/.test(g)) return { cls: 'tone-feast', glyph: '🍲' };
 if (/cơm tấm|cơm/.test(g)) return { cls: 'tone-rice', glyph: '🍚' };
 if (/bánh|xôi|burger|pizza/.test(g)) return { cls: 'tone-quick', glyph: '🥖' };
 if (/kem|chè|ăn vặt|ngọt|nộm|nem/.test(g)) return { cls: 'tone-treat', glyph: '🍨' };
 if (/chay/.test(g)) return { cls: 'tone-light', glyph: '🥬' };
 return { cls: 'tone-rice', glyph: '🍚' };
}

export function formatDistance(meters: number | null): string | null {
 if (meters === null) return null;
 if (meters < 1000) return `≈ ${meters} m`;
 return `≈ ${(meters / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function BrandPlaceholder({
 glyph,
 variant = 'card',
}: {
 glyph: string;
 variant?: 'card' | 'sheet' | 'compact';
}) {
 return (
  <div
   className={`food-card-illustration${variant === 'sheet' ? ' is-large' : variant === 'compact' ? ' is-compact' : ''}`}
   role="img"
   aria-label="Ảnh đại diện mặc định Ăn gì đây?"
  >
   <svg
    className="brand-fallback-bg-svg"
    viewBox="0 0 400 250"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
   >
    <defs>
     <radialGradient id="agGlow" cx="78%" cy="22%" r="65%">
      <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.38" />
      <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.10" />
      <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0" />
     </radialGradient>
    </defs>
    <rect width="400" height="250" fill="url(#agGlow)" />
    <circle cx="330" cy="48" r="88" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.2" />
    <circle cx="330" cy="48" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 5" strokeWidth="1.2" />
    <circle cx="62" cy="212" r="74" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" />
   </svg>

   <div className="brand-fallback-lockup is-emblem-only" aria-hidden="true">
    <BrandLogo variant={variant === 'compact' ? 'compact' : 'card'} />
   </div>
  </div>
 );
}

export function SuggestionCard({
 restaurant: r,
 index,
 distance,
 busy,
 loading,
 highlighted = false,
 picked = false,
 liked = false,
 note,
 onSelectCard,
 onToggleLike,
 onVisit,
}: CardProps) {
 const [imgFailed, setImgFailed] = useState(false);

 useEffect(() => {
  setImgFailed(false);
 }, [r.image_url]);

 const dishName = r.primary_group || r.dishes[0]?.group || 'Món gợi ý';
 const distText = formatDistance(distance);
 const tone = dishTone(dishName);
 const showImage = Boolean(r.image_url && !imgFailed);
 const w = r.weather;
 const pop = getPopularityInfo(r.popularity_badge, r.popularity_saves);

 const openActions = () => {
  if (onSelectCard) onSelectCard(r, distance);
 };

 return (
  <article
   className={`food-card ${tone.cls}${w ? ' aura-' + w.aura : ''}${showImage ? ' has-photo' : ' no-photo'}${highlighted ? ' is-highlighted' : ''}${picked ? ' is-picked' : ''}`}
   aria-label={`${dishName} tại ${r.name}`}
  >
   <div
    className="food-card-media"
    role="button"
    tabIndex={0}
    aria-label={`Mở tùy chọn nhanh cho ${r.name}`}
    onClick={openActions}
    onKeyDown={(e) => {
     if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openActions();
     }
    }}
   >
    {showImage ? (
     <img
      src={r.image_url!}
      alt={r.name}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="food-card-img"
      onError={() => setImgFailed(true)}
     />
    ) : (
     <BrandPlaceholder glyph={tone.glyph} variant="card" />
    )}
    <div className="food-card-scrim" aria-hidden="true" />

    <div className="food-card-top-badges">
     {onToggleLike ? (
      <button
       type="button"
       className={`card-like-pill${liked ? ' is-liked' : ''}`}
       aria-label={liked ? `Bỏ thích ${r.name}` : `Thả tim ${r.name}`}
       onClick={(e) => {
        e.stopPropagation();
        onToggleLike(r);
       }}
      >
       {liked ? '♥' : '♡'}
      </button>
     ) : (
      <span className="card-index-pill">{index !== undefined ? `0${index + 1}` : '✦'}</span>
     )}

     {picked ? (
      <span className="card-float-badge is-pick">✦ Chốt quán này!</span>
     ) : distText ? (
      <span className="card-float-badge is-dist">{distText}</span>
     ) : null}
    </div>

    <div className="food-card-dish-overlay">
     <span className="card-dish-pill">{dishName}</span>
     {pop && (
      <span className={`card-pop-pill ${pop.cls}`}>
       <span aria-hidden="true">{pop.icon}</span> {pop.text}
      </span>
     )}
    </div>
   </div>

   {w && (
    <div className={`food-card-weather is-${w.aura}`} onClick={openActions}>
     <span className="weather-icon" aria-hidden="true">{w.icon}</span>
     <span className="weather-temp">{w.tempC}°C</span>
     <span className="weather-sep" aria-hidden="true">·</span>
     <span className="weather-vibe">{w.condition} — {w.vibe}</span>
    </div>
   )}

   <div className="food-card-body" onClick={openActions}>
    <h3 className="food-card-place">{r.name}</h3>
    <p className="food-card-address">{r.address}</p>
    {note && <p className="food-card-my-note">📝 “{note}”</p>}
   </div>

   <div className="food-card-footer">
    <button
     type="button"
     className="card-more-btn"
     onClick={openActions}
     aria-label={`Tùy chọn cho ${r.name}`}
    >
     <span>✦ Tùy chọn</span>
    </button>
    <button
     type="button"
     className={`card-go-btn${picked ? ' is-picked-btn' : ''}`}
     disabled={busy || loading}
     onClick={() => onVisit(r)}
    >
     <span>Chỉ đường</span>
     <span aria-hidden="true">↗</span>
    </button>
   </div>
  </article>
 );
}

type SheetProps = {
 restaurant: Restaurant | null;
 distance: number | null;
 liked: boolean;
 isPro: boolean;
 collections: UserCollection[];
 existingNote?: string;
 inCompare?: boolean;
 busy: boolean;
 onClose: () => void;
 onVisit: (restaurant: Restaurant) => void;
 onToggleLike: (restaurant: Restaurant) => void;
 onToggleCompare?: (restaurant: Restaurant) => void;
 onOpenProPlans?: () => void;
 onRefreshHub?: () => Promise<any>;
};

export function CardActionSheet({
 restaurant: r,
 distance,
 liked,
 isPro,
 collections,
 existingNote = '',
 inCompare = false,
 busy,
 onClose,
 onVisit,
 onToggleLike,
 onToggleCompare,
 onOpenProPlans,
 onRefreshHub,
}: SheetProps) {
 const [copied, setCopied] = useState<'address' | 'share' | null>(null);
 const [imgFailed, setImgFailed] = useState(false);
 const [noteDraft, setNoteDraft] = useState(existingNote);
 const [noteSavedMsg, setNoteSavedMsg] = useState('');
 const [subBusy, setSubBusy] = useState(false);

 useEffect(() => {
  setCopied(null);
  setImgFailed(false);
  setNoteDraft(existingNote || '');
  setNoteSavedMsg('');
 }, [r?.id, existingNote]);

 useEffect(() => {
  if (!r) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') onClose();
  };
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKey);
  return () => {
   document.body.style.overflow = prev;
   window.removeEventListener('keydown', onKey);
  };
 }, [r, onClose]);

 if (!r) return null;

 const dishName = r.primary_group || r.dishes[0]?.group || 'Món gợi ý';
 const distText = formatDistance(distance);
 const tone = dishTone(dishName);
 const showImage = Boolean(r.image_url && !imgFailed);
 const w = r.weather;
 const pop = getPopularityInfo(r.popularity_badge, r.popularity_saves);

 async function copyAddress() {
  if (!r) return;
  const text = `${r.name} — ${r.address}`;
  try {
   await navigator.clipboard.writeText(text);
   setCopied('address');
   window.setTimeout(() => setCopied(null), 2200);
  } catch {}
 }

 async function sharePlace() {
  if (!r) return;
  const text = `Đi ăn/uống ${dishName} ở "${r.name}" (${r.address}) không?`;
  if (typeof navigator !== 'undefined' && navigator.share) {
   try {
    await navigator.share({ title: r.name, text });
    return;
   } catch {}
  }
  try {
   await navigator.clipboard.writeText(text);
   setCopied('share');
   window.setTimeout(() => setCopied(null), 2200);
  } catch {}
 }

 async function handleToggleCollection(col: UserCollection) {
  if (!r) return;
  const has = col.items.some((x) => x.id === r.id);
  setSubBusy(true);
  try {
   if (has) await api(`/collections/${col.id}/items/${r.id}`, 'DELETE');
   else await api(`/collections/${col.id}/items`, 'POST', { restaurantId: r.id });
   if (onRefreshHub) await onRefreshHub();
  } catch {}
  setSubBusy(false);
 }

 async function handleSaveNote(e: React.FormEvent) {
  e.preventDefault();
  if (!r) return;
  setSubBusy(true);
  try {
   if (!noteDraft.trim()) {
    await api(`/restaurants/${r.id}/note`, 'DELETE');
    setNoteSavedMsg('Đã xóa ghi chú.');
   } else {
    await api(`/restaurants/${r.id}/note`, 'PUT', { note: noteDraft.trim() });
    setNoteSavedMsg('✓ Đã lưu ghi chú riêng!');
   }
   if (onRefreshHub) await onRefreshHub();
  } catch {}
  setSubBusy(false);
 }

 return (
  <div className="action-sheet-backdrop" role="dialog" aria-modal="true" aria-label={r.name} onClick={onClose}>
   <div className={`action-sheet-card ${tone.cls}`} onClick={(e) => e.stopPropagation()}>
    <div className="action-sheet-hero">
     {showImage ? (
      <img
       src={r.image_url!}
       alt={r.name}
       referrerPolicy="no-referrer"
       className="action-sheet-img"
       onError={() => setImgFailed(true)}
      />
     ) : (
      <BrandPlaceholder glyph={tone.glyph} variant="sheet" />
     )}
     <div className="action-sheet-scrim" aria-hidden="true" />
     <button type="button" className="action-sheet-close" onClick={onClose} aria-label="Đóng">
      ×
     </button>
     <div className="action-sheet-hero-meta">
      <div className="action-sheet-pills">
       <span className="card-dish-pill">{dishName}</span>
       {pop && <span className={`card-pop-pill ${pop.cls}`}>{pop.icon} {pop.text}</span>}
       {distText && <span className="card-float-badge is-dist">{distText}</span>}
      </div>
      <h2>{r.name}</h2>
      <p>{r.address}</p>
     </div>
    </div>

    {w && (
     <div className={`sheet-weather-banner is-${w.aura}`}>
      <span>{w.icon} Thời tiết quanh quán: <b>{w.tempC}°C ({w.condition})</b> — {w.vibe}.</span>
     </div>
    )}

    <div className="action-sheet-scroll">
     <div className="action-bento-grid">
      <button
       type="button"
       className="action-tile is-maps"
       disabled={busy}
       onClick={() => onVisit(r)}
      >
       <span className="action-tile-icon" aria-hidden="true">🗺️</span>
       <span className="action-tile-title">Mở Google Maps</span>
       <span className="action-tile-sub">Xem vị trí & đường đi ngay ↗</span>
      </button>

      <button
       type="button"
       className={`action-tile is-copy${copied === 'address' ? ' is-done' : ''}`}
       onClick={copyAddress}
      >
       <span className="action-tile-icon" aria-hidden="true">{copied === 'address' ? '✓' : '📋'}</span>
       <span className="action-tile-title">{copied === 'address' ? 'Đã chép địa chỉ!' : 'Chép địa chỉ'}</span>
       <span className="action-tile-sub">Dán nhanh vào Grab / XanhSM</span>
      </button>

      <button
       type="button"
       className={`action-tile is-like${liked ? ' is-liked' : ''}`}
       onClick={() => onToggleLike(r)}
      >
       <span className="action-tile-icon" aria-hidden="true">{liked ? '❤️' : '🤍'}</span>
       <span className="action-tile-title">{liked ? 'Đã lưu quán thích' : 'Thả tim lưu quán'}</span>
       <span className="action-tile-sub">{liked ? 'Chạm để bỏ lưu' : 'Giữ lại trong Tài khoản'}</span>
      </button>

      <button
       type="button"
       className={`action-tile is-share${copied === 'share' ? ' is-done' : ''}`}
       onClick={sharePlace}
      >
       <span className="action-tile-icon" aria-hidden="true">{copied === 'share' ? '✓' : '📤'}</span>
       <span className="action-tile-title">{copied === 'share' ? 'Đã chép lời rủ!' : 'Rủ bạn đi cùng'}</span>
       <span className="action-tile-sub">Gửi nhanh qua Zalo / tin nhắn</span>
      </button>
     </div>

     {/* PRO TOOLS INSIDE CARD SHEET */}
     <div className="sheet-pro-zone">
      <div className="sheet-pro-head">
       <span>✦ Tiện ích Ăn gì · Pro</span>
       {!isPro && onOpenProPlans && (
        <button type="button" className="sheet-unlock-link" onClick={() => { onClose(); onOpenProPlans(); }}>
         Dùng thử 14 ngày (0đ) ↗
        </button>
       )}
      </div>

      {isPro ? (
       <>
        <div className="sheet-pro-actions-row">
         {onToggleCompare && (
          <button
           type="button"
           className={`pro-chip-btn${inCompare ? ' is-selected' : ''}`}
           onClick={() => onToggleCompare(r)}
          >
           {inCompare ? '✓ Đang trong khay So sánh' : '⚖️ Thêm vào So sánh quán'}
          </button>
         )}

         {collections.map((col) => {
          const inCol = col.items.some((x) => x.id === r.id);
          return (
           <button
            key={col.id}
            type="button"
            disabled={subBusy}
            className={`pro-chip-btn${inCol ? ' is-selected' : ''}`}
            onClick={() => handleToggleCollection(col)}
           >
            {inCol ? `✓ ${col.icon} ${col.name}` : `＋ ${col.icon} ${col.name}`}
           </button>
          );
         })}
        </div>

        <form className="sheet-note-form" onSubmit={handleSaveNote}>
         <input
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          maxLength={500}
          placeholder="📝 Ghi chú riêng cho quán này (VD: Gọi tái gầu, gửi xe ngõ cạnh)…"
         />
         <button type="submit" disabled={subBusy}>Lưu</button>
        </form>
        {noteSavedMsg && <small className="note-saved-hint">{noteSavedMsg}</small>}
       </>
      ) : (
       <p className="sheet-pro-teaser">
        Mở khóa <b>So sánh 2–4 quán</b>, lưu vào <b>Bộ sưu tập theo chủ đề</b> và <b>Ghi chú bí kíp riêng</b> cho từng quán.
       </p>
      )}
     </div>
    </div>
   </div>
  </div>
 );
}

function CompareCardThumb({ restaurant: r }: { restaurant: Restaurant }) {
 const [failed, setFailed] = useState(false);
 const dishName = r.primary_group || r.dishes[0]?.group || 'Món gợi ý';
 const tone = dishTone(dishName);
 if (r.image_url && !failed) {
  return (
   <img
    src={r.image_url}
    alt={r.name}
    referrerPolicy="no-referrer"
    className="compare-col-img"
    onError={() => setFailed(true)}
   />
  );
 }
 return (
  <div className={`compare-col-fallback ${tone.cls}`}>
   <BrandPlaceholder glyph={tone.glyph} variant="compact" />
  </div>
 );
}

export function ProCompareModal({
 items,
 notesById,
 onClose,
 onRemove,
 onVisit,
}: {
 items: { restaurant: Restaurant; distance: number | null }[];
 notesById: Record<string, string>;
 onClose: () => void;
 onRemove: (id: string) => void;
 onVisit: (r: Restaurant) => void;
}) {
 if (!items.length) return null;
 return (
  <div className="action-sheet-backdrop" role="dialog" aria-modal="true" aria-label="So sánh quán Pro" onClick={onClose}>
   <div className="account-sheet-card is-compare-modal" onClick={(e) => e.stopPropagation()}>
    <div className="account-sheet-head">
     <div>
      <span className="tier-badge is-pro">✦ SO SÁNH NHANH · PRO</span>
      <h2 style={{ margin: '4px 0 0', fontSize: 19 }}>Đặt cạnh nhau để dễ chốt ({items.length} quán)</h2>
     </div>
     <button type="button" className="action-sheet-close is-static" onClick={onClose} aria-label="Đóng">×</button>
    </div>

    <div className="compare-cards-grid">
     {items.map(({ restaurant: r, distance }) => {
      const pop = getPopularityInfo(r.popularity_badge, r.popularity_saves);
      const dist = formatDistance(distance ?? r.distance ?? null);
      return (
       <article className="compare-col-card" key={r.id}>
        <CompareCardThumb restaurant={r} />
        <div className="compare-col-body">
         <span className="saved-place-tag">{r.primary_group || r.dishes[0]?.group}</span>
         <h3>{r.name}</h3>
         <p className="compare-addr">{r.address}</p>
         <div className="compare-specs">
          <div><b>Khoảng cách:</b> <span>{dist || 'Chưa rõ'}</span></div>
          <div><b>Độ yêu thích:</b> <span>{pop ? `${pop.icon} ${pop.text}` : 'Mới / chưa xếp hạng'}</span></div>
          {r.weather && (
           <div><b>Thời tiết:</b> <span>{r.weather.icon} {r.weather.tempC}°C · {r.weather.condition}</span></div>
          )}
          {notesById[r.id] && (
           <div><b>Ghi chú của bạn:</b> <span>“{notesById[r.id]}”</span></div>
          )}
         </div>
         <div className="compare-col-actions">
          <button type="button" className="saved-go-btn is-full" onClick={() => onVisit(r)}>Chốt quán này ↗</button>
          <button type="button" className="text-danger-mini" onClick={() => onRemove(r.id)}>Bỏ khỏi so sánh</button>
         </div>
        </div>
       </article>
      );
     })}
    </div>
   </div>
  </div>
 );
}
