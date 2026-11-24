import {pool} from '../apps/api/src/db';
import {directoryPage} from '../apps/api/src/catalogue';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
async function main(){
 const checks=(await pool.query(`SELECT (SELECT count(*)::int FROM foody_import_records) AS source_ids,(SELECT count(DISTINCT restaurant_id)::int FROM foody_import_records) AS foody_restaurants,(SELECT count(*)::int FROM restaurants WHERE active AND NOT demo) AS public_restaurants,(SELECT count(*)::int FROM restaurants WHERE import_record_id IS NOT NULL) AS original_imports,(SELECT count(*)::int FROM restaurants WHERE active AND NOT demo AND (cardinality(food_groups)=0 OR dishes='[]')) AS without_group,(SELECT count(*)::int FROM restaurants WHERE (lat IS NULL)<>(lng IS NULL)) AS bad_coordinate_pairs`)).rows[0];
 assert.equal(checks.source_ids,71432);assert.equal(checks.original_imports,400);assert.equal(checks.without_group,0);assert.equal(checks.bad_coordinate_pairs,0);
 const samples=[];
 for(const raw of [{group:'phở bò',limit:4},{q:'bun cha bat dan',limit:4},{q:'ngoc lam',limit:4},{group:'trà sữa',limit:4},{group:'chưa phân nhóm',limit:4},{q:'zzzzz-no-matches',limit:4}]){
  const times=[];let result:any;
  for(let i=0;i<8;i++){const start=performance.now();result=await directoryPage(raw,r=>r);times.push(performance.now()-start);assert.ok(result.items.length<=4);}
  times.sort((a,b)=>a-b);samples.push({query:raw,total:result.total,returned:result.items.length,medianMs:Math.round(times[4]*100)/100,maxMs:Math.round(times.at(-1)!*100)/100});
 }
 const first=await directoryPage({group:'phở bò',limit:4},r=>r),next=await directoryPage({group:'phở bò',limit:4,offset:4},r=>r);
 assert.equal(new Set([...first.items,...next.items].map(x=>x.id)).size,8);
 const plan=await pool.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM restaurants WHERE active AND search_text LIKE '%ngoc%' AND search_text LIKE '%lam%' LIMIT 4");
 const report={at:new Date().toISOString(),checks,samples,searchPlan:plan.rows[0]['QUERY PLAN'],note:'Measured directly against the local database on the imported dataset; not network latency. Classification is inferred, not a verified menu.'};
 writeFileSync('C:/Users/Vimass/Documents/Codex/2026-11-17/foody-ha-noi-tu-dong/outputs/foody-web-performance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks,samples},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
