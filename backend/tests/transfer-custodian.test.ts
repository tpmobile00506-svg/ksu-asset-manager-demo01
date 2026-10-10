import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { assetRequestSchema } from '../validation';
import type { Member } from '../auth/sessions';

const dean: Member = { id: 'dean-1', email: 'dean@example.test', name: 'Dean', role: 'dean', branch: null, active: 1, createdAt: '' };
const staff: Member = { id: 'staff-1', email: 'staff@example.test', name: 'Staff', role: 'staff', branch: null, active: 1, createdAt: '' };

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

// คำขอโอนย้ายที่อยู่ขั้นสุดท้าย (stage 2 ของสาย 3 ระดับ) รอคณบดีอนุมัติ
function createEnvironment(payload: Record<string, unknown>) {
  const asset: Record<string, unknown> = {
    id: 'asset-1', code: 'PC-001', name: 'คอมพิวเตอร์', quantity: 1, unitSatang: 3000000, totalSatang: 3000000, salvageSatang: 0,
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', location: 'ห้อง 101', custodian: 'นายเอ', condition: 'normal', lifecycle: 'active', version: 2,
  };
  const request: Record<string, any> = {
    id: 'req-1', assetId: 'asset-1', assetVersion: 2, kind: 'transfer', payload: JSON.stringify(payload), reason: 'ย้ายห้อง',
    stage: 2, chain: JSON.stringify(['head', 'deputy', 'dean']), status: 'pending', version: 1, actor: 'staff-other', createdAt: '',
  };
  const tx = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === dean.id ? dean : where.id === staff.id ? staff : null) },
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
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === request.id ? structuredClone(request) : null),
      update: async ({ data }: { data: Record<string, any> }) => {
        const { version, ...rest } = data;
        if (version?.increment) request.version += version.increment;
        Object.assign(request, rest);
        return request;
      },
    },
    approval: { create: async ({ data }: { data: unknown }) => data },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
    location: { createMany: async () => ({}) },
    branch: { createMany: async () => ({}) },
  };
  return { tx, asset, request };
}

const approveFinal = { action: 'approve', id: 'req-1', version: 1 };

test('อนุมัติขั้นสุดท้าย: โอนย้ายพร้อมผู้รับผิดชอบใหม่ → สถานที่ สาขา และผู้รับผิดชอบเปลี่ยน', async () => {
  const { tx, asset, request } = createEnvironment({ location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', custodian: 'นางสาวบี' });
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    const res = await mutate(dean, approveFinal);
    assert.equal(res.ok, true);
    assert.equal(request.status, 'approved');
    assert.equal(asset.location, 'ห้อง 202');
    assert.equal(asset.branch, 'วิศวกรรมไฟฟ้า (วฟ)');
    assert.equal(asset.custodian, 'นางสาวบี');
    assert.equal(asset.version, 3);                  // 2 + 1
  } finally { restore(); }
});

test('อนุมัติขั้นสุดท้าย: โอนย้ายที่ไม่ระบุผู้รับผิดชอบ → ผู้รับผิดชอบเดิมไม่เปลี่ยน', async () => {
  const { tx, asset } = createEnvironment({ location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)' });
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await mutate(dean, approveFinal);
    assert.equal(asset.location, 'ห้อง 202');
    assert.equal(asset.custodian, 'นายเอ');
  } finally { restore(); }
});

test('สร้างคำขอโอนย้าย: schema รับ custodian แบบไม่บังคับ และปฏิเสธชื่อยาวเกิน 200 ตัวอักษร', () => {
  const base = { action: 'request', id: 'asset-1', version: 1, kind: 'transfer', reason: 'ย้ายห้อง' };
  const ok = assetRequestSchema.safeParse({ ...base, payload: { location: 'ห้อง 202', branch: 'วค', custodian: ' นางสาวบี ' } });
  assert.equal(ok.success, true);
  if (ok.success && ok.data.kind === 'transfer') assert.equal(ok.data.payload.custodian, 'นางสาวบี'); // trim แล้ว
  const none = assetRequestSchema.safeParse({ ...base, payload: { location: 'ห้อง 202', branch: 'วค' } });
  assert.equal(none.success, true);
  const tooLong = assetRequestSchema.safeParse({ ...base, payload: { location: 'ห้อง 202', branch: 'วค', custodian: 'ก'.repeat(201) } });
  assert.equal(tooLong.success, false);
});

test('บทบาท staff อนุมัติขั้นสุดท้ายไม่ได้ (403) และทะเบียนไม่เปลี่ยน', async () => {
  const { tx, asset } = createEnvironment({ location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', custodian: 'นางสาวบี' });
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await assert.rejects(mutate(staff, approveFinal), (e: any) => e?.status === 403);
    assert.equal(asset.custodian, 'นายเอ');
  } finally { restore(); }
});

// ---------- ชื่อสาขาปลายทางต้องถูกแปลงเป็นชื่อมาตรฐานก่อนเขียนลงทะเบียน ----------
test('อนุมัติโอนย้าย: สาขาปลายทางที่พิมพ์แบบย่อ ("วิศวกรรมไฟฟ้า") ถูกแปลงเป็นชื่อมาตรฐานก่อนบันทึก', async () => {
  const { tx, asset } = createEnvironment({ location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า' });
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await mutate(dean, approveFinal);
    assert.equal(asset.branch, 'วิศวกรรมไฟฟ้า (วฟ)');
  } finally { restore(); }
});

test('สร้างคำขอโอนย้าย: payload ที่เก็บในคำขอใช้ชื่อสาขามาตรฐานแล้ว', async () => {
  const stored: Array<Record<string, any>> = [];
  const asset = { id: 'asset-1', code: 'PC-001', name: 'คอมพิวเตอร์', quantity: 1, unitSatang: 3000000, totalSatang: 3000000, salvageSatang: 0,
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', location: 'ห้อง 101', custodian: '', condition: 'normal', lifecycle: 'active', version: 2 };
  const tx = {
    user: { findUnique: async () => staff },
    asset: { findUnique: async () => ({ ...asset }), update: async () => asset },
    assetRequest: { findFirst: async () => null, create: async ({ data }: { data: Record<string, any> }) => { stored.push(data); return { id: 'req-new', ...data }; } },
    setting: { findUnique: async () => null },
    operation: { findUnique: async () => null, create: async () => ({}) },
    audit: { create: async () => ({}) },
  };
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try {
    await mutate(staff, { action: 'request', id: 'asset-1', version: 2, kind: 'transfer', reason: 'ย้ายห้อง', payload: { location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า' } });
    assert.equal(stored.length, 1);
    assert.equal(JSON.parse(stored[0].payload).branch, 'วิศวกรรมไฟฟ้า (วฟ)');
  } finally { restore(); }
});
