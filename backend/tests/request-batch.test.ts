import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { ApiError } from '../services/errors';
import type { Member } from '../auth/sessions';
import { requestManySchema, approveManySchema } from '../validation';
import { installMemoryDatabase } from './helpers/memory-db';
import { batchCheck, sameValue } from '../../frontend/features/inventory/request-many';
import type { Asset } from '../contracts/domain';

// ยื่นคำขอหลายรายการพร้อมกัน + อนุมัติที่เลือก (ผู้ใช้เลือกแบบ ก. 8 พ.ย. 2569)
// ฐานข้อมูลจำลองมี transaction จริงแบบง่าย: ถ้าคำสั่งล้มกลางทาง ข้อมูลทุกตารางกลับเป็นเหมือนก่อนเริ่ม

const com = 'วิศวกรรมคอมพิวเตอร์ (วค)';
const elec = 'วิศวกรรมไฟฟ้า (วฟ)';
const member = (id: string, role: Member['role'], branch: string | null = null): Member => ({
  id,
  email: `${id}@example.test`,
  name: id,
  role,
  branch,
  active: 1,
  createdAt: '',
});
const staff = member('staff-1', 'staff');
const headCom = member('head-com', 'head', com);
const dean = member('dean-1', 'dean');
const chain = JSON.stringify(['head', 'deputy', 'dean']);

type Row = Record<string, any>;
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v && typeof v === 'object' && Array.isArray(v.in) ? v.in.includes(row[k]) : row[k] === v,
  );
const bump = (row: Row, data: Row) => {
  const { version, ...rest } = data;
  Object.assign(row, rest);
  if (version?.increment) row.version += version.increment;
  return row;
};

function chair(code: string, extra: Row = {}): Row {
  return {
    id: 'id-' + code,
    code,
    name: 'เก้าอี้',
    quantity: 1,
    unitSatang: 120000,
    totalSatang: 120000,
    salvageSatang: 0,
    branch: com,
    location: 'ห้อง 101',
    custodian: '',
    condition: 'damaged',
    lifecycle: 'active',
    setId: null,
    version: 1,
    ...extra,
  };
}

