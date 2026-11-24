import type {Metadata,Viewport} from 'next';
import {siteName,siteUrl,siteDescription} from './brand';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import './globals.css';
import './card-buttons.css';
export const metadata:Metadata={
 metadataBase:new URL(siteUrl),
 title:siteName,
 applicationName:siteName,
 description:siteDescription,
 openGraph:{title:siteName,siteName,description:siteDescription,locale:'vi_VN',type:'website'},
};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#0284c7'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>;}
