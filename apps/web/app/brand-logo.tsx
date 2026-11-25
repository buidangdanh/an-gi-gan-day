'use client';

import React, { useId } from 'react';

type BrandLogoProps = {
 size?: 'header' | 'card' | 'compact';
 className?: string;
};

/**
 * Square Ocean-Blue Brand Mark (36x36px in header) for "Tìm quán ngon" (timquanngon.com),
 * featuring interwoven stylized "T × Q" monogram (Q doubles as a search magnifying glass & plate)
 * with 3 alternating over/under weave crossings + culinary sparkle star.
 */
export function BrandLogo({ size = 'header', className = '' }: BrandLogoProps) {
 const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
 const bgId = `tqBg_${rawId}`;
 const glowId = `tqGlow_${rawId}`;
 const cyanId = `tqCyan_${rawId}`;
 const clipRightId = `tqRight_${rawId}`;
 const maskQId = `tqMaskQ_${rawId}`;
 const maskTId = `tqMaskT_${rawId}`;

 return (
  <svg
   xmlns="http://www.w3.org/2000/svg"
   viewBox="0 0 72 72"
   aria-hidden="true"
   className={`brand-square-mark is-${size}${className ? ' ' + className : ''}`}
  >
   <defs>
    <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
     <stop offset="0%" stopColor="#0ea5e9" />
     <stop offset="50%" stopColor="#0284c7" />
     <stop offset="100%" stopColor="#0369a1" />
    </linearGradient>

    <radialGradient id={glowId} cx="20%" cy="14%" r="70%">
     <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.38" />
     <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
    </radialGradient>

    <linearGradient id={cyanId} x1="0%" y1="0%" x2="100%" y2="100%">
     <stop offset="0%" stopColor="#e0f2fe" />
     <stop offset="100%" stopColor="#7dd3fc" />
    </linearGradient>

    <clipPath id={clipRightId}>
     <rect x="37" y="0" width="35" height="40" />
    </clipPath>

    {/* Mask for 'Q': T's left crossbar & bottom stem cross OVER Q */}
    <mask id={maskQId}>
     <rect width="72" height="72" fill="white" />
     <path d="M 12 28.5 Q 23 26.2 31 26" fill="none" stroke="black" strokeWidth="9.4" strokeLinecap="round" />
     <line x1="33.5" y1="45" x2="33.5" y2="63" stroke="black" strokeWidth="9.4" strokeLinecap="round" />
    </mask>

    {/* Mask for 'T': Q's upper-right ring crosses OVER T's right crossbar */}
    <mask id={maskTId}>
     <rect width="72" height="72" fill="white" />
     <circle
      cx="33.5"
      cy="37.5"
      r="18"
      fill="none"
      stroke="black"
      strokeWidth="9.4"
      clipPath={`url(#${clipRightId})`}
     />
    </mask>
   </defs>

   {/* Rounded Square Ocean-Blue Badge */}
   <rect width="72" height="72" rx="21" fill={`url(#${bgId})`} />
   <rect width="72" height="72" rx="21" fill={`url(#${glowId})`} />
   <rect
    x="1.2"
    y="1.2"
    width="69.6"
    height="69.6"
    rx="19.8"
    fill="none"
    stroke="rgba(255,255,255,0.3)"
    strokeWidth="1.2"
   />

   {/* Interwoven Stylized 'Q' (Magnifying-glass ring + handle) */}
   <g mask={`url(#${maskQId})`}>
    <circle cx="33.5" cy="37.5" r="18" fill="none" stroke={`url(#${cyanId})`} strokeWidth="5.4" />
    <path d="M 44 48 L 57.5 59.5" fill="none" stroke={`url(#${cyanId})`} strokeWidth="5.8" strokeLinecap="round" />
   </g>

   {/* Interwoven Stylized 'T' */}
   <g mask={`url(#${maskTId})`}>
    <path d="M 12.5 28.5 Q 34.5 24.5 56.5 28.5" fill="none" stroke="#ffffff" strokeWidth="5.7" strokeLinecap="round" />
    <line x1="33.5" y1="26.5" x2="33.5" y2="60" stroke="#ffffff" strokeWidth="5.7" strokeLinecap="round" />
   </g>

   {/* Culinary Sparkle Star ("Ngon") */}
   <path
    d="M 57.5 12 L 58.9 15.4 L 62.3 16.8 L 58.9 18.2 L 57.5 21.6 L 56.1 18.2 L 52.7 16.8 L 56.1 15.4 Z"
    fill="#ffffff"
   />
  </svg>
 );
}
