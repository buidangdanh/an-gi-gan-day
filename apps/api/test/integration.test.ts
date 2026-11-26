import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {isOpen,rankScore,mapsUrl} from '../src/domain';
import {chooseAddressLocation} from '../src/geocode-match';
import {classifyFood} from '../src/food-classifier';
import type {INestApplication} from '@nestjs/common';
let app:INestApplication,db:Pool,adminDb:Pool,base:string,dbName:string;
const origin='http://127.0.0.1:3100';const adminKey='test-only-'+randomUUID();
let ids:string[]=[];
async function call(path:string,{method='GET',body,cookie='',admin=false,headers={}}:{method?:string,body?:any,cookie?:string,admin?:boolean,headers?:Record<string,string>}={}){
 const r=await fetch(base+'/api'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:'Bearer '+adminKey}:{}),...headers},body:method==='GET'?undefined:JSON.stringify(body||{})});return {status:r.status,data:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};
}
async function guest(){return (await call('/session')).cookie;}
async function login(cookie?:string){return call('/auth/login',{method:'POST',cookie:cookie||await guest(),body:{provider:'development'}});}
before(async()=>{
 for(const key of ['GOOGLE_CLIENT_ID','FIREBASE_PROJECT_ID','FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','GOOGLE_MAPS_GEOCODING_API_KEY','TURNSTILE_SECRET_KEY','NEXT_PUBLIC_TURNSTILE_SITE_KEY'])delete process.env[key];
 process.env.NODE_ENV='test';process.env.ENABLE_DEV_AUTH='true';process.env.WEB_ORIGIN=origin;process.env.ADMIN_TOKEN=adminKey;process.env.PAYMENT_WEBHOOK_SECRET='test-webhook-secret-'+randomUUID();
 const connection=process.env.DATABASE_URL||'postgresql://angiday:local_demo_only@127.0.0.1:55439/angiday';if(!['127.0.0.1','localhost'].includes(new URL(connection).hostname))throw Error('Test chỉ dùng DB local, không chạy trên dữ liệu production');adminDb=new Pool({connectionString:connection});dbName='angiday_test_'+randomUUID().replace(/-/g,'');await adminDb.query(`CREATE DATABASE ${dbName}`);const url=new URL(connection);url.pathname='/'+dbName;process.env.DATABASE_URL=url.toString();db=new Pool({connectionString:url.toString()});await db.query(readFileSync('db/001_initial.sql','utf8'));await db.query(readFileSync('db/002_users.sql','utf8'));
 for(let i=0;i<8;i++){const id=randomUUID();ids.push(id);await db.query('INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,price_min,price_max,source) VALUES($1,$2,$3,$4,$5,$6,$7,30000,70000,$8)',[id,'Quán test '+i,'Địa chỉ hư cấu test '+i,10.7731+i*.001,106.6983,JSON.stringify([{name:'Phở bò',group:'phở',tags:['nước','nóng','sáng','ăn nhanh'],price:30000,bestsellerSource:null},{name:'Chè',group:'ăn vặt',tags:['nước','lạnh','ăn nhẹ'],price:70000,bestsellerSource:null}]),JSON.stringify(Array.from({length:7},(_,day)=>({day,open:0,close:1440}))),'Test tự động hư cấu']);}
 await db.query(readFileSync('db/003_filter_privacy.sql','utf8'));
 await db.query(readFileSync('db/004_restaurant_imports.sql','utf8'));
 await db.query(readFileSync('db/005_live_hanoi.sql','utf8'));
 await db.query(readFileSync('db/006_foody_catalogue.sql','utf8'));
 await db.query(readFileSync('db/007_search_tokens.sql','utf8'));
 await db.query(readFileSync('db/008_performance_and_scale.sql','utf8'));
 await db.query(readFileSync('db/009_restaurant_images.sql','utf8'));
 await db.query(readFileSync('db/010_popularity_and_accounts_pro.sql','utf8'));
 await db.query(readFileSync('db/011_multi_city.sql','utf8'));
 await db.query(readFileSync('db/012_auth_security_and_verification.sql','utf8'));
 const {createApp}=require('../src/main');app=await createApp();await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();if(db)await db.end();const {closePools}=require('../src/db');await closePools();if(adminDb){if(dbName)await adminDb.query(`DROP DATABASE ${dbName} WITH (FORCE)`);await adminDb.end();}});

