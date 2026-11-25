'use client';

import React, { useId } from 'react';

type BrandLogoProps = {
 variant?: 'header' | 'card' | 'compact';
 className?: string;
};

export function BrandLogo({ variant = 'header', className = '' }: BrandLogoProps) {
 const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
 const bgId = `agBg_${rawId}`;
 const glowId = `agGlow_${rawId}`;
 const glossId = `agGloss_${rawId}`;
 const whiteId = `agWhite_${rawId}`;
 const iceId = `agIce_${rawId}`;
 const cyanId = `agCyan_${rawId}`;
 const clipId = `agClip_${rawId}`;

 return (
  <svg
   xmlns="http://www.w3.org/2000/svg"
   viewBox="0 0 284 72"
   role="img"
   aria-label="Ăn gì đây?"
   className={`brand-logo-svg is-${variant}${className ? ' ' + className : ''}`}
  >
   <defs>
    <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
     <stop offset="0%" stopColor="#0ea5e9" />
     <stop offset="45%" stopColor="#0284c7" />
     <stop offset="100%" stopColor="#075985" />
    </linearGradient>

    <radialGradient id={glowId} cx="22%" cy="15%" r="68%">
     <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.34" />
     <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.06" />
     <stop offset="100%" stopColor="#075985" stopOpacity="0" />
    </radialGradient>

    <linearGradient id={glossId} x1="0%" y1="0%" x2="0%" y2="100%">
     <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
     <stop offset="46%" stopColor="#ffffff" stopOpacity="0.03" />
     <stop offset="48%" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>

    <linearGradient id={whiteId} x1="0%" y1="0%" x2="0%" y2="100%">
     <stop offset="0%" stopColor="#ffffff" />
     <stop offset="100%" stopColor="#f0f9ff" />
    </linearGradient>

    <linearGradient id={iceId} x1="0%" y1="0%" x2="0%" y2="100%">
     <stop offset="0%" stopColor="#f0f9ff" />
     <stop offset="100%" stopColor="#bae6fd" />
    </linearGradient>

    <linearGradient id={cyanId} x1="0%" y1="0%" x2="100%" y2="100%">
     <stop offset="0%" stopColor="#e0f2fe" />
     <stop offset="55%" stopColor="#7dd3fc" />
     <stop offset="100%" stopColor="#38bdf8" />
    </linearGradient>

    <clipPath id={clipId}>
     <rect x="1" y="1" width="282" height="70" rx="19" />
    </clipPath>
   </defs>

   {/* Ocean Blue Emblem */}
   <g clipPath={`url(#${clipId})`}>
    <rect x="1" y="1" width="282" height="70" rx="19" fill={`url(#${bgId})`} />
    <rect x="1" y="1" width="282" height="70" rx="19" fill={`url(#${glowId})`} />
    <circle cx="264" cy="12" r="38" fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="1.3" />
    <circle cx="20" cy="64" r="30" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.3" />
    <rect x="1" y="1" width="282" height="35" fill={`url(#${glossId})`} />
   </g>
   <rect
    x="1.75"
    y="1.75"
    width="280.5"
    height="68.5"
    rx="18.25"
    fill="none"
    stroke="rgba(255,255,255,0.34)"
    strokeWidth="1.5"
   />

   {/* Interwoven Stylized Lettering: "Ăn gì đây?" */}
   <g fontFamily="var(--sans), 'Segoe UI', system-ui, sans-serif" fontWeight="900">
    {/* Word 1: "Ăn" — 'n' tucked behind right leg of 'Ă' */}
    <text
     x="44"
     y="51"
     transform="rotate(3 55 40)"
     fontSize="38"
     fill={`url(#${iceId})`}
     stroke="#064e78"
     strokeWidth="6.2"
     strokeLinejoin="round"
     paintOrder="stroke fill"
    >
     n
    </text>

    <g transform="translate(17, 52) rotate(-4)">
     <text
      x="0"
      y="0"
      fontSize="43"
      fill={`url(#${whiteId})`}
      stroke="#064e78"
      strokeWidth="6.6"
      strokeLinejoin="round"
      paintOrder="stroke fill"
     >
      A
     </text>
     {/* Smiling rice-bowl breve (˘) + aroma dot */}
     <path d="M 8 -35 C 11.5 -29.5, 20.5 -29.5, 24 -35" fill="none" stroke="#064e78" strokeWidth="7" strokeLinecap="round" />
     <path d="M 8 -35 C 11.5 -29.5, 20.5 -29.5, 24 -35" fill="none" stroke="#7dd3fc" strokeWidth="3.4" strokeLinecap="round" />
     <circle cx="16" cy="-39.5" r="2" fill="#e0f2fe" />
    </g>

    {/* Sweeping interlacing wave ribbon (weaves UNDER 'g' & 'y' loops) */}
    <path
     d="M 24 58 C 68 65, 118 53, 168 60 C 198 64, 224 59, 244 52"
     fill="none"
     stroke="#064e78"
     strokeWidth="6"
     strokeLinecap="round"
    />
    <path
     d="M 24 58 C 68 65, 118 53, 168 60 C 198 64, 224 59, 244 52"
     fill="none"
     stroke={`url(#${cyanId})`}
     strokeWidth="2.6"
     strokeLinecap="round"
    />

    {/* Word 2: "gì" — vector 'ì' stem + grave accent tucked tightly beside 'g' */}
    <g transform="translate(115, 49) rotate(4)">
     <path d="M 5 -2 L 5 -21" stroke="#064e78" strokeWidth="13.2" strokeLinecap="round" />
     <path d="M 5 -2 L 5 -21" stroke={`url(#${iceId})`} strokeWidth="7" strokeLinecap="round" />
     <path d="M 2 -32.5 L 9.5 -25.5" stroke="#064e78" strokeWidth="6.8" strokeLinecap="round" />
     <path d="M 2 -32.5 L 9.5 -25.5" stroke="#7dd3fc" strokeWidth="3.4" strokeLinecap="round" />
    </g>

    <g transform="translate(86, 49) rotate(-4)">
     <text
      x="0"
      y="0"
      fontSize="40"
      fill={`url(#${whiteId})`}
      stroke="#064e78"
      strokeWidth="6.4"
      strokeLinejoin="round"
      paintOrder="stroke fill"
     >
      g
     </text>
    </g>

    {/* Word 3: "đây" — interwoven triad ('y' & 'đ' flanking 'â', 'y' loop weaving over ribbon) */}
    <g transform="translate(199, 50) rotate(-3)">
     <text
      x="0"
      y="0"
      fontSize="39"
      fill={`url(#${whiteId})`}
      stroke="#064e78"
      strokeWidth="6.4"
      strokeLinejoin="round"
      paintOrder="stroke fill"
     >
      y
     </text>
    </g>

    <g transform="translate(173, 50) rotate(3)">
     <text
      x="0"
      y="0"
      fontSize="38"
      fill={`url(#${iceId})`}
      stroke="#064e78"
      strokeWidth="6.2"
      strokeLinejoin="round"
      paintOrder="stroke fill"
     >
      a
     </text>
     <path d="M 5 -27 L 12.5 -33.5 L 20 -27" fill="none" stroke="#064e78" strokeWidth="6.8" strokeLinecap="round" strokeLinejoin="round" />
     <path d="M 5 -27 L 12.5 -33.5 L 20 -27" fill="none" stroke="#ffffff" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    <g transform="translate(145, 52) rotate(-3)">
     <text
      x="0"
      y="0"
      fontSize="40"
      fill={`url(#${whiteId})`}
      stroke="#064e78"
      strokeWidth="6.4"
      strokeLinejoin="round"
      paintOrder="stroke fill"
     >
      d
     </text>
     {/* Stylized chopstick crossbar */}
     <path d="M 11 -23 L 28 -26" stroke="#064e78" strokeWidth="6.2" strokeLinecap="round" />
     <path d="M 11 -23 L 28 -26" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round" />
    </g>
   </g>

   {/* Sculpted '?' with 4-point sparkle dot */}
   <g transform="translate(230, 48) rotate(7)">
    <path
     d="M 4 -24 C 4 -35, 23 -36, 23 -23 C 23 -15, 13 -13.5, 13 -6"
     fill="none"
     stroke="#064e78"
     strokeWidth="11"
     strokeLinecap="round"
    />
    <path
     d="M 4 -24 C 4 -35, 23 -36, 23 -23 C 23 -15, 13 -13.5, 13 -6"
     fill="none"
     stroke={`url(#${cyanId})`}
     strokeWidth="5.5"
     strokeLinecap="round"
    />
    <path
     d="M 13 0 L 15.1 3.9 L 19 6 L 15.1 8.1 L 13 12 L 10.9 8.1 L 7 6 L 10.9 3.9 Z"
     fill="#ffffff"
     stroke="#064e78"
     strokeWidth="2.2"
     strokeLinejoin="round"
    />
   </g>

   {/* Subtle corner sparkle */}
   <path
    d="M 266 15 L 267.3 18.2 L 270.5 19.5 L 267.3 20.8 L 266 24 L 264.7 20.8 L 261.5 19.5 L 264.7 18.2 Z"
    fill="#e0f2fe"
    opacity="0.9"
   />
  </svg>
 );
}
