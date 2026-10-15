import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getData } from '../services/asset-service';
import type { Member } from '../auth/sessions';

// ตัวชี้หน้าประวัติ Audit: รับเฉพาะเวลา ISO และ id ที่ระบบสร้าง (ทดสอบ 15 ต.ค. 2569 ด้วยค่าแบบ SQL injection)
const admin: Member = { id: 'admin-1', email: 'admin@example.test', name: 'admin', role: 'admin', branch: null, active: 1, createdAt: '' };

function useMemoryDatabase(client: object) {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  cache.assetPool = new Proxy({}, { get() { throw new Error('Real database access is forbidden in this test'); } });
  cache.assetPrisma = client;
  return () => {
    if (previous.pool === undefined) delete cache.assetPool; else cache.assetPool = previous.pool;
    if (previous.client === undefined) delete cache.assetPrisma; else cache.assetPrisma = previous.client;
  };
}

test('ตัวชี้หน้าประวัติที่แปลกปลอมตอบ 400 ก่อนถึงฐานข้อมูล และตัวชี้ที่ถูกต้องใช้ได้', async () => {
  let queried = 0;
  const restore = useMemoryDatabase({ audit: { findMany: async () => { queried++; return []; }, count: async () => 0 } });
  try {
    const view = (q: string) => getData(admin, new URL('http://localhost/api/data?view=audit' + q));
    await assert.rejects(view('&before=' + encodeURIComponent("2099' OR '1'='1")), /ตำแหน่งประวัติไม่ถูกต้อง/);
    await assert.rejects(view('&before=2026-10-15T00:00:00.000Z&beforeId=' + encodeURIComponent("' OR 1=1 --")), /ตำแหน่งประวัติไม่ถูกต้อง/);
    assert.equal(queried, 0);
    const ok = await view('&before=2026-10-15T00:00:00.000Z&beforeId=47556385-0e72-4601-b51a-5ec463867de7') as { events: unknown[]; more: boolean };
    assert.deepEqual([ok.events.length, ok.more, queried], [0, false, 1]);
  } finally { restore(); }
});
