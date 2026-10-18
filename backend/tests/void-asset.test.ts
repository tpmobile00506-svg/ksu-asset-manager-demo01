import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { voidBlockReason, voidedCode, restoredCode, type Asset } from '../contracts/domain';
import { createAssetWorkbook } from '../../frontend/services/excel-export';
import type { Member } from '../auth/sessions';

// ยกเลิกรายการที่บันทึกผิด (ผู้ใช้ตัดสินใจ 18 ต.ค. 2569): เจ้าหน้าที่/Admin กดเองได้ ต้องใส่เหตุผล
// ใช้ได้เฉพาะรายการที่ยังไม่มีอะไรเกิดขึ้น · ยกเลิกแล้วอยู่หมวด "ข้อมูลผิดพลาด" (lifecycle = voided) และรหัสเดิมว่างให้ใช้ใหม่
const staff: Member = { id: 'staff-1', email: 'staff@example.test', name: 'เจ้าหน้าที่', role: 'staff', branch: null, active: 1, createdAt: '' };
const head: Member = { id: 'head-1', email: 'head@example.test', name: 'หัวหน้า', role: 'head', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', active: 1, createdAt: '' };
const ASSET_ID = 'abcdef12-3456-7890-abcd-ef1234567890';

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
// history: requests = คำขอทุกสถานะ · counted = รายการตรวจนับที่บันทึกผลแล้ว · pendingCounts = อยู่ในรอบที่เปิดแต่ยังไม่นับ
// siblings = รายการอื่นจากแถว Excel เดียวกันที่ยังไม่ถูกยกเลิก
function environment(member: Member, overrides: Record<string, unknown> = {}, history = { requests: 0, counted: 0, pendingCounts: 0, siblings: 0 }) {
  const asset: Record<string, any> = { id: ASSET_ID, code: 'วค.01-0001', name: 'คอมพิวเตอร์', quantity: 1, unitSatang: 1500000, totalSatang: 1500000, salvageSatang: 0,
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', location: 'ห้อง 1', custodian: '', condition: 'normal', lifecycle: 'active', version: 2,
    parentId: null, setId: null, sourceId: 'src-1', sourceRow: 'คอม!12', ...overrides };
  const log = { stocktakeDeleted: 0, sourceRowDeleted: [] as unknown[], audits: [] as Array<Record<string, any>> };
  const tx = {
    user: { findUnique: async () => member },
    asset: {
      findUnique: async () => ({ ...asset }),
      count: async () => history.siblings,
      update: async ({ data }: { data: Record<string, any> }) => { const { version, ...rest } = data; Object.assign(asset, rest); if (version?.increment) asset.version += 1; return asset; },
    },
    assetRequest: { findFirst: async () => null, count: async () => history.requests },
    stocktakeItem: {
      count: async () => history.counted,
      deleteMany: async () => { log.stocktakeDeleted = history.pendingCounts; return { count: history.pendingCounts }; },
    },
    sourceRow: { deleteMany: async ({ where }: { where: unknown }) => { log.sourceRowDeleted.push(where); return { count: 1 }; } },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async ({ data }: { data: Record<string, any> }) => { log.audits.push(data); return data; } },
  };
  return { asset, log, restore: useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) }) };
}

test('voidedCode เติมท้ายรหัสด้วย 8 ตัวแรกของไอดี', () => {
  assert.equal(voidedCode('วค.01-0001', ASSET_ID), 'วค.01-0001 (ยกเลิก abcdef12)');
});

test('voidBlockReason: ยกเลิกได้เฉพาะรายการที่ยังไม่มีอะไรเกิดขึ้น', () => {
  const fresh = { lifecycle: 'active', parentId: null, setId: null };
  const none = { requests: 0, counted: 0 };
  assert.equal(voidBlockReason(fresh, none), '');
  assert.match(voidBlockReason({ ...fresh, lifecycle: 'disposed' }, none), /ไม่อยู่ในทะเบียนที่ถือครอง/);
  assert.match(voidBlockReason({ ...fresh, lifecycle: 'voided' }, none), /ไม่อยู่ในทะเบียนที่ถือครอง/);
  assert.match(voidBlockReason({ ...fresh, parentId: 'p-1' }, none), /แบ่งล็อต/);
  assert.match(voidBlockReason({ ...fresh, setId: 'set-1' }, none), /ในชุด/);
  assert.match(voidBlockReason(fresh, { requests: 1, counted: 0 }), /เคยมีคำขอ/);
  assert.match(voidBlockReason(fresh, { requests: 0, counted: 1 }), /เคยถูกตรวจนับ/);
});

