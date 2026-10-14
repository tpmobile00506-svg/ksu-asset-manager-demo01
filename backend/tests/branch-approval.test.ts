import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { ApiError } from '../services/errors';
import type { Member } from '../auth/sessions';

const branchCom = 'วิศวกรรมคอมพิวเตอร์ (วค)';
const branchElec = 'วิศวกรรมไฟฟ้า (วฟ)';

const adminUser: Member = { id: 'admin-1', email: 'admin@example.test', name: 'Admin', role: 'admin', branch: null, active: 1, createdAt: '' };
const headCom: Member = { id: 'head-com', email: 'headcom@example.test', name: 'Head Com', role: 'head', branch: branchCom, active: 1, createdAt: '' };
const headElec: Member = { id: 'head-elec', email: 'headelec@example.test', name: 'Head Elec', role: 'head', branch: branchElec, active: 1, createdAt: '' };
const headNullBranch: Member = { id: 'head-null', email: 'headnull@example.test', name: 'Head Null', role: 'head', branch: null, active: 1, createdAt: '' };
const deputyUser: Member = { id: 'deputy-1', email: 'deputy@example.test', name: 'Deputy', role: 'deputy', branch: null, active: 1, createdAt: '' };
const deanUser: Member = { id: 'dean-1', email: 'dean@example.test', name: 'Dean', role: 'dean', branch: null, active: 1, createdAt: '' };
const staffUser: Member = { id: 'staff-1', email: 'staff@example.test', name: 'Staff', role: 'staff', branch: branchCom, active: 1, createdAt: '' };

const hasStatus = (status: number) => (error: unknown) => error instanceof ApiError && error.status === status;

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

function createMockEnvironment(overrides?: { requestStage?: number; requestKind?: string }) {
  const asset = {
    id: 'asset-1',
    code: 'COM-001',
    name: 'เครื่องคอมพิวเตอร์',
    branch: branchCom,
    location: 'ห้องปฏิบัติการคอมพิวเตอร์',
    version: 1,
    lifecycle: 'active',
  };

  const request = {
    id: 'req-1',
    assetId: 'asset-1',
    assetVersion: 1,
    kind: overrides?.requestKind ?? 'transfer',
    payload: JSON.stringify({ location: 'อาคารเรียนรวม', branch: branchElec }),
    reason: 'ขอโอนย้ายไปสาขาไฟฟ้า',
    stage: overrides?.requestStage ?? 0,
    chain: JSON.stringify(['head', 'deputy', 'dean']),
    status: 'pending',
    version: 1,
    actor: 'staff-other',
    createdAt: new Date().toISOString(),
  };

  const usersMap = new Map<string, Member>([
    [adminUser.id, adminUser],
    [headCom.id, headCom],
    [headElec.id, headElec],
    [headNullBranch.id, headNullBranch],
    [deputyUser.id, deputyUser],
    [deanUser.id, deanUser],
    [staffUser.id, staffUser],
  ]);

  const approvals: any[] = [];
  const invitesMap = new Map<string, any>();

  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return usersMap.get(where.id) ?? null;
        if (where.email) return [...usersMap.values()].find(u => u.email === where.email) ?? null;
        return null;
      },
      create: async ({ data }: { data: any }) => {
        usersMap.set(data.id, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const existing = usersMap.get(where.id);
        const updated = { ...existing, ...data };
        usersMap.set(where.id, updated);
        return updated;
      },
      session: { deleteMany: async () => ({}) },
    },
    session: { deleteMany: async () => ({}) },
    invite: {
      findUnique: async ({ where }: { where: { email: string } }) => invitesMap.get(where.email) ?? null,
      upsert: async ({ where, create, update }: { where: { email: string }; create: any; update: any }) => {
        const existing = invitesMap.get(where.email);
        const saved = existing ? { ...existing, ...update } : { ...create };
        invitesMap.set(where.email, saved);
        return saved;
      },
    },
    asset: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === asset.id ? asset : null),
      update: async ({ data }: { data: any }) => Object.assign(asset, data),
    },
    assetRequest: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === request.id ? structuredClone(request) : null),
      update: async ({ data }: { data: any }) => {
        const { version, ...rest } = data;
        if (version?.increment) request.version += version.increment;
        else if (typeof version === 'number') request.version = version;
        Object.assign(request, rest);
        return request;
      },
    },
    approval: {
      create: async ({ data }: { data: any }) => {
        approvals.push(data);
        return data;
      },
    },
    operation: {
      findUnique: async () => null,
      create: async () => ({}),
    },
    audit: {
      create: async () => ({}),
    },
    location: {
      createMany: async () => ({}),
    },
    branch: {
      createMany: async () => ({}),
    },
  };

  return { tx, asset, request, approvals, usersMap, invitesMap };
}