function database(assets: Row[], requests: Row[] = []) {
  const state = { assets, requests, approvals: [] as Row[], audits: [] as Row[] };
  const users = [staff, headCom, dean];
  const tx = {
    user: { findUnique: async ({ where }: Row) => users.find(u => u.id === where.id) ?? null },
    operation: { findUnique: async () => null, create: async () => ({}) },
    setting: { findUnique: async () => null },
    asset: {
      findUnique: async ({ where }: Row) => structuredClone(state.assets.find(a => a.id === where.id) ?? null),
      findMany: async ({ where }: Row) => structuredClone(state.assets.filter(a => matches(a, where))),
      update: async ({ where, data }: Row) => bump(state.assets.find(a => a.id === where.id)!, data),
    },
    assetRequest: {
      findUnique: async ({ where }: Row) => structuredClone(state.requests.find(r => r.id === where.id) ?? null),
      findFirst: async ({ where }: Row) => structuredClone(state.requests.find(r => matches(r, where)) ?? null),
      findMany: async ({ where, select }: Row) =>
        state.requests
          .filter(r => matches(r, where))
          .map(r =>
            select?.asset ? { id: r.id, asset: { code: state.assets.find(a => a.id === r.assetId)?.code } } : { ...r },
          ),
      create: async ({ data }: Row) => {
        const row = { stage: 0, status: 'pending', version: 1, ...data };
        state.requests.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => bump(state.requests.find(r => r.id === where.id)!, data),
    },
    approval: { create: async ({ data }: Row) => (state.approvals.push(data), data) },
    audit: { create: async ({ data }: Row) => (state.audits.push(data), data) },
    location: { createMany: async () => ({}) },
    branch: { createMany: async () => ({}) },
  };
  const client = {
    $transaction: async (run: (t: typeof tx) => Promise<unknown>) => {
      const before = structuredClone(state);
      try {
        return await run(tx);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
  return { state, client };
}

async function run<T>(db: ReturnType<typeof database>, fn: () => Promise<T>): Promise<T> {
  const restore = installMemoryDatabase(db.client, { strict: true });
  try {
    return await fn();
  } finally {
    restore();
  }
}

const items = (...list: Row[]) => list.map(a => ({ id: a.id, version: a.version }));
const seqOf = (r: Row) => JSON.parse(r.payload).seq;

test('ยื่นซ่อม 3 รายการพร้อมกัน: ได้คำขอ 3 ใบ เลขเรียงตามลำดับที่ส่ง ค่าซ่อมประมาณเป็นของแต่ละใบ', async () => {
  const a = chair('CH-001'),
    b = chair('CH-002'),
    c = chair('CH-003');
  const db = database([a, b, c]);
  const res = await run(db, () =>
    mutate(staff, {
      action: 'requestMany',
      items: items(a, b, c),
      kind: 'repair',
      reason: 'ขาหัก',
      payload: { estimateSatang: 50000 },
    }),
  );
  assert.equal(res.ok, true);
  assert.equal(res.count, 3);
  const list = db.state.requests;
  assert.deepEqual(
    list.map(r => r.assetId),
    ['id-CH-001', 'id-CH-002', 'id-CH-003'],
  );
  // ยังไม่มีคำขอในปีงบนี้ → เลขที่ 1, 2, 3
  assert.deepEqual(list.map(seqOf), [1, 2, 3]);
  for (const r of list) {
    assert.equal(r.kind, 'repair');
    assert.equal(r.reason, 'ขาหัก');
    assert.equal(r.status, 'pending');
    assert.equal(r.chain, chain);
    assert.equal(JSON.parse(r.payload).estimateSatang, 50000); // 500 บาทต่อใบ ไม่ได้หาร 3
    assert.equal(r.actor, 'staff-1');
  }
  // ยื่นคำขอแล้ว version ของครุภัณฑ์ +1 (1 → 2) และคำขอจำ version ใหม่ไว้
  assert.deepEqual(
    db.state.assets.map(x => x.version),
    [2, 2, 2],
  );
  assert.deepEqual(
    list.map(r => r.assetVersion),
    [2, 2, 2],
  );
  assert.equal(db.state.audits.length, 3);
});

test('ยื่นหลายรายการ: ติดรายการเดียว → ไม่มีใบไหนถูกสร้าง และข้อความบอกหมายเลขที่ติด', async () => {
  const a = chair('CH-001'),
    b = chair('CH-002');
  const old = {
    id: 'req-old',
    assetId: b.id,
    assetVersion: 1,
    kind: 'transfer',
    payload: '{"seq":1}',
    reason: 'ย้าย',
    stage: 0,
    chain,
    status: 'pending',
    version: 1,
    actor: 'staff-1',
    createdAt: new Date().toISOString(),
  };
  const db = database([a, b], [old]);
  await assert.rejects(
    run(db, () =>
      mutate(staff, { action: 'requestMany', items: items(a, b), kind: 'repair', reason: 'ขาหัก', payload: {} }),
    ),
    (e: unknown) =>
      e instanceof ApiError && e.message === 'CH-002: รายการนี้มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน',
  );
  assert.equal(db.state.requests.length, 1); // เหลือแค่ใบเดิม ใบของ CH-001 ถูกย้อนกลับ
  assert.equal(db.state.assets[0].version, 1);
  assert.equal(db.state.audits.length, 0);
});

test('ยื่นหลายรายการ: ข้อมูลที่ใช้ร่วมกันผิด → ข้อความไม่ติดหมายเลขรายการ · ผู้อนุมัติยื่นไม่ได้', async () => {
  const a = chair('CH-001');
  const db = database([a]);
  await assert.rejects(
    run(db, () => mutate(staff, { action: 'requestMany', items: items(a), kind: 'repair', reason: ' ', payload: {} })),
    (e: unknown) => e instanceof ApiError && e.message === 'ระบุประเภทและเหตุผลของคำขอ',
  );
  await assert.rejects(
    run(db, () =>
      mutate(staff, {
        action: 'requestMany',
        items: items(a),
        kind: 'transfer',
        reason: 'ย้าย',
        payload: { location: '', branch: elec },
      }),
    ),
    (e: unknown) => e instanceof ApiError && e.message === 'ระบุสถานที่และสาขาปลายทาง',
  );
  await assert.rejects(
    run(db, () => mutate(headCom, { action: 'requestMany', items: items(a), kind: 'repair', reason: 'x' })),
    (e: unknown) => e instanceof ApiError && e.status === 403,
  );
  assert.equal(db.state.requests.length, 0);
});

test('รูปแบบคำสั่ง: ไม่เกิน 100 รายการ · ห้ามรายการซ้ำ · ต้องมีอย่างน้อย 1 รายการ', () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'a' + i, version: 1 }));
  assert.equal(requestManySchema.safeParse({ action: 'requestMany', items: list(100) }).success, true);
  assert.equal(requestManySchema.safeParse({ action: 'requestMany', items: list(101) }).success, false);
  assert.equal(requestManySchema.safeParse({ action: 'requestMany', items: [] }).success, false);
  const dup = [
    { id: 'a', version: 1 },
    { id: 'a', version: 2 },
  ];
  assert.equal(requestManySchema.safeParse({ action: 'requestMany', items: dup }).success, false);
  assert.equal(approveManySchema.safeParse({ action: 'approveMany', items: list(100) }).success, true);
  assert.equal(approveManySchema.safeParse({ action: 'approveMany', items: list(101) }).success, false);
});

