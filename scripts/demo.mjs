import {spawn} from 'node:child_process';
if(process.env.NODE_ENV==='production'){console.error('Demo không được chạy production.');process.exit(1);}
if(!process.env.npm_execpath){console.error('Hãy dùng npm run demo.');process.exit(1);}
console.log('DEVELOPMENT DEMO • Quán hư cấu • Đăng nhập thử Free • Không OTP/thu phí thật');
process.env.ENABLE_DEV_AUTH='true';
process.env.NEXT_TELEMETRY_DISABLED='1';
const run=(name)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[process.env.npm_execpath,'run',name],{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${name} dừng với mã ${code}`)));});
try{for(const name of ['db:up','db:migrate','db:seed','data:import:hanoi','data:activate:hanoi'])await run(name);await run('dev');}catch(e){console.error(e.message);process.exitCode=1;}