test('head สาขาเดียวกัน สามารถอนุมัติคำขอได้สำเร็จ', async () => {
  const { tx, request } = createMockEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const res = await mutate(headCom, {
      action: 'approve',
      id: request.id,
      version: request.version,
    });
    assert.equal(res.ok, true);
    assert.equal(request.stage, 1);
  } finally {
    restore();
  }
});

test('head สาขาเดียวกัน สามารถปฏิเสธ (reject) คำขอได้สำเร็จ', async () => {
  const { tx, request } = createMockEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const res = await mutate(headCom, {
      action: 'reject',
      id: request.id,
      version: request.version,
      reason: 'ไม่อนุมัติเนื่องจากยังจำเป็นต้องใช้งาน',
    });
    assert.equal(res.ok, true);
    assert.equal(request.status, 'rejected');
  } finally {
    restore();
  }
});

test('head คนละสาขา ถูกปฏิเสธ (403) ทั้ง approve และ reject', async () => {
  const { tx, request } = createMockEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    // คนละสาขา พยายาม approve
    await assert.rejects(
      mutate(headElec, {
        action: 'approve',
        id: request.id,
        version: request.version,
      }),
      hasStatus(403)
    );

    // คนละสาขา พยายาม reject
    await assert.rejects(
      mutate(headElec, {
        action: 'reject',
        id: request.id,
        version: request.version,
        reason: 'ปฏิเสธข้ามสาขา',
      }),
      hasStatus(403)
    );
  } finally {
    restore();
  }
});

test('head ที่ branch เป็น null ถูกปฏิเสธ (403) ทั้ง approve และ reject', async () => {
  const { tx, request } = createMockEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(
      mutate(headNullBranch, {
        action: 'approve',
        id: request.id,
        version: request.version,
      }),
      hasStatus(403)
    );

    await assert.rejects(
      mutate(headNullBranch, {
        action: 'reject',
        id: request.id,
        version: request.version,
        reason: 'ไม่มีสังกัดสาขา',
      }),
      hasStatus(403)
    );
  } finally {
    restore();
  }
});

test('บทบาทที่ไม่มีสิทธิ์ใน stage นั้น ถูกปฏิเสธ (403)', async () => {
  const { tx, request } = createMockEnvironment({ requestStage: 0 }); // stage 0 คือ head
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    // staff ไม่มีสิทธิ์อนุมัติ
    await assert.rejects(
      mutate(staffUser, {
        action: 'approve',
        id: request.id,
        version: request.version,
      }),
      hasStatus(403)
    );

    // deputy พยายามอนุมัติใน stage 0 ของ head
    await assert.rejects(
      mutate(deputyUser, {
        action: 'approve',
        id: request.id,
        version: request.version,
      }),
      hasStatus(403)
    );
  } finally {
    restore();
  }
});

test('deputy และ dean ข้ามเงื่อนไขสาขาได้สำเร็จ (อนุมัติได้ทุกสาขา)', async () => {
  const { tx, request } = createMockEnvironment({ requestStage: 1 }); // stage 1 คือ deputy
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    // deputy อนุมัติผ่านแม้ branch เป็น null
    const resDeputy = await mutate(deputyUser, {
      action: 'approve',
      id: request.id,
      version: request.version,
    });
    assert.equal(resDeputy.ok, true);
    assert.equal(request.stage, 2);

    // dean อนุมัติขั้นสุดท้ายผ่าน (stage 2)
    const resDean = await mutate(deanUser, {
      action: 'approve',
      id: request.id,
      version: request.version,
    });
    assert.equal(resDean.ok, true);
    assert.equal(request.status, 'approved');
  } finally {
    restore();
  }
});

