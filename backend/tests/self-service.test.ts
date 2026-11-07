import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { ApiError } from '../services/errors';
import { hashPassword, verifyPassword, type Member } from '../auth/sessions';
import { installMemoryDatabase } from './helpers/memory-db';

// งานที่ผู้ใช้ทำเองได้ (เพิ่ม 7 พ.ย. 2569):
// 1) ผู้ยื่นยกเลิกคำขอของตัวเองได้ระหว่างรออนุมัติทุกขั้น (ผู้ใช้เลือก) ทะเบียนไม่เปลี่ยน
// 2) ทุกบทบาทเปลี่ยนรหัสผ่านของตัวเองได้ ต้องใส่รหัสเดิม แล้วออกจากระบบทุกเครื่อง
// ใช้ฐานข้อมูลจำลองเท่านั้น (installMemoryDatabase โยน error ถ้ามีใครแตะฐานจริง)

const member = (id: string, role: Member['role']): Member => ({
  id,
  email: `${id}@example.test`,
  name: id,
  role,
  branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
  active: 1,
  createdAt: '',
});
const staff = member('staff-1', 'staff');
const otherStaff = member('staff-2', 'staff');
const head = member('head-1', 'head');

const hasError = (status: number, message?: string) => (error: unknown) =>
  error instanceof ApiError && error.status === status && (!message || error.message === message);

function environment(opts: { status?: string; stage?: number; passwordHash?: string } = {}) {
  const request = {
    id: 'req-1',
    assetId: 'asset-1',
    assetVersion: 2,
    kind: 'repair',
    payload: '{}',
    reason: 'จอเสีย',
    stage: opts.stage ?? 1,
    chain: JSON.stringify(['head', 'deputy', 'dean']),
    status: opts.status ?? 'pending',
    version: 3,
    actor: staff.id,
    createdAt: '2026-11-07T00:00:00.000Z',
  };
  const users = new Map<string, Member & { passwordHash?: string }>([
    [staff.id, { ...staff, passwordHash: opts.passwordHash }],
    [otherStaff.id, { ...otherStaff }],
    [head.id, { ...head }],
  ]);
  const audits: { action: string; assetId: string | null }[] = [];
  const operations: { requestHash: string; response: string }[] = [];
  const deletedSessions: unknown[] = [];
  const assetWrites: unknown[] = [];
  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        return u ? { ...u } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.get(where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    session: {
      deleteMany: async (args: unknown) => {
        deletedSessions.push(args);
        return { count: 1 };
      },
    },
    assetRequest: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === request.id ? structuredClone(request) : null,
      update: async ({ data }: { data: { status?: string; version?: { increment: number } } }) => {
        if (data.status) request.status = data.status;
        if (data.version?.increment) request.version += data.version.increment;
        return request;
      },
    },
    asset: {
      update: async (args: unknown) => {
        assetWrites.push(args);
        return {};
      },
    },
    audit: {
      create: async ({ data }: { data: { action: string; assetId: string | null } }) => {
        audits.push(data);
        return data;
      },
    },
    operation: {
      findUnique: async () => null,
      create: async ({ data }: { data: { requestHash: string; response: string } }) => {
        operations.push(data);
        return data;
      },
    },
  };
  const restore = installMemoryDatabase(
    { $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx), user: tx.user },
    { strict: true },
  );
  return { tx, request, users, audits, operations, deletedSessions, assetWrites, restore };
}

test('ผู้ยื่นยกเลิกคำขอของตัวเองได้ แม้หัวหน้าสาขาอนุมัติขั้นที่ 1 ไปแล้ว: สถานะยกเลิก เลขรุ่น 3 → 4 ทะเบียนไม่ถูกแก้', async () => {
  const env = environment({ stage: 1 });
  try {
    const res = await mutate(staff, { action: 'cancelRequest', id: 'req-1', version: 3, reason: 'ยื่นผิดรายการ' });
    assert.equal(res.ok, true);
    assert.equal(env.request.status, 'cancelled');
    assert.equal(env.request.version, 4);
    assert.equal(env.assetWrites.length, 0);
    assert.deepEqual(
      env.audits.map(a => [a.action, a.assetId]),
      [['ยกเลิกคำขอ', 'asset-1']],
    );
  } finally {
    env.restore();
  }
});

