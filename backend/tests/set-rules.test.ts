import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';

// กฎชุดห้ามแยก (ผู้ใช้ยืนยัน 13 ต.ค. 2569): โอนย้าย/จำหน่ายรายการใดในชุด มีผลทั้งชุดเมื่ออนุมัติครบ
// ห้ามแบ่งจำนวนหรือแบ่งล็อตรายการในชุด ส่วนส่งซ่อมทำทีละชิ้นได้
const branchCom = 'วิศวกรรมคอมพิวเตอร์ (วค)', branchElec = 'วิศวกรรมไฟฟ้า (วฟ)';
const mk = (id: string, role: Member['role'], branch: string | null = null): Member => ({ id, email: id + '@example.test', name: id, role, branch, active: 1, createdAt: '' });
const staff = mk('staff-1', 'staff'), dean = mk('dean-1', 'dean');

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

const item = (id: string, code: string, quantity: number, totalSatang: bigint, setRole: string) => ({
  id, code, name: 'ชุดตัดต่อ ' + id, quantity, unitSatang: totalSatang / BigInt(quantity), totalSatang, salvageSatang: 0n,
  notes: '', location: 'ห้อง 101', branch: branchCom, category: 'ครุภัณฑ์คอมพิวเตอร์', groupName: 'ทั่วไป', condition: 'normal',
  lifecycle: 'active', version: 1, parentId: null, sourceId: null, sourceRow: null, receivedDate: '', lifeYears: 0,
  serial: '', brand: '', custodian: '', createdAt: '2026-10-01', setId: 'set-1', setRole,
});

function environment(opts: { pending?: Array<{ assetId: string; kind: string }>; request?: Record<string, unknown> } = {}) {
  // หัวชุด 160,500.00 บาท + ชิ้นส่วน 2 ชิ้น (มูลค่ารวมในหัวชุด) + ชิ้นที่จำหน่ายไปแล้วซึ่งต้องไม่ถูกแตะ
  const assets: any[] = [
    item('H1', '156-034-15-15.58-1-1', 4, 16050000n, 'header'),
    item('P1', '156-034-15-15.58-1-1-ชิ้น1', 1, 0n, 'part'),
    item('P2', '156-034-15-15.58-1-1-ชิ้น2', 1, 0n, 'part'),
    { ...item('P3', '156-034-15-15.58-1-1-ชิ้น3', 1, 0n, 'part'), lifecycle: 'disposed' },
  ];
  const requests: any[] = [];
  const pending = opts.pending ?? [];
  const request: any = opts.request ? {
    id: 'req-1', assetId: 'P1', assetVersion: 1, reason: 'ทดสอบ', stage: 2, chain: JSON.stringify(['head', 'deputy', 'dean']),
    status: 'pending', version: 1, actor: 'staff-other', createdAt: '2026-10-01', ...opts.request,
  } : null;
  const tx = {
    user: { findUnique: async ({ where }: any) => ({ [staff.id]: staff, [dean.id]: dean } as Record<string, Member>)[where.id] ?? null },
    operation: { findUnique: async () => null, create: async () => ({}) },
    setting: { findUnique: async () => null },
    asset: {
      findUnique: async ({ where }: any) => structuredClone(assets.find(a => a.id === where.id) ?? null),
      findMany: async ({ where }: any) => structuredClone(assets.filter(a => a.setId === where.setId && a.lifecycle === where.lifecycle)),
      update: async ({ where, data }: any) => {
        const a = assets.find(x => x.id === where.id);
        const { version, ...rest } = data;
        Object.assign(a, rest, { version: a.version + (version?.increment || 0) });
        return a;
      },
    },
    assetRequest: {
      findFirst: async ({ where }: any) => pending.find(p => p.assetId === where.assetId) ?? null,
      findMany: async ({ where }: any) => pending.filter(p => where.assetId.in.includes(p.assetId)),
      create: async ({ data }: any) => { requests.push(data); return data; },
      findUnique: async () => structuredClone(request),
      update: async ({ data }: any) => { const { version, ...rest } = data; Object.assign(request, rest); return request; },
    },
    approval: { create: async () => ({}) },
    audit: { create: async () => ({}) },
    location: { createMany: async () => ({}) },
    branch: { createMany: async () => ({}) },
  };
  return { tx, assets, requests };
}
const run = (tx: object) => useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
const transfer = (id: string, extra: Record<string, unknown> = {}) => ({ action: 'request', id, version: 1, kind: 'transfer', reason: 'ย้ายห้องปฏิบัติการ', payload: { location: 'ห้อง 202', branch: branchElec }, ...extra });

test('ยื่นโอนย้ายชิ้นส่วนใดก็ได้: คำขอจำทั้งชุดไว้ (3 รายการที่ยังใช้งาน ไม่นับชิ้นที่จำหน่ายแล้ว)', async () => {
  const env = environment();
  const restore = run(env.tx);
  try {
    await mutate(staff, transfer('P1'));
    assert.equal(env.requests.length, 1);
    const payload = JSON.parse(env.requests[0].payload);
    assert.equal(payload.setId, 'set-1');
    assert.equal(payload.setCount, 3);
  } finally { restore(); }
});