test('คำขอโอนย้ายตรวจที่สาขาต้นทาง (asset.branch) เสมอ ไม่ใช่สาขาปลายทางใน payload', async () => {
  // request ย้ายจาก COM -> ELEC
  // ดังนั้น headCom (ต้นทาง) อนุมัติได้ แต่ headElec (ปลายทาง) อนุมัติ stage 0 ไม่ได้
  const { tx, request } = createMockEnvironment({ requestKind: 'transfer' });
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    // head ปลายทาง (headElec) ไม่สามารถอนุมัติการปล่อยของจากสาขาต้นทางได้
    await assert.rejects(
      mutate(headElec, {
        action: 'approve',
        id: request.id,
        version: request.version,
      }),
      hasStatus(403)
    );

    // head ต้นทาง (headCom) อนุมัติได้
    const res = await mutate(headCom, {
      action: 'approve',
      id: request.id,
      version: request.version,
    });
    assert.equal(res.ok, true);
  } finally {
    restore();
  }
});

test('เมื่อ invite มีการกำหนด branch ไว้ ตอนสร้าง user ค่า branch ถูกคัดลอกไปด้วย', async () => {
  const { tx, invitesMap, usersMap } = createMockEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const inviteEmail = 'newhead@ksu.ac.th';
    invitesMap.set(inviteEmail, {
      email: inviteEmail,
      name: 'อาจารย์หัวหน้าใหม่',
      role: 'head',
      branch: branchCom,
      active: 1,
    });

    // Admin สร้างบัญชีผู้ใช้โดยใช้ email ที่มี invite เดิมอยู่ โดยไม่ได้ส่ง branch มาซ้ำ
    await mutate(adminUser, {
      action: 'user',
      email: inviteEmail,
      name: 'อาจารย์หัวหน้าใหม่',
      role: 'head',
      password: 'StrongPassword2026!',
    });

    const createdUser = [...usersMap.values()].find(u => u.email === inviteEmail);
    assert.ok(createdUser);
    assert.equal(createdUser.branch, branchCom);
  } finally {
    restore();
  }
});

test('สร้างหรือแก้บัญชีหัวหน้าสาขาโดยไม่มีสาขา ถูกปฏิเสธ (หัวหน้าที่ไม่มีสาขาอนุมัติอะไรไม่ได้)', async () => {
  const { tx, usersMap } = createMockEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const before = usersMap.size;
    await assert.rejects(mutate(adminUser, {
      action: 'user', email: 'nobranch-head@ksu.ac.th', name: 'หัวหน้าไม่มีสาขา', role: 'head', password: 'StrongPassword2026!',
    }), /หัวหน้าสาขาต้องระบุสาขา/);
    assert.equal(usersMap.size, before);
  } finally {
    restore();
  }
});

test('awaitsApprovalBy: กระดิ่งและหน้าคำขอนับคำขอที่รอผู้ใช้คนนี้ตรงกัน', async () => {
  const { awaitsApprovalBy } = await import('../contracts/domain');
  const req = { status: 'pending', chain: '["head","deputy","dean"]', stage: 0, actor: 'staff-1' };
  const headVk = { id: 'h1', role: 'head', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)' };
  assert.equal(awaitsApprovalBy(req, headVk, 'วค'), true);                                   // สาขาเดียวกัน (ชื่อย่อ)
  assert.equal(awaitsApprovalBy(req, { ...headVk, branch: null }, 'วค'), false);            // หัวหน้าไม่มีสาขา
  assert.equal(awaitsApprovalBy(req, headVk, 'วิศวกรรมไฟฟ้า (วฟ)'), false);                 // คนละสาขา
  assert.equal(awaitsApprovalBy(req, { id: 'd1', role: 'deputy' }, 'วค'), false);          // ยังไม่ถึงขั้นรองคณบดี
  assert.equal(awaitsApprovalBy({ ...req, stage: 1 }, { id: 'd1', role: 'deputy' }, 'วค'), true);
  assert.equal(awaitsApprovalBy({ ...req, actor: 'h1' }, headVk, 'วค'), false);             // คำขอของตัวเอง
  assert.equal(awaitsApprovalBy({ ...req, status: 'approved' }, headVk, 'วค'), false);
});
