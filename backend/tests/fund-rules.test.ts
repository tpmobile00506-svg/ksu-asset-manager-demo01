import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';

// หัวทุน / โครงการ (ผู้ใช้ยืนยัน 13 ต.ค. 2569): ทุนมีเฉพาะครุภัณฑ์ที่เจ้าหน้าที่เลือกใส่เอง
// ครุภัณฑ์ 1 ชิ้นอยู่ได้ทุนเดียว และหัวทุนไม่บังคับโอนย้ายทั้งก้อน (ต่างจากชุดห้ามแยก)
const mk = (id: string, role: Member['role']): Member => ({ id, email: id + '@example.test', name: id, role, branch: null, active: 1, createdAt: '' });
const staff = mk('staff-1', 'staff'), head = mk('head-1', 'head');

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

function environment() {
  const sets: any[] = [
    { id: 'fund-lab', name: 'ทุนห้องปฏิบัติการ', kind: 'fund', createdAt: '' },
    { id: 'fund-other', name: 'ทุนอื่น', kind: 'fund', createdAt: '' },
    { id: 'set-1', name: 'ชุดตัดต่อ', kind: 'package', createdAt: '' },
  ];
  const assets: any[] = [
    { id: 'A', code: 'A-1', lifecycle: 'active', version: 1, fundId: null, fundHintId: 'fund-lab' },
    { id: 'B', code: 'B-1', lifecycle: 'active', version: 1, fundId: null, fundHintId: null },
    { id: 'C', code: 'C-1', lifecycle: 'active', version: 1, fundId: 'fund-other', fundHintId: null },
    { id: 'D', code: 'D-1', lifecycle: 'disposed', version: 1, fundId: null, fundHintId: null },
  ];
  const audits: any[] = [];
  const pick = (where: any) => assets.filter(a =>
    (where.id?.in ? where.id.in.includes(a.id) : true) &&
    (where.fundId !== undefined ? a.fundId === where.fundId : true) &&
    (where.fundHintId !== undefined ? a.fundHintId === where.fundHintId : true));
  const tx = {
    user: { findUnique: async ({ where }: any) => ({ [staff.id]: staff, [head.id]: head } as Record<string, Member>)[where.id] ?? null },
    operation: { findUnique: async () => null, create: async () => ({}) },
    assetSet: {
      findUnique: async ({ where }: any) => structuredClone(sets.find(s => s.id === where.id) ?? null),
      findFirst: async ({ where }: any) => structuredClone(sets.find(s => s.kind === where.kind && s.name === where.name) ?? null),
      findMany: async ({ where }: any) => structuredClone(sets.filter(s => s.kind === where.kind)),
      create: async ({ data }: any) => { sets.push(data); return data; },
      update: async ({ where, data }: any) => Object.assign(sets.find(s => s.id === where.id), data),
      delete: async ({ where }: any) => sets.splice(sets.findIndex(s => s.id === where.id), 1),
    },
    asset: {
      findMany: async ({ where }: any) => structuredClone(pick(where)),
      updateMany: async ({ where, data }: any) => {
        const hit = pick(where);
        for (const a of hit) { const { version, ...rest } = data; Object.assign(a, rest, { version: a.version + (version?.increment || 0) }); }
        return { count: hit.length };
      },
    },
    audit: { create: async ({ data }: any) => { audits.push(data); return data; } },
  };
  return { tx, sets, assets, audits };
}
const run = (tx: object) => useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });

test('ใส่เข้าทุนเฉพาะรายการที่เลือก รายการอื่นไม่ถูกนับ และเพิ่มเวอร์ชัน', async () => {
  const { tx, assets, audits } = environment();
  const restore = run(tx);
  try {
    const r = await mutate(staff, { action: 'fundAssign', fundId: 'fund-lab', assetIds: ['A'] });
    assert.equal(r.count, 1);
    assert.deepEqual(assets.map(a => a.fundId), ['fund-lab', null, 'fund-other', null]);
    assert.equal(assets[0].version, 2);
    assert.equal(audits[0].action, 'ใส่ครุภัณฑ์เข้าทุน');
  } finally { restore(); }
});

test('รายการที่อยู่ทุนอื่นแล้วต้องเอาออกก่อน และรายการที่จำหน่ายแล้วใส่ทุนไม่ได้', async () => {
  const { tx, assets } = environment();
  const restore = run(tx);
  try {
    await assert.rejects(mutate(staff, { action: 'fundAssign', fundId: 'fund-lab', assetIds: ['B', 'C'] }), /อยู่ในทุนอื่นแล้ว/);
    await assert.rejects(mutate(staff, { action: 'fundAssign', fundId: 'fund-lab', assetIds: ['D'] }), /จำหน่ายแล้ว/);
    assert.equal(assets[1].fundId, null);                     // ไม่มีอะไรเปลี่ยนเมื่อถูกปฏิเสธ
    await mutate(staff, { action: 'fundUnassign', assetIds: ['C'] });
    await mutate(staff, { action: 'fundAssign', fundId: 'fund-lab', assetIds: ['B', 'C'] });
    assert.deepEqual(assets.map(a => a.fundId), [null, 'fund-lab', 'fund-lab', null]);
  } finally { restore(); }
});

test('สร้างทุนชื่อซ้ำใช้ทุนเดิม แก้ชื่อได้ และลบทุนแล้วครุภัณฑ์ไม่มีทุน (ครุภัณฑ์ไม่ถูกลบ)', async () => {
  const { tx, sets, assets } = environment();
  const restore = run(tx);
  try {
    const same = await mutate(staff, { action: 'fundSave', name: '  ทุนห้องปฏิบัติการ ' });
    sets.push({ id: 'fund-space', name: 'ทุน  ช่องว่าง  ซ้อน', kind: 'fund', createdAt: '' });
    assert.equal((await mutate(staff, { action: 'fundSave', name: 'ทุน ช่องว่าง ซ้อน' })).id, 'fund-space');   // ชื่อจากต้นฉบับมีช่องว่างซ้อน
    assert.equal(same.id, 'fund-lab');
    const created = await mutate(staff, { action: 'fundSave', name: 'ทุนใหม่' });
    assert.match(String(created.id), /^fund-/);
    await mutate(staff, { action: 'fundSave', fundId: 'fund-lab', name: 'ทุนห้องปฏิบัติการ (แก้ชื่อ)' });
    assert.equal(sets[0].name, 'ทุนห้องปฏิบัติการ (แก้ชื่อ)');
    await assert.rejects(mutate(staff, { action: 'fundSave', fundId: 'set-1', name: 'x' }), /ไม่พบทุนนี้/);   // ชุดห้ามแยกแก้ทางนี้ไม่ได้
    await mutate(staff, { action: 'fundDelete', fundId: 'fund-other' });
    assert.equal(assets[2].fundId, null);
    assert.equal(assets.length, 4);
    assert.ok(!sets.some(s => s.id === 'fund-other'));
  } finally { restore(); }
});

test('หัวหน้าสาขาดูได้แต่แก้ทุนไม่ได้', async () => {
  const { tx } = environment();
  const restore = run(tx);
  try {
    await assert.rejects(mutate(head, { action: 'fundAssign', fundId: 'fund-lab', assetIds: ['A'] }), /ไม่มีสิทธิ์/);
  } finally { restore(); }
});