function pending(id: string, asset: Row, stage: number, kind: string, payload: Row, seq: number): Row {
  return {
    id,
    assetId: asset.id,
    assetVersion: asset.version,
    kind,
    payload: JSON.stringify({ ...payload, seq }),
    reason: 'เหตุผล',
    stage,
    chain,
    status: 'pending',
    version: 1,
    actor: 'staff-1',
    createdAt: new Date().toISOString(),
  };
}

test('อนุมัติที่เลือก (หัวหน้าสาขา): ลงนามขั้นที่ 1 ทุกใบ ลายเซ็นแยกใบละรายการ ทะเบียนยังไม่เปลี่ยน', async () => {
  const a = chair('CH-001', { version: 2 }),
    b = chair('CH-002', { version: 2 });
  const db = database([a, b], [pending('r1', a, 0, 'repair', {}, 1), pending('r2', b, 0, 'repair', {}, 2)]);
  const res = await run(db, () =>
    mutate(headCom, {
      action: 'approveMany',
      items: [
        { id: 'r1', version: 1 },
        { id: 'r2', version: 1 },
      ],
      reason: 'เห็นควร',
    }),
  );
  assert.equal(res.count, 2);
  assert.deepEqual(
    db.state.requests.map(r => [r.stage, r.status, r.version]),
    [
      [1, 'pending', 2],
      [1, 'pending', 2],
    ],
  );
  assert.deepEqual(
    db.state.approvals.map(x => [x.requestId, x.stage, x.decision, x.actor, x.note]),
    [
      ['r1', 0, 'approve', 'head-com', 'เห็นควร'],
      ['r2', 0, 'approve', 'head-com', 'เห็นควร'],
    ],
  );
  assert.deepEqual(
    db.state.assets.map(x => [x.condition, x.version]),
    [
      ['damaged', 2],
      ['damaged', 2],
    ],
  );
});

