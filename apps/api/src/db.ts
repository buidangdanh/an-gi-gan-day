import { Pool, PoolClient } from 'pg';

const defaultLocal = process.env.NODE_ENV !== 'production'
 ? 'postgresql://angiday:local_demo_only@127.0.0.1:55439/angiday'
 : undefined;

const poolConfig = (connectionString: string | undefined, maxEnv: string, fallbackMax: number) => ({
 connectionString,
 max: Math.min(200, Math.max(4, Number(process.env[maxEnv] || fallbackMax))),
 idleTimeoutMillis: 30_000,
 connectionTimeoutMillis: 5_000,
 statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 8_000),
 allowExitOnIdle: process.env.NODE_ENV === 'test',
});

const primaryUrl = process.env.DATABASE_URL || defaultLocal;
const replicaUrl = process.env.DATABASE_READ_URL || primaryUrl;

export const pool = new Pool(poolConfig(primaryUrl, 'DB_POOL_MAX', 20));
pool.on('error', () => {});
export const readPool = replicaUrl === primaryUrl
 ? pool
 : (() => {
    const rp = new Pool(poolConfig(replicaUrl, 'DB_READ_POOL_MAX', 40));
    rp.on('error', () => {});
    return rp;
   })();

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
 const c = await pool.connect();
 try {
  await c.query('BEGIN');
  const result = await fn(c);
  await c.query('COMMIT');
  return result;
 } catch (e) {
  await c.query('ROLLBACK');
  throw e;
 } finally {
  c.release();
 }
}

export async function closePools() {
 if (readPool !== pool) await readPool.end();
 await pool.end();
}
