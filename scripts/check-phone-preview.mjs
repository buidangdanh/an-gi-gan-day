import assert from 'node:assert/strict';
const base=process.argv[2];if(!base)throw Error('Cần URL LAN làm tham số.');
let cookie='';
async function request(path,{method='GET',origin=base}={}){
 const response=await fetch(base+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
 cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;
 const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {status:response.status,data};
}
assert.equal((await request('/')).status,200);
assert.equal((await request('/ha-noi')).status,200);
const directory=await request('/api/directory?lat=21.0285&lng=105.8542');assert.equal(directory.status,200);assert.equal(directory.data.datasetTotal,400);assert.ok(directory.data.located>0);assert.equal(directory.data.located+directory.data.missing,400);
const session=await request('/api/session');assert.equal(session.status,200);assert.equal(session.data.config.development,false);assert.equal(session.data.user,null);
for(const path of ['/admin','/api/admin','/.env.local','/data/imports/ha-noi-2026-11-17/restaurants.json'])assert.equal((await request(path)).status,403);
for(const path of ['/api/auth/login','/api/payments/webhook','/api/admin/geocode'])assert.equal((await request(path,{method:'POST'})).status,403);
const list=await request('/api/restaurants?lat=10.7731&lng=106.6983&radius=2000');assert.equal(list.status,200);assert.ok(list.data.items.length>=5);
assert.equal((await request('/api/restaurants/'+list.data.items[0].id)).status,200);
assert.equal((await request('/api/restaurants/'+list.data.items[0].id+'/visit',{method:'POST',origin:'https://example.invalid'})).status,403);
for(const r of list.data.items.slice(0,4)){const v=await request('/api/restaurants/'+r.id+'/visit',{method:'POST'});assert.equal(v.status,200);assert.equal(v.data.requiresLogin,false);}
assert.equal((await request('/api/restaurants/'+list.data.items[4].id+'/visit',{method:'POST'})).data.requiresLogin,true);
console.log('PASS LAN: giao diện, dữ liệu, chi tiết, Origin, gate 4 quán; admin/auth/payment/key/data nguồn riêng đều bị chặn.');
