import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCategory, standardBranches } from '../contracts/domain';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';

// ค่าคาดหวังกำหนดมือจากตารางสาขา → หมวดหมู่ของคณะ (ไม่ได้คัดลอกจากผลของโค้ด)
const expected: Array<[string, string]> = [
  ['วิศวกรรมคอมพิวเตอร์ (วค)', 'คอมพิวเตอร์'],
  ['วิศวกรรมไฟฟ้า (วฟ)', 'ไฟฟ้า'],
  ['เทคโนโลยีเครื่องจักรกลเกษตร (คจก)', 'เครื่องจักรกลเกษตร'],
  ['วิศวกรรมเครื่องกล (วคม/วศค)', 'เครื่องกล'],
  ['วิศวกรรมอุตสาหการ (วอ)', 'อุตสาหการ'],
  ['วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)', 'โลจิสติกส์และโยธา'],
  ['วิศวกรรมเมคคาทรอนิกส์ (มค)', 'เมคคาทรอนิกส์'],
  ['นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)', 'ออกแบบและสถาปัตย์'],
  ['สำนักงานคณะฯ / คณบดี (สนง.ควอ.)', 'สำนักงานส่วนกลาง'],
  ['ส่วนกลาง / การศึกษา', 'สำนักงานส่วนกลาง'],
];

test('หมวดหมู่ของสาขามาตรฐานทั้ง 10 ตรงตามตาราง (รวมกรณีตัวย่อซ้อนกัน)', () => {
  assert.equal(expected.length, standardBranches.length);
  for (const [branch, category] of expected) assert.equal(resolveCategory(branch), category, branch);
});

test('regression: "สนง.ควอ." ไม่ถูกจัดเป็นอุตสาหการ และ "วคม" ไม่ถูกจัดเป็นคอมพิวเตอร์', () => {
  assert.notEqual(resolveCategory('สำนักงานคณะฯ / คณบดี (สนง.ควอ.)'), 'อุตสาหการ');
  assert.notEqual(resolveCategory('วิศวกรรมเครื่องกล (วคม/วศค)'), 'คอมพิวเตอร์');
});

// ---------- ห้ามสร้างครุภัณฑ์ใหม่ด้วยสถานะ "กำลังซ่อม" ----------
const staff: Member = { id: 'staff-1', email: 'staff@example.test', name: 'Staff', role: 'staff', branch: null, active: 1, createdAt: '' };

function useMemoryDatabase(client: object) {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  cache.assetPool = new Proxy({}, { get() { throw new Error('Real database access is forbidden in this test'); } });
  cache.assetPrisma = new Proxy(client, {
    get(target, property) {
      if (!(property in target)) throw new Error(`Unexpected database method: ${String(property)}`);
      return Reflect.get(target, property);
    },
  });
  return () => {
    if (previous.pool === undefined) delete cache.assetPool; else cache.assetPool = previous.pool;
    if (previous.client === undefined) delete cache.assetPrisma; else cache.assetPrisma = previous.client;
  };
}

function createEnvironment() {
  const created: Array<Record<string, any>> = [];
  const noop = { createMany: async () => ({}) };
  const tx = {
    user: { findUnique: async () => staff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    location: noop, branch: noop, category: noop, assetGroup: noop,
    asset: { create: async ({ data }: { data: Record<string, any> }) => { created.push(data); return data; } },
    audit: { create: async () => ({}) },
  };
  return { tx, created };
}

const newAsset = (condition: string) => ({
  action: 'create',
  asset: {
    code: 'TEST-001', name: 'โต๊ะทดสอบ', quantity: 2, unitSatang: 150000, totalSatang: 300000, // 2 × 1,500.00 = 3,000.00 บาท
    location: 'ห้อง 101', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', category: 'คอมพิวเตอร์', groupName: 'ทั่วไป', condition,
  },
});

test('เพิ่มครุภัณฑ์ด้วยสถานะ "กำลังซ่อม" ถูกปฏิเสธ (400) และไม่สร้างรายการ', async () => {
  const { tx, created } = createEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(mutate(staff, newAsset('repair')), (e: any) => e?.status === 400);
    assert.equal(created.length, 0);
  } finally { restore(); }
});

test('เพิ่มครุภัณฑ์ด้วยสถานะ "ปกติ" ทำได้ตามเดิม', async () => {
  const { tx, created } = createEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const res = await mutate(staff, newAsset('normal'));
    assert.equal(res.ok, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].condition, 'normal');
    assert.equal(created[0].totalSatang, 300000n);
  } finally { restore(); }
});
