import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const csp = [
 "default-src 'self'",
 `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
 "style-src 'self' 'unsafe-inline'",
 "font-src 'self' data:",
 "img-src 'self' data: https://*.susercontent.com https://*.foody.vn",
 "connect-src 'self'",
 "object-src 'none'",
 "base-uri 'self'",
 "form-action 'self'",
 "frame-ancestors 'none'",
 ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const config: NextConfig = {
 poweredByHeader: false,
 async rewrites() {
  return [
   {
    source: '/api/:path*',
    destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4100'}/api/:path*`,
   },
  ];
 },
 async headers() {
  return [
   {
    source: '/:path*',
    headers: [
     { key: 'Content-Security-Policy', value: csp },
     { key: 'X-Content-Type-Options', value: 'nosniff' },
     { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
     { key: 'X-Frame-Options', value: 'DENY' },
     { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
     { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
     { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
     ...(isProd
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
      : []),
    ],
   },
  ];
 },
};

export default config;