test('ยกเลิกคำขอของคนอื่นไม่ได้ (403) ทั้งเจ้าหน้าที่คนอื่นและผู้อนุมัติ และคำขอไม่เปลี่ยน', async () => {
  const env = environment();
  try {
    for (const who of [otherStaff, head])
      await assert.rejects(
        mutate(who, { action: 'cancelRequest', id: 'req-1', version: 3 }),
        hasError(403, 'ยกเลิกได้เฉพาะคำขอที่คุณยื่นเอง'),
      );
    assert.equal(env.request.status, 'pending');
    assert.equal(env.request.version, 3);
    assert.equal(env.audits.length, 0);
  } finally {
    env.restore();
  }
});

test('ยกเลิกคำขอที่อนุมัติแล้ว ไม่อนุมัติแล้ว หรือข้อมูลเก่า (เลขรุ่นไม่ตรง) ไม่ได้ (409)', async () => {
  for (const [status, version] of [
    ['approved', 3],
    ['rejected', 3],
    ['pending', 2],
  ] as const) {
    const env = environment({ status });
    try {
      await assert.rejects(
        mutate(staff, { action: 'cancelRequest', id: 'req-1', version }),
        hasError(409, 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่'),
      );
      assert.equal(env.request.status, status);
      assert.equal(env.audits.length, 0);
    } finally {
      env.restore();
    }
  }
});

test('เปลี่ยนรหัสผ่านของตัวเอง: รหัสเดิมถูก → เก็บรหัสใหม่ ออกจากระบบทุกเครื่อง และไม่มีรหัสจริงในตาราง operations', async () => {
  const oldPassword = 'old-password-1234';
  const newPassword = 'new-password-5678';
  const env = environment({ passwordHash: await hashPassword(oldPassword) });
  try {
    const res = await mutate(staff, { action: 'password', currentPassword: oldPassword, password: newPassword });
    assert.equal(res.ok, true);
    assert.equal(res.signedOut, true);
    const saved = env.users.get(staff.id)!.passwordHash!;
    assert.equal(await verifyPassword(newPassword, saved), true);
    assert.equal(await verifyPassword(oldPassword, saved), false);
    assert.deepEqual(env.deletedSessions, [{ where: { userId: staff.id } }]);
    assert.deepEqual(
      env.audits.map(a => a.action),
      ['เปลี่ยนรหัสผ่านของตนเอง'],
    );
    const stored = JSON.stringify(env.operations);
    assert.ok(!stored.includes(oldPassword) && !stored.includes(newPassword));
  } finally {
    env.restore();
  }
});

test('เปลี่ยนรหัสผ่าน: รหัสเดิมผิด รหัสใหม่สั้นกว่า 12 ตัว หรือซ้ำรหัสเดิม → 400 และรหัสในฐานไม่เปลี่ยน', async () => {
  const oldPassword = 'old-password-1234';
  const env = environment({ passwordHash: await hashPassword(oldPassword) });
  const before = env.users.get(staff.id)!.passwordHash;
  try {
    await assert.rejects(
      mutate(staff, { action: 'password', currentPassword: 'wrong-password-00', password: 'new-password-5678' }),
      hasError(400, 'รหัสผ่านเดิมไม่ถูกต้อง'),
    );
    await assert.rejects(
      mutate(staff, { action: 'password', currentPassword: oldPassword, password: 'short' }),
      hasError(400, 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร'),
    );
    await assert.rejects(
      mutate(staff, { action: 'password', currentPassword: oldPassword, password: oldPassword }),
      hasError(400, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม'),
    );
    assert.equal(env.users.get(staff.id)!.passwordHash, before);
    assert.equal(env.deletedSessions.length, 0);
    assert.equal(env.audits.length, 0);
  } finally {
    env.restore();
  }
});
