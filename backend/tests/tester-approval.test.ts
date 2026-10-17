import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { awaitsApprovalBy } from '../contracts/domain';
import { userMutationSchema } from '../validation';
import type { Member } from '../auth/sessions';

// บัญชีผู้ทดสอบระบบ (tester) — ผู้ใช้ตัดสินใจ 18 ต.ค. 2569:
// อนุมัติครั้งเดียวจบทุกขั้นที่เหลือ ทุกสาขา · ห้ามอนุมัติคำขอของตัวเอง · ยื่นคำขอ/แก้ทะเบียนไม่ได้
const tester: Member = { id: 'tester-1', email: 'tester@example.test', name: 'ผู้ทดสอบ', role: 'tester', branch: null, active: 1, createdAt: '' };
const head: Member = { id: 'head-1', email: 'head@example.test', name: 'หัวหน้า', role: 'head', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', active: 1, createdAt: '' };
const CHAIN = JSON.stringify(['head', 'deputy', 'dean']);

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

// คำขอโอนย้ายของสาขา วค ที่ขั้น stage (0 = รอหัวหน้าสาขา)
function environment(stage: number, actor = 'staff-1', members: Member[] = [tester, head]) {
  const asset: Record<string, any> = {
    id: 'asset-1', code: 'PC-001', name: 'คอมพิวเตอร์', quantity: 1, unitSatang: 3000000, totalSatang: 3000000, salvageSatang: 0,
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', location: 'ห้อง 101', custodian: 'นายเอ', condition: 'normal', lifecycle: 'active', version: 2,
  };
  const request: Record<string, any> = {
    id: 'req-1', assetId: 'asset-1', assetVersion: 2, kind: 'transfer', reason: 'ย้ายห้อง', stage, chain: CHAIN, status: 'pending', version: 1, actor, createdAt: '',
    payload: JSON.stringify({ location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', from: { location: 'ห้อง 101', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', custodian: 'นายเอ' } }),
  };
  const approvals: Array<Record<string, any>> = [];
  const tx = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => members.find(x => x.id === where.id) ?? null },
    asset: {
      findUnique: async () => ({ ...asset }),
      update: async ({ data }: { data: Record<string, any> }) => {
        const { version, ...rest } = data;
        if (version?.increment) asset.version += version.increment;
        Object.assign(asset, rest);
        return asset;
      },
    },
    assetRequest: {
      findUnique: async () => structuredClone(request),
      update: async ({ data }: { data: Record<string, any> }) => {
        const { version, ...rest } = data;
        if (version?.increment) request.version += version.increment;
        Object.assign(request, rest);
        return request;
      },
    },
    approval: { create: async ({ data }: { data: Record<string, any> }) => { approvals.push(data); return data; } },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
    location: { createMany: async () => ({}) },
    branch: { createMany: async () => ({}) },
  };
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  return { asset, request, approvals, restore };
}

test('ผู้ทดสอบอนุมัติที่ขั้น 1 (หัวหน้าสาขา) → ลงนามครบ 3 ขั้นในครั้งเดียว คำขออนุมัติแล้ว ทะเบียนย้ายทันที', async () => {
  const env = environment(0);
  try {
    await mutate(tester, { action: 'approve', id: 'req-1', version: 1, reason: 'ทดลอง' });
    assert.equal(env.request.status, 'approved');
    assert.equal(env.request.stage, 3);                                   // ผ่านครบ 3 ขั้น
    assert.deepEqual(env.approvals.map(a => [a.stage, a.decision, a.actor]), [[0, 'approve', 'tester-1'], [1, 'approve', 'tester-1'], [2, 'approve', 'tester-1']]);
    assert.ok(env.approvals.every(a => a.note === 'อนุมัติข้ามขั้นโดยบัญชีทดลอง (ผู้ทดสอบระบบ) · ทดลอง'));
    assert.equal(env.asset.location, 'ห้อง 202');
    assert.equal(env.asset.branch, 'วิศวกรรมไฟฟ้า (วฟ)');
    assert.equal(env.asset.version, 3);                                   // 2 + 1
  } finally { env.restore(); }
});

