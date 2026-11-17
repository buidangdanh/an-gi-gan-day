import assert from 'node:assert/strict';
const base='http://127.0.0.1:3100';let cookie='';
async function request(path,body){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;const data=await response.json();assert.equal(response.status,200,data.message);return data;}
const session=await request('/session');const list=await request('/restaurants?lat=10.7731&lng=106.6983&radius=2000');assert.ok(list.items.length>=5,'Cần seed ít nhất 5 quán');
await request('/restaurants/'+list.items[0].id);assert.equal((await request('/session')).distinctVisits,0);
for(const r of list.items.slice(0,4)){const intent=await request('/restaurants/'+r.id+'/visit',{});assert.equal(intent.requiresLogin,false);assert.equal(new URL(intent.url).hostname,'www.google.com');}
const fifth=list.items[4];assert.equal((await request('/restaurants/'+fifth.id+'/visit',{})).requiresLogin,true);
if(session.config.development){const logged=await request('/auth/login',{provider:'development'});assert.equal(logged.continuation.restaurantId,fifth.id);assert.equal(logged.user.pro,false);await request('/restaurants/'+fifth.id+'/favorite',{});assert.equal((await request('/library')).favorites.length,1);await request('/auth/logout',{});console.log('PASS Next → Nest → PostGIS: tìm, chi tiết, 4 lượt, gate thứ 5, login Free tiếp tục, yêu thích, logout.');}
else console.log('PASS Next → Nest → PostGIS: tìm, chi tiết, 4 lượt, gate thứ 5. Bỏ qua login vì demo auth đang tắt.');
