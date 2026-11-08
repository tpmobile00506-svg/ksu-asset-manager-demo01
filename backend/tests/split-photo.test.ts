import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';
import { installMemoryDatabase } from './helpers/memory-db';

// แบ่งล็อตรายการที่มีรูป: รายการลูกทั้ง 2 ได้รูปเดียวกับแม่ ด้วยคำสั่ง createMany ครั้งเดียวแบบ skipDuplicates
// (เดิม create ทีละรูปแล้ว .catch(() => {}) ซึ่งใน Postgres ถ้าล้มจริง transaction จะใช้ต่อไม่ได้อยู่ดี)
// ตัวเลขคำนวณมือ: 3 ชิ้น 300 สตางค์ แบ่ง 1 ชิ้น → 1/3 × 300 = 100 สตางค์ ; ที่เหลือ 2 ชิ้น = 200 สตางค์

const staff: Member = {
  id: 'staff-1',
  email: 'staff@example.test',
  name: 'เจ้าหน้าที่',
  role: 'staff',
  branch: null,
  active: 1,
  createdAt: '',
};

function environment(photo: Buffer | null) {
  const parent = {
    id: 'parent-1',
    code: 'PC-003',
    name: 'คอมพิวเตอร์',
    quantity: 3,
    unitSatang: 100,
    totalSatang: 300,
    salvageSatang: 0,
    notes: '',
    location: 'ห้อง 1',
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
    groupName: 'คอม',
    category: 'ครุภัณฑ์คอมพิวเตอร์',
    condition: 'normal',
    lifecycle: 'active',
    version: 1,
    parentId: null,
    sourceId: null,
    sourceRow: null,
    receivedDate: '',
    lifeYears: 0,
    serial: '',
    brand: '',
    custodian: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    setId: null,
  };
  const created: Array<{ id: string; quantity: number; totalSatang: bigint }> = [];
  const photoCopies: Array<{ data: Array<{ key: string; body: Buffer }>; skipDuplicates?: boolean }> = [];
  const tx = {
    user: { findUnique: async () => ({ ...staff }) },
    operation: { findUnique: async () => null, create: async () => ({}) },
    asset: {
      findUnique: async () => ({ ...parent }),
      update: async () => ({}),
      create: async ({ data }: { data: (typeof created)[number] }) => {
        created.push(data);
        return data;
      },
    },
    assetRequest: { findFirst: async () => null },
    storedFile: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        photo && where.key === 'asset-images/parent-1.webp' ? { key: where.key, body: photo } : null,
      createMany: async (args: (typeof photoCopies)[number]) => {
        photoCopies.push(args);
        return { count: args.data.length };
      },
    },
    // ยังไม่มีรอบตรวจนับเปิดอยู่ (คำสั่งแยก/อนุมัติจะปรับรอบที่เปิดอยู่ตามทะเบียน 8 พ.ย. 2569)
    stocktakeItem: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    audit: { create: async () => ({}) },
  };
  const restore = installMemoryDatabase(
    { $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx), operation: tx.operation },
    { strict: true },
  );
  return { created, photoCopies, restore };
}

const splitOne = {
  action: 'split',
  id: 'parent-1',
  version: 1,
  quantity: 1,
  condition: 'normal',
  reason: 'แยกเครื่องที่ย้ายห้อง',
};

test('แบ่งล็อตรายการที่มีรูป → คัดลอกรูปให้ลูกทั้ง 2 รายการในคำสั่งเดียว (skipDuplicates)', async () => {
  const photo = Buffer.from('webp-bytes');
  const env = environment(photo);
  try {
    assert.deepEqual(await mutate(staff, splitOne), { ok: true });
    assert.deepEqual(
      env.created.map(c => [c.quantity, c.totalSatang]),
      [
        [1, 100n],
        [2, 200n],
      ],
    );
    assert.equal(env.photoCopies.length, 1);
    assert.equal(env.photoCopies[0].skipDuplicates, true);
    assert.deepEqual(
      env.photoCopies[0].data.map(f => f.key),
      env.created.map(c => `asset-images/${c.id}.webp`),
    );
    assert.ok(env.photoCopies[0].data.every(f => f.body === photo));
  } finally {
    env.restore();
  }
});

test('แบ่งล็อตรายการที่ไม่มีรูป → ไม่สร้างไฟล์รูป', async () => {
  const env = environment(null);
  try {
    assert.deepEqual(await mutate(staff, splitOne), { ok: true });
    assert.equal(env.created.length, 2);
    assert.equal(env.photoCopies.length, 0);
  } finally {
    env.restore();
  }
});
