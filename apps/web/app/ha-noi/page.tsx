'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {api,Restaurant} from '../api';
import {currentDistanceMeters} from '../current-distance';

export default function Hanoi(){
 const [data,setData]=useState<{items:Restaurant[]}|null>(null);
 const [position,setPosition]=useState<{lat:number,lng:number,accuracy:number}|null>(null);
 const [locating,setLocating]=useState(false),[locationMessage,setLocationMessage]=useState('Cho phép vị trí để tính khoảng cách từ bạn.');
 const watchId=useRef<number|undefined>(undefined);
 const hasFix=useRef(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[pageStart,setPageStart]=useState(0),[gate,setGate]=useState('');
 async function load(){setError('');try{setData(await api('/directory'));}catch(e){setError((e as Error).message);}}
 function locate(){
  if(!window.isSecureContext){setLocationMessage('Cần mở liên kết HTTPS để dùng vị trí hiện tại.');setLocating(false);return;}
  if(!navigator.geolocation){setLocationMessage('Trình duyệt này chưa hỗ trợ định vị.');return;}
  if(watchId.current!==undefined)navigator.geolocation.clearWatch(watchId.current);
  setLocating(true);setPageStart(0);setLocationMessage('Đang lấy vị trí của bạn…');
  watchId.current=navigator.geolocation.watchPosition(p=>{
   setPosition({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy});if(!hasFix.current){setPageStart(0);hasFix.current=true;}setLocating(false);
   setLocationMessage(`Đang dùng vị trí của bạn · sai số khoảng ${Math.round(p.coords.accuracy)} m`);
  },e=>{setPosition(null);hasFix.current=false;setLocating(false);setLocationMessage(e.code===1?'Hãy cho phép vị trí trong trình duyệt rồi thử lại.':e.code===3?'Chưa lấy được vị trí. Vui lòng thử lại.':'Không xác định được vị trí hiện tại.');},{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
 }
 useEffect(()=>{load();locate();return()=>{if(watchId.current!==undefined)navigator.geolocation.clearWatch(watchId.current);};},[]);
 const orderedItems=useMemo(()=>data?.items.map(r=>({...r,distance:position?currentDistanceMeters(position,r):null})).sort((a,b)=>Number(!!b.import_record_id)-Number(!!a.import_record_id)||(a.distance??Infinity)-(b.distance??Infinity))||[],[data,position]);
 const visibleItems=Array.from({length:Math.min(4,orderedItems.length)},(_,i)=>orderedItems[(pageStart+i)%orderedItems.length]);
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
  <div className="current-location-bar"><span role="status">{locationMessage}</span><button className="text-button" onClick={locate} disabled={locating}>{locating?'Đang định vị…':position?'Cập nhật vị trí':'Dùng vị trí hiện tại'}</button></div>
  {error&&<div className="message error" role="alert">{error}<button className="text-button" onClick={load}>Thử lại</button></div>}
  {gate&&<p className="message" role="status">{gate}</p>}
  {!data&&!error&&<p className="loading-bar" role="status">Đang lấy gợi ý món…</p>}
  {data&&<>
   <div className="directory-grid dish-page-grid" aria-live="polite" aria-label="Bốn gợi ý quán">{visibleItems.map(r=><article className="directory-card" key={r.id}>
    <h2 className="dish-suggestion-title">{r.dishes[0].name}</h2>
    <h3 className="dish-suggestion-place">{r.name}</h3>
    <p>{r.address}</p>
    <div className="distance-note">{r.distance!=null?<><b>≈ {r.distance>=1000?(r.distance/1000).toFixed(1)+' km':r.distance+' m'}</b><small>Đường thẳng từ vị trí hiện tại</small></>:<b>{r.lat===null?'Quán chưa có tọa độ':'Chờ vị trí của bạn'}</b>}</div>
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
