import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';

// กฎ (ตัดสินใจแล้ว): คำขอที่ระบุจำนวนบางส่วนจะ "ยังไม่แบ่งล็อต" ตอนยื่น แบ่งจริงเมื่ออนุมัติขั้นสุดท้าย
// ถูกปฏิเสธ/ยังไม่ถึงขั้นสุดท้าย = ทะเบียนไม่เปลี่ยน
// ตัวเลขทุกค่าคำนวณมือ: เก้าอี้ 200 ตัว ตัวละ 1,250.00 บาท = 250,000.00 บาท = 25,000,000 สตางค์
//   แบ่ง 50 ตัว: 50/200 × 25,000,000 = 6,250,000 สตางค์ ; ที่เหลือ 150 ตัว = 18,750,000 สตางค์ (6,250,000 + 18,750,000 = 25,000,000)

const branchCom = 'วิศวกรรมคอมพิวเตอร์ (วค)';
const branchElec = 'วิศวกรรมไฟฟ้า (วฟ)';
const mk = (id: string, role: Member['role'], branch: string | null = null): Member => ({ id, email: id + '@example.test', name: id, role, branch, active: 1, createdAt: '' });
const headCom = mk('head-com', 'head', branchCom);
const deputy = mk('deputy-1', 'deputy');
const dean = mk('dean-1', 'dean');

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

function environment(kind: 'repair' | 'transfer', stage: number, payloadExtra: Record<string, unknown> = {}) {
  const members = new Map<string, Member>([[headCom.id, headCom], [deputy.id, deputy], [dean.id, dean]]);
  let parent: any = {
    id: 'parent-1', code: 'CHAIR-200', name: 'เก้าอี้บรรยาย', quantity: 200, unitSatang: 125000n, totalSatang: 25000000n, salvageSatang: 0n,
    notes: '', location: 'ห้อง 101', branch: branchCom, category: 'คอมพิวเตอร์', groupName: 'ทั่วไป', condition: 'normal', lifecycle: 'active',
    version: 2, parentId: null, sourceId: null, sourceRow: null, receivedDate: '2026-01-01', lifeYears: 5, serial: '', brand: '', custodian: '', createdAt: '2026-01-01',
  };
  const created: any[] = [];
  const request: any = {
    id: 'req-1', assetId: 'parent-1', assetVersion: 2, kind,
    payload: JSON.stringify({ splitQuantity: 50, ...payloadExtra }), reason: 'ทดสอบ', stage,
    chain: JSON.stringify(['head', 'deputy', 'dean']), status: 'pending', version: 1, actor: 'staff-other', createdAt: '2026-10-01',
  };
  const tx = {
    user: { findUnique: async ({ where }: { where: { id?: string } }) => (where.id ? members.get(where.id) ?? null : null) },
    operation: { findUnique: async () => null, create: async () => ({}) },
    asset: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === parent.id ? structuredClone(parent) : structuredClone(created.find(c => c.id === where.id) ?? null)),
      create: async ({ data }: { data: any }) => { created.push(data); return data; },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const inc = data.version?.increment || 0;
        const { version, ...rest } = data;
        if (where.id === parent.id) { parent = { ...parent, ...rest, version: parent.version + inc }; return parent; }
        const child = created.find(c => c.id === where.id);
        Object.assign(child, rest, { version: child.version + inc });
        return child;
      },
    },
    assetRequest: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === request.id ? structuredClone(request) : null),
      update: async ({ data }: { data: any }) => {
        const { version, ...rest } = data;
        if (version?.increment) request.version += version.increment;
        Object.assign(request, rest);
        return request;
      },
    },
    approval: { create: async () => ({}) },
    storedFile: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
    location: { createMany: async () => ({}) },
    branch: { createMany: async () => ({}) },
  };
  return { tx, getParent: () => parent, created, request };
}

const run = (tx: object) => useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });

