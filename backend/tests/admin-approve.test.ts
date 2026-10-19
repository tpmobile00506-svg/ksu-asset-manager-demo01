import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { ADMIN_APPROVES_ALL, awaitsApprovalBy } from '../contracts/domain';
import type { Member } from '../auth/sessions';

// ชั่วคราว (ผู้ใช้ตัดสินใจ 18 ต.ค. 2569): Admin อนุมัติได้ กดครั้งเดียวจบทุกขั้น รวมคำขอของตัวเอง (ADMIN_APPROVES_ALL)
// บทบาทอื่นต้องเหมือนเดิม · ถ้าปิดสวิตช์หลังสอบ เทสต์นี้จะข้ามตัวเอง
const admin: Member = { id: 'admin-1', email: 'admin@example.test', name: 'ผู้ดูแลระบบ', role: 'admin', branch: null, active: 1, createdAt: '' };
const staff: Member = { id: 'staff-1', email: 'staff@example.test', name: 'เจ้าหน้าที่', role: 'staff', branch: null, active: 1, createdAt: '' };
const head: Member = { id: 'head-1', email: 'head@example.test', name: 'หัวหน้า', role: 'head', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', active: 1, createdAt: '' };
const skip = !ADMIN_APPROVES_ALL && 'ปิดสวิตช์ ADMIN_APPROVES_ALL แล้ว';

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
// คำขอจำหน่ายของสาขา วฟ ที่ขั้น stage ยื่นโดย actor
function environment(member: Member, actor: string, stage = 0) {
  const asset: Record<string, any> = { id: 'asset-1', code: 'PC-001', name: 'คอมพิวเตอร์', quantity: 1, unitSatang: 100000, totalSatang: 100000, salvageSatang: 0,
    branch: 'วิศวกรรมไฟฟ้า (วฟ)', location: 'ห้อง 1', custodian: '', condition: 'damaged', lifecycle: 'active', version: 2 };
  const request: Record<string, any> = { id: 'req-1', assetId: 'asset-1', assetVersion: 2, kind: 'disposal', reason: 'ชำรุดเกินซ่อม', stage,
    chain: '["head","deputy","dean"]', status: 'pending', version: 1, actor, createdAt: '', payload: '{"seq":1}' };
  const approvals: Array<Record<string, any>> = [];
  const tx = {
    user: { findUnique: async () => member },
    asset: { findUnique: async () => ({ ...asset }), update: async ({ data }: { data: Record<string, any> }) => { const { version, ...rest } = data; Object.assign(asset, rest); if (version?.increment) asset.version += 1; return asset; } },
    assetRequest: { findUnique: async () => structuredClone(request), update: async ({ data }: { data: Record<string, any> }) => { const { version, ...rest } = data; Object.assign(request, rest); return request; } },
    approval: { create: async ({ data }: { data: Record<string, any> }) => { approvals.push(data); return data; } },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
  };
  return { asset, request, approvals, restore: useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) }) };
}

test('Admin อนุมัติคำขอที่ตัวเองยื่น (สาขาอื่น) → ลงนามครบ 3 ขั้นในครั้งเดียว และจำหน่ายทันที', { skip }, async () => {
  const env = environment(admin, admin.id);
  try {
    await mutate(admin, { action: 'approve', id: 'req-1', version: 1, reason: 'สาธิต' });
    assert.equal(env.request.status, 'approved');
    assert.equal(env.request.stage, 3);
    assert.deepEqual(env.approvals.map(a => a.stage), [0, 1, 2]);
    assert.ok(env.approvals.every(a => a.note === 'อนุมัติข้ามขั้นโดยAdmin · สาธิต'));
    assert.equal(env.asset.lifecycle, 'disposed');
  } finally { env.restore(); }
});

test('Admin ไม่อนุมัติ → คำขอสิ้นสุด 1 แถว ทะเบียนไม่เปลี่ยน', { skip }, async () => {
  const env = environment(admin, staff.id);
  try {
    await mutate(admin, { action: 'reject', id: 'req-1', version: 1, reason: 'เอกสารไม่ครบ' });
    assert.equal(env.request.status, 'rejected');
    assert.deepEqual(env.approvals.map(a => [a.stage, a.decision]), [[0, 'reject']]);
    assert.equal(env.asset.lifecycle, 'active');
  } finally { env.restore(); }
});

test('บทบาทอื่นเหมือนเดิม: เจ้าหน้าที่อนุมัติไม่ได้ (403) · หัวหน้าสาขาอื่นอนุมัติไม่ได้ (403)', { skip }, async () => {
  const s = environment(staff, 'someone-else');
  try { await assert.rejects(mutate(staff, { action: 'approve', id: 'req-1', version: 1, reason: '' }), (e: any) => e?.status === 403); }
  finally { s.restore(); }
  const h = environment(head, 'someone-else');
  try {
    await assert.rejects(mutate(head, { action: 'approve', id: 'req-1', version: 1, reason: '' }), (e: any) => e?.status === 403);
    assert.equal(h.request.status, 'pending');
  } finally { h.restore(); }
});

test('awaitsApprovalBy: Admin เห็นปุ่มพิจารณาทุกคำขอที่รอ (รวมของตัวเอง) · หัวหน้ายังอนุมัติของตัวเองไม่ได้', { skip }, () => {
  const r = { status: 'pending', chain: '["head","deputy","dean"]', stage: 1, actor: admin.id };
  assert.equal(awaitsApprovalBy(r, admin, 'วิศวกรรมไฟฟ้า (วฟ)'), true);
  assert.equal(awaitsApprovalBy({ ...r, status: 'approved' }, admin, null), false);
  assert.equal(awaitsApprovalBy({ ...r, stage: 0, actor: head.id }, head, head.branch), false);
  assert.equal(awaitsApprovalBy({ ...r, actor: 'staff-1' }, staff, null), false);
});

// ปิดสวิตช์แล้ว (หลังสอบ 19 ต.ค. 2569): กลับเป็นกฎปกติ Admin อนุมัติ/ส่งกลับไม่ได้ (403) และไม่เห็นปุ่มพิจารณา
test('ปิดสวิตช์: Admin อนุมัติไม่ได้ (403) คำขอยังรออยู่ที่ขั้นเดิม · awaitsApprovalBy เป็น false', { skip: ADMIN_APPROVES_ALL && 'สวิตช์ ADMIN_APPROVES_ALL ยังเปิดอยู่' }, async () => {
  const env = environment(admin, staff.id);
  try {
    await assert.rejects(mutate(admin, { action: 'approve', id: 'req-1', version: 1, reason: '' }), (e: any) => e?.status === 403);
    assert.equal(env.request.status, 'pending');
    assert.equal(env.request.stage, 0);
    assert.equal(env.approvals.length, 0);
    assert.equal(env.asset.lifecycle, 'active');
  } finally { env.restore(); }
  assert.equal(awaitsApprovalBy({ status: 'pending', chain: '["head","deputy","dean"]', stage: 1, actor: 'staff-1' }, admin, null), false);
});
