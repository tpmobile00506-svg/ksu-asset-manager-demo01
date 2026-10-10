import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { ApiError } from '../services/errors';
import type { Member } from '../auth/sessions';

const staff: Member = { id: 'staff-1', email: 'staff@example.test', name: 'Staff', role: 'staff', branch: null, active: 1, createdAt: '' };
const head: Member = { id: 'head-1', email: 'head@example.test', name: 'Head', role: 'head', branch: null, active: 1, createdAt: '' };

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

function createEnvironment(condition = 'repair') {
  const asset: Record<string, unknown> = {
    id: 'asset-1', code: 'CH-001', name: 'เก้าอี้เลคเชอร์', quantity: 50, unitSatang: 125000, totalSatang: 6250000,
    salvageSatang: 0, branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', location: 'ห้อง 201', condition, lifecycle: 'active', version: 4,
  };
  const repairRecords: Array<Record<string, unknown>> = [];
  const users = new Map<string, Member>([[staff.id, staff], [head.id, head]]);
  const tx = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null },
    asset: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'asset-1' ? { ...asset } : null),
      update: async ({ data }: { data: Record<string, any> }) => {
        const { version, ...rest } = data;
        if (version?.increment) asset.version = (asset.version as number) + version.increment;
        Object.assign(asset, rest);
        return asset;
      },
    },
    assetRequest: {
      // คำขอที่รออนุมัติ: ไม่มี / คำขอซ่อมที่อนุมัติแล้ว: req-9
      findFirst: async ({ where }: { where: { status: string } }) => (where.status === 'approved' ? { id: 'req-9' } : null),
    },
    repairRecord: { create: async ({ data }: { data: Record<string, unknown> }) => { repairRecords.push(data); return data; } },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
  };
  return { tx, asset, repairRecords };
}

const complete = (over: Record<string, unknown> = {}) => ({
  action: 'repairComplete', id: 'asset-1', version: 4, costSatang: 125050, repairedBy: 'ช่างภายในคณะ', reason: 'เปลี่ยนอะไหล่และทดสอบแล้ว', ...over,
});

test('บันทึกซ่อมเสร็จ: สร้างประวัติซ่อมพร้อมผู้ซ่อมและค่าใช้จ่ายจริง แล้วคืนสถานะเป็นปกติ', async () => {
  const { tx, asset, repairRecords } = createEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const res = await mutate(staff, complete());
    assert.equal(res.ok, true);
    assert.equal(repairRecords.length, 1);
    const rec = repairRecords[0];
    assert.equal(rec.assetId, 'asset-1');
    assert.equal(rec.requestId, 'req-9');           // ผูกกับคำขอซ่อมที่อนุมัติแล้ว
    assert.equal(rec.repairedBy, 'ช่างภายในคณะ');
    assert.equal(rec.costSatang, 125050n);          // ฿1,250.50 = 125,050 สตางค์ (1,250 × 100 + 50)
    assert.equal(rec.result, 'เปลี่ยนอะไหล่และทดสอบแล้ว');
    assert.equal(rec.actor, 'staff-1');
    assert.equal(asset.condition, 'normal');
    assert.equal(asset.version, 5);                 // 4 + 1
  } finally { restore(); }
});

test('บันทึกซ่อมเสร็จ: ไม่ระบุผู้ซ่อมถูกปฏิเสธ และไม่สร้างประวัติ', async () => {
  const { tx, asset, repairRecords } = createEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(mutate(staff, complete({ repairedBy: '   ' })), hasStatus(400));
    assert.equal(repairRecords.length, 0);
    assert.equal(asset.condition, 'repair');         // สถานะไม่เปลี่ยน
  } finally { restore(); }
});

test('บันทึกซ่อมเสร็จ: ค่าซ่อมติดลบหรือไม่ใช่จำนวนเต็มถูกปฏิเสธ', async () => {
  const { tx, repairRecords } = createEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(mutate(staff, complete({ costSatang: -1 })), hasStatus(400));
    await assert.rejects(mutate(staff, complete({ costSatang: 10.5 })), hasStatus(400));
    assert.equal(repairRecords.length, 0);
  } finally { restore(); }
});

test('บันทึกซ่อมเสร็จ: รายการที่ไม่ได้อยู่ในสถานะซ่อมถูกปฏิเสธ', async () => {
  const { tx, repairRecords } = createEnvironment('normal');
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(mutate(staff, complete()), hasStatus(400));
    assert.equal(repairRecords.length, 0);
  } finally { restore(); }
});

test('บันทึกซ่อมเสร็จ: บทบาท head ไม่มีสิทธิ์ (403)', async () => {
  const { tx, repairRecords } = createEnvironment();
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(mutate(head, complete()), hasStatus(403));
    assert.equal(repairRecords.length, 0);
  } finally { restore(); }
});
