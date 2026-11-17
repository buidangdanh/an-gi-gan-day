'use client';
import {useEffect,useState} from 'react';
import {api,Restaurant} from '../api';

export default function Hanoi(){
 const [data,setData]=useState<{items:Restaurant[]}|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[pageStart,setPageStart]=useState(0),[gate,setGate]=useState('');
 async function load(){setError('');try{setData(await api('/directory?lat=21.0285&lng=105.8542'));}catch(e){setError((e as Error).message);}}
 useEffect(()=>{load();},[]);
 const visibleItems=data?Array.from({length:Math.min(4,data.items.length)},(_,i)=>data.items[(pageStart+i)%data.items.length]):[];
 function nextFour(){
  if(!data?.items.length)return;
  setPageStart(start=>(start+4)%data.items.length);setGate('');setError('');
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 async function visit(r:Restaurant){
  setBusy(true);setGate('');setError('');
  try{const result=await api('/restaurants/'+r.id+'/visit','POST');if(result.requiresLogin)setGate(result.message+' Bản xem Wi-Fi chưa mở đăng nhập.');else window.location.assign(result.url);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <main className="directory-page dish-first-page">
  <h1 className="sr-only">Gợi ý món ăn từ danh sách Hà Nội</h1>
  {error&&<div className="message error" role="alert">{error}<button className="text-button" onClick={load}>Thử lại</button></div>}
  {gate&&<p className="message" role="status">{gate}</p>}
  {!data&&!error&&<p className="loading-bar" role="status">Đang lấy gợi ý món…</p>}
  {data&&<>
   <div className="directory-grid dish-page-grid" aria-live="polite" aria-label="Bốn gợi ý quán">{visibleItems.map(r=><article className="directory-card" key={r.id}>
    <h2 className="dish-suggestion-title">{r.dishes[0].name}</h2>
    <h3 className="dish-suggestion-place">{r.name}</h3>
    <p>{r.address}</p>
    <div className="distance-note">{r.distance!=null?<><b>≈ {r.distance>=1000?(r.distance/1000).toFixed(1)+' km':r.distance+' m'}</b><small>Đường thẳng ước tính từ Hồ Gươm</small></>:<b>Chưa có khoảng cách</b>}</div>
    <p className="fine-print">Chưa xác minh hoạt động.</p>
    <details><summary>Thông tin quán</summary><p className="fine-print">{r.source}</p><p className="fine-print">Chưa có đánh giá nội bộ. Chưa xác minh thực đơn chi tiết, giá bán và giờ mở cửa.</p></details>
    <button className="primary full" disabled={busy} onClick={()=>visit(r)}>Ghé thăm quán ↗</button>
    {r.lat===null&&<small className="fine-print">Maps sẽ tìm theo địa chỉ.</small>}
   </article>)}</div>
   <button className="primary full next-four-button" onClick={nextFour} disabled={busy||data.items.length<=4}>Quán ngon khác <span aria-hidden>↻</span></button>
  </>}
  <footer className="dish-first-footer"><a href="/goi-y">Chọn món & tìm quanh vị trí khác ↗</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></footer>
 </main>;
}
