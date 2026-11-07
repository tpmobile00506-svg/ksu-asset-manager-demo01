import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { awaitsApprovalBy } from '../contracts/domain';
import { userMutationSchema } from '../validation';
import type { Member } from '../auth/sessions';
import { installMemoryDatabase } from './helpers/memory-db';

// ยกเลิกบทบาทผู้ทดสอบระบบ (tester) แล้ว (ผู้ใช้สั่ง 7 พ.ย. 2569) ห้ามมีทางอนุมัติข้ามขั้นเหลืออยู่
// ถ้ามีบัญชีบทบาทนี้ค้างในฐานข้อมูล ต้องไม่มีสิทธิ์พิเศษใดๆ
const legacyTester: Member = {
  id: 'tester-1',
  email: 'tester@example.test',
  name: 'ผู้ทดสอบ',
  role: 'tester',
  branch: null,
  active: 1,
  createdAt: '',
};
const head: Member = {
  id: 'head-1',
  email: 'head@example.test',
  name: 'หัวหน้า',
  role: 'head',
  branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
  active: 1,
  createdAt: '',
};
const CHAIN = JSON.stringify(['head', 'deputy', 'dean']);

// คำขอโอนย้ายของสาขา วค ที่ขั้น stage (0 = รอหัวหน้าสาขา)
function environment(stage: number, actor = 'staff-1', members: Member[] = [legacyTester, head]) {
  const asset: Record<string, any> = {
    id: 'asset-1',
    code: 'PC-001',
    name: 'คอมพิวเตอร์',
    quantity: 1,
    unitSatang: 3000000,
    totalSatang: 3000000,
    salvageSatang: 0,
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
    location: 'ห้อง 101',
    custodian: 'นายเอ',
    condition: 'normal',
    lifecycle: 'active',
    version: 2,
  };
  const request: Record<string, any> = {
    id: 'req-1',
    assetId: 'asset-1',
    assetVersion: 2,
    kind: 'transfer',
    reason: 'ย้ายห้อง',
    stage,
    chain: CHAIN,
    status: 'pending',
    version: 1,
    actor,
    createdAt: '',
    payload: JSON.stringify({
      location: 'ห้อง 202',
      branch: 'วิศวกรรมไฟฟ้า (วฟ)',
      from: { location: 'ห้อง 101', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', custodian: 'นายเอ' },
    }),
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
    approval: {
      create: async ({ data }: { data: Record<string, any> }) => {
        approvals.push(data);
        return data;
      },
    },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
    location: { createMany: async () => ({}) },
    branch: { createMany: async () => ({}) },
  };
  const restore = installMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  return { asset, request, approvals, restore };
}

test('บทบาท tester ที่ค้างในฐานข้อมูลอนุมัติไม่ได้ (403) คำขอและทะเบียนไม่เปลี่ยน', async () => {
  const env = environment(0);
  try {
    await assert.rejects(
      mutate(legacyTester, { action: 'approve', id: 'req-1', version: 1, reason: 'ทดลอง' }),
      (e: any) => e?.status === 403,
    );
    assert.equal(env.approvals.length, 0);
    assert.equal(env.request.status, 'pending');
    assert.equal(env.request.stage, 0);
    assert.equal(env.asset.location, 'ห้อง 101');
  } finally {
    env.restore();
  }
});

test('บทบาท tester ที่ค้างในฐานข้อมูลไม่อนุมัติคำขอไม่ได้เช่นกัน (403)', async () => {
  const env = environment(0);
  try {
    await assert.rejects(
      mutate(legacyTester, { action: 'reject', id: 'req-1', version: 1, reason: 'ทดลอง' }),
      (e: any) => e?.status === 403,
    );
    assert.equal(env.approvals.length, 0);
    assert.equal(env.request.status, 'pending');
  } finally {
    env.restore();
  }
});

test('หัวหน้าสาขาอนุมัติขั้น 1 → ลงนาม 1 ขั้น คำขอยังรอขั้น 2', async () => {
  const env = environment(0);
  try {
    await mutate(head, { action: 'approve', id: 'req-1', version: 1, reason: 'เห็นควร' });
    assert.deepEqual(
      env.approvals.map(a => [a.stage, a.note]),
      [[0, 'เห็นควร']],
    );
    assert.equal(env.request.stage, 1);
    assert.equal(env.request.status, 'pending');
    assert.equal(env.asset.location, 'ห้อง 101');
  } finally {
    env.restore();
  }
});

test('awaitsApprovalBy: บทบาท tester ไม่เห็นปุ่มอนุมัติ และหัวหน้าต่างสาขายังเห็นไม่ได้', () => {
  const r = { status: 'pending', chain: CHAIN, stage: 0, actor: 'staff-1' };
  assert.equal(awaitsApprovalBy(r, legacyTester, 'วิศวกรรมคอมพิวเตอร์ (วค)'), false);
  assert.equal(awaitsApprovalBy({ ...r, stage: 2 }, legacyTester, 'วิศวกรรมคอมพิวเตอร์ (วค)'), false);
  assert.equal(awaitsApprovalBy(r, head, 'วิศวกรรมไฟฟ้า (วฟ)'), false);
  assert.equal(awaitsApprovalBy(r, head, 'วิศวกรรมคอมพิวเตอร์ (วค)'), true);
});

test('สร้างบัญชีบทบาท tester ไม่ได้แล้ว', () => {
  const parsed = userMutationSchema.safeParse({
    action: 'user',
    name: 'ผู้ทดสอบ',
    email: 'tester@example.test',
    role: 'tester',
  });
  assert.equal(parsed.success, false);
});