test('อนุมัติขั้นสุดท้ายของคำขอซ่อมที่ระบุ 50 ตัว: แบ่งล็อตเป็น 50 + 150 และมีเฉพาะล็อต 50 ตัวที่เปลี่ยนเป็นกำลังซ่อม', async () => {
  const env = environment('repair', 2);
  const restore = run(env.tx);
  try {
    const res = await mutate(dean, { action: 'approve', id: 'req-1', version: 1 });
    assert.equal(res.ok, true);
    assert.equal(env.getParent().lifecycle, 'split');
    assert.equal(env.created.length, 2);
    const [target, remainder] = env.created;
    assert.equal(target.quantity, 50);
    assert.equal(target.totalSatang, 6250000n);
    assert.equal(remainder.quantity, 150);
    assert.equal(remainder.totalSatang, 18750000n);
    assert.equal(target.totalSatang + remainder.totalSatang, 25000000n);
    assert.equal(target.condition, 'repair');
    assert.equal(remainder.condition, 'normal');
    assert.equal(env.request.status, 'approved');
    assert.equal(env.request.assetId, target.id);
  } finally { restore(); }
});

test('คำขอโอนย้ายที่ระบุ 50 ตัว: เมื่ออนุมัติขั้นสุดท้ายย้ายเฉพาะล็อต 50 ตัว ส่วนที่เหลือคงสถานที่เดิม', async () => {
  const env = environment('transfer', 2, { location: 'ห้อง 202', branch: branchElec, custodian: 'ผู้รับผิดชอบใหม่' });
  const restore = run(env.tx);
  try {
    await mutate(dean, { action: 'approve', id: 'req-1', version: 1 });
    const [target, remainder] = env.created;
    assert.equal(target.quantity, 50);
    assert.equal(target.location, 'ห้อง 202');
    assert.equal(target.branch, branchElec);
    assert.equal(target.custodian, 'ผู้รับผิดชอบใหม่');
    assert.equal(remainder.quantity, 150);
    assert.equal(remainder.location, 'ห้อง 101');
    assert.equal(remainder.branch, branchCom);
  } finally { restore(); }
});

test('ถูกปฏิเสธ (reject) ที่ขั้นแรก: ทะเบียนไม่เปลี่ยน ไม่มีล็อตใหม่ และครุภัณฑ์เดิมยังใช้งานได้', async () => {
  const env = environment('repair', 0);
  const restore = run(env.tx);
  try {
    const res = await mutate(headCom, { action: 'reject', id: 'req-1', version: 1, reason: 'ยังไม่จำเป็น' });
    assert.equal(res.ok, true);
    assert.equal(env.request.status, 'rejected');
    assert.equal(env.created.length, 0);
    assert.equal(env.getParent().lifecycle, 'active');
    assert.equal(env.getParent().quantity, 200);
  } finally { restore(); }
});

test('อนุมัติขั้นที่ยังไม่ใช่ขั้นสุดท้าย: ยังไม่แบ่งล็อต', async () => {
  const env = environment('repair', 0);
  const restore = run(env.tx);
  try {
    await mutate(headCom, { action: 'approve', id: 'req-1', version: 1 });
    assert.equal(env.request.stage, 1);
    assert.equal(env.request.status, 'pending');
    assert.equal(env.created.length, 0);
    assert.equal(env.getParent().lifecycle, 'active');
  } finally { restore(); }
});

test('คำขอเดิมที่ไม่ได้ระบุจำนวน (ไม่มี splitQuantity) ทำงานเหมือนเดิม: เปลี่ยนที่ครุภัณฑ์เดิมทั้งรายการ', async () => {
  const env = environment('repair', 2);
  env.request.payload = JSON.stringify({});
  const restore = run(env.tx);
  try {
    await mutate(dean, { action: 'approve', id: 'req-1', version: 1 });
    assert.equal(env.created.length, 0);
    assert.equal(env.getParent().condition, 'repair');
    assert.equal(env.getParent().lifecycle, 'active');
    assert.equal(env.request.assetId, 'parent-1');
  } finally { restore(); }
});
