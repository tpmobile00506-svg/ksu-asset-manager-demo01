import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';

const staff: Member = { id: 'staff-a', email: 'a@example.test', name: 'A', role: 'staff', active: 1, createdAt: '' };
const head: Member = { ...staff, id: 'head-a', role: 'head' };

function useMemoryDatabase(client: object) {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  cache.assetPool = new Proxy({}, { get() { throw new Error('Real database access is forbidden in this test'); } });
  cache.assetPrisma = new Proxy(client, {
    get(target, property) {
      if (!(property in target)) throw new Error(`Unexpected database method: ${String(property)}`);
      return (target as Record<PropertyKey, unknown>)[property];
    },
  });
  return () => { cache.assetPool = previous.pool; cache.assetPrisma = previous.client; };
}

const row = (id: string, code: string) => ({ id, code, name: 'คอมพิวเตอร์', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', category: 'ครุภัณฑ์คอมพิวเตอร์',
  groupName: 'คอม', location: 'ห้อง 1', condition: 'normal', lifecycle: 'active', version: 3, quantity: 1, unitSatang: 100n, totalSatang: 100n, salvageSatang: 0n });

function setup(pendingFor: string | null = null, who: Member = staff) {
  const assets = [row('a1', 'PC-1'), row('a2', 'PC-2')];
  const updates: unknown[] = [];
  const audits: Array<{ assetId: string; reason: string }> = [];
  const dimensions = { createMany: async () => ({ count: 1 }) };
  const tx = {
    user: { findUnique: async () => who },
    operation: { findUnique: async () => null, create: async () => ({}) },
    asset: {
      findMany: async () => assets,
      updateMany: async (args: unknown) => { updates.push(args); return { count: assets.length }; },
    },
    assetRequest: { findFirst: async () => pendingFor ? { assetId: pendingFor } : null },
    location: dimensions, branch: dimensions, category: dimensions, assetGroup: dimensions,
    audit: { create: async ({ data }: { data: { assetId: string; reason: string } }) => { audits.push(data); return {}; } },
  };
  const restore = useMemoryDatabase({
    user: { findUnique: async () => who },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  return { updates, audits, restore };
}
const body = (extra: object = {}) => ({ action: 'bulkEdit', ids: ['a1', 'a2'], reason: 'นำเข้าผิดสาขา',
  versions: { a1: 3, a2: 3 }, changes: { branch: 'วิศวกรรมไฟฟ้า (วฟ)', category: 'ครุภัณฑ์ไฟฟ้าและวิทยุ' }, ...extra });

test('แก้ไขหลายรายการ: เปลี่ยนสาขาและประเภทของทุกชิ้นที่เลือก หมวดเปลี่ยนตามประเภท บันทึกประวัติทีละชิ้น', async () => {
  const { updates, audits, restore } = setup();
  try {
    const result = await mutate(staff, body());
    assert.equal(result.count, 2);
    assert.deepEqual(updates, [{ where: { id: { in: ['a1', 'a2'] } },
      data: { branch: 'วิศวกรรมไฟฟ้า (วฟ)', category: 'ครุภัณฑ์ไฟฟ้าและวิทยุ', groupName: 'ไฟฟ้า', version: { increment: 1 } } }]);
    assert.deepEqual(audits.map(a => [a.assetId, a.reason]), [['a1', 'นำเข้าผิดสาขา'], ['a2', 'นำเข้าผิดสาขา']]);
  } finally { restore(); }
});

test('แก้ไขหลายรายการ: ปฏิเสธเมื่อไม่มีเหตุผล สาขานอกรายการ ข้อมูลเก่า มีคำขอค้าง หรือผู้ใช้ไม่ใช่เจ้าหน้าที่ และไม่แก้อะไรเลย', async () => {
  const cases: Array<[object, RegExp, Member?, string?]> = [
    [{ reason: '' }, /เหตุผล/],
    [{ changes: {} }, /อย่างน้อย 1 ช่อง/],
    [{ changes: { branch: 'สาขามั่ว' } }, /สาขาไม่ถูกต้อง/],
    [{ changes: { condition: 'repair' } }, /ปกติ หรือ ชำรุด/],
    [{ versions: { a1: 3, a2: 2 } }, /โหลดใหม่/],
    [{}, /PC-2 มีคำขอรออนุมัติ/, staff, 'a2'],
    [{}, /สิทธิ์|ไม่มีสิทธิ/, head],
  ];
  for (const [extra, message, who = staff, pending = null] of cases) {
    const { updates, restore } = setup(pending, who);
    try {
      await assert.rejects(mutate(who, body(extra)), message);
      assert.equal(updates.length, 0);
    } finally { restore(); }
  }
});