test('อนุมัติที่เลือก (คณบดี ขั้นสุดท้าย): ทะเบียนเปลี่ยนตามแต่ละใบ — ใบซ่อม → กำลังซ่อม · ใบโอนย้าย → ย้ายที่', async () => {
  const a = chair('CH-001', { version: 2 }),
    b = chair('CH-002', { version: 2 });
  const db = database(
    [a, b],
    [
      pending('r1', a, 2, 'repair', { estimateSatang: 0 }, 1),
      pending('r2', b, 2, 'transfer', { location: 'ห้อง 202', branch: elec }, 2),
    ],
  );
  await run(db, () =>
    mutate(dean, {
      action: 'approveMany',
      items: [
        { id: 'r1', version: 1 },
        { id: 'r2', version: 1 },
      ],
    }),
  );
  assert.deepEqual(
    db.state.requests.map(r => [r.stage, r.status]),
    [
      [3, 'approved'],
      [3, 'approved'],
    ],
  );
  assert.equal(db.state.assets[0].condition, 'repair');
  assert.equal(db.state.assets[1].location, 'ห้อง 202');
  assert.equal(db.state.assets[1].branch, elec);
  // อนุมัติขั้นสุดท้าย = แก้ทะเบียน version +1 (2 → 3)
  assert.deepEqual(
    db.state.assets.map(x => x.version),
    [3, 3],
  );
});

test('อนุมัติที่เลือก: มีใบของสาขาอื่นปนมา → 403 บอกหมายเลข และไม่มีใบไหนถูกอนุมัติ · เจ้าหน้าที่อนุมัติไม่ได้', async () => {
  const a = chair('CH-001', { version: 2 }),
    b = chair('EE-001', { version: 2, branch: elec });
  const db = database([a, b], [pending('r1', a, 0, 'repair', {}, 1), pending('r2', b, 0, 'repair', {}, 2)]);
  const body = {
    action: 'approveMany',
    items: [
      { id: 'r1', version: 1 },
      { id: 'r2', version: 1 },
    ],
  };
  await assert.rejects(
    run(db, () => mutate(headCom, body)),
    (e: unknown) => e instanceof ApiError && e.status === 403 && e.message.startsWith('EE-001: '),
  );
  assert.deepEqual(
    db.state.requests.map(r => [r.stage, r.version]),
    [
      [0, 1],
      [0, 1],
    ],
  );
  assert.equal(db.state.approvals.length, 0);
  await assert.rejects(
    run(db, () => mutate(staff, body)),
    (e: unknown) => e instanceof ApiError && e.status === 403,
  );
});

test('กดอนุมัติใบที่มีคนดำเนินการไปก่อนแล้ว → 409 บอกเหตุผลที่ชัด (ผู้อนุมัติ 2 คนกดพร้อมกัน)', async () => {
  const a = chair('CH-001', { version: 2 });
  const cases: [Row, string][] = [
    // ยังรออนุมัติแต่เลขรุ่นขยับจาก 1 เป็น 2 = มีคนลงนามขั้นนี้ไปแล้ว
    [{ version: 2, stage: 1 }, 'มีผู้อนุมัติคำขอนี้ไปแล้ว กรุณาโหลดใหม่'],
    [{ version: 4, stage: 3, status: 'approved' }, 'คำขอนี้อนุมัติครบแล้ว กรุณาโหลดใหม่'],
    [{ version: 2, status: 'rejected' }, 'คำขอนี้ไม่ได้รับอนุมัติไปแล้ว กรุณาโหลดใหม่'],
    [{ version: 2, status: 'cancelled' }, 'ผู้ยื่นยกเลิกคำขอนี้แล้ว กรุณาโหลดใหม่'],
  ];
  for (const [changed, message] of cases) {
    const db = database([a], [{ ...pending('r1', a, 0, 'repair', {}, 1), ...changed }]);
    await assert.rejects(
      run(db, () => mutate(dean, { action: 'approve', id: 'r1', version: 1 })),
      (e: unknown) => e instanceof ApiError && e.status === 409 && e.message === message,
    );
    // อนุมัติที่เลือก: ข้อความเดียวกัน มีหมายเลขครุภัณฑ์นำหน้า
    await assert.rejects(
      run(db, () => mutate(dean, { action: 'approveMany', items: [{ id: 'r1', version: 1 }] })),
      (e: unknown) => e instanceof ApiError && e.message === 'CH-001: ' + message,
    );
    assert.equal(db.state.approvals.length, 0);
  }
});

