import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { settings } from '../config/env';
import { ApiError } from '../services/errors';
import { traceOn, traceSql } from '../debug/trace';
const cached = globalThis as unknown as { assetPrisma?: PrismaClient; assetPool?: pg.Pool };
export function getDatabaseUrl() {
  return settings.databaseUrl;
}
export function getPool(): pg.Pool {
  if (cached.assetPool) return cached.assetPool;
  if (!settings.databaseUrl) throw new ApiError('ฐานข้อมูลยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลระบบ', 503);
  let connection: URL;
  try {
    connection = new URL(settings.databaseUrl);
  } catch {
    throw new ApiError('การตั้งค่าฐานข้อมูลไม่ถูกต้อง', 503);
  }
  if (!['postgres:', 'postgresql:'].includes(connection.protocol))
    throw new ApiError('การตั้งค่าฐานข้อมูลไม่ถูกต้อง', 503);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname);
  if (!local) {
    connection.searchParams.set('sslmode', 'verify-full');
    connection.searchParams.delete('uselibpqcompat');
  }
  cached.assetPool = new pg.Pool({
    connectionString: connection.href,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 20000,
  });
  // โหมดดูการทำงานหลังบ้าน (npm run dev:trace): ให้ Prisma แจ้งทุกคำสั่ง SQL ที่ส่งเข้าฐานข้อมูล
  if (traceOn()) {
    const client = new PrismaClient({
      adapter: new PrismaPg(cached.assetPool),
      log: [{ emit: 'event', level: 'query' }],
    });
    client.$on('query', event => traceSql(event.query, event.duration));
    cached.assetPrisma = client as unknown as PrismaClient;
  } else cached.assetPrisma = new PrismaClient({ adapter: new PrismaPg(cached.assetPool) });
  return cached.assetPool;
}
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    getPool();
    const value = (cached.assetPrisma as any)[property];
    return typeof value === 'function' ? value.bind(cached.assetPrisma) : value;
  },
});
export async function disconnectDatabase() {
  const client = cached.assetPrisma,
    pool = cached.assetPool;
  delete cached.assetPrisma;
  delete cached.assetPool;
  try {
    await client?.$disconnect();
  } finally {
    await pool?.end();
  }
}
import { ensureDatabaseReady } from './init';

// ตรวจความพร้อมของฐานข้อมูลครั้งเดียวต่อการเชื่อมต่อ (เดิมตรวจทุกคำขอ เสีย 2 คำสั่งไปกลับ ช้ามากเมื่อเซิร์ฟเวอร์อยู่ไกลฐานข้อมูล)
// ตรวจไม่ผ่านจะไม่จำผล คำขอถัดไปตรวจใหม่ · หน้า /api/health ส่ง fresh: true เพื่อตรวจจริงทุกครั้ง
const readyPools = new WeakMap<pg.Pool, Promise<void>>();
export async function checkDatabase({ fresh = false } = {}) {
  let pool: pg.Pool | undefined;
  try {
    pool = getPool();
    let ready = fresh ? undefined : readyPools.get(pool);
    if (!ready) {
      const target = pool;
      ready = (async () => {
        await target.query('SELECT 1');
        await ensureDatabaseReady(target);
      })();
      readyPools.set(pool, ready);
    }
    await ready;
  } catch (error) {
    if (pool) readyPools.delete(pool);
    console.error('Database unavailable', { code: (error as { code?: string }).code });
    throw new ApiError('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่ภายหลัง', 503);
  }
}
export type Transaction = Prisma.TransactionClient;
export { Prisma };

// Serializable ยกเลิก transaction ที่ชนกับของคนอื่น (รหัส Postgres 40001 / deadlock 40P01) ทุกอย่างถูกย้อนกลับแล้ว ลองใหม่ได้ปลอดภัย
// Prisma แจ้งได้ 2 แบบ: P2034 (ชนระหว่างคำสั่ง) หรือ DriverAdapterError ที่ cause.kind = TransactionWriteConflict (ชนตอน COMMIT)
// เดิมเช็กแค่ P2034 → แบบที่สองตอบ 500 ทันที (เจอจากการทดสอบโหลด 18 ต.ค. 2569: เพิ่มพร้อมกัน 5 คน ล้ม 64%)
export function isWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, cause } = error as { code?: unknown; cause?: { kind?: unknown; originalCode?: unknown } };
  if (code === 'P2034') return true;
  if (!cause || typeof cause !== 'object') return false;
  return cause.kind === 'TransactionWriteConflict' || cause.originalCode === '40001' || cause.originalCode === '40P01';
}
// รอแบบสุ่ม (full jitter) ก่อนลองใหม่: ถ้ารอเท่ากันทุกคน คำขอที่ชนกันจะตื่นพร้อมกันแล้วชนซ้ำอีก
export function writeConflictDelay(attempt: number, random = Math.random): number {
  return Math.floor(random() * Math.min(1000, 50 * 2 ** attempt));
}
// เลขเงินจากฐานข้อมูล (BigInt สตางค์) → number ที่ส่งเป็น JSON ได้ ต้องอยู่ในช่วงปลอดภัย ไม่งั้นโยน error
export function safeNumber(item: bigint | number): number {
  const number = Number(item);
  if (!Number.isSafeInteger(number)) throw new Error('Database number is outside the safe integer range');
  return number;
}
// ทางเร็ว: ข้อมูลที่แปลงเลขไว้แล้ว (เช่น getData) ใช้ JSON.stringify ตรง ๆ ไม่ต้องเรียกตัวแปลงทุกช่อง
// (20,000 รายการ: 139 → 77 ms) · ถ้ายังมี BigInt อยู่ JSON.stringify โยน TypeError แล้วใช้ทางเดิมที่ตรวจทุกช่อง
export function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? safeNumber(item) : item));
  }
}
export function plain<T>(value: unknown): T {
  return JSON.parse(json(value)) as T;
}
