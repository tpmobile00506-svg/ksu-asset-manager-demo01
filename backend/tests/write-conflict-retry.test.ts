import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { isWriteConflict, writeConflictDelay } from '../db/client';
import { fail } from '../routes/data';
import type { Member } from '../auth/sessions';

// Serializable ยกเลิก transaction ที่ชนกัน: ระบบต้องลองใหม่เอง ไม่ใช่ตอบ 500 (บั๊กจากการทดสอบโหลด 18 ต.ค. 2569)

const admin: Member = {
  id: 'admin-1',
  email: 'admin@example.test',
  name: 'ผู้ดูแลระบบ',
  role: 'admin',
  branch: null,
  active: 1,
  createdAt: '',
};

// รูปแบบ error ที่ Prisma 7 + @prisma/adapter-pg โยนออกมาจริงเมื่อ COMMIT ชน (Postgres 40001)
function adapterConflict(originalCode = '40001') {
  const error = new Error('TransactionWriteConflict') as Error & { cause: unknown };
  error.name = 'DriverAdapterError';
  error.cause = { kind: 'TransactionWriteConflict', originalCode };
  return error;
}

test('isWriteConflict: รู้จักทั้ง P2034 และ DriverAdapterError (40001 / 40P01)', () => {
  assert.equal(isWriteConflict(Object.assign(new Error('x'), { code: 'P2034' })), true);
  assert.equal(isWriteConflict(adapterConflict('40001')), true);
  assert.equal(isWriteConflict(adapterConflict('40P01')), true);
  assert.equal(isWriteConflict({ cause: { originalCode: '40001' } }), true);
  assert.equal(isWriteConflict(Object.assign(new Error('x'), { code: 'P2002' })), false);
  assert.equal(isWriteConflict({ cause: { kind: 'UniqueConstraintViolation', originalCode: '23505' } }), false);
  assert.equal(isWriteConflict(new Error('อื่น ๆ')), false);
  assert.equal(isWriteConflict(null), false);
  assert.equal(isWriteConflict('P2034'), false);
});

test('writeConflictDelay: สุ่มระหว่าง 0 ถึงเพดานที่โตขึ้นทีละเท่า และไม่เกิน 1 วินาที', () => {
  // เพดาน = min(1000, 50 × 2^attempt): รอบ 1 = 100, รอบ 2 = 200, รอบ 3 = 400, รอบ 4 = 800, รอบ 5 ขึ้นไป = 1000
  assert.equal(
    writeConflictDelay(1, () => 0),
    0,
  );
  assert.equal(
    writeConflictDelay(1, () => 0.5),
    50,
  );
  assert.equal(
    writeConflictDelay(2, () => 0.5),
    100,
  );
  assert.equal(
    writeConflictDelay(4, () => 0.999),
    799,
  );
  assert.equal(
    writeConflictDelay(9, () => 0.999),
    999,
  );
});

function installClient(failures: unknown[]) {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  const saved: unknown[] = [];
  let calls = 0;
  const tx = {
    user: { findUnique: async () => ({ ...admin }) },
    operation: { findUnique: async () => null, create: async () => ({}) },
    setting: {
      upsert: async ({ create }: { create: unknown }) => {
        saved.push(create);
        return create;
      },
    },
    audit: { create: async () => ({}) },
  };
  cache.assetPool = new Proxy(
    {},
    {
      get() {
        throw new Error('Real database access is forbidden in this test');
      },
    },
  );
  cache.assetPrisma = {
    operation: { findUnique: async () => null },
    $transaction: async (cb: (t: typeof tx) => unknown) => {
      calls++;
      const result = await cb(tx);
      // จำลองว่า COMMIT ชนกับคนอื่น: งานในรอบนั้นถูกย้อนกลับทั้งหมด
      if (failures.length) {
        saved.pop();
        throw failures.shift();
      }
      return result;
    },
  };
  return {
    saved,
    calls: () => calls,
    restore() {
      if (previous.pool === undefined) delete cache.assetPool;
      else cache.assetPool = previous.pool;
      if (previous.client === undefined) delete cache.assetPrisma;
      else cache.assetPrisma = previous.client;
    },
  };
}

test('mutate: COMMIT ชน (DriverAdapterError 40001) 2 ครั้ง → ลองใหม่เองจนสำเร็จในรอบที่ 3', async () => {
  const env = installClient([adapterConflict(), adapterConflict()]);
  try {
    const result = await mutate(admin, { action: 'workflow', chain: ['head', 'deputy', 'dean'] });
    assert.deepEqual(result, { ok: true });
    assert.equal(env.calls(), 3);
    assert.equal(env.saved.length, 1);
  } finally {
    env.restore();
  }
});

test('mutate: ชนติดกันครบ 5 รอบ → หยุดลอง และ fail() ตอบ 409 พร้อมข้อความให้ลองใหม่ (ไม่ใช่ 500)', async () => {
  const env = installClient([1, 2, 3, 4, 5].map(() => adapterConflict()));
  try {
    const error = await mutate(admin, { action: 'workflow', chain: ['head'] }).then(
      () => assert.fail('ต้องล้ม'),
      (e: unknown) => e,
    );
    assert.equal(env.calls(), 5);
    assert.equal(env.saved.length, 0);
    const response = fail(error);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'มีผู้ใช้อื่นบันทึกข้อมูลพร้อมกัน กรุณาลองใหม่อีกครั้ง' });
  } finally {
    env.restore();
  }
});

test('mutate: แถวซ้ำระหว่างทำพร้อมกัน (P2002 เช่น ลงนามขั้นเดียวกันพร้อมกัน) → ลองใหม่เหมือนการชนกัน', async () => {
  const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const env = installClient([duplicate]);
  try {
    const result = await mutate(admin, { action: 'workflow', chain: ['head', 'deputy', 'dean'] });
    assert.deepEqual(result, { ok: true });
    // รอบแรกชน (ย้อนกลับ) · รอบที่ 2 สำเร็จ บันทึก 1 ครั้ง
    assert.equal(env.calls(), 2);
    assert.equal(env.saved.length, 1);
  } finally {
    env.restore();
  }
});

test('mutate: error อื่นที่ไม่ใช่การชน → ไม่ลองใหม่', async () => {
  const env = installClient([new Error('อื่น ๆ')]);
  try {
    await assert.rejects(mutate(admin, { action: 'workflow', chain: ['head'] }), /อื่น ๆ/);
    assert.equal(env.calls(), 1);
  } finally {
    env.restore();
  }
});
