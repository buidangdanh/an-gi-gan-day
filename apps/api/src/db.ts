import { Pool, PoolClient } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || (process.env.NODE_ENV !== 'production' ? 'postgresql://angiday:local_demo_only@127.0.0.1:55439/angiday' : undefined), max: 12 });
export async function transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
 const c=await pool.connect();
 try {await c.query('BEGIN'); const result=await fn(c); await c.query('COMMIT');return result;} catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
}
