import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
const folder=new URL('../data/imports/ha-noi-2026-11-17/',import.meta.url);
const cacheFolder=new URL('../data/geocoding/',import.meta.url);
mkdirSync(cacheFolder,{recursive:true});
const lock=new URL('photon.lock',cacheFolder);let fd;
try{fd=openSync(lock,'wx');}catch{throw Error('Đã có tiến trình geocoding. Không chạy song song.');}
const cacheFile=new URL('photon-hanoi.json',cacheFolder);
const input=JSON.parse(readFileSync(new URL('restaurants.json',folder),'utf8'));
const cache=existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile,'utf8')):{provider:'Photon / OpenStreetMap',endpoint:process.env.PHOTON_ENDPOINT||'https://photon.komoot.io/api/',attribution:'© OpenStreetMap contributors · ODbL',license:'https://www.openstreetmap.org/copyright',records:{}};
const maximum=Number(process.argv[2]||400);let requests=0;
const save=()=>writeFileSync(cacheFile,JSON.stringify(cache,null,2)+'\n','utf8');
try{
 for(const row of input.records){
  if(cache.records[row.record_id])continue;if(requests>=maximum)break;
  const url=new URL(cache.endpoint);url.searchParams.set('q',row.address);url.searchParams.set('limit','3');url.searchParams.set('bbox','105.2,20.6,106.2,21.5');url.searchParams.set('lat','21.03');url.searchParams.set('lon','105.85');
  let response;try{response=await fetch(url,{headers:{'User-Agent':'AnGiGanDay/0.1 (single-machine one-time Hanoi restaurant import)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});}catch(e){console.log('Dừng do lỗi mạng; kết quả đã lưu, có thể tiếp tục sau.');break;}
  requests++;
  if(!response.ok){console.log('Dừng theo phản hồi nhà cung cấp HTTP '+response.status+'; không đổi IP hoặc tăng tốc để thử lại.');break;}
  const json=await response.json();if(!Array.isArray(json.features))throw Error('Provider response không hợp lệ');
  cache.records[row.record_id]={query:row.address,fetched_at:new Date().toISOString(),features:json.features};save();
  if(requests%20===0)console.log('Đã tra và cache '+Object.keys(cache.records).length+'/400 địa chỉ.');
  await new Promise(resolve=>setTimeout(resolve,2100));
 }
 console.log('Hoàn tất lượt: '+requests+' request, '+Object.keys(cache.records).length+' địa chỉ có kết quả tra (bao gồm không tìm thấy).');
}finally{save();closeSync(fd);unlinkSync(lock);}
