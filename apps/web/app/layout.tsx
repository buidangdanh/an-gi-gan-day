import type {Metadata,Viewport} from 'next';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import './globals.css';
export const metadata:Metadata={title:'Ăn gì gần đây? — Chọn quán, nhẹ đầu',description:'Ba gợi ý hợp khẩu vị, gần bạn. MVP chỉ chữ với dữ liệu quán hư cấu minh họa.'};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#174c3c'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>;}
