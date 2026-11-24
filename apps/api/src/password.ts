import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LEN = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
 return new Promise((resolve, reject) => {
  scryptCb(password, salt, KEY_LEN, SCRYPT_PARAMS, (err, derivedKey) => {
   if (err) reject(err);
   else resolve(derivedKey);
  });
 });
}

export async function hashPassword(password: string): Promise<string> {
 const salt = randomBytes(16);
 const derived = await deriveKey(password, salt);
 return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

const DUMMY_SALT = Buffer.alloc(16, 7);
const DUMMY_KEY = Buffer.alloc(KEY_LEN, 9);

export async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
 if (!storedHash || !storedHash.startsWith('scrypt$')) {
  // Constant-time dummy derivation to prevent username enumeration timing leaks
  await deriveKey(password, DUMMY_SALT);
  return false;
 }
 const parts = storedHash.split('$');
 if (parts.length !== 3) return false;
 const salt = Buffer.from(parts[1], 'hex');
 const expected = Buffer.from(parts[2], 'hex');
 if (salt.length !== 16 || expected.length !== KEY_LEN) return false;
 const actual = await deriveKey(password, salt);
 return timingSafeEqual(actual, expected);
}
