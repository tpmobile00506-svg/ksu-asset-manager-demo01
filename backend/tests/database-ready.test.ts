import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDatabase } from '../db/client';

// ตรวจความพร้อมฐานข้อมูลครั้งเดียวต่อการเชื่อมต่อ: ลดคำสั่งไปกลับ 2 ครั้งในทุกคำขอ (เว็บช้าเพราะเซิร์ฟเวอร์อยู่ไกลฐานข้อมูล)
// แต่ละครั้งที่ตรวจจริง = 2 คำสั่ง (SELECT 1 + ตรวจว่ามีตารางครบ)
function usePool(failFirst = 0) {
  const cache = globalThis as unknown as { assetPool?: unknown };
  const previous = cache.assetPool;
  const pool = { calls: 0, failures: failFirst, async query() { this.calls++; if (this.failures > 0) { this.failures--; throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); } return { rows: [] }; } };
  cache.assetPool = pool;
  return { pool, restore: () => { if (previous === undefined) delete cache.assetPool; else cache.assetPool = previous; } };
}
const quiet = async <T>(run: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await run(); } finally { console.error = e; } };

test('ตรวจครั้งแรก 2 คำสั่ง · คำขอถัดไปไม่ต้องตรวจซ้ำ (0 คำสั่ง)', async () => {
  const { pool, restore } = usePool();
  try {
    await checkDatabase();
    assert.equal(pool.calls, 2);
    await checkDatabase();
    await checkDatabase();
    assert.equal(pool.calls, 2);
  } finally { restore(); }
});

test('หน้า health (fresh: true) ตรวจจริงทุกครั้ง: เพิ่มครั้งละ 2 คำสั่ง', async () => {
  const { pool, restore } = usePool();
  try {
    await checkDatabase({ fresh: true });
    await checkDatabase({ fresh: true });
    assert.equal(pool.calls, 4);
  } finally { restore(); }
});

test('ฐานข้อมูลล่มครั้งแรก → ตอบ 503 และไม่จำผล · ครั้งถัดไปตรวจใหม่แล้วผ่าน', async () => {
  const { pool, restore } = usePool(1);
  try {
    await quiet(() => assert.rejects(checkDatabase(), (e: any) => e?.status === 503));
    assert.equal(pool.calls, 1);
    await checkDatabase();
    assert.equal(pool.calls, 3);                          // 1 ที่ล้มเหลว + 2 ของการตรวจใหม่
  } finally { restore(); }
});
