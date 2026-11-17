import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {All,ArgumentsHost,Catch,Controller,ExceptionFilter,HttpException,Module,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {ZodError} from 'zod';
import {FoodService} from './service';
export const service=new FoodService();
@Catch()
class Errors implements ExceptionFilter{
 catch(error:unknown,host:ArgumentsHost){const res=host.switchToHttp().getResponse<Response>();let status=500,message='Có lỗi xử lý. Vui lòng thử lại.';if(error instanceof HttpException){status=error.getStatus();message=error.message;}else if(error instanceof ZodError){status=400;message=error.issues.map(x=>x.path.join('.')+': '+x.message).join('; ');}else if((error as any)?.code==='23503'||(error as any)?.code==='23505'){status=409;message='Dữ liệu tham chiếu không hợp lệ hoặc đã tồn tại.';}else{console.error('Request failed:',(error as Error)?.name,(error as any)?.code||'');}res.status(status).json({message});}
}
@Controller('api')
class ApiController{
 @All('{*path}')
 async route(@Req()req:Request,@Res({passthrough:true})res:Response){
  res.setHeader('Cache-Control','no-store');
  const path=req.path.replace(/^\/api/,'')||'/';const method=req.method;
  if(method==='GET'&&path==='/health')return {ok:true,service:'Ăn gì gần đây?',database:'PostgreSQL + PostGIS'};
  if(method==='POST'&&path==='/payments/webhook')return service.webhook(req);
  if(!['GET','HEAD','OPTIONS'].includes(method)){
   if(req.headers.origin!==(process.env.WEB_ORIGIN||'http://127.0.0.1:3100'))throw new HttpException('Nguồn yêu cầu không hợp lệ.',403);
   if(!req.is('application/json'))throw new HttpException('Cần nội dung JSON.',415);
  }
  await service.rate('api:'+(req.ip||'local'),300,60);
  const s=await service.session(req,res);
  if(method==='GET'&&path==='/session')return service.status(s);
  if(method==='GET'&&path==='/restaurants')return service.restaurants(req.query);
  if(method==='GET'&&path==='/directory')return service.directory(req.query);
  if(method==='POST'&&path==='/locations/resolve')return service.geocode(req,s);
  if(method==='POST'&&path==='/auth/login')return service.login(s,req,res);
  if(method==='POST'&&path==='/auth/logout')return service.logout(s,res);
  if(method==='POST'&&path==='/auth/otp'){await service.rate('otp:'+(req.ip||'local'),3,600);throw new HttpException('Gửi OTP chưa được cấu hình. Cần Firebase Phone Auth có reCAPTCHA phía client.',503);}
  if(method==='GET'&&path==='/library')return service.library(s);
  if(method==='POST'&&path==='/filters')return service.saveFilter(s,req.body);
  if(method==='GET'&&path==='/compare')return service.compare(s,req.query);
  if(method==='GET'&&path==='/admin')return service.adminList(req);
  if(method==='POST'&&path==='/admin/restaurants')return service.adminRestaurant(req);
  if(method==='POST'&&path==='/admin/geocode')return service.geocode(req);
  let m=path.match(/^\/restaurants\/([^/]+)(?:\/(visit|favorite|eligibility|reviews|reports))?$/);
  if(m){const [,id,action]=m;if(method==='GET'&&!action)return service.detail(id);if(method==='POST'&&action==='visit')return service.visit(s,id);if((method==='POST'||method==='DELETE')&&action==='favorite')return service.favorite(s,id,method==='POST');if(method==='GET'&&action==='eligibility')return service.eligibility(s,id);if(method==='POST'&&action==='reviews')return service.review(s,id,req.body);if(method==='POST'&&action==='reports')return service.report(s,id,req.body);}
  m=path.match(/^\/admin\/(restaurants|reviews|reports)\/([^/]+)$/);
  if(m){if(m[1]==='restaurants'&&method==='PUT')return service.adminRestaurant(req,m[2]);if(m[1]==='restaurants'&&method==='DELETE')return service.adminDelete(req,m[2]);if(m[1]==='reviews'&&method==='PATCH')return service.moderate(req,m[2]);if(m[1]==='reports'&&method==='PATCH')return service.resolve(req,m[2]);}
  throw new HttpException('Không tìm thấy API.',404);
 }
}
@Module({controllers:[ApiController]})
class AppModule{}
export async function createApp(){
 if(process.env.NODE_ENV==='production'){
  if(process.env.ENABLE_DEV_AUTH==='true')throw Error('ENABLE_DEV_AUTH bị cấm ở production');
  if(!process.env.DATABASE_URL||!process.env.WEB_ORIGIN?.startsWith('https://'))throw Error('Production cần DATABASE_URL và WEB_ORIGIN HTTPS');
 }
 const app=await NestFactory.create(AppModule,{rawBody:true,logger:['error','warn']});app.useGlobalFilters(new Errors());return app;
}
if(require.main===module){createApp().then(app=>app.listen(Number(process.env.API_PORT||4100),'127.0.0.1')).then(()=>console.log('API http://127.0.0.1:'+(process.env.API_PORT||4100))).catch(()=>{console.error('Không khởi động được API. Kiểm tra cấu hình.');process.exitCode=1;});}
