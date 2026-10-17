import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, login } from '../auth/sessions';

// จำกัดการล็อกอินแยกตาม IP และ อีเมล + IP (เดิมใช้ตัวนับรวมทั้งระบบ 120 ครั้ง/นาที)
function useMemoryDatabase() {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  const counts = new Map<string, number>(), limits = new Map<string, number>();
  cache.assetPool = { query: async () => ({ rows: [] }) };
  cache.assetPrisma = {
    // ตัวนับในหน่วยความจำแทนตาราง login_attempts: ค่าที่ 4 ของคำสั่ง SQL คือ limit + 1
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      const key = values[0] as string, cap = values[3] as number;
      const attempts = Math.min((counts.get(key) || 0) + 1, cap);
      counts.set(key, attempts); limits.set(key, cap - 1);
      return [{ attempts }];
    },
    user: { findUnique: async () => null },
  };
  const restore = () => {
    if (previous.pool === undefined) delete cache.assetPool; else cache.assetPool = previous.pool;
    if (previous.client === undefined) delete cache.assetPrisma; else cache.assetPrisma = previous.client;
  };
  return { counts, limits, restore };
}

const attempt = (email: string, ip: string) => login(new Request('http://127.0.0.1:3000/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ email, password: 'wrong-password' }),
}));
const status = (promise: Promise<unknown>) => promise.then(() => 200, (e: { status?: number }) => e.status);

test('clientIp: ใช้ x-real-ip ก่อน · ไม่มีใช้ค่าขวาสุดของ x-forwarded-for · ไม่มีเลยได้ unknown', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/', { headers });
  assert.equal(clientIp(req({ 'x-real-ip': '10.0.0.5', 'x-forwarded-for': '1.1.1.1, 10.0.0.9' })), '10.0.0.5');
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })), '203.0.113.7'); // ค่าซ้ายสุดผู้ใช้ปลอมได้
  assert.equal(clientIp(req({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
  assert.equal(clientIp(req({})), 'unknown');
});

test('ตัวนับที่ใช้: ต่อ IP 120 · อีเมล + IP 10 · ต่ออีเมล 50 และไม่มีตัวนับรวมทั้งระบบ (global) แล้ว', async () => {
  const db = useMemoryDatabase();
  try {
    assert.equal(await status(attempt('victim@example.test', '10.0.0.1')), 401);
    const keys = [...db.limits.keys()];
    assert.equal(keys.length, 3);
    assert.ok(!keys.includes('global'));
    assert.deepEqual(keys.map(k => [k.split(':')[0], db.limits.get(k)]), [['ip', 120], ['email-ip', 10], ['email', 50]]);
  } finally { db.restore(); }
});

test('ผู้ไม่หวังดีเดารหัสผิด 10 ครั้งจาก IP หนึ่ง → ครั้งที่ 11 ถูกบล็อก (429) แต่เจ้าของบัญชีจาก IP อื่นยังล็อกอินได้', async () => {
  const db = useMemoryDatabase();
  try {
    for (let i = 1; i <= 10; i++) assert.equal(await status(attempt('victim@example.test', '198.51.100.9')), 401, `ครั้งที่ ${i}`);
    assert.equal(await status(attempt('victim@example.test', '198.51.100.9')), 429);
    // เจ้าของบัญชีจากเครื่องในคณะ: ไม่ถูกบล็อก (ได้ 401 เพราะในเทสต์นี้ไม่มีบัญชีจริง ไม่ใช่ 429)
    assert.equal(await status(attempt('victim@example.test', '10.0.0.20')), 401);
  } finally { db.restore(); }
});

test('IP เดียวลองล็อกอินเกิน 120 ครั้งต่อนาที (คนละอีเมล) → ครั้งที่ 121 ถูกบล็อก แต่ IP อื่นไม่ได้รับผลกระทบ', async () => {
  const db = useMemoryDatabase();
  try {
    for (let i = 0; i < 120; i++) assert.equal(await status(attempt(`user${i}@example.test`, '198.51.100.9')), 401, `ครั้งที่ ${i + 1}`);
    assert.equal(await status(attempt('user999@example.test', '198.51.100.9')), 429);
    assert.equal(await status(attempt('user999@example.test', '10.0.0.20')), 401);
  } finally { db.restore(); }
});
