import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../apps/api/src/db';
import {chooseAddressLocation} from '../apps/api/src/geocode-match';
import {groups} from '../apps/api/src/domain';
async function main(){
 const input=JSON.parse(readFileSync('data/imports/ha-noi-2026-11-17/restaurants.json','utf8'));
 const cachePath='data/geocoding/photon-hanoi.json';const cache=existsSync(cachePath)?JSON.parse(readFileSync(cachePath,'utf8')):{records:{}};
 const counts:Record<string,number>={};const report:any[]=[];
 await transaction(async c=>{
  for(const row of input.records){
   const cached=cache.records[row.record_id];const geo=cached?chooseAddressLocation(row,cached.features):{status:'not_processed',location:null};
   counts[geo.status]=(counts[geo.status]||0)+1;
   const group=row.category.toLocaleLowerCase('vi');if(!groups.includes(group as any))throw Error('Nhóm món chưa hỗ trợ: '+group);
   const source=`Tài liệu người dùng 17/11/2026 · ${row.source_type} · ${row.source_notes||'chưa xác minh hoạt động'} · ${row.source_document_url}`;
   await c.query(`INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo,import_record_id,location_source,location_checked_at,verification_status)
    VALUES($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,$7,false,$8,$9,$10,'unverified')
    ON CONFLICT(import_record_id) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,location_source=EXCLUDED.location_source,location_checked_at=EXCLUDED.location_checked_at`,
    [randomUUID(),row.name,row.address,geo.location?.lat??null,geo.location?.lng??null,JSON.stringify([{name:row.category,group,tags:[],price:null,bestsellerSource:null}]),source,row.record_id,geo.location?.precision||'none',cached?.fetched_at||null]);
   report.push({record_id:row.record_id,name:row.name,address:row.address,status:geo.status,...geo.location});
  }
 });
 const result={updated_at:new Date().toISOString(),total:report.length,counts,provider:'Photon / OpenStreetMap',attribution:'© OpenStreetMap contributors · ODbL',note:'Khớp địa chỉ tự động không chứng minh quán còn hoạt động; chỉ điểm khớp số nhà/đường hoặc tên POI chính xác mới được tính khoảng cách.',records:report};
 writeFileSync('data/geocoding/hanoi-location-report.json',JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({total:result.total,counts},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