test('ผู้ทดสอบอนุมัติที่ขั้น 2 (รองคณบดี) → ลงนามเฉพาะขั้นที่เหลือ 2 และ 3', async () => {
  const env = environment(1);
  try {
    await mutate(tester, { action: 'approve', id: 'req-1', version: 1, reason: '' });
    assert.deepEqual(env.approvals.map(a => a.stage), [1, 2]);
    assert.equal(env.approvals[0].note, 'อนุมัติข้ามขั้นโดยบัญชีทดลอง (ผู้ทดสอบระบบ)');
    assert.equal(env.request.status, 'approved');
  } finally { env.restore(); }
});

test('ผู้ทดสอบไม่อนุมัติ → คำขอสิ้นสุด (rejected) 1 แถว และทะเบียนไม่เปลี่ยน', async () => {
  const env = environment(0);
  try {
    await mutate(tester, { action: 'reject', id: 'req-1', version: 1, reason: 'ทดลองไม่อนุมัติ' });
    assert.equal(env.request.status, 'rejected');
    assert.equal(env.request.stage, 0);
    assert.deepEqual(env.approvals.map(a => [a.stage, a.decision, a.note]), [[0, 'reject', 'ทดลองไม่อนุมัติ']]);
    assert.equal(env.asset.location, 'ห้อง 101');
  } finally { env.restore(); }
});

test('ผู้ทดสอบอนุมัติคำขอที่ตัวเองยื่นไม่ได้', async () => {
  const env = environment(0, tester.id);
  try {
    await assert.rejects(mutate(tester, { action: 'approve', id: 'req-1', version: 1, reason: '' }), /ไม่สามารถอนุมัติคำขอตนเอง/);
    assert.equal(env.approvals.length, 0);
    assert.equal(env.request.status, 'pending');
  } finally { env.restore(); }
});

test('ผู้ใช้อื่นไม่เปลี่ยน: หัวหน้าสาขาอนุมัติขั้น 1 → ลงนาม 1 ขั้น คำขอยังรอขั้น 2', async () => {
  const env = environment(0);
  try {
    await mutate(head, { action: 'approve', id: 'req-1', version: 1, reason: 'เห็นควร' });
    assert.deepEqual(env.approvals.map(a => [a.stage, a.note]), [[0, 'เห็นควร']]);
    assert.equal(env.request.stage, 1);
    assert.equal(env.request.status, 'pending');
    assert.equal(env.asset.location, 'ห้อง 101');
  } finally { env.restore(); }
});

test('ผู้ทดสอบยื่นคำขอหรือเพิ่มครุภัณฑ์ไม่ได้ (403)', async () => {
  const env = environment(0);
  try {
    await assert.rejects(mutate(tester, { action: 'request', id: 'asset-1', version: 2, kind: 'disposal', reason: 'ทดลอง' }), (e: any) => e?.status === 403);
    await assert.rejects(mutate(tester, { action: 'create', asset: { code: 'X-1', name: 'ทดลอง', quantity: 1 } }), (e: any) => e?.status === 403);
  } finally { env.restore(); }
});

test('awaitsApprovalBy: ผู้ทดสอบเห็นปุ่มอนุมัติทุกคำขอที่รออยู่ทุกสาขา ยกเว้นคำขอของตัวเอง/ที่จบแล้ว', () => {
  const r = { status: 'pending', chain: CHAIN, stage: 0, actor: 'staff-1' };
  assert.equal(awaitsApprovalBy(r, tester, 'วิศวกรรมไฟฟ้า (วฟ)'), true);
  assert.equal(awaitsApprovalBy({ ...r, stage: 2 }, tester, 'วิศวกรรมคอมพิวเตอร์ (วค)'), true);
  assert.equal(awaitsApprovalBy({ ...r, actor: tester.id }, tester, 'วิศวกรรมไฟฟ้า (วฟ)'), false);
  assert.equal(awaitsApprovalBy({ ...r, status: 'approved' }, tester, 'วิศวกรรมไฟฟ้า (วฟ)'), false);
  assert.equal(awaitsApprovalBy(r, head, 'วิศวกรรมไฟฟ้า (วฟ)'), false);   // หัวหน้าต่างสาขายังเห็นไม่ได้เหมือนเดิม
});

test('สร้างบัญชีบทบาท tester ได้ (ไม่ต้องระบุสาขา)', () => {
  const parsed = userMutationSchema.safeParse({ action: 'user', name: 'ผู้ทดสอบ', email: 'tester@example.test', role: 'tester' });
  assert.equal(parsed.success, true);
});
