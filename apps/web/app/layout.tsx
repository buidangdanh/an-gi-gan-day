import type {Metadata,Viewport} from 'next';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import './globals.css';
export const metadata:Metadata={title:'Ăn gì gần đây? — Chọn quán, nhẹ đầu',description:'Ưu tiên danh sách 400 địa điểm Hà Nội bạn cung cấp. Tìm theo món và khoảng cách đường thẳng ước tính; thông tin chưa xác minh hoạt động.'};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#174c3c'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>;}