test('PostGIS thật, lọc khoảng cách, ngân sách/nhãn trên cùng một món và empty không nới điều kiện',async()=>{
 const version=await db.query('SELECT postgis_version() AS version');assert.match(version.rows[0].version,/3\./);
 const r=await call('/restaurants?lat=10.7731&lng=106.6983&radius=150&budget=35000&tags=nóng&group=phở');assert.equal(r.status,200);assert.equal(r.data.total,2);assert.equal(r.data.items[0].id,ids[0]);assert.equal(r.data.items[0].distance,0);assert.equal(r.data.items[0].average,null);assert.equal(r.data.items[0].count,0);
 const mismatch=await call('/restaurants?lat=10.7731&lng=106.6983&radius=2000&budget=35000&tags=lạnh');assert.equal(mismatch.data.total,0);assert.ok(mismatch.data.emptySuggestion);
 const far=await call('/restaurants?lat=21&lng=105&radius=500');assert.equal(far.data.total,0);
 assert.equal((await call('/restaurants?lat=100&lng=0')).status,400);
});
test('giờ Việt Nam: qua nửa đêm, nghỉ giữa ca, ranh giới và giờ chưa biết',()=>{
 const h=[{day:1,open:1080,close:120}];assert.equal(isOpen(h,new Date('2026-11-16T18:00:00Z')),true); // Tue 01:00
 assert.equal(isOpen(h,new Date('2026-11-16T19:00:00Z')),false);
 assert.equal(isOpen([{day:1,open:360,close:720},{day:1,open:840,close:1200}],new Date('2026-11-16T06:00:00Z')),false);
 assert.equal(isOpen(null),null);assert.equal(isOpen([]),false);
 assert.equal(isOpen([{day:0,open:1380,close:60}],new Date('2026-11-15T17:30:00Z')),true);
});
test('ranking không bịa sao, gần hơn ưu tiên khi chưa có review; Maps encode tọa độ',()=>{
 assert.ok(rankScore(100,2000,null,0,null,1,0)>rankScore(1000,2000,null,0,null,1,0));
 assert.ok(Number.isFinite(rankScore(0,2000,null,0,null,1,0)));
 assert.ok(Math.abs(rankScore(0,2000,5,10,3,1,0)-(.35+.20+.10+.25*.8)/.90)<1e-10);
 assert.equal(new URL(mapsUrl({lat:10.5,lng:106.7})).searchParams.get('query'),'10.5,106.7');
});
test('xem chi tiết không tính; click lặp và race nhiều tab chỉ cho 4 quán khác nhau',async()=>{
 const cookie=await guest();await call('/restaurants/'+ids[0],{cookie});assert.equal((await call('/session',{cookie})).data.distinctVisits,0);
 const repeats=await Promise.all(Array.from({length:10},()=>call('/restaurants/'+ids[0]+'/visit',{method:'POST',cookie})));assert.ok(repeats.every(r=>!r.data.requiresLogin));assert.equal((await call('/session',{cookie})).data.distinctVisits,1);
 const race=await Promise.all(ids.slice(1).map(id=>call('/restaurants/'+id+'/visit',{method:'POST',cookie})));assert.equal(race.filter(r=>!r.data.requiresLogin).length,3);assert.equal(race.filter(r=>r.data.requiresLogin).length,4);assert.equal((await call('/session',{cookie})).data.distinctVisits,4);
});
test('quán thứ 5 lưu ý định; login Free tiếp tục đúng quán và quay vòng cookie',async()=>{
 let cookie=await guest();for(const id of ids.slice(0,4))await call('/restaurants/'+id+'/visit',{method:'POST',cookie});const gate=await call('/restaurants/'+ids[4]+'/visit',{method:'POST',cookie});assert.equal(gate.data.requiresLogin,true);
 const logged=await login(cookie);assert.equal(logged.status,200);assert.notEqual(logged.cookie,cookie);assert.equal(logged.data.user.pro,false);assert.equal(logged.data.continuation.restaurantId,ids[4]);assert.ok(logged.data.continuation.url);
 assert.equal((await call('/session',{cookie:logged.cookie})).data.distinctVisits,5);
 const old=await call('/session',{cookie});assert.equal(old.data.user,null);assert.equal(old.data.distinctVisits,0);
});
test('phiên idle 30 phút, max24h; không mượn tài khoản từ cookie hết hạn',async()=>{
 for(const column of ['last_seen','created_at']){const logged=await login();const token=logged.cookie.split('=')[1];await db.query(`UPDATE sessions SET ${column}=now()-interval '${column==='last_seen'?'31 minutes':'25 hours'}' WHERE id=$1`,[createHash('sha256').update(token).digest('hex')]);const fresh=await call('/session',{cookie:logged.cookie});assert.equal(fresh.data.user,null);assert.notEqual(fresh.cookie,logged.cookie);}
});
test('auth thật fail closed, CSRF, admin và production chặn demo auth',async()=>{
 const cookie=await guest();assert.equal((await call('/auth/login',{method:'POST',cookie,body:{provider:'google',token:'forged'}})).status,503);
 process.env.GOOGLE_CLIENT_ID='invalid-test-client';assert.equal((await call('/auth/login',{method:'POST',cookie,body:{provider:'google',token:'forged'}})).status,401);delete process.env.GOOGLE_CLIENT_ID;
 process.env.FIREBASE_PROJECT_ID='invalid-test-project';assert.equal((await call('/auth/login',{method:'POST',cookie,body:{provider:'phone',token:'forged'}})).status,401);delete process.env.FIREBASE_PROJECT_ID;
 assert.equal((await call('/auth/login',{method:'POST',cookie,body:{provider:'development'},headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await call('/admin',{cookie})).status,403);assert.equal((await call('/admin',{cookie,admin:true})).status,200);
 process.env.NODE_ENV='production';assert.equal((await call('/auth/login',{method:'POST',cookie,body:{provider:'development'}})).status,403);const {createApp}=require('../src/main');await assert.rejects(createApp(),/ENABLE_DEV_AUTH/);process.env.NODE_ENV='test';
 for(let i=0;i<4;i++){const r=await call('/auth/otp',{method:'POST',cookie});assert.equal(r.status,i<3?503:429);}
});
test('Pro trên API; review cần chờ và tự xác nhận; moderation đổi điểm, hết Pro vẫn giữ bài',async()=>{
 const l=await login();const cookie=l.cookie,account=l.data.user.id;
 assert.equal((await call('/compare?ids='+ids.slice(0,2).join(',')+'&group=phở',{cookie})).status,403);
 const body={taste:5,value:4,service:3,space:2,body:'Bài đánh giá test hư cấu, không phải trải nghiệm thật.',self_confirmed:true};
 assert.equal((await call('/restaurants/'+ids[0]+'/reviews',{method:'POST',cookie,body})).status,403);
 await db.query("INSERT INTO subscriptions VALUES($1,now()+interval '1 hour','test')",[account]);
 assert.equal((await call('/filters',{method:'POST',cookie,body:{name:'Bộ lọc riêng tư',filters:{lat:10.5,lng:106.5,q:'phở',radius:1000}}})).status,200);
 const saved=(await db.query('SELECT filters FROM saved_filters WHERE account_id=$1',[account])).rows[0].filters;assert.equal(saved.lat,undefined);assert.equal(saved.lng,undefined);assert.equal(saved.exclude,undefined);assert.equal(saved.q,'phở');
 assert.equal((await call('/compare?ids='+ids.slice(0,2).join(',')+'&group=phở',{cookie})).status,200);
 assert.equal((await call('/compare?ids='+ids.slice(0,2).join(',')+'&group=cơm',{cookie})).status,400);
 await call('/restaurants/'+ids[0]+'/visit',{method:'POST',cookie});assert.equal((await call('/restaurants/'+ids[0]+'/reviews',{method:'POST',cookie,body})).status,403);
 await db.query("UPDATE visits SET created_at=now()-interval '31 minutes' WHERE account_id=$1",[account]);
 assert.equal((await call('/restaurants/'+ids[0]+'/reviews',{method:'POST',cookie,body:{...body,self_confirmed:false}})).status,400);
 const created=await call('/restaurants/'+ids[0]+'/reviews',{method:'POST',cookie,body});assert.equal(created.status,200);assert.equal(created.data.status,'pending');assert.equal((await call('/restaurants/'+ids[0])).data.count,0);
 await call('/admin/reviews/'+created.data.id,{method:'PATCH',admin:true,body:{status:'approved',reason:'Bài test kiểm duyệt'}});let detail=(await call('/restaurants/'+ids[0])).data;assert.equal(detail.count,1);assert.equal(Number(detail.average),4.15);assert.equal(detail.reviews[0].demo,true);
 await call('/restaurants/'+ids[0]+'/reviews',{method:'POST',cookie,body:{...body,taste:4}});assert.equal((await call('/restaurants/'+ids[0])).data.count,0);
 await call('/admin/reviews/'+created.data.id,{method:'PATCH',admin:true,body:{status:'approved',reason:'Duyệt bản cập nhật'}});
 await db.query("UPDATE subscriptions SET expires_at=now()-interval '1 second' WHERE account_id=$1",[account]);assert.equal((await call('/restaurants/'+ids[0]+'/reviews',{method:'POST',cookie,body})).status,403);assert.equal((await call('/restaurants/'+ids[0])).data.count,1);
 await call('/admin/reviews/'+created.data.id,{method:'PATCH',admin:true,body:{status:'rejected',reason:'Ẩn bài test'}});assert.equal((await call('/restaurants/'+ids[0])).data.count,0);
 assert.ok(Number((await db.query('SELECT count(*) FROM review_history WHERE review_id=$1',[created.data.id])).rows[0].count)>=3);assert.equal(Number((await db.query('SELECT count(*) FROM reviews WHERE account_id=$1',[account])).rows[0].count),1);
});
test('Free yêu thích/lịch sử; saved filters cần Pro, báo sai và audit quản trị',async()=>{
 const l=await login(),cookie=l.cookie;
 const beforeSaves=Number((await db.query('SELECT popularity_saves FROM restaurants WHERE id=$1',[ids[2]])).rows[0].popularity_saves??0);
 const favOn=await call('/restaurants/'+ids[2]+'/favorite',{method:'POST',cookie});assert.equal(favOn.status,200);assert.equal(favOn.data.popularity_saves,beforeSaves+1);
 const favDup=await call('/restaurants/'+ids[2]+'/favorite',{method:'POST',cookie});assert.equal(favDup.data.popularity_saves,beforeSaves+1);
 const favOff=await call('/restaurants/'+ids[2]+'/favorite',{method:'DELETE',cookie});assert.equal(favOff.status,200);assert.equal(favOff.data.popularity_saves,beforeSaves);
 assert.equal((await call('/restaurants/'+ids[2]+'/favorite',{method:'POST',cookie})).data.popularity_saves,beforeSaves+1);
 await call('/restaurants/'+ids[2]+'/visit',{method:'POST',cookie});const library=(await call('/library',{cookie})).data;assert.equal(library.favorites.length,1);assert.equal(library.history.length,1);
 assert.equal((await call('/filters',{method:'POST',cookie,body:{name:'Test',filters:{lat:10,lng:106}}})).status,403);
 await call('/restaurants/'+ids[2]+'/reports',{method:'POST',cookie,body:{body:'Báo sai thông tin hư cấu trong test.'}});const admin=(await call('/admin',{admin:true})).data;assert.equal(admin.reports.length,1);assert.equal((await call('/admin/reports/'+admin.reports[0].id,{method:'PATCH',admin:true})).status,200);assert.ok((await call('/admin',{admin:true})).data.audit.length>0);
});
test('CRUD admin text, validate tọa độ và cấm trường ảnh; geocoding thiếu cấu hình rõ',async()=>{
 const restaurant={name:'Quán CRUD hư cấu',address:'Địa chỉ CRUD test hư cấu',lat:10,lng:106,dishes:[{name:'Cơm test',group:'cơm',tags:['khô','trưa'],price:null,bestsellerSource:null}],hours:null,price_min:null,price_max:null,source:'Test admin',demo:true};
 assert.equal((await call('/admin/restaurants',{method:'POST',body:restaurant})).status,403);
 assert.equal((await call('/admin/restaurants',{method:'POST',admin:true,body:{...restaurant,image:'forbidden'}})).status,400);
 assert.equal((await call('/admin/restaurants',{method:'POST',admin:true,body:{...restaurant,lat:999}})).status,400);
 const r=await call('/admin/restaurants',{method:'POST',admin:true,body:restaurant});assert.equal(r.status,200);assert.equal((await call('/restaurants/'+r.data.id)).data.open,null);
 assert.equal((await call('/admin/restaurants/'+r.data.id,{method:'PUT',admin:true,body:{...restaurant,name:'Tên mới'}})).status,200);
 assert.equal((await call('/admin/restaurants/'+r.data.id,{method:'DELETE',admin:true})).status,200);assert.equal((await call('/restaurants/'+r.data.id)).status,404);
 assert.equal((await call('/admin/geocode',{method:'POST',admin:true,body:{address:'Địa chỉ test'}})).status,503);
});
test('webhook HMAC raw body, timestamp, idempotency và event đổi payload',async()=>{
 const l=await login();const body={id:'event-test-0001',account_id:l.data.user.id,expires_at:new Date(Date.now()+86400000).toISOString()};
 const signed=(b:any,ts=String(Math.floor(Date.now()/1000)))=>({'x-payment-timestamp':ts,'x-payment-signature':createHmac('sha256',process.env.PAYMENT_WEBHOOK_SECRET!).update(ts+'.'+JSON.stringify(b)).digest('hex')});
 assert.equal((await call('/payments/webhook',{method:'POST',body})).status,401);
 const ok=await call('/payments/webhook',{method:'POST',body,headers:signed(body)});assert.equal(ok.status,200);assert.equal(ok.data.duplicate,false);
 const duplicate=await Promise.all(Array.from({length:5},()=>call('/payments/webhook',{method:'POST',body,headers:signed(body)})));assert.ok(duplicate.every(r=>r.data.duplicate));assert.equal((await call('/session',{cookie:l.cookie})).data.user.pro,true);
 const changed={...body,expires_at:new Date(Date.now()+2*86400000).toISOString()};assert.equal((await call('/payments/webhook',{method:'POST',body:changed,headers:signed(changed)})).status,409);
 assert.equal((await call('/payments/webhook',{method:'POST',body,headers:signed(body,String(Math.floor(Date.now()/1000)-600))})).status,401);
});
test('geocoding chỉ nhận số nhà/đường rõ; không dùng sai số nhà, tâm phố, thành phố hoặc kết quả mơ hồ',()=>{
 const row={name:'Phở A',address:'49 Bát Đàn, Hà Nội'};
 const feature=(house:string,road:string,lat=21.0336,lng=105.8463)=>({properties:{housenumber:house,street:road,countrycode:'VN',city:'Hà Nội',name:'Phở A',osm_id:1,osm_type:'N'},geometry:{coordinates:[lng,lat]}});
 assert.equal(chooseAddressLocation(row,[feature('49','Phố Bát Đàn')]).status,'matched_address');
 assert.equal(chooseAddressLocation(row,[feature('51','Phố Bát Đàn')]).location,null);
 assert.equal(chooseAddressLocation(row,[feature('49','Hàng Vôi')]).location,null);
 assert.equal(chooseAddressLocation(row,[{properties:{type:'street',name:'Phố Bát Đàn',countrycode:'VN'},geometry:{coordinates:[105.8463,21.0336]}}]).location,null);
 assert.equal(chooseAddressLocation(row,[feature('49','Bát Đàn',10,106)]).location,null);
 const wrongCity=feature('49','Bát Đàn');wrongCity.properties.city='Bắc Ninh';assert.equal(chooseAddressLocation(row,[wrongCity]).location,null);
 assert.equal(chooseAddressLocation(row,[feature('49','Bát Đàn'),feature('49','Bát Đàn',21.034,105.847)]).status,'ambiguous');
 assert.equal(chooseAddressLocation(row,[feature('49','Bát Đàn'),feature('49','Bát Đàn',21.03361,105.84631)]).status,'matched_address');
 assert.equal(chooseAddressLocation(row,[]).status,'not_found');
});
test('dữ liệu thật thiếu tọa độ vẫn có trong danh sách; khoảng cách chỉ khi biết điểm, Maps fallback địa chỉ',async()=>{
 const located=randomUUID(),missing=randomUUID();
 for(const [id,lat,lng] of [[located,21.0285,105.8542],[missing,null,null]] as const)await db.query(`INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,source,demo,location_source) VALUES($1,$2,'49 Bát Đàn, Hà Nội',$3,$4,$5,NULL,'Tài liệu người dùng · chưa xác minh',false,$6)`,[id,'Quán Hà Nội '+id,lat,lng,JSON.stringify([{name:'Phở bò',group:'phở bò',tags:[],price:null,bestsellerSource:null}]),lat===null?'none':'osm_address']);
 const directory=await call('/directory?lat=21.0285&lng=105.8542');assert.equal(directory.status,200);assert.equal(directory.data.datasetTotal,2);assert.equal(directory.data.located,1);assert.equal(directory.data.items.find((r:any)=>r.id===missing).distance,null);assert.equal(directory.data.items.find((r:any)=>r.id===located).distance,0);
 const near=await call('/restaurants?lat=21.0285&lng=105.8542&radius=2000&group='+encodeURIComponent('phở bò'));assert.equal(near.data.items.length,1);assert.equal(near.data.items[0].id,located);
 const filtered=await call('/restaurants?lat=21.0285&lng=105.8542&radius=2000&budget=100000');assert.equal(filtered.data.items.length,0);
 const cached=await call('/locations/resolve',{method:'POST',cookie:await guest(),body:{address:'49 Bát Đàn'}});assert.equal(cached.status,200);assert.ok(cached.data.candidates.some((c:any)=>c.coordinates.lat===21.0285));assert.match(cached.data.storage,/không gọi API Google/);
 assert.equal((await call('/restaurants/'+missing)).status,200);
 const intent=await call('/restaurants/'+missing+'/visit',{method:'POST',cookie:await guest()});assert.equal(intent.status,200);assert.equal(new URL(intent.data.url).searchParams.get('query'),'49 Bát Đàn, Hà Nội');
});
test('ưu tiên dữ liệu người dùng trước quán minh họa sau khi lọc, không vượt bán kính/giá/giờ',async()=>{
 const id=randomUUID();await db.query(`INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,source,demo,import_record_id) VALUES($1,'Quán ưu tiên từ tài liệu','Địa chỉ test hư cấu',10.7831,106.6983,$2,NULL,'Tài liệu người dùng - fixture test',false,'priority-test')`,[id,JSON.stringify([{name:'Phở ưu tiên',group:'phở',tags:['nước','nóng'],price:30000,bestsellerSource:null}])]);
 const path='/restaurants?lat=10.7731&lng=106.6983&radius=2000';
 const all=await call(path);assert.equal(all.data.items[0].id,id);assert.ok(all.data.items[0].distance>1000);assert.ok(all.data.items.some((r:any)=>r.demo));assert.deepEqual(all.data.ranking.sourcePriority,['user_import','non_demo','demo']);
 assert.equal((await call(path+'&open=true')).data.items.some((r:any)=>r.id===id),false);
 assert.equal((await call(path+'&budget=10000')).data.items.some((r:any)=>r.id===id),false);
 assert.equal((await call(path.replace('radius=2000','radius=500'))).data.items.some((r:any)=>r.id===id),false);
 assert.equal((await call(path+'&exclude='+id)).data.items.some((r:any)=>r.id===id),false);
});
test('không có vị trí thì danh sách không dùng mốc mặc định hoặc tự sinh khoảng cách',async()=>{
 const r=await call('/directory');assert.equal(r.status,200);assert.equal(r.data.reference,null);assert.ok(r.data.items.length>0);assert.ok(r.data.items.every((x:any)=>x.distance===null));
 assert.equal((await call('/directory?lat=21')).status,400);
});

test('phân nhóm dựa trên món, không nhầm địa chỉ Phố thành phở hoặc bịa thực đơn quán chưa rõ',()=>{
 assert.deepEqual(classifyFood('Pizza Hut - Phố Huế').groups,['pizza & mì Ý']);
 assert.equal(classifyFood('Quán A Không Rõ Món').groups[0],'chưa phân nhóm');
 assert.equal(classifyFood('Phở Bò & Bún Chả - Ngọc Lâm').groups[0],'phở bò');
 assert.ok(classifyFood('Phở Bò & Bún Chả - Ngọc Lâm').groups.includes('bún chả'));
 assert.equal(classifyFood('Quán A',[2]).source,'source_category');
 assert.equal(classifyFood('Quán A',[2]).groups[0],'đồ uống & tráng miệng');
 assert.deepEqual(classifyFood('Bánh Mì An Tâm - Phố Tư Đình').groups,['bánh mì']);
 assert.deepEqual(classifyFood('Trà Sữa Cô A').groups,['trà sữa']);
 assert.ok(classifyFood('Bánh Mì & Mì Xào').groups.includes('mì & hủ tiếu'));
});

test('danh mục tìm không dấu, nhiều từ, phân trang ổn định và lọc nhóm phụ; chỉ số tự cập nhật khi sửa tên',async()=>{
 const fixtureIds=[];for(let i=0;i<9;i++){const id=randomUUID();fixtureIds.push(id);await db.query(`INSERT INTO restaurants(id,name,address,lat,lng,dishes,source,demo,foody_id,classification_source) VALUES($1,$2,'Ngõ Bát Đàn, Hà Nội',21.03,105.85,$3,'Foody test',false,$4,'name_inferred')`,[id,'Kiểm thử Bún Chả '+i,JSON.stringify([{name:'bún chả',group:'bún chả',tags:[],price:null,bestsellerSource:null},{name:'trà sữa',group:'trà sữa',tags:[],price:null,bestsellerSource:null}]),900000000+i]);}
 try{
  const first=(await call('/directory?q=kiem+thu+bat+dan&group='+encodeURIComponent('trà sữa')+'&limit=4')).data;
  const next=(await call('/directory?q=kiem+thu+bat+dan&group='+encodeURIComponent('trà sữa')+'&limit=4&offset=4')).data;
  assert.equal(first.total,9);assert.equal(first.items.length,4);assert.equal(next.items.length,4);assert.ok(first.hasMore);
  assert.ok(first.items.every((x:any)=>x.food_groups.includes('trà sữa')));
  assert.equal(new Set([...first.items,...next.items].map((x:any)=>x.id)).size,8);
  assert.equal((await call('/directory?q=zzzzzzzz-no-match')).data.items.length,0);
  assert.equal((await call('/directory?q=kiem+th')).data.items.length,0);
  assert.equal((await call('/directory?limit=1000')).status,400);
  await db.query('UPDATE restaurants SET name=$2 WHERE id=$1',[fixtureIds[0],'Tên Mới Đã Sửa']);
  assert.equal((await call('/directory?q=ten+moi+da+sua')).data.items[0].id,fixtureIds[0]);
 }finally{await db.query('DELETE FROM restaurants WHERE id=ANY($1::uuid[])',[fixtureIds]);}
});

test('Thường vs Pro: đăng ký mật khẩu scrypt, dùng thử Pro 14 ngày 1 lần, Bộ sưu tập, Ghi chú riêng và Né món',async()=>{
 const guestCookie=await guest();
 const uname='user_'+randomUUID().slice(0,8);
 const reg=await call('/auth/register',{method:'POST',cookie:guestCookie,body:{displayName:'Minh Anh',username:uname,password:'MatKhauAnToan123'}});
 assert.equal(reg.status,200);
 assert.equal(reg.data.user.display_name,'Minh Anh');
 assert.equal(reg.data.user.pro,false);
 const cookie=reg.cookie;

 // Duplicate username rejected
 assert.equal((await call('/auth/register',{method:'POST',cookie:await guest(),body:{displayName:'Khác',username:uname,password:'MatKhauAnToan123'}})).status,409);

 // Wrong password rejected, right password succeeds
 assert.equal((await call('/auth/password-login',{method:'POST',cookie:await guest(),body:{username:uname,password:'SaiMatKhau999'}})).status,401);
 assert.equal((await call('/auth/password-login',{method:'POST',cookie:await guest(),body:{username:uname,password:'MatKhauAnToan123'}})).status,200);

 // Free user can set default_area, but Pro features (collections, notes, excluded_groups) require Pro
 assert.equal((await call('/account/preferences',{method:'PUT',cookie,body:{default_area:'hoan-kiem'}})).status,200);
 assert.equal((await call('/account/preferences',{method:'PUT',cookie,body:{excluded_groups:['bún đậu mắm tôm']}})).status,403);
 assert.equal((await call('/collections',{method:'POST',cookie,body:{name:'Ăn trưa',icon:'🍜'}})).status,403);
 assert.equal((await call('/restaurants/'+ids[0]+'/note',{method:'PUT',cookie,body:{note:'Gọi tái gầu'}})).status,403);

 // Claim 14-day Pro trial once; second claim rejected with 409
 const trial=await call('/pro/trial',{method:'POST',cookie});
 assert.equal(trial.status,200);
 assert.equal(trial.data.user.pro,true);
 assert.equal((await call('/pro/trial',{method:'POST',cookie})).status,409);

 // Now Pro features work end-to-end
 assert.equal((await call('/account/preferences',{method:'PUT',cookie,body:{excluded_groups:['bún đậu mắm tôm'],pro_boost:true}})).status,200);
 const col=await call('/collections',{method:'POST',cookie,body:{name:'Quán ruột trưa',icon:'🍜'}});
 assert.equal(col.status,200);
 assert.equal((await call('/collections/'+col.data.id+'/items',{method:'POST',cookie,body:{restaurantId:ids[0]}})).status,200);
 assert.equal((await call('/restaurants/'+ids[0]+'/note',{method:'PUT',cookie,body:{note:'Gọi tái gầu, gửi xe ngõ cạnh'}})).status,200);

 const hub=(await call('/account/hub',{cookie})).data;
 assert.equal(hub.user.pro,true);
 assert.equal(hub.trialAvailable,false);
 assert.equal(hub.collections.length,1);
 assert.equal(hub.collections[0].items.length,1);
 assert.equal(hub.notes.length,1);
 assert.equal(hub.notes[0].note,'Gọi tái gầu, gửi xe ngõ cạnh');
 assert.deepEqual(hub.preferences.excluded_groups,['bún đậu mắm tôm']);
});

test('Đa thành phố (TP.HCM, Đà Nẵng, Hà Nội): phân loại đặc sản vùng miền và lọc đúng city_slug',async()=>{
 assert.equal(classifyFood('Cơm Tấm Ba Ghiền - Đặng Văn Ngữ').groups[0],'cơm tấm');
 assert.equal(classifyFood('Hủ Tiếu Nam Vang Nhân Quán').groups[0],'hủ tiếu');
 assert.equal(classifyFood('Mì Quảng Bà Mua - Trần Phú').groups[0],'mì quảng & cao lầu');
 assert.equal(classifyFood('Bún Bò Huế Đông Ba').groups[0],'bún bò huế');
 assert.equal(classifyFood('Bánh Đa Cua Đồng Lạch Tray').groups[0],'bánh đa cua');

 const hcmDishes=['cơm tấm','hủ tiếu','bánh mì','bún bò huế'];
 const hcmIds:string[]=[];
 const dnId=randomUUID();
 for(let i=0;i<hcmDishes.length;i++){
  const id=randomUUID();hcmIds.push(id);
  const g=hcmDishes[i];
  await db.query(
   `INSERT INTO restaurants(id,name,address,city_slug,lat,lng,dishes,source,demo,foody_id,classification_source,popularity_badge,popularity_saves,popularity_score)
    VALUES($1,$2,'Quận 1, TP. HCM','ho-chi-minh',10.776,106.701,$3,'Foody test',false,$4,'name_inferred','top_fav',250,88)`,
   [id,'Quán Sài Gòn '+g,JSON.stringify([{name:g,group:g,tags:['trưa'],price:null,bestsellerSource:null}]),910000000+i],
  );
 }
 await db.query(
  `INSERT INTO restaurants(id,name,address,city_slug,lat,lng,dishes,source,demo,foody_id,classification_source)
   VALUES($1,'Mì Quảng Hải Châu','Hải Châu, Đà Nẵng','da-nang',16.061,108.222,$2,'Foody test',false,910000099,'name_inferred')`,
  [dnId,JSON.stringify([{name:'mì quảng & cao lầu',group:'mì quảng & cao lầu',tags:['sáng'],price:null,bestsellerSource:null}])],
 );
 try{
  const sugHcm=await call('/directory?suggestions=true&city=ho-chi-minh');
  assert.equal(sugHcm.status,200);
  assert.equal(sugHcm.data.items.length,4);
  assert.ok(sugHcm.data.items.every((x:any)=>x.city_slug==='ho-chi-minh'));
  assert.equal(new Set(sugHcm.data.items.map((x:any)=>x.primary_group)).size,4);

  const dirDn=await call('/directory?city=da-nang');
  assert.equal(dirDn.status,200);
  assert.equal(dirDn.data.total,1);
  assert.equal(dirDn.data.items[0].city_slug,'da-nang');

  assert.equal((await call('/directory?city=khong-ton-tai')).status,400);
 }finally{
  await db.query('DELETE FROM restaurants WHERE id=ANY($1::uuid[])',[[...hcmIds,dnId]]);
 }
});

test('Ưu tiên quán nhiều lượt yêu thích và sắp xếp nghiêm ngặt từ gần đến xa cho cả Gợi ý & Tìm kiếm',async()=>{
 const tag='kiemthuutien'+randomUUID().slice(0,6);
 const unratedClose=randomUUID();
 const favMid=randomUUID();
 const favFar=randomUUID();
 const sug2=randomUUID(),sug3=randomUUID(),sug4=randomUUID();
 const allIds=[unratedClose,favMid,favFar,sug2,sug3,sug4];
 const mkDish=(g:string)=>JSON.stringify([{name:g+' '+tag,group:g,tags:['trưa'],price:null,bestsellerSource:null}]);
 await db.query(
  `INSERT INTO restaurants(id,name,address,lat,lng,dishes,source,demo,foody_id,classification_source,popularity_badge,popularity_saves,popularity_score) VALUES
   ($1,$2,'Điểm test',14.5003,108.5000,$3,'Foody test',false,920000001,'name_inferred',NULL,0,0),
   ($4,$5,'Điểm test',14.5022,108.5000,$6,'Foody test',false,920000002,'name_inferred','top_fav',180,85),
   ($7,$8,'Điểm test',14.5055,108.5000,$9,'Foody test',false,920000003,'name_inferred','top_fav',360,92),
   ($10,'Bún Chả Yêu Thích','Điểm test',14.5040,108.5000,$11,'Foody test',false,920000004,'name_inferred','top_fav',210,88),
   ($12,'Cơm Tấm Yêu Thích','Điểm test',14.5012,108.5000,$13,'Foody test',false,920000005,'name_inferred','top_fav',150,82),
   ($14,'Bánh Mì Yêu Thích','Điểm test',14.5065,108.5000,$15,'Foody test',false,920000006,'name_inferred','top_fav',95,79)`,
  [
   unratedClose,'Phở Chưa Lưu '+tag,mkDish('phở bò'),
   favMid,'Phở Đông Khách Gần '+tag,mkDish('phở bò'),
   favFar,'Phở Đông Khách Xa '+tag,mkDish('phở bò'),
   sug2,mkDish('bún chả'),
   sug3,mkDish('cơm tấm'),
   sug4,mkDish('bánh mì'),
  ],
 );
 try{
  const srch=(await call('/directory?q='+tag+'&group='+encodeURIComponent('phở bò')+'&lat=14.5000&lng=108.5000')).data;
  assert.equal(srch.items[0].id,favMid);
  assert.equal(srch.items[1].id,favFar);
  assert.ok(srch.items[0].distance < srch.items[1].distance);
  assert.equal(srch.items[2].id,unratedClose);

  const sug=(await call('/directory?suggestions=true&lat=14.5000&lng=108.5000')).data;
  assert.equal(sug.items.length,4);
  assert.ok(sug.items.every((x:any)=>x.popularity_badge==='top_fav'));
  for(let i=1;i<sug.items.length;i++){
   assert.ok(sug.items[i-1].distance <= sug.items[i].distance);
  }
 }finally{
  await db.query('DELETE FROM restaurants WHERE id=ANY($1::uuid[])',[allIds]);
 }
});
