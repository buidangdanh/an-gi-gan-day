'use client';

import React, { useId } from 'react';

type BrandLogoProps = {
 size?: 'header' | 'card' | 'compact';
 className?: string;
};

/**
 * Square Ocean-Blue Brand Mark (36x36px in header) featuring interwoven
 * stylized "Ă × G" monogram with 4 alternating over/under weave crossings.
 */
export function BrandLogo({ size = 'header', className = '' }: BrandLogoProps) {
 const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
 const bgId = `sqBg_${rawId}`;
 const glowId = `sqGlow_${rawId}`;
 const cyanId = `sqCyan_${rawId}`;
 const maskGId = `sqMaskG_${rawId}`;
 const maskAId = `sqMaskA_${rawId}`;

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
     <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.36" />
     <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
    </radialGradient>

    <linearGradient id={cyanId} x1="0%" y1="0%" x2="100%" y2="100%">
     <stop offset="0%" stopColor="#e0f2fe" />
     <stop offset="100%" stopColor="#7dd3fc" />
    </linearGradient>

    {/* Mask for 'G': Ă crosses OVER top arc & bottom-left arc of G */}
    <mask id={maskGId}>
     <rect width="72" height="72" fill="white" />
     <line x1="31" y1="32" x2="39" y2="18" stroke="black" strokeWidth="9.4" strokeLinecap="round" />
     <line x1="18" y1="58" x2="26.2" y2="40" stroke="black" strokeWidth="9.4" strokeLinecap="round" />
    </mask>

    {/* Mask for 'Ă': G's inward bar & lower-right curve cross OVER right leg of Ă */}
    <mask id={maskAId}>
     <rect width="72" height="72" fill="white" />
     <path
      d="M 35 42 L 54 42 C 54 50, 49 55, 42 57"
      fill="none"
      stroke="black"
      strokeWidth="9.4"
      strokeLinecap="round"
      strokeLinejoin="round"
     />
    </mask>
   </defs>

   {/* Rounded Square Ocean-Blue Background */}
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

   {/* Interwoven Stylized 'G' */}
   <path
    mask={`url(#${maskGId})`}
    d="M 49 26 C 42 18, 25 18, 17 29 C 10 38, 13 52, 26 57 C 39 61, 54 54, 54 42 L 33.5 42"
    fill="none"
    stroke={`url(#${cyanId})`}
    strokeWidth="5.5"
    strokeLinecap="round"
    strokeLinejoin="round"
   />

   {/* Interwoven Stylized 'Ă' */}
   <path
    mask={`url(#${maskAId})`}
    d="M 19 57 L 36 21 L 53 58"
    fill="none"
    stroke="#ffffff"
    strokeWidth="5.7"
    strokeLinecap="round"
    strokeLinejoin="round"
   />

   {/* Smiling Bowl Breve (˘) + 4-point Sparkle */}
   <path
    d="M 29.5 11.5 C 32.5 15.8, 39.5 15.8, 42.5 11.5"
    fill="none"
    stroke="#ffffff"
    strokeWidth="4.2"
    strokeLinecap="round"
   />
   <path
    d="M 56 14 L 57.3 17.2 L 60.5 18.5 L 57.3 19.8 L 56 23 L 54.7 19.8 L 51.5 18.5 L 54.7 17.2 Z"
    fill="#bae6fd"
   />
  </svg>
 );
}
