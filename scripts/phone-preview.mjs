import http from 'node:http';
import {networkInterfaces} from 'node:os';
const host=process.env.PHONE_PREVIEW_HOST;
const port=Number(process.env.PHONE_PREVIEW_PORT||3180);
const localAddresses=Object.values(networkInterfaces()).flat().filter(Boolean).map(x=>x.address);
if(!host||!localAddresses.includes(host)||!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host))throw Error('PHONE_PREVIEW_HOST phải là IPv4 mạng nội bộ của máy này.');
const origin=`http://${host}:${port}`;
// A narrow LAN gateway. Next and Nest remain on loopback; admin/auth/payment are never forwarded.
const server=http.createServer((req,res)=>{
 const url=new URL(req.url||'/',origin);
 const method=req.method||'GET';const pathname=url.pathname;
 if(req.headers.host!==`${host}:${port}`){res.writeHead(403);res.end('Host không hợp lệ');return;}
 if(!['GET','HEAD','POST'].includes(method)){res.writeHead(405);res.end();return;}
 if(!['GET','HEAD'].includes(method)&&req.headers.origin!==origin){res.writeHead(403);res.end('Nguồn yêu cầu không hợp lệ');return;}
 const publicRead=pathname==='/api/session'||pathname==='/api/health'||pathname==='/api/directory'||pathname==='/api/restaurants'||/^\/api\/restaurants\/[a-f0-9-]{36}$/.test(pathname);
 const publicWrite=pathname==='/api/locations/resolve'||/^\/api\/restaurants\/[a-f0-9-]{36}\/visit$/.test(pathname);
 const page=pathname==='/'||pathname==='/ha-noi'||pathname==='/goi-y'||pathname==='/about'||pathname.startsWith('/_next/')||pathname==='/favicon.ico';
 if(!(method==='POST'?publicWrite:publicRead||page)){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'});res.end('Bản xem trên điện thoại chỉ mở tìm quán, chi tiết và chọn ghé thăm. Tài khoản/quản trị dùng riêng trên máy tính.');return;}
 const headers={...req.headers,host:'127.0.0.1:3100'};
 delete headers.authorization;delete headers['x-forwarded-for'];delete headers['x-forwarded-host'];delete headers['x-forwarded-proto'];
 if(method==='POST')headers.origin=process.env.WEB_ORIGIN||'http://127.0.0.1:3100';
 const upstream=http.request({hostname:'127.0.0.1',port:3100,path:req.url,method,headers},reply=>{
  res.writeHead(reply.statusCode||502,{...reply.headers,'Cache-Control':'no-store'});reply.pipe(res);
 });
 upstream.setTimeout(15000,()=>upstream.destroy());
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('Ứng dụng đang khởi động, vui lòng tải lại.');});
 req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
server.listen(port,host,()=>console.log(`Điện thoại cùng Wi-Fi mở ${origin} • Không mở admin/auth/payment ra LAN.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