test('ครุภัณฑ์ในชุดแบ่งจำนวนหรือแบ่งล็อตไม่ได้', async () => {
  const env = environment();
  const restore = run(env.tx);
  try {
    await assert.rejects(mutate(staff, transfer('H1', { splitQuantity: 2 })), /ทั้งชุด แบ่งจำนวนไม่ได้/);
    await assert.rejects(mutate(staff, { action: 'split', id: 'H1', version: 1, quantity: 2, condition: 'normal', reason: 'ทดสอบ' }), /ห้ามแยก/);
    assert.equal(env.requests.length, 0);
  } finally { restore(); }
});

test('ชิ้นอื่นในชุดมีคำขอรออนุมัติ: ยื่นโอนย้ายทั้งชุดไม่ได้', async () => {
  const env = environment({ pending: [{ assetId: 'P2', kind: 'repair' }] });
  const restore = run(env.tx);
  try {
    await assert.rejects(mutate(staff, transfer('P1')), /รายการในชุดนี้มีคำขอรออนุมัติ/);
  } finally { restore(); }
});

test('ส่งซ่อมทีละชิ้นได้ แต่ถ้าชุดมีคำขอโอนย้ายทั้งชุดรออยู่ต้องรอก่อน', async () => {
  let env = environment();
  let restore = run(env.tx);
  try {
    await mutate(staff, { action: 'request', id: 'P2', version: 1, kind: 'repair', reason: 'จอเสีย', payload: { estimateSatang: 150000 } });
    assert.equal(env.requests.length, 1);
    assert.equal(JSON.parse(env.requests[0].payload).setId, undefined);
  } finally { restore(); }
  env = environment({ pending: [{ assetId: 'H1', kind: 'transfer' }] });
  restore = run(env.tx);
  try {
    await assert.rejects(mutate(staff, { action: 'request', id: 'P2', version: 1, kind: 'repair', reason: 'จอเสีย', payload: { estimateSatang: 150000 } }), /ทั้งชุดรออนุมัติ/);
  } finally { restore(); }
});

test('อนุมัติขั้นสุดท้ายของโอนย้ายทั้งชุด: ทุกรายการที่ยังใช้งานย้ายไปที่ใหม่ ชิ้นที่จำหน่ายแล้วไม่ถูกแตะ', async () => {
  const env = environment({ request: { kind: 'transfer', payload: JSON.stringify({ location: 'ห้อง 202', branch: branchElec, setId: 'set-1', setCount: 3 }) } });
  const restore = run(env.tx);
  try {
    await mutate(dean, { action: 'approve', id: 'req-1', version: 1 });
    for (const id of ['H1', 'P1', 'P2']) {
      const a = env.assets.find(x => x.id === id);
      assert.deepEqual([a.location, a.branch, a.version], ['ห้อง 202', branchElec, 2], id);
    }
    const p3 = env.assets.find(x => x.id === 'P3');
    assert.deepEqual([p3.location, p3.version], ['ห้อง 101', 1]);
  } finally { restore(); }
});

test('อนุมัติขั้นสุดท้ายของจำหน่ายทั้งชุด: ทุกรายการที่ยังใช้งานเป็นจำหน่ายแล้ว', async () => {
  const env = environment({ request: { kind: 'disposal', payload: JSON.stringify({ setId: 'set-1', setCount: 3 }) } });
  const restore = run(env.tx);
  try {
    await mutate(dean, { action: 'approve', id: 'req-1', version: 1 });
    assert.deepEqual(env.assets.map(a => a.lifecycle), ['disposed', 'disposed', 'disposed', 'disposed']);
  } finally { restore(); }
});

test('โอนย้ายไปที่เดิม (สถานที่ สาขา ผู้รับผิดชอบเหมือนเดิม) ถูกปฏิเสธ แต่เปลี่ยนแค่ผู้รับผิดชอบยังยื่นได้', async () => {
  const env = environment();
  const restore = run(env.tx);
  try {
    // P1 อยู่ "ห้อง 101" สาขา วค ผู้รับผิดชอบว่าง
    await assert.rejects(mutate(staff, transfer('P1', { payload: { location: 'ห้อง 101', branch: branchCom } })), /เหมือนเดิม/);
    assert.equal(env.requests.length, 0);
    await mutate(staff, transfer('P1', { payload: { location: 'ห้อง 101', branch: branchCom, custodian: 'อ.ผู้ดูแลใหม่' } }));
    assert.equal(env.requests.length, 1);
  } finally { restore(); }
});

test('ยื่นโอนย้ายโดยไม่มีข้อมูลปลายทาง ได้ข้อความภาษาไทย', async () => {
  const env = environment();
  const restore = run(env.tx);
  try {
    await assert.rejects(mutate(staff, { action: 'request', id: 'P1', version: 1, kind: 'transfer', reason: 'ย้าย' }), /ระบุสถานที่และสาขาปลายทาง/);
  } finally { restore(); }
});

test('ส่งซ่อม: ของที่อยู่ระหว่างซ่อมแล้วยื่นคำขอซ่อมซ้ำไม่ได้', async () => {
  const env = environment();
  env.assets.find(a => a.id === 'P1').condition = 'repair';
  const restore = run(env.tx);
  try {
    await assert.rejects(mutate(staff, { action: 'request', id: 'P1', version: 1, kind: 'repair', reason: 'เสียอีก', payload: { estimateSatang: 0 } }), /ระหว่างซ่อม/);
    assert.equal(env.requests.length, 0);
  } finally { restore(); }
});
