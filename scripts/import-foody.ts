import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pool,transaction} from '../apps/api/src/db';
import {classifyFood} from '../apps/api/src/food-classifier';
const source=process.argv[2]||process.env.FOODY_SOURCE_JSON||'';
const evidence=process.argv[3]||process.env.FOODY_EVIDENCE_DIR||'';
const out=process.env.FOODY_REPORT_DIR||'./work/reports';
if(!source)throw Error('Cần truyền đường dẫn file JSON nguồn qua tham số CLI hoặc FOODY_SOURCE_JSON.');
const uid=(n:number)=>{const h=createHash('sha256').update('foody.vn:'+n).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
async function main(){
 const input=JSON.parse(readFileSync(source,'utf8'));const seen=new Set<number>();
 const categoryEvidence=new Map<number,Set<number>>();
 if(evidence){for(const f of readdirSync(evidence)){if(!f.endsWith('.json'))continue;const d=JSON.parse(readFileSync(join(evidence,f),'utf8'));const cat=Number(d.q?.cateId);if(cat>0)for(const item of d.Items||[]){if(!categoryEvidence.has(item.Id))categoryEvidence.set(item.Id,new Set());categoryEvidence.get(item.Id)!.add(cat);}}}
 const rows=input.items.map((x:any)=>{
  if(!Number.isSafeInteger(x.Id)||x.Id<=0||seen.has(x.Id)||!x.Name?.trim()||!x.Address?.trim())throw Error('Bản ghi Foody không hợp lệ hoặc trùng Id: '+x.Id);seen.add(x.Id);
  const classification=classifyFood(x.Name,[...categoryEvidence.get(x.Id)||[],Number(x.MainCategoryId)]);
  const valid=Number.isFinite(x.Latitude)&&Number.isFinite(x.Longitude)&&x.Latitude!==0&&x.Longitude!==0&&Math.abs(x.Latitude)<=90&&Math.abs(x.Longitude)<=180;
  const local=valid&&x.Latitude>=20.5&&x.Latitude<=21.5&&x.Longitude>=105.2&&x.Longitude<=106.1;
  const url=typeof x.Url==='string'&&x.Url.startsWith('/ha-noi/')?'https://www.foody.vn'+x.Url:null;
  return {id:uid(x.Id),foody_id:x.Id,name:x.Name.trim().replace(/\s+/g,' '),address:x.Address.trim().replace(/\s+/g,' '),lat:local?x.Latitude:null,lng:local?x.Longitude:null,dishes:classification.groups.map(g=>({name:g,group:g,tags:[],price:null,bestsellerSource:null})),source:'Foody.vn · dữ liệu nguồn; chưa xác minh hoạt động/thực đơn',external_url:url,classification_source:classification.source,groups:classification.groups,coordinate_status:!valid?'missing_or_invalid':!local?'outside_hanoi_check_box':'source_coordinates',payload:x};
 });
 await transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('foody-catalogue-import'))");
  await c.query(`CREATE TEMP TABLE incoming_foody(id uuid,foody_id bigint,name text,address text,lat float8,lng float8,dishes jsonb,source text,external_url text,classification_source text,groups text[],coordinate_status text,payload jsonb) ON COMMIT DROP`);
  for(let i=0;i<rows.length;i+=500){await c.query('INSERT INTO incoming_foody SELECT * FROM jsonb_populate_recordset(NULL::incoming_foody,$1::jsonb)',[JSON.stringify(rows.slice(i,i+500))]);if(i%10000===0)console.log(JSON.stringify({staged:Math.min(i+500,rows.length),total:rows.length}));}
  await c.query('CREATE INDEX incoming_identity ON incoming_foody((food_normalize(name)),(food_normalize(address)))');
  // Exact same normalized name AND address only. Preserve existing restaurant IDs and all linked user activity.
  await c.query(`CREATE TEMP TABLE foody_links ON COMMIT DROP AS SELECT i.foody_id,coalesce((SELECT restaurant_id FROM foody_import_records f WHERE f.foody_id=i.foody_id),(SELECT min(r.id::text)::uuid FROM restaurants r WHERE NOT r.demo AND food_normalize(r.name)=food_normalize(i.name) AND food_normalize(r.address)=food_normalize(i.address)),(SELECT min(j.id::text)::uuid FROM incoming_foody j WHERE food_normalize(j.name)=food_normalize(i.name) AND food_normalize(j.address)=food_normalize(i.address))) AS restaurant_id FROM incoming_foody i`);
  await c.query(`INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo,active,foody_id,external_url,classification_source,location_source,location_checked_at,verification_status)
   SELECT DISTINCT ON(l.restaurant_id) l.restaurant_id,i.name,i.address,i.lat,i.lng,i.dishes,NULL,NULL,NULL,i.source,false,true,i.foody_id,i.external_url,i.classification_source,CASE WHEN i.lat IS NULL THEN 'none' ELSE 'foody_source' END,now(),'unverified'
   FROM incoming_foody i JOIN foody_links l USING(foody_id) ORDER BY l.restaurant_id,i.foody_id
   ON CONFLICT(id) DO UPDATE SET foody_id=coalesce(restaurants.foody_id,excluded.foody_id),external_url=coalesce(restaurants.external_url,excluded.external_url),dishes=CASE WHEN restaurants.classification_source='document' THEN restaurants.dishes ELSE excluded.dishes END,classification_source=CASE WHEN restaurants.classification_source='document' THEN restaurants.classification_source ELSE excluded.classification_source END,lat=coalesce(restaurants.lat,excluded.lat),lng=coalesce(restaurants.lng,excluded.lng),location_source=CASE WHEN restaurants.lat IS NULL AND excluded.lat IS NOT NULL THEN 'foody_source' ELSE restaurants.location_source END`);
  await c.query(`INSERT INTO foody_import_records(foody_id,restaurant_id,source_payload,classification,classification_source,coordinate_status) SELECT i.foody_id,l.restaurant_id,i.payload,i.groups,i.classification_source,i.coordinate_status FROM incoming_foody i JOIN foody_links l USING(foody_id) ON CONFLICT(foody_id) DO UPDATE SET source_payload=excluded.source_payload,classification=excluded.classification,classification_source=excluded.classification_source,coordinate_status=excluded.coordinate_status,imported_at=now()`);
  await c.query("INSERT INTO audit(actor,action,target,detail) VALUES('local-import','foody-import','hanoi',$1)",[JSON.stringify({source:resolve(source),records:rows.length,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')})]);
 });
 await pool.query('ANALYZE restaurants');await pool.query('ANALYZE foody_import_records');
 const report={at:new Date().toISOString(),sourceRecords:rows.length,coordinateStatus:rows.reduce((a:Record<string,number>,x:any)=>(a[x.coordinate_status]=(a[x.coordinate_status]||0)+1,a),{}),database:(await pool.query('SELECT count(*)::int AS foody_source_ids,count(DISTINCT restaurant_id)::int AS linked_restaurants FROM foody_import_records')).rows[0],catalogue:(await pool.query('SELECT count(*)::int AS active,count(lat)::int AS with_coordinates FROM restaurants WHERE active AND NOT demo')).rows[0],groups:(await pool.query('SELECT primary_group,count(*)::int AS count FROM restaurants WHERE active AND NOT demo GROUP BY primary_group ORDER BY count(*) DESC')).rows,classification:(await pool.query('SELECT classification_source,count(*)::int AS count FROM restaurants WHERE active AND NOT demo GROUP BY classification_source')).rows};
 mkdirSync(out,{recursive:true});writeFileSync(join(out,'foody-web-import-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
