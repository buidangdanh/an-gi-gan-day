import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction} from '../apps/api/src/db';
const path='data/imports/ha-noi-2026-11-17/';
const sourceId='1AowweHdwdHUNa-nKYxlSTJKugRM-01tM';
const row=z.object({record_id:z.string().regex(/^hn-20261117-\d{2}-\d{2}$/),category:z.string().min(1),source_ordinal:z.number().int().min(1).max(20),name:z.string().min(2),address:z.string().min(5),source_type:z.string().min(1),source_notes:z.string(),category_price_reference:z.string(),lat:z.null(),lng:z.null(),restaurant_price_min:z.null(),restaurant_price_max:z.null(),hours:z.null(),bestseller:z.null(),review_score:z.null(),publishable:z.literal(false),verification_status:z.literal('pending_verification')}).passthrough();
async function main(){
 const data=JSON.parse(readFileSync(path+'restaurants.json','utf8'));
 const rows=z.array(row).length(400).parse(data.records);
 const hash=createHash('sha256').update(readFileSync(path+'source.txt','utf8')).digest('hex');
 if(hash!==data.summary.source_sha256||new Set(rows.map(r=>r.record_id)).size!==400)throw Error('Nguồn hoặc record ID không khớp.');
 const groups=new Map<string,number>();for(const r of rows)groups.set(r.category,(groups.get(r.category)||0)+1);
 if(groups.size!==20||[...groups.values()].some(n=>n!==20))throw Error('Cần đúng 20 nhóm, mỗi nhóm 20 địa điểm.');
 await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[sourceId]);
  const existing=(await c.query('SELECT content_sha256 FROM import_documents WHERE id=$1',[sourceId])).rows[0];
  if(existing&&existing.content_sha256!==hash)throw Error('Nguồn đã thay đổi. Cần đối chiếu trước khi thay phiên bản.');
  await c.query('INSERT INTO import_documents(id,title,url,source_modified_at,content_sha256,source_notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[sourceId,data.source.title,data.source.url,data.source.modified_at,hash,JSON.stringify(data.source.cautions)]);
  for(const r of rows)await c.query('INSERT INTO restaurant_candidates(document_id,record_id,category,ordinal,name,address,source_type,source_notes,category_price_reference,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(document_id,record_id) DO NOTHING',[sourceId,r.record_id,r.category,r.source_ordinal,r.name,r.address,r.source_type,r.source_notes,r.category_price_reference,JSON.stringify(r)]);
  const saved=await c.query('SELECT count(*)::int AS count FROM restaurant_candidates WHERE document_id=$1',[sourceId]);
  if(saved.rows[0].count!==400)throw Error('Số bản ghi sau nhập không khớp.');
  console.log('Đã lưu 400 địa điểm / 20 nhóm vào restaurant_candidates. Chạy lại không nhân đôi; không thay đổi restaurants đang hiển thị.');
 });
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
