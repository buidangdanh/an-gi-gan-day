import {z} from 'zod';
export const coordinate = z.object({lat:z.coerce.number().min(-90).max(90),lng:z.coerce.number().min(-180).max(180)});
export const groups=['phở','bún','cơm','lẩu','nướng','bánh mì','ăn vặt','phở bò','bún chả','bún đậu mắm tôm','bún riêu cua','chả cá lã vọng','bún thang','bánh cuốn nóng','xôi xéo','bún ốc','miến lươn','phở gà','bánh mì sốt vang','nem chua rán','bánh tôm hồ tây','nộm bò khô','cháo sườn','phở cuốn','bánh giò','kem tràng tiền','cà phê trứng'] as const;
export const tags=['nước','khô','nóng','lạnh','ăn nhanh','bữa thông thường','ngồi lâu','sáng','trưa','tối','ăn nhẹ'] as const;
export const dishSchema=z.object({name:z.string().trim().min(2).max(120),group:z.enum(groups),tags:z.array(z.enum(tags)).max(12),price:z.number().int().min(0).max(10000000).nullable(),bestsellerSource:z.string().trim().min(3).max(300).nullable()}).strict();
export const intervalSchema=z.object({day:z.number().int().min(0).max(6),open:z.number().int().min(0).max(1439),close:z.number().int().min(0).max(1440)}).strict().refine(x=>x.open!==x.close,{message:'Giờ mở và đóng phải khác nhau'});
export const restaurantSchema=z.object({name:z.string().trim().min(2).max(140),address:z.string().trim().min(5).max(300),lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),dishes:z.array(dishSchema).min(1).max(80),hours:z.array(intervalSchema).max(70).nullable(),price_min:z.number().int().min(0).max(10000000).nullable(),price_max:z.number().int().min(0).max(10000000).nullable(),source:z.string().trim().min(3).max(300),demo:z.boolean(),branch_of:z.string().uuid().nullable().optional()}).strict().refine(r=>r.price_min===null||r.price_max===null||r.price_max>=r.price_min,{message:'Khoảng giá không hợp lệ'});
export type Dish=z.infer<typeof dishSchema>;
export type Hours=z.infer<typeof intervalSchema>[]|null;
export function isOpen(hours:Hours,date=new Date()):boolean|null {
 if(hours===null)return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find(p=>p.type==='weekday')!.value);
 const minute=Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value);
 return hours.some(h=>h.close>h.open ? h.day===day&&minute>=h.open&&minute<h.close : (h.day===day&&minute>=h.open)||((h.day+1)%7===day&&minute<h.close));
}
export function normalize(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();}
export function mapsUrl(r:{lat:number|null,lng:number|null,address?:string}){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(r.lat!==null&&r.lng!==null?`${r.lat},${r.lng}`:r.address||'');}
export function rankScore(distance:number,radius:number,average:number|null,count:number,prior:number|null,match:number,ageDays:number){
 const near=Math.max(0,1-distance/radius), fresh=Math.exp(-Math.max(0,ageDays)/180);
 // CTR disabled. Quality omitted until internal prior has >=10 valid reviews.
 const quality=prior===null||!count||average===null?null:(count*average+10*prior)/(count+10)/5;
 return (near*.35+match*.20+fresh*.10+(quality===null?0:quality*.25))/(quality===null?.65:.90);
}