// ---------- หน้าต่างยื่นหลายรายการ: คัดรายการที่ยื่นได้ล่วงหน้า ----------
const asAsset = (row: Row) => row as unknown as Asset;

test('คัดรายการ: มีคำขอค้าง / กำลังซ่อมอยู่ (ส่งซ่อม) ถูกข้าม · ที่เหลือเรียงตามหมายเลข', () => {
  const list = [chair('CH-010'), chair('CH-002', { condition: 'repair' }), chair('CH-001'), chair('CH-003')].map(
    asAsset,
  );
  const out = batchCheck(list, 'repair', new Set(['id-CH-003']));
  assert.deepEqual(
    out.ready.map(a => a.code),
    ['CH-001', 'CH-010'],
  );
  assert.deepEqual(
    out.skipped.map(s => [s.asset.code, s.why]),
    [
      ['CH-002', 'อยู่ระหว่างซ่อมแล้ว'],
      ['CH-003', 'มีคำขอรออนุมัติอยู่แล้ว'],
    ],
  );
  // จำหน่าย: ของที่กำลังซ่อมยื่นได้ (กฎเดิมห้ามเฉพาะส่งซ่อมซ้ำ)
  assert.equal(batchCheck(list, 'disposal', new Set()).ready.length, 4);
});

test('คัดรายการ: ชุดห้ามแยก ยื่นโอนย้าย/จำหน่ายใบเดียวทั้งชุด · ส่งซ่อมยื่นแยกชิ้นได้', () => {
  const list = [chair('T-1', { setId: 's1' }), chair('T-2', { setId: 's1' }), chair('P-1')].map(asAsset);
  const out = batchCheck(list, 'disposal', new Set());
  assert.deepEqual(
    out.ready.map(a => a.code),
    ['P-1', 'T-1'],
  );
  assert.deepEqual(
    out.skipped.map(s => [s.asset.code, s.why]),
    [['T-2', 'อยู่ในชุดเดียวกับ T-1 (ยื่นทั้งชุดในใบเดียวแล้ว)']],
  );
  assert.equal(batchCheck(list, 'repair', new Set()).ready.length, 3);
});

test('คัดรายการ: โอนย้ายไปที่เดิม (สถานที่ + สาขาเดิม ไม่เปลี่ยนผู้รับผิดชอบ) ถูกข้าม', () => {
  const list = [chair('CH-001'), chair('CH-002', { location: 'ห้อง 202' })].map(asAsset);
  const to = { location: ' ห้อง 101 ', branch: 'วิศวกรรมคอมพิวเตอร์', custodian: '' };
  const out = batchCheck(list, 'transfer', new Set(), to);
  assert.deepEqual(
    out.skipped.map(s => [s.asset.code, s.why]),
    [['CH-001', 'อยู่ที่ปลายทางนี้แล้ว']],
  );
  // เปลี่ยนผู้รับผิดชอบ = ยื่นได้ แม้สถานที่และสาขาเดิม
  assert.equal(batchCheck(list, 'transfer', new Set(), { ...to, custodian: 'นายบี' }).ready.length, 2);
  // ยังไม่กรอกปลายทาง = ยังไม่ข้าม
  assert.equal(batchCheck(list, 'transfer', new Set(), { location: '', branch: '', custodian: '' }).ready.length, 2);
});

test('ค่าที่เติมให้ก่อน: ทุกรายการเหมือนกัน = ค่านั้น · ต่างกัน = ว่าง', () => {
  assert.equal(sameValue(['ห้อง 101', 'ห้อง 101']), 'ห้อง 101');
  assert.equal(sameValue(['ห้อง 101', 'ห้อง 202']), '');
  assert.equal(sameValue([]), '');
});