test('เจ้าหน้าที่ยกเลิกรายการบันทึกผิด → หมวดข้อมูลผิดพลาด รหัสเดิมว่าง ออกจากรอบตรวจนับ และเปิดแถว Excel ให้นำเข้าใหม่', async () => {
  const env = environment(staff, {}, { requests: 0, counted: 0, pendingCounts: 1, siblings: 0 });
  try {
    await mutate(staff, { action: 'void', id: ASSET_ID, version: 2, reason: 'ใส่ราคาผิด 15,000 ที่ถูกคือ 1,500' });
    assert.equal(env.asset.lifecycle, 'voided');
    assert.equal(env.asset.code, 'วค.01-0001 (ยกเลิก abcdef12)');
    assert.equal(env.asset.version, 3);
    assert.equal(env.asset.totalSatang, 1500000);                 // ยอดเงินไม่ถูกแตะ เก็บไว้ตามที่บันทึกผิด
    assert.equal(env.log.stocktakeDeleted, 1);
    assert.deepEqual(env.log.sourceRowDeleted, [{ sourceId: 'src-1', sourceRow: 'คอม!12' }]);
    assert.equal(env.log.audits.length, 1);
    assert.equal(env.log.audits[0].action, 'ยกเลิกรายการ (ข้อมูลผิดพลาด)');
    assert.equal(env.log.audits[0].reason, 'ใส่ราคาผิด 15,000 ที่ถูกคือ 1,500');
  } finally { env.restore(); }
});

test('แถว Excel ที่ยังมีรายการอื่นจากแถวเดียวกัน (ช่วงรหัส) → ไม่เปิดแถวให้นำเข้าซ้ำ', async () => {
  const env = environment(staff, {}, { requests: 0, counted: 0, pendingCounts: 0, siblings: 2 });
  try {
    await mutate(staff, { action: 'void', id: ASSET_ID, version: 2, reason: 'เพิ่มซ้ำ' });
    assert.equal(env.asset.lifecycle, 'voided');
    assert.deepEqual(env.log.sourceRowDeleted, []);
  } finally { env.restore(); }
});

test('ยกเลิกไม่ได้: ไม่มีเหตุผล · เคยมีคำขอ · เคยตรวจนับ · หัวหน้าสาขา (403) — ทะเบียนไม่เปลี่ยน', async () => {
  const cases: Array<[Member, Record<string, unknown>, { requests: number; counted: number; pendingCounts: number; siblings: number }, (e: any) => boolean]> = [
    [staff, { reason: '' }, { requests: 0, counted: 0, pendingCounts: 0, siblings: 0 }, e => /เหตุผล/.test(e?.message)],
    [staff, {}, { requests: 1, counted: 0, pendingCounts: 0, siblings: 0 }, e => /เคยมีคำขอ/.test(e?.message)],
    [staff, {}, { requests: 0, counted: 1, pendingCounts: 0, siblings: 0 }, e => /เคยถูกตรวจนับ/.test(e?.message)],
    [head, {}, { requests: 0, counted: 0, pendingCounts: 0, siblings: 0 }, e => e?.status === 403],
  ];
  for (const [member, input, history, check] of cases) {
    const env = environment(member, {}, history);
    try {
      await assert.rejects(mutate(member, { action: 'void', id: ASSET_ID, version: 2, reason: 'บันทึกผิด', ...input }), check);
      assert.equal(env.asset.lifecycle, 'active');
      assert.equal(env.asset.code, 'วค.01-0001');
      assert.equal(env.log.audits.length, 0);
    } finally { env.restore(); }
  }
});

test('Excel: รายการที่ยกเลิก (ข้อมูลผิดพลาด) ไม่ออกในรายงาน · รายการปกติประเภทเดียวกันยังออก', async () => {
  const base = { quantity: 1, unitSatang: 150000, totalSatang: 150000, notes: '', location: 'ห้อง 1', branch: 'วค', groupName: '',
    category: 'ครุภัณฑ์คอมพิวเตอร์', condition: 'normal' };
  const ok = { ...base, id: '1', code: 'OK-1', name: 'เมาส์', lifecycle: 'active' } as unknown as Asset;
  const wrong = { ...base, id: '2', code: 'WRONG-1 (ยกเลิก 2)', name: 'เมาส์ (เพิ่มซ้ำ)', lifecycle: 'voided' } as unknown as Asset;
  const sheets = (await createAssetWorkbook([ok, wrong], { fiscalYear: 2570 })).worksheets;
  const texts: string[] = [];
  for (const s of sheets) s.eachRow(row => row.eachCell(cell => { texts.push(String(cell.value ?? '')); }));
  assert.ok(texts.some(t => t.includes('OK-1')));
  assert.ok(!texts.some(t => t.includes('WRONG-1')));
});

