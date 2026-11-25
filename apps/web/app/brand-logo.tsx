'use client';

import React, { useId } from 'react';

type BrandLogoProps = {
 size?: 'header' | 'card' | 'compact';
 className?: string;
};

const STICK_UPPER =
 'M 21.82 32.56 L 60.22 16.03 A 2.45 2.45 0 0 0 58.18 11.57 L 20.58 29.84 A 1.5 1.5 0 0 0 21.82 32.56 Z';
const STICK_LOWER =
 'M 24.27 37.17 L 61.57 25.22 A 2.35 2.35 0 0 0 60.03 20.78 L 23.33 34.43 A 1.45 1.45 0 0 0 24.27 37.17 Z';

/**
 * Square Ocean-Blue Brand Mark (36x36px in header) for "Tìm quán ngon" (timquanngon.com),
 * combining a stylized 'Q' magnifying-glass search lens with a Vietnamese bowl ('cái bát')
 * and a pair of tapered chopsticks ('đôi đũa') interwoven over the upper-right lens ring.
 */
export function BrandLogo({ size = 'header', className = '' }: BrandLogoProps) {
 const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
 const bgId = `tqBg_${rawId}`;
 const glowId = `tqGlow_${rawId}`;
 const iceId = `tqIce_${rawId}`;
 const maskQId = `tqMaskQ_${rawId}`;

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

    <linearGradient id={iceId} gradientUnits="userSpaceOnUse" x1="12" y1="15" x2="60" y2="62">
     <stop offset="0%" stopColor="#e0f2fe" />
     <stop offset="65%" stopColor="#bae6fd" />
     <stop offset="100%" stopColor="#7dd3fc" />
    </linearGradient>

    {/* Cutout mask so the pair of chopsticks weaves cleanly OVER the upper-right 'Q' search ring */}
    <mask id={maskQId}>
     <rect width="72" height="72" fill="white" />
     <path d={STICK_UPPER} fill="black" stroke="black" strokeWidth="5.2" strokeLinejoin="round" />
     <path d={STICK_LOWER} fill="black" stroke="black" strokeWidth="5.2" strokeLinejoin="round" />
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

   {/* Seamless 'Q' Search Magnifying-Glass Lens + Handle ("Tìm Quán") */}
   <g mask={`url(#${maskQId})`}>
    <circle cx="32.2" cy="36.2" r="20.2" fill="none" stroke={`url(#${iceId})`} strokeWidth="4.8" />
    <path
     d="M 46.5 50.5 L 59.0 61.5"
     fill="none"
     stroke={`url(#${iceId})`}
     strokeWidth="5.8"
     strokeLinecap="round"
    />
   </g>

   {/* Sleek Tapered Chopsticks ('đôi đũa') interwoven OVER the 'Q' ring */}
   <path d={STICK_UPPER} fill="#ffffff" />
   <path d={STICK_LOWER} fill="#e0f2fe" />

   {/* Vietnamese Bowl ('cái bát') with rounded lip, pedestal foot & rim wave */}
   <path
    d="M 18.8 38.6 Q 17.6 38.6 17.8 39.8 C 18.7 46.4 23.2 50.2 27.6 51.0 L 27.6 52.2 Q 27.6 53.0 28.6 53.0 L 35.8 53.0 Q 36.8 53.0 36.8 52.2 L 36.8 51.0 C 41.2 50.2 45.7 46.4 46.6 39.8 Q 46.8 38.6 45.6 38.6 Z"
    fill="#ffffff"
   />
   <path
    d="M 22.8 42.6 Q 32.2 46.2 41.6 42.6"
    fill="none"
    stroke="#0284c7"
    strokeWidth="2.7"
    strokeLinecap="round"
   />
  </svg>
 );
}
