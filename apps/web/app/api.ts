export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:body===undefined?(method==='GET'?undefined:'{}'):JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw Error('Máy chủ chưa sẵn sàng. Vui lòng thử lại.');}
 if(!response.ok)throw Error(data.message||'Yêu cầu chưa thực hiện được.');return data;
}
export type Dish={name:string,group:string,tags:string[],price:number|null,bestsellerSource:string|null};
export type Restaurant={id:string,name:string,address:string,lat:number,lng:number,dishes:Dish[],matchedDishes?:Dish[],hours:{day:number,open:number,close:number}[]|null,price_min:number|null,price_max:number|null,source:string,updated_at:string,demo:boolean,count:number,average:number|null,distance?:number,open:boolean|null,reasons?:string[],reviews?:any[]};
export const money=(n:number|null)=>n===null?'Chưa rõ giá':new Intl.NumberFormat('vi-VN').format(n)+'đ';
export const groups=['phở','bún','cơm','lẩu','nướng','bánh mì','ăn vặt'];
export const tagGroups=[['nước','khô'],['nóng','lạnh'],['ăn nhanh','bữa thông thường','ngồi lâu'],['sáng','trưa','tối','ăn nhẹ']];
