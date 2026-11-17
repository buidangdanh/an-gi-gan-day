import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const folder=new URL('../data/imports/ha-noi-2026-11-17/',import.meta.url);
const text=readFileSync(new URL('source.txt',folder),'utf8');
const parts=text.split('#\nTÊN QUÁN / ĐIỂM BÁN\nĐỊA CHỈ\nNGUỒN & MAPS\n');
const categories=[...parts[0].matchAll(/^\d{2}\.\s+(.+?)\s+·\s+20 địa điểm$/gm)].map(m=>m[1]);
const prices=[...parts[0].matchAll(/Giá tham khảo theo món: (.+?)\s+•/g)].map(m=>m[1]);
if(parts.length!==21||categories.length!==20||prices.length!==20)throw Error('Cấu trúc tài liệu không khớp 20 nhóm.');
const records=[];
for(let index=1;index<parts.length;index++){
 const entries=parts[index].split(/^(\d{2})\s*\n/m);
 if(entries[0].trim()||entries.length!==41)throw Error('Số dòng bảng không khớp nhóm '+index);
 for(let j=1;j<entries.length;j+=2){
  const ordinal=Number(entries[j]),lines=entries[j+1].split('\n').map(s=>s.trim()).filter(Boolean);
  if(ordinal!==(j+1)/2||lines.length<3||!lines[2].includes('Tra Maps'))throw Error('Dòng không hợp lệ '+index+'/'+ordinal);
  const [name,address,source]=lines;const entity=createHash('sha256').update((name+'|'+address).normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim()).digest('hex');
  records.push({record_id:`hn-20261117-${String(index).padStart(2,'0')}-${String(ordinal).padStart(2,'0')}`,category_number:index,category:categories[index-1],source_ordinal:ordinal,name,address,city:'Hà Nội',source_type:source.split('|')[0].trim(),source_notes:lines.slice(3).join(' / '),category_price_reference:prices[index-1],restaurant_price_min:null,restaurant_price_max:null,lat:null,lng:null,hours:null,menu:null,bestseller:null,review_score:null,verification_status:'pending_verification',location_status:'missing_coordinates',publishable:false,entity_key:entity,source_document_url:'https://docs.google.com/document/d/1AowweHdwdHUNa-nKYxlSTJKugRM-01tM/edit',source_modified_at:'2026-11-17T09:58:24.230Z',imported_on:'2026-11-17'});
 }
}
if(records.length!==400)throw Error('Không đủ 400 dòng.');
const sources={};for(const r of records)sources[r.source_type]=(sources[r.source_type]||0)+1;
const summary={records:records.length,categories:categories.length,unique_name_address_pairs:new Set(records.map(r=>r.entity_key)).size,by_source_type:sources,with_coordinates:0,published:0,source_sha256:createHash('sha256').update(text).digest('hex')};
const payload={source:{title:'Cẩm nang 400 quán ăn Hà Nội · 20 món · 17/11/2026',url:records[0].source_document_url,modified_at:records[0].source_modified_at,imported_on:'2026-11-17',cautions:['Thông tin chưa được kiểm tra độc lập.','Tra Maps chỉ là tìm theo tên/địa chỉ, không xác minh tọa độ.','Giá tham khảo là của nhóm món, không phải giá từng quán.','17 đại lý Kem Tràng Tiền theo nguồn 2024, chưa xác minh còn hoạt động.','Không tự gán tọa độ, điểm, bestseller, menu hoặc giờ mở cửa.']},summary,records};
writeFileSync(new URL('restaurants.json',folder),JSON.stringify(payload,null,2)+'\n','utf8');
writeFileSync(new URL('summary.json',folder),JSON.stringify(summary,null,2)+'\n','utf8');
const cols=Object.keys(records[0]);const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
writeFileSync(new URL('restaurants.csv',folder),'\uFEFF'+[cols,...records.map(r=>cols.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n','utf8');
console.log(JSON.stringify(summary,null,2));
