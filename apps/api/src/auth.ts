import {createRemoteJWKSet,jwtVerify} from 'jose';
import {HttpException} from '@nestjs/common';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:5000});
const firebaseKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),{timeoutDuration:5000});
export function devAuthEnabled(){return process.env.NODE_ENV!=='production'&&process.env.ENABLE_DEV_AUTH==='true';}
export function authConfig(){return {development:devAuthEnabled(),google:!!process.env.GOOGLE_CLIENT_ID,phone:!!process.env.FIREBASE_PROJECT_ID,facebook:!!process.env.FACEBOOK_APP_ID&&!!process.env.FACEBOOK_APP_SECRET,otpSending:false,payment:false};}
export async function verifyIdentity(provider:string,token:string):Promise<{subject:string,name:string}>{
 if(provider==='google'){
  if(!process.env.GOOGLE_CLIENT_ID)throw new HttpException('Google chưa được cấu hình',503);
  const {payload}=await jwtVerify(token,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:process.env.GOOGLE_CLIENT_ID,algorithms:['RS256'],maxTokenAge:'1h'});
  if(!payload.sub)throw Error('Missing subject');return {subject:payload.sub,name:typeof payload.name==='string'?payload.name.slice(0,80):'Bạn dùng Google'};
 }
 if(provider==='phone'){
  const project=process.env.FIREBASE_PROJECT_ID;if(!project)throw new HttpException('Phone OTP chưa được cấu hình',503);
  const {payload}=await jwtVerify(token,firebaseKeys,{issuer:`https://securetoken.google.com/${project}`,audience:project,algorithms:['RS256'],maxTokenAge:'1h'});
  const firebase=payload.firebase as {sign_in_provider?:string}|undefined;
  if(!payload.sub||firebase?.sign_in_provider!=='phone'||!payload.phone_number)throw Error('Phone token required');
  return {subject:payload.sub,name:'Bạn dùng số điện thoại'};
 }
 if(provider==='facebook'){
  const app=process.env.FACEBOOK_APP_ID,secret=process.env.FACEBOOK_APP_SECRET;if(!app||!secret)throw new HttpException('Facebook chưa được cấu hình',503);
  const url=new URL('https://graph.facebook.com/debug_token');url.searchParams.set('input_token',token);url.searchParams.set('access_token',`${app}|${secret}`);
  const result=await fetch(url,{signal:AbortSignal.timeout(5000)});const {data}=await result.json() as {data?:{is_valid:boolean,app_id:string,user_id:string,expires_at:number,data_access_expires_at?:number}};
  if(!result.ok||!data?.is_valid||data.app_id!==app||!data.user_id||data.expires_at*1000<=Date.now()||(data.data_access_expires_at&&data.data_access_expires_at*1000<=Date.now()))throw Error('Invalid Facebook token');
  return {subject:data.user_id,name:'Bạn dùng Facebook'};
 }
 throw new HttpException('Nhà cung cấp không hợp lệ',400);
}