// กู้คืนรายการที่ยกเลิก: กลับเข้าทะเบียนที่ถือครองด้วยรหัสเดิม (ถ้ารหัสเดิมยังว่าง)
// others = รายการอื่นในทะเบียน (ใช้ตรวจรหัสซ้ำ) · decided = แถว Excel ต้นฉบับยังมีบันทึกว่านำเข้าแล้วหรือไม่
function restoreEnvironment(member: Member, overrides: Record<string, unknown> = {}, others: Array<Record<string, unknown>> = [], decided = false) {
  const asset: Record<string, any> = { id: ASSET_ID, code: 'วค.01-0001 (ยกเลิก abcdef12)', name: 'คอมพิวเตอร์', quantity: 1, unitSatang: 1500000, totalSatang: 1500000,
    salvageSatang: 0, branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', location: 'ห้อง 1', condition: 'normal', lifecycle: 'voided', version: 3,
    parentId: null, setId: null, sourceId: 'src-1', sourceRow: 'คอม!12', ...overrides };
  const log = { sourceRowCreated: [] as Array<Record<string, any>>, audits: [] as Array<Record<string, any>> };
  const tx = {
    user: { findUnique: async () => member },
    asset: {
      findUnique: async () => ({ ...asset }),
      findMany: async () => [{ ...asset }, ...others],
      update: async ({ data }: { data: Record<string, any> }) => { const { version, ...rest } = data; Object.assign(asset, rest); if (version?.increment) asset.version += 1; return asset; },
    },
    sourceRow: {
      findFirst: async () => (decided ? { id: 'decision-1' } : null),
      create: async ({ data }: { data: Record<string, any> }) => { log.sourceRowCreated.push(data); return data; },
    },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async ({ data }: { data: Record<string, any> }) => { log.audits.push(data); return data; } },
  };
  return { asset, log, restore: useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) }) };
}

test('restoredCode ตัดส่วนท้าย "(ยกเลิก ไอดี 8 ตัว)" ออก · รหัสที่ไม่มีส่วนท้ายคืนตามเดิม', () => {
  assert.equal(restoredCode('วค.01-0001 (ยกเลิก abcdef12)', ASSET_ID), 'วค.01-0001');
  assert.equal(restoredCode('วค.01-0001', ASSET_ID), 'วค.01-0001');
  assert.equal(restoredCode('วค.01-0001 (ยกเลิก 99999999)', ASSET_ID), 'วค.01-0001 (ยกเลิก 99999999)');   // ไอดีไม่ตรงกับรายการนี้
});

test('กู้คืน → ทะเบียนที่ถือครอง รหัสเดิม และบันทึกแถว Excel กลับว่านำเข้าแล้ว', async () => {
  const env = restoreEnvironment(staff);
  try {
    await mutate(staff, { action: 'restore', id: ASSET_ID, version: 3, reason: 'กดยกเลิกผิดรายการ' });
    assert.equal(env.asset.lifecycle, 'active');
    assert.equal(env.asset.code, 'วค.01-0001');
    assert.equal(env.asset.version, 4);
    assert.equal(env.log.sourceRowCreated.length, 1);
    assert.equal(env.log.sourceRowCreated[0].sourceId, 'src-1');
    assert.equal(env.log.sourceRowCreated[0].sourceRow, 'คอม!12');
    assert.equal(env.log.sourceRowCreated[0].decision, 'imported');
    assert.equal(env.log.audits.length, 1);
    assert.equal(env.log.audits[0].action, 'กู้คืนรายการ (จากข้อมูลผิดพลาด)');
    assert.equal(env.log.audits[0].reason, 'กดยกเลิกผิดรายการ');
  } finally { env.restore(); }
});

test('กู้คืน: แถว Excel ยังมีบันทึกนำเข้าอยู่ (มีรายการอื่นจากแถวเดียวกัน) → ไม่สร้างซ้ำ', async () => {
  const env = restoreEnvironment(staff, {}, [], true);
  try {
    await mutate(staff, { action: 'restore', id: ASSET_ID, version: 3, reason: 'กดยกเลิกผิดรายการ' });
    assert.equal(env.asset.lifecycle, 'active');
    assert.equal(env.log.sourceRowCreated.length, 0);
  } finally { env.restore(); }
});

test('กู้คืนไม่ได้: รหัสเดิมถูกใช้แล้ว (409) · ไม่ได้อยู่ในหมวดข้อมูลผิดพลาด · ไม่มีเหตุผล · หัวหน้าสาขา (403) — ทะเบียนไม่เปลี่ยน', async () => {
  const taken = { id: 'new-1', code: 'วค.01-0001', name: 'คอมพิวเตอร์ (เพิ่มใหม่)', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', lifecycle: 'active' };
  const cases: Array<[Member, Record<string, unknown>, Array<Record<string, unknown>>, Record<string, unknown>, (e: any) => boolean]> = [
    [staff, {}, [taken], {}, e => e?.status === 409 && /ซ้ำ/.test(e?.message)],
    [staff, { lifecycle: 'active', code: 'วค.01-0001' }, [], {}, e => /ไม่ได้อยู่ในหมวดข้อมูลผิดพลาด/.test(e?.message)],
    [staff, {}, [], { reason: '' }, e => /เหตุผล/.test(e?.message)],
    [head, {}, [], {}, e => e?.status === 403],
  ];
  for (const [member, overrides, others, input, check] of cases) {
    const env = restoreEnvironment(member, overrides, others);
    const before = { lifecycle: env.asset.lifecycle, code: env.asset.code };
    try {
      await assert.rejects(mutate(member, { action: 'restore', id: ASSET_ID, version: 3, reason: 'กดยกเลิกผิดรายการ', ...input }), check);
      assert.deepEqual({ lifecycle: env.asset.lifecycle, code: env.asset.code }, before);
      assert.equal(env.log.audits.length, 0);
      assert.equal(env.log.sourceRowCreated.length, 0);
    } finally { env.restore(); }
  }
});
