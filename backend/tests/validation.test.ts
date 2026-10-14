import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginSchema,
  userMutationSchema,
  assetRequestSchema,
  approvalMutationSchema,
  workflowMutationSchema,
  validate
} from '../validation';
import { ApiError } from '../services/errors';

test('loginSchema validates credentials correctly', () => {
  // Valid credentials
  const valid = loginSchema.safeParse({ email: 'admin@ksu.ac.th', password: 'password12345' });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.email, 'admin@ksu.ac.th');
    assert.equal(valid.data.password, 'password12345');
  }

  // Invalid email format
  const badEmail = loginSchema.safeParse({ email: 'not-an-email', password: 'password12345' });
  assert.equal(badEmail.success, false);

  // Missing password
  const emptyPass = loginSchema.safeParse({ email: 'admin@ksu.ac.th', password: '' });
  assert.equal(emptyPass.success, false);

  // Password exceeds 128 chars
  const longPass = loginSchema.safeParse({ email: 'admin@ksu.ac.th', password: 'a'.repeat(129) });
  assert.equal(longPass.success, false);
});

test('userMutationSchema validates role, branch, and active status', () => {
  // Valid user with standard branch
  const valid = validate(userMutationSchema, {
    action: 'user',
    name: 'ทดสอบ อาจารย์',
    email: 'test@ksu.ac.th',
    role: 'head',
    branch: 'วิศวกรรมคอมพิวเตอร์',
    active: true,
  });
  assert.equal(valid.name, 'ทดสอบ อาจารย์');
  assert.equal(valid.email, 'test@ksu.ac.th');
  assert.equal(valid.role, 'head');
  assert.equal(valid.branch, 'วิศวกรรมคอมพิวเตอร์ (วค)'); // normalized
  assert.equal(valid.active, 1);

  // active as boolean false maps to 0
  const inactiveUser = validate(userMutationSchema, {
    action: 'user',
    name: 'ผู้ใช้ ระงับ',
    email: 'inactive@ksu.ac.th',
    role: 'staff',
    active: false,
  });
  assert.equal(inactiveUser.active, 0);
  assert.equal(inactiveUser.branch, undefined);

  // explicit null branch maps to null
  const nullBranchUser = validate(userMutationSchema, {
    action: 'user',
    name: 'ผู้ใช้ ไม่มีสาขา',
    email: 'nobranch@ksu.ac.th',
    role: 'staff',
    branch: null,
  });
  assert.equal(nullBranchUser.branch, null);

  // active as number 1 and 0
  const activeNum = validate(userMutationSchema, {
    action: 'user',
    name: 'ผู้ใช้',
    email: 'user@ksu.ac.th',
    role: 'staff',
    active: 0,
  });
  assert.equal(activeNum.active, 0);

  // Invalid role
  assert.throws(
    () => validate(userMutationSchema, {
      action: 'user',
      name: 'ผู้ใช้',
      email: 'user@ksu.ac.th',
      role: 'superadmin',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง'
  );

  // Invalid branch not in standard list
  assert.throws(
    () => validate(userMutationSchema, {
      action: 'user',
      name: 'ผู้ใช้',
      email: 'user@ksu.ac.th',
      role: 'head',
      branch: 'สาขาที่ไม่มีอยู่จริงในคณะ',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน'
  );

  // Password too short (< 12 chars)
  assert.throws(
    () => validate(userMutationSchema, {
      action: 'user',
      name: 'ผู้ใช้',
      email: 'user@ksu.ac.th',
      role: 'staff',
      password: 'short',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร'
  );
});

test('assetRequestSchema enforces discriminated union on kind', () => {
  // Valid transfer request
  const validTransfer = validate(assetRequestSchema, {
    action: 'request',
    id: 'asset-1',
    version: 1,
    kind: 'transfer',
    payload: {
      location: 'ห้องปฏิบัติการคอมพิวเตอร์ 1',
      branch: 'วิศวกรรมคอมพิวเตอร์',
    },
    reason: 'ย้ายสถานที่ใช้งาน',
  });
  assert.equal(validTransfer.kind, 'transfer');
  assert.equal(validTransfer.payload.location, 'ห้องปฏิบัติการคอมพิวเตอร์ 1');

  // Transfer missing location/branch
  assert.throws(
    () => validate(assetRequestSchema, {
      action: 'request',
      id: 'asset-1',
      version: 1,
      kind: 'transfer',
      payload: { location: '', branch: '' },
      reason: 'ย้าย',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'ระบุสถานที่และสาขาปลายทาง'
  );

  // Valid repair request
  const validRepair = validate(assetRequestSchema, {
    action: 'request',
    id: 'asset-1',
    version: 1,
    kind: 'repair',
    payload: { estimateSatang: 250000 },
    reason: 'พัดลมระบายความร้อนเสีย',
  });
  assert.equal(validRepair.kind, 'repair');
  assert.equal(validRepair.payload.estimateSatang, 250000);

  // Repair without payload defaults estimateSatang to 0
  const defaultRepair = validate(assetRequestSchema, {
    action: 'request',
    id: 'asset-1',
    version: 1,
    kind: 'repair',
    reason: 'พัดลมระบายความร้อนเสีย',
  });
  assert.equal(defaultRepair.kind, 'repair');
  assert.equal(defaultRepair.payload.estimateSatang, 0);

  // Repair with negative estimateSatang
  assert.throws(
    () => validate(assetRequestSchema, {
      action: 'request',
      id: 'asset-1',
      version: 1,
      kind: 'repair',
      payload: { estimateSatang: -100 },
      reason: 'ซ่อม',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'ประมาณการค่าซ่อมไม่ถูกต้อง'
  );

  // Repair with estimateSatang exceeding 100,000,000,000,000
  assert.throws(
    () => validate(assetRequestSchema, {
      action: 'request',
      id: 'asset-1',
      version: 1,
      kind: 'repair',
      payload: { estimateSatang: 100_000_000_000_001 },
      reason: 'ซ่อม',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'ประมาณการค่าซ่อมไม่ถูกต้อง'
  );

  // Valid disposal request
  const validDisposal = validate(assetRequestSchema, {
    action: 'request',
    id: 'asset-1',
    version: 1,
    kind: 'disposal',
    reason: 'ชำรุดทรุดโทรมไม่คุ้มค่าซ่อม',
  });
  assert.equal(validDisposal.kind, 'disposal');

  // Invalid kind
  assert.throws(
    () => validate(assetRequestSchema, {
      action: 'request',
      id: 'asset-1',
      version: 1,
      kind: 'unknown_kind',
      reason: 'ทดสอบ',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'ระบุประเภทและเหตุผลของคำขอ'
  );

  // Missing reason
  assert.throws(
    () => validate(assetRequestSchema, {
      action: 'request',
      id: 'asset-1',
      version: 1,
      kind: 'repair',
      reason: '',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'ระบุประเภทและเหตุผลของคำขอ'
  );

  // Invalid splitQuantity (0 or non-integer)
  assert.throws(
    () => validate(assetRequestSchema, {
      action: 'request',
      id: 'asset-1',
      version: 1,
      kind: 'repair',
      splitQuantity: 0,
      reason: 'ทดสอบ',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'จำนวนที่แบ่งต้องเป็นจำนวนเต็ม'
  );
});

test('approvalMutationSchema validates approve and reject', () => {
  // Valid approve without reason
  const validApprove = validate(approvalMutationSchema, {
    action: 'approve',
    id: 'req-1',
    version: 1,
  });
  assert.equal(validApprove.action, 'approve');
  assert.equal(validApprove.id, 'req-1');

  // Valid reject with reason
  const validReject = validate(approvalMutationSchema, {
    action: 'reject',
    id: 'req-1',
    version: 1,
    reason: 'เอกสารแนบไม่ครบถ้วน',
  });
  assert.equal(validReject.action, 'reject');
  assert.equal(validReject.reason, 'เอกสารแนบไม่ครบถ้วน');

  // Reject without reason
  assert.throws(
    () => validate(approvalMutationSchema, {
      action: 'reject',
      id: 'req-1',
      version: 1,
      reason: '',
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'กรุณาระบุเหตุผลส่งกลับ'
  );
});

test('workflowMutationSchema validates approval chain', () => {
  // Valid chain
  const valid = validate(workflowMutationSchema, {
    action: 'workflow',
    chain: ['head', 'deputy', 'dean'],
  });
  assert.deepEqual(valid.chain, ['head', 'deputy', 'dean']);

  // Invalid chain with unknown role
  assert.throws(
    () => validate(workflowMutationSchema, {
      action: 'workflow',
      chain: ['head', 'unknown'],
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'สายอนุมัติไม่ถูกต้อง'
  );

  // Duplicate roles in chain
  assert.throws(
    () => validate(workflowMutationSchema, {
      action: 'workflow',
      chain: ['head', 'head'],
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'สายอนุมัติไม่ถูกต้อง'
  );

  // Empty chain
  assert.throws(
    () => validate(workflowMutationSchema, {
      action: 'workflow',
      chain: [],
    }),
    (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === 'สายอนุมัติไม่ถูกต้อง'
  );
});

test('checkOrigin: รับเฉพาะต้นทางของเว็บนี้ ไม่รับเว็บอื่นบน vercel.app', async () => {
  const { checkOrigin } = await import('../auth/sessions');
  const req = (origin: string, host: string) => new Request('http://x/api/auth/login', { method: 'POST', headers: { origin, host } });
  assert.doesNotThrow(() => checkOrigin(req('https://ksu-asset-manager-demo01.vercel.app', 'ksu-asset-manager-demo01.vercel.app')));
  assert.throws(() => checkOrigin(req('https://attacker-site.vercel.app', 'ksu-asset-manager-demo01.vercel.app')), /ต้นทางคำขอไม่ถูกต้อง/);
  assert.throws(() => checkOrigin(req('https://evil.example.com', 'localhost:3000')), /ต้นทางคำขอไม่ถูกต้อง/);
});
