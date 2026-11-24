/**
 * High-concurrency L1 in-memory LRU cache with single-flight stampede protection,
 * spatial grid quantization, and lock-free read rate limiting.
 *
 * In multi-pod production deployments (1M CCU), pair this L1 cache with Redis Cluster (L2)
 * and CDN Edge caching (L0) using the same quantized spatial keys.
 */

type CacheEntry<T> = { value: T; expiresAt: number };

export class LruCache<T = unknown> {
 private readonly store = new Map<string, CacheEntry<T>>();
 private readonly inflight = new Map<string, Promise<T>>();

 constructor(private readonly maxEntries = 2000) {}

 get(key: string): T | undefined {
  const entry = this.store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
   this.store.delete(key);
   return undefined;
  }
  // Refresh LRU recency
  this.store.delete(key);
  this.store.set(key, entry);
  return entry.value;
 }

 set(key: string, value: T, ttlMs: number): void {
  if (this.store.has(key)) this.store.delete(key);
  this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (this.store.size > this.maxEntries) {
   const oldest = this.store.keys().next().value;
   if (oldest !== undefined) this.store.delete(oldest);
  }
 }

 async getOrCompute(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = this.get(key);
  if (hit !== undefined) return hit;

  const existing = this.inflight.get(key);
  if (existing) return existing;

  const promise = compute()
   .then((value) => {
    this.set(key, value, ttlMs);
    return value;
   })
   .finally(() => {
    this.inflight.delete(key);
   });

  this.inflight.set(key, promise);
  return promise;
 }

 clear(): void {
  this.store.clear();
  this.inflight.clear();
 }

 size(): number {
  return this.store.size;
 }
}

export class MemoryRateLimiter {
 private readonly buckets = new Map<string, { count: number; resetAt: number }>();

 constructor(private readonly maxKeys = 50_000) {}

 check(key: string, limit: number, windowSeconds: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const current = this.buckets.get(key);

  if (!current || current.resetAt <= now) {
   if (this.buckets.size >= this.maxKeys) this.sweep(now);
   const resetAt = now + windowMs;
   this.buckets.set(key, { count: 1, resetAt });
   return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  current.count += 1;
  return {
   allowed: current.count <= limit,
   remaining: Math.max(0, limit - current.count),
   resetAt: current.resetAt,
  };
 }

 private sweep(now: number): void {
  for (const [k, v] of this.buckets) {
   if (v.resetAt <= now) this.buckets.delete(k);
  }
  if (this.buckets.size >= this.maxKeys) {
   let drop = Math.ceil(this.maxKeys * 0.2);
   for (const k of this.buckets.keys()) {
    this.buckets.delete(k);
    if (--drop <= 0) break;
   }
  }
 }
}

// ~150m grid bucketing around Vietnam latitudes so nearby users share cached 4-card suggestions
const LAT_STEP = 0.00135;
const LNG_STEP = 0.00145;

export function quantizePoint(lat: number, lng: number): { lat: number; lng: number; cell: string } {
 const qLat = Math.round(lat / LAT_STEP) * LAT_STEP;
 const qLng = Math.round(lng / LNG_STEP) * LNG_STEP;
 const rLat = Math.round(qLat * 1e5) / 1e5;
 const rLng = Math.round(qLng * 1e5) / 1e5;
 return { lat: rLat, lng: rLng, cell: `${rLat.toFixed(4)}:${rLng.toFixed(4)}` };
}

export function escapeLike(term: string): string {
 return term.replace(/[\\%_]/g, '\\$&');
}
