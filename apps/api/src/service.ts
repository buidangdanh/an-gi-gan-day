import {HttpException} from '@nestjs/common';
import type {Request,Response} from 'express';
import {createHash,randomBytes,randomUUID,timingSafeEqual,createHmac} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction} from './db';
import {coordinate,groups,tags,isOpen,mapsUrl,normalize,rankScore,restaurantSchema,Dish} from './domain';
import {authConfig,devAuthEnabled,verifyIdentity} from './auth';

const fail=(message:string,status=400):never=>{throw new HttpException(message,status);};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const uuid=z.string().uuid();
const COOKIE='ag_session';
const searchSchema=coordinate.extend({q:z.string().max(120).default(''),radius:z.coerce.number().min(100).max(20000).default(2000),budget:z.coerce.number().min(0).max(10000000).optional(),open:z.enum(['true','false']).default('false'),group:z.enum(groups).optional(),tags:z.string().max(200).default(''),exclude:z.string().max(1500).default('')});
type Session={id:string,account_id:string|null,pending_restaurant:string|null,pending_at:Date|null};
export class FoodService{
 async rate(key:string,limit:number,seconds:number){
  const r=await pool.query("INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count",[key,seconds]);
  if(r.rows[0].count>limit)fail('Bạn thao tác hơi nhanh. Vui lòng thử lại sau.',429);
 }
 async session(req:Request,res:Response):Promise<Session>{
  const token=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(token&&/^[a-f0-9]{64}$/.test(token)){
   const result=await pool.query("UPDATE sessions SET last_seen=now() WHERE id=$1 AND last_seen>now()-interval '30 minutes' AND created_at>now()-interval '24 hours' RETURNING *",[hash(token)]);
   if(result.rows[0])return result.rows[0];
  }
  await this.rate('session:'+hash(req.ip||'local'),60,60);
  const newToken=randomBytes(32).toString('hex');const id=hash(newToken);
  const r=await pool.query('INSERT INTO sessions(id) VALUES($1) RETURNING *',[id]);this.cookie(res,newToken);return r.rows[0];
 }
 cookie(res:Response,token:string){res.cookie(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:24*3600*1000});}
 async user(s:Session){
  if(!s.account_id)return null;
  const r=await pool.query('SELECT a.id,u.display_name,COALESCE(p.expires_at>now(),false) AS pro,p.expires_at FROM accounts a JOIN users u ON u.id=a.user_id LEFT JOIN subscriptions p ON p.account_id=a.id WHERE a.id=$1',[s.account_id]);return r.rows[0]||null;
 }
 async requireUser(s:Session,pro=false){const u=await this.user(s);if(!u)fail('Bạn cần đăng nhập tài khoản miễn phí.',401);if(pro&&!u.pro)fail('Tính năng cần Pro đang còn hạn.',403);return u;}
 admin(req:Request){const key=process.env.ADMIN_TOKEN;const given=req.headers.authorization?.replace(/^Bearer /,'')||'';if(!key||key.length<32||given.length!==key.length||!timingSafeEqual(Buffer.from(key),Buffer.from(given)))fail('Không có quyền quản trị.',403);}
 async status(s:Session){return {user:await this.user(s),config:authConfig(),distinctVisits:Number((await pool.query('SELECT count(*) FROM visits WHERE session_id=$1',[s.id])).rows[0].count),pending:s.pending_restaurant,dataset:'Danh sách Hà Nội do người dùng cung cấp, chưa xác minh hoạt động; quán seed hư cấu được ghi nhãn riêng.'};}
 async directory(raw:Record<string,unknown>){
  const f=z.object({lat:coordinate.shape.lat.optional(),lng:coordinate.shape.lng.optional(),q:z.string().max(120).default(''),group:z.enum(groups).optional()}).refine(v=>(v.lat===undefined)===(v.lng===undefined),{message:'Cần cung cấp đủ cặp tọa độ.'}).parse(raw);
  const result=await pool.query(`SELECT r.*,a.count,a.average,CASE WHEN r.location IS NOT NULL THEN ST_Distance(r.location,ST_SetSRID(ST_MakePoint($1::float8,$2::float8),4326)::geography) ELSE NULL END AS distance FROM restaurants r LEFT JOIN review_aggregates a ON a.restaurant_id=r.id WHERE r.active AND NOT r.demo ORDER BY (r.import_record_id IS NOT NULL) DESC,distance ASC NULLS LAST,r.name`,[f.lng??null,f.lat??null]);
  const query=normalize(f.q);const all=result.rows;
  const items=all.filter(r=>(!f.group||r.dishes.some((d:Dish)=>d.group===f.group))&&(!query||normalize(r.name+' '+r.address+' '+r.dishes.map((d:Dish)=>d.name).join(' ')).includes(query))).map(r=>({...this.publicRestaurant(r),distance:r.distance===null?null:Math.round(r.distance),open:isOpen(r.hours)}));
  return {items,total:items.length,datasetTotal:all.length,located:all.filter(r=>r.lat!==null).length,missing:all.filter(r=>r.lat===null).length,attribution:'© OpenStreetMap contributors · ODbL',reference:f.lat===undefined?null:{lat:f.lat,lng:f.lng},notice:'Danh sách địa điểm theo tài liệu, chưa xác minh hoạt động. Chỉ tính khoảng cách khi khớp địa chỉ; không dùng điểm trung tâm phố để thay vị trí quán.'};
 }
 async restaurants(raw:Record<string,unknown>){
  const f=searchSchema.parse(raw);const selected=f.tags?f.tags.split(','):[];for(const tag of selected)z.enum(tags).parse(tag);
  const excluded=f.exclude?f.exclude.split(',').map(x=>uuid.parse(x)):[];
  const r=await pool.query(`SELECT r.*,ST_Distance(r.location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance,a.count,a.average,
   (SELECT CASE WHEN count(*)>=10 THEN avg(score)::float ELSE NULL END FROM reviews WHERE status='approved') AS prior
   FROM restaurants r LEFT JOIN review_aggregates a ON a.restaurant_id=r.id
   WHERE active AND ST_DWithin(location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3)`,[f.lng,f.lat,f.radius]);
  const now=new Date();const query=normalize(f.q);
  const rows=r.rows.flatMap(row=>{
   if(excluded.includes(row.id))return [];
   const open=isOpen(row.hours,now);if(f.open==='true'&&open!==true)return [];
   // All dish-level constraints must match the SAME dish.
   const dishes=(row.dishes as Dish[]).filter(d=>(!f.group||d.group===f.group)&&selected.every(t=>d.tags.includes(t as any))&&(f.budget===undefined||(d.price!==null&&d.price<=f.budget))&&(!query||normalize(d.name).includes(query)||normalize(row.name).includes(query)));
   if(!dishes.length)return [];
   const score=rankScore(row.distance,f.radius,row.average??null,row.count||0,row.prior??null,query||selected.length||f.group?1:.7,(now.getTime()-row.updated_at.getTime())/86400000);
   return [{...this.publicRestaurant(row),open,distance:Math.round(row.distance),matchedDishes:dishes,score,reasons:[`Cách khoảng ${Math.round(row.distance)} m đường thẳng`,...(f.budget!==undefined?['Có món trong ngân sách']:[]),...(selected.length||f.group||query?['Khớp món và khẩu vị bạn chọn']:['Một lựa chọn để đổi vị']),...(!row.count?['Quán chưa có đánh giá nội bộ']:[])]}];
  }).sort((a,b)=>Number(!!b.import_record_id)-Number(!!a.import_record_id)||Number(a.demo)-Number(b.demo)||b.score-a.score||a.id.localeCompare(b.id));
  return {items:rows,total:rows.length,emptySuggestion:rows.length?null:'Không có quán khớp đầy đủ. Bạn có thể chủ động tăng bán kính hoặc đổi bộ lọc.',ranking:{sourcePriority:['user_import','non_demo','demo'],weights:{distance:35,quality:25,match:20,interest:0,freshness:10},interestDisabled:true},location:{lat:f.lat,lng:f.lng}};
 }
 publicRestaurant(row:any){const {location,prior,score,...r}=row;return {...r,count:row.count||0,average:row.average??null};}
 async detail(id:string){
  uuid.parse(id);const r=await pool.query('SELECT r.*,a.count,a.average FROM restaurants r LEFT JOIN review_aggregates a ON a.restaurant_id=r.id WHERE r.id=$1 AND active',[id]);if(!r.rows[0])fail('Không tìm thấy quán.',404);
  const reviews=await pool.query("SELECT r.id,r.taste,r.value,r.service,r.space,r.score,r.body,r.self_confirmed,r.demo,r.updated_at,u.display_name FROM reviews r JOIN accounts a ON a.id=r.account_id JOIN users u ON u.id=a.user_id WHERE restaurant_id=$1 AND status='approved' ORDER BY r.updated_at DESC LIMIT 50",[id]);
  return {...this.publicRestaurant(r.rows[0]),open:isOpen(r.rows[0].hours),reviews:reviews.rows};
 }
 async visit(s:Session,id:string){
  uuid.parse(id);
  return transaction(async c=>{
   const locked=await c.query("SELECT * FROM sessions WHERE id=$1 AND last_seen>now()-interval '30 minutes' AND created_at>now()-interval '24 hours' FOR UPDATE",[s.id]);const current=locked.rows[0];if(!current)fail('Phiên đã hết hạn, vui lòng tải lại.',401);
   const restaurant=(await c.query('SELECT * FROM restaurants WHERE id=$1 AND active',[id])).rows[0];if(!restaurant)fail('Không tìm thấy quán.',404);
   const prior=await c.query('SELECT 1 FROM visits WHERE session_id=$1 AND restaurant_id=$2',[s.id,id]);
   const count=Number((await c.query('SELECT count(*) FROM visits WHERE session_id=$1',[s.id])).rows[0].count);
   if(!current.account_id&&!prior.rowCount&&count>=4){await c.query('UPDATE sessions SET pending_restaurant=$2,pending_at=now() WHERE id=$1',[s.id,id]);return {requiresLogin:true,restaurantId:id,message:'Bạn đã chọn ghé thăm 4 quán khác nhau. Đăng nhập miễn phí để tiếp tục quán này.'};}
   await c.query('INSERT INTO visits(session_id,restaurant_id,account_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[s.id,id,current.account_id]);
   await c.query('UPDATE sessions SET pending_restaurant=NULL,pending_at=NULL WHERE id=$1',[s.id]);
   return {requiresLogin:false,url:mapsUrl(restaurant),restaurantId:id,message:'Đây là ý định ghé thăm, không xác minh bạn đã đến quán.'};
  });
 }
 async login(s:Session,req:Request,res:Response){
  await this.rate('login:'+hash(req.ip||'local'),12,60);
  const body=z.object({provider:z.enum(['development','google','phone','facebook']),token:z.string().max(12000).optional()}).strict().parse(req.body);
  let identity:{subject:string,name:string};
  if(body.provider==='development'){
   if(!devAuthEnabled())fail('Đăng nhập development bị tắt.',403);
   identity={subject:randomUUID(),name:'Bạn thử nghiệm'};
  }else{try{identity=await verifyIdentity(body.provider,body.token||'');}catch(e){if(e instanceof HttpException)throw e;fail('Token đăng nhập không hợp lệ hoặc đã hết hạn.',401);}}
  const token=randomBytes(32).toString('hex');const newId=hash(token);
  const result=await transaction(async c=>{
   // Serialize identity creation as well as session rotation; never merge by email.
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[body.provider+':'+identity.subject]);
   const old=(await c.query('SELECT * FROM sessions WHERE id=$1 FOR UPDATE',[s.id])).rows[0];if(!old)fail('Phiên đã đổi. Vui lòng tải lại.',409);
   let account=(await c.query('SELECT account_id FROM auth_identities WHERE provider=$1 AND subject=$2',[body.provider,identity.subject])).rows[0]?.account_id;
   if(!account){account=randomUUID();const userId=randomUUID();await c.query('INSERT INTO users(id,display_name) VALUES($1,$2)',[userId,identity.name]);await c.query('INSERT INTO accounts(id,user_id) VALUES($1,$2)',[account,userId]);await c.query('INSERT INTO auth_identities VALUES($1,$2,$3)',[body.provider,identity.subject,account]);}
   const next=(await c.query('INSERT INTO sessions(id,account_id,pending_restaurant,pending_at) VALUES($1,$2,$3,$4) RETURNING *',[newId,account,old.pending_restaurant,old.pending_at])).rows[0];
   await c.query('UPDATE visits SET account_id=$2 WHERE session_id=$1 AND account_id IS NULL',[s.id,account]);
   await c.query('UPDATE visits SET session_id=$2 WHERE session_id=$1',[s.id,newId]);
   // Reports keep an audit reference to old session; invalidate it rather than deleting it.
   await c.query("UPDATE sessions SET last_seen=now()-interval '25 hours',account_id=NULL,pending_restaurant=NULL,pending_at=NULL WHERE id=$1",[s.id]);return next as Session;
  });this.cookie(res,token);
  const continuation=result.pending_restaurant&&result.pending_at&&Date.now()-new Date(result.pending_at).getTime()<30*60000?await this.visit(result,result.pending_restaurant):null;
  return {user:await this.user(result),continuation};
 }
 async logout(s:Session,res:Response){await pool.query("UPDATE sessions SET last_seen=now()-interval '25 hours',account_id=NULL WHERE id=$1",[s.id]);res.clearCookie(COOKIE,{path:'/'});return {ok:true};}
 async library(s:Session){const u=await this.requireUser(s);return {favorites:(await pool.query('SELECT r.id,r.name,r.address FROM favorites f JOIN restaurants r ON r.id=f.restaurant_id WHERE account_id=$1 AND active ORDER BY f.created_at DESC',[u.id])).rows,history:(await pool.query('SELECT r.id,r.name,max(v.created_at) AS chosen_at FROM visits v JOIN restaurants r ON r.id=v.restaurant_id WHERE v.account_id=$1 AND active GROUP BY r.id ORDER BY chosen_at DESC LIMIT 50',[u.id])).rows,filters:(await pool.query('SELECT id,name,filters FROM saved_filters WHERE account_id=$1',[u.id])).rows};}
 async favorite(s:Session,id:string,on:boolean){const u=await this.requireUser(s);await this.detail(id);if(on)await pool.query('INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING',[u.id,id]);else await pool.query('DELETE FROM favorites WHERE account_id=$1 AND restaurant_id=$2',[u.id,id]);return {ok:true};}
 async saveFilter(s:Session,body:unknown){const u=await this.requireUser(s,true);const b=z.object({name:z.string().trim().min(1).max(60),filters:searchSchema.omit({lat:true,lng:true,exclude:true})}).strict().parse(body);await this.rate('filters:'+u.id,20,3600);await pool.query('INSERT INTO saved_filters VALUES($1,$2,$3,$4)',[randomUUID(),u.id,b.name,JSON.stringify(b.filters)]);return {ok:true};}
 async compare(s:Session,raw:Record<string,unknown>){await this.requireUser(s,true);const b=z.object({ids:z.string().max(150),group:z.enum(groups)}).parse(raw);const ids=[...new Set(b.ids.split(',').map(x=>uuid.parse(x)))];if(ids.length<2||ids.length>3)fail('Chọn 2–3 quán để so sánh.');const items=await Promise.all(ids.map(id=>this.detail(id)));if(items.some(r=>!r.dishes.some((d:Dish)=>d.group===b.group)))fail('Các quán phải có cùng nhóm món cụ thể.');return {group:b.group,items:items.map(r=>({...r,dishes:r.dishes.filter((d:Dish)=>d.group===b.group)}))};}
 async eligibility(s:Session,id:string){const u=await this.requireUser(s);uuid.parse(id);const v=(await pool.query('SELECT min(created_at) AS at FROM visits WHERE account_id=$1 AND restaurant_id=$2',[u.id,id])).rows[0].at;const wait=v?Math.max(0,30*60000-(Date.now()-v.getTime())):null;return {pro:u.pro,hasIntent:!!v,waitSeconds:wait===null?null:Math.ceil(wait/1000),canReview:u.pro&&wait===0,explanation:'Chờ 30 phút sau ý định ghé thăm và tự xác nhận đã ăn. Đây không phải lượt đến đã xác minh.',myReview:(await pool.query('SELECT * FROM reviews WHERE account_id=$1 AND restaurant_id=$2',[u.id,id])).rows[0]||null};}
 async review(s:Session,id:string,body:unknown){
  const u=await this.requireUser(s,true);await this.detail(id);const b=z.object({taste:z.number().int().min(1).max(5),value:z.number().int().min(1).max(5),service:z.number().int().min(1).max(5),space:z.number().int().min(1).max(5),body:z.string().trim().min(10).max(2000),self_confirmed:z.literal(true)}).strict().parse(body);
  await this.rate('review:'+u.id,6,3600);
  return transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[u.id+':'+id]);
   const active=await c.query('SELECT 1 FROM subscriptions WHERE account_id=$1 AND expires_at>now() FOR UPDATE',[u.id]);if(!active.rowCount)fail('Pro đã hết hạn.',403);
   const v=await c.query("SELECT 1 FROM visits WHERE account_id=$1 AND restaurant_id=$2 AND created_at<=now()-interval '30 minutes' LIMIT 1",[u.id,id]);if(!v.rowCount)fail('Cần ý định ghé thăm trước ít nhất 30 phút.',403);
   const old=(await c.query('SELECT * FROM reviews WHERE account_id=$1 AND restaurant_id=$2 FOR UPDATE',[u.id,id])).rows[0];
   if(old)await c.query('INSERT INTO review_history(review_id,snapshot) VALUES($1,$2)',[old.id,JSON.stringify(old)]);
   const demo=(await c.query('SELECT demo FROM restaurants WHERE id=$1',[id])).rows[0].demo;
   const r=await c.query("INSERT INTO reviews(id,account_id,restaurant_id,taste,value,service,space,body,self_confirmed,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9) ON CONFLICT(account_id,restaurant_id) DO UPDATE SET taste=EXCLUDED.taste,value=EXCLUDED.value,service=EXCLUDED.service,space=EXCLUDED.space,body=EXCLUDED.body,status='pending',updated_at=now() RETURNING id,status",[randomUUID(),u.id,id,b.taste,b.value,b.service,b.space,b.body,demo]);
   await c.query('INSERT INTO audit(actor,action,target) VALUES($1,$2,$3)',[u.id,old?'review-edit':'review-create',r.rows[0].id]);return r.rows[0];
  });
 }
 async report(s:Session,id:string,body:unknown){await this.detail(id);const b=z.object({body:z.string().trim().min(10).max(1000),review_id:uuid.nullable().optional()}).strict().parse(body);await this.rate('report:'+s.id,5,3600);if(b.review_id){const r=await pool.query('SELECT 1 FROM reviews WHERE id=$1 AND restaurant_id=$2',[b.review_id,id]);if(!r.rowCount)fail('Đánh giá không thuộc quán này.');}await pool.query('INSERT INTO reports(id,session_id,restaurant_id,review_id,body) VALUES($1,$2,$3,$4,$5)',[randomUUID(),s.id,id,b.review_id||null,b.body]);return {ok:true};}
 async adminList(req:Request){this.admin(req);return {restaurants:(await pool.query('SELECT * FROM restaurants ORDER BY name')).rows,reviews:(await pool.query('SELECT * FROM reviews ORDER BY updated_at DESC LIMIT 100')).rows,reports:(await pool.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100')).rows,audit:(await pool.query('SELECT * FROM audit ORDER BY id DESC LIMIT 100')).rows};}
 async adminRestaurant(req:Request,id?:string){this.admin(req);if(id)uuid.parse(id);const b=restaurantSchema.parse(req.body);const target=id||randomUUID();await transaction(async c=>{const r=await c.query(`INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo,branch_of) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,lat=EXCLUDED.lat,lng=EXCLUDED.lng,dishes=EXCLUDED.dishes,hours=EXCLUDED.hours,price_min=EXCLUDED.price_min,price_max=EXCLUDED.price_max,source=EXCLUDED.source,demo=EXCLUDED.demo,branch_of=EXCLUDED.branch_of,updated_at=now() RETURNING id`,[target,b.name,b.address,b.lat,b.lng,JSON.stringify(b.dishes),b.hours===null?null:JSON.stringify(b.hours),b.price_min,b.price_max,b.source,b.demo,b.branch_of||null]);await c.query("INSERT INTO audit(actor,action,target,detail) VALUES('admin',$1,$2,$3)",[id?'restaurant-update':'restaurant-create',target,JSON.stringify({name:b.name})]);});return {id:target};}
 async adminDelete(req:Request,id:string){this.admin(req);uuid.parse(id);await transaction(async c=>{const r=await c.query('UPDATE restaurants SET active=false,updated_at=now() WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)fail('Không có quán.',404);await c.query("INSERT INTO audit(actor,action,target) VALUES('admin','restaurant-archive',$1)",[id]);});return {ok:true};}
 async moderate(req:Request,id:string){this.admin(req);uuid.parse(id);const b=z.object({status:z.enum(['approved','rejected','pending']),reason:z.string().trim().min(3).max(500)}).strict().parse(req.body);await transaction(async c=>{const r=(await c.query('SELECT * FROM reviews WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)fail('Không có đánh giá.',404);await c.query('INSERT INTO review_history(review_id,snapshot) VALUES($1,$2)',[id,JSON.stringify(r)]);await c.query('UPDATE reviews SET status=$2 WHERE id=$1',[id,b.status]);await c.query("INSERT INTO audit(actor,action,target,detail) VALUES('admin','review-moderation',$1,$2)",[id,JSON.stringify(b)]);});return {ok:true};}
 async resolve(req:Request,id:string){this.admin(req);uuid.parse(id);await transaction(async c=>{const r=await c.query("UPDATE reports SET status='resolved' WHERE id=$1 RETURNING id",[id]);if(!r.rowCount)fail('Không có báo cáo.',404);await c.query("INSERT INTO audit(actor,action,target) VALUES('admin','report-resolve',$1)",[id]);});return {ok:true};}
 async geocode(req:Request,publicSession?:Session){
  if(publicSession){await this.rate('geocode-user:'+publicSession.id,5,600);await this.rate('geocode-ip:'+(req.ip||'local'),10,600);}else{this.admin(req);await this.rate('geocode-admin',10,60);}const b=z.object({address:z.string().trim().min(5).max(300)}).strict().parse(req.body);
  if(publicSession){
   const rows=(await pool.query('SELECT name,address,lat,lng,location_source FROM restaurants WHERE active AND lat IS NOT NULL')).rows;
   const query=normalize(b.address);const candidates=rows.filter(r=>normalize(r.name+' '+r.address).includes(query)).slice(0,5).map(r=>({coordinates:{lat:r.lat,lng:r.lng},label:r.name+' · '+r.address,provider:r.location_source.startsWith('osm')?'OpenStreetMap':'Tọa độ hồ sơ',partial:true}));
   return {status:candidates.length>1?'AMBIGUOUS':candidates.length?'OK':'ZERO_RESULTS',candidates,provenance:'Dữ liệu quán đã tra tọa độ',storage:'Tra dữ liệu cục bộ, không gọi API Google hoặc dịch vụ ngoài.'};
  }
  const key=process.env.GOOGLE_MAPS_GEOCODING_API_KEY;if(!key)fail('Geocoding quản trị chưa được cấu hình.',503);
  // No automatic persistence or cache of provider coordinates. Results only shown in admin.
  const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');url.searchParams.set('address',b.address);url.searchParams.set('region','vn');url.searchParams.set('key',key!);
  for(let attempt=0;attempt<2;attempt++){
   let response:globalThis.Response;try{response=await fetch(url,{signal:AbortSignal.timeout(4000)});}catch{if(attempt===0)continue;return fail('Geocoding tạm thời không kết nối được.',502);}
   if(response.status>=500&&attempt===0)continue;if(!response.ok)fail('Dịch vụ Geocoding không sẵn sàng.',502);
   const data=await response.json() as any;
   if(data.status==='ZERO_RESULTS')return {status:'ZERO_RESULTS',candidates:[]};
   if(data.status==='OVER_QUERY_LIMIT'||data.status==='OVER_DAILY_LIMIT')fail('Geocoding đã chạm giới hạn.',429);
   if(data.status==='REQUEST_DENIED')fail('Cấu hình Geocoding bị từ chối.',503);
   if(data.status==='UNKNOWN_ERROR'&&attempt===0)continue;
   if(data.status!=='OK')fail('Địa chỉ không xử lý được.',502);
   const candidates=data.results.slice(0,5).map((r:any)=>({coordinates:coordinate.parse(r.geometry.location),partial:!!r.partial_match}));
   return {status:candidates.length>1||candidates.some((x:any)=>x.partial)?'AMBIGUOUS':'OK',candidates,provenance:'Google Maps',storage:'Không lưu kết quả. Chỉ sử dụng tạm thời cho truy vấn; không sao chép vào hồ sơ quán lâu dài.'};
  }return fail('Geocoding tạm thời không sẵn sàng.',502);
 }
 async webhook(req:Request){
  const secret=process.env.PAYMENT_WEBHOOK_SECRET;if(!secret||secret.length<32)fail('Thanh toán chưa được cấu hình.',503);
  const timestamp=String(req.headers['x-payment-timestamp']||'');if(!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)fail('Webhook đã hết hạn.',401);
  const signature=String(req.headers['x-payment-signature']||'');const raw=(req as any).rawBody as Buffer|undefined;if(!raw)fail('Thiếu raw body.',400);
  const expected=createHmac('sha256',secret!).update(timestamp+'.').update(raw!).digest('hex');if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))fail('Chữ ký webhook không hợp lệ.',401);
  const b=z.object({id:z.string().min(8).max(100),account_id:uuid,expires_at:z.iso.datetime()}).strict().parse(req.body);const expires=new Date(b.expires_at);if(expires<=new Date()||expires.getTime()>Date.now()+2*366*86400000)fail('Hạn subscription không hợp lệ.');
  return transaction(async c=>{const r=await c.query('INSERT INTO payment_events(id,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',[b.id,hash(raw!.toString())]);if(!r.rowCount){const existing=(await c.query('SELECT payload_hash FROM payment_events WHERE id=$1',[b.id])).rows[0];if(existing.payload_hash!==hash(raw!.toString()))fail('Event ID có nội dung khác.',409);return {ok:true,duplicate:true};}await c.query("INSERT INTO subscriptions VALUES($1,$2,'webhook-adapter') ON CONFLICT(account_id) DO UPDATE SET expires_at=GREATEST(subscriptions.expires_at,EXCLUDED.expires_at),source=EXCLUDED.source",[b.account_id,expires]);await c.query("INSERT INTO audit(actor,action,target) VALUES('webhook','subscription',$1)",[b.account_id]);return {ok:true,duplicate:false};});
 }
}
