import {pool,transaction} from '../apps/api/src/db';
const [command,accountId,days='7']=process.argv.slice(2);
async function main(){
 if(command==='accounts'){console.table((await pool.query('SELECT a.id AS account_id,u.display_name,a.created_at FROM accounts a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 30')).rows);return;}
 if(command==='grant-pro'){
  if(process.env.NODE_ENV==='production')throw Error('Công cụ cấp thử bị tắt production');
  if(!accountId||!Number.isInteger(Number(days))||Number(days)<1||Number(days)>30)throw Error('grant-pro <account UUID> <1..30 ngày>');
  await transaction(async c=>{await c.query("INSERT INTO subscriptions VALUES($1,now()+$2*interval '1 day','development') ON CONFLICT(account_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,source='development'",[accountId,Number(days)]);await c.query("INSERT INTO audit(actor,action,target) VALUES('development-cli','grant-pro',$1)",[accountId]);});console.log('Đã cấp thử Pro development.');return;
 }
 throw Error('Lệnh: npm run admin -- accounts | grant-pro <UUID> [ngày]');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
