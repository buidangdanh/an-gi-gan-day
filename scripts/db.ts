import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../apps/api/src/db';
const mode=process.argv[2];
async function main(){
 if(mode==='migrate'){
  const exists=await pool.query("SELECT to_regclass('public.schema_migrations') AS t");
  const versions=exists.rows[0].t?(await pool.query('SELECT version FROM schema_migrations')).rows.map(r=>r.version):[];
  for(const [version,file] of [['001','001_initial.sql'],['002','002_users.sql'],['003','003_filter_privacy.sql']]){
   if(versions.includes(version)){console.log('Migration '+version+' đã có.');continue;}
   await transaction(async c=>{await c.query(readFileSync('db/'+file,'utf8'));});console.log('Migration '+version+' OK');
  }
 }else if(mode==='seed'){
  if(process.env.NODE_ENV==='production')throw Error('Seed minh họa chỉ chạy development');
  const names=['Phở Hiên Nhỏ','Bún Góc Nắng','Cơm Nhà Mây','Lẩu Chuyện Trò','Nướng Sân Gạch','Bánh Mì Sớm','Gánh Ăn Vặt','Phở Mộc','Bún Bờ Tre','Cơm Trưa Vui','Lẩu Đèn Vàng','Nướng Bếp Than','Bánh Mì Giòn','Chè Chiều Êm','Phở Ban Mai','Bún Ngõ Quen','Cơm Niêu Mùa','Lẩu Quây Quần','Nướng Khói Nhẹ','Bánh Mì Trạm Nhỏ','Quà Xế Thảnh Thơi','Phở Đêm Dịu','Bún Lá Xanh','Cơm Gạo Thơm','Lẩu Bên Hiên','Nướng Chậm','Bánh Mì Bình Minh','Chè Hẻm Nhỏ','Phở Gừng','Bún Nắng Mai'];
  const dishes=[['phở','Phở bò tái','nước','nóng','ăn nhanh','sáng'],['bún','Bún thịt nướng','khô','nóng','bữa thông thường','trưa'],['cơm','Cơm sườn','khô','nóng','bữa thông thường','trưa'],['lẩu','Lẩu nấm','nước','nóng','ngồi lâu','tối'],['nướng','Thịt nướng cuốn','khô','nóng','ngồi lâu','tối'],['bánh mì','Bánh mì trứng','khô','nóng','ăn nhanh','sáng'],['ăn vặt','Chè đậu xanh','nước','lạnh','ăn nhanh','ăn nhẹ']];
  await transaction(async c=>{
   const n=await c.query('SELECT count(*) FROM restaurants');if(Number(n.rows[0].count)>0){console.log('Đã có dữ liệu, không seed lặp.');return;}
   for(let i=0;i<30;i++){
    const d=dishes[i%7];const price=25000+(i%7)*10000;
    const menu=[{name:d[1],group:d[0],tags:d.slice(2),price,bestsellerSource:i%3===0?'Kịch bản seed hư cấu, không phải dữ liệu bán hàng':null},{name:d[1]+' đặc biệt',group:d[0],tags:d.slice(2),price:price+15000,bestsellerSource:null}];
    const hours=Array.from({length:7},(_,day)=>i===21?{day,open:1080,close:120}:{day,open:360,close:840}).flatMap(h=>i===21?[h]:[h,{day:h.day,open:960,close:1320}]);
    await c.query('INSERT INTO restaurants(id,name,address,lat,lng,dishes,hours,price_min,price_max,source,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)',[randomUUID(),names[i],`${10+i*3} Đường Minh Họa ${1+i%5}, khu vực giả lập Bến Thành, TP.HCM`,10.7731+(Math.floor(i/6)-2)*.003,106.6983+(i%6-2.5)*.003,JSON.stringify(menu),JSON.stringify(hours),price,price+15000,'Seed hư cấu • tọa độ vùng trung tâm TP.HCM, không xác minh địa chỉ']);
   }
  });console.log('Seed 30 quán hư cấu OK; không seed đánh giá.');
 }else throw Error('Dùng migrate hoặc seed');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
