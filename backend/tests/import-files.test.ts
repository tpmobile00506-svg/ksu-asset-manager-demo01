import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';

const staff: Member = { id: 'staff-a', email: 'a@example.test', name: 'A', role: 'staff', active: 1, createdAt: '' };
const dean: Member = { ...staff, id: 'dean-a', role: 'dean' };

function useMemoryDatabase(client: object) {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  cache.assetPool = new Proxy({}, { get() { throw new Error('Real database access is forbidden in this test'); } });
  cache.assetPrisma = new Proxy(client, {
    get(target, property) {
      if (!(property in target)) throw new Error(`Unexpected database method: ${String(property)}`);
      return (target as Record<PropertyKey, unknown>)[property];
    },
  });
  return () => { cache.assetPool = previous.pool; cache.assetPrisma = previous.client; };
}

// ไฟล์ "src-1" ที่นำเข้าทะเบียนไปแล้ว imported แถว
function setup(imported: number, who: Member = staff) {
  const file = { id: 'src-1', name: 'ทะเบียน.xlsx', hash: 'h', objectKey: 'imports/src-1', rowCount: 120, createdAt: '', actor: 'staff-a' };
  const deletedKeys: string[] = [], createdKeys: string[] = [], audits: string[] = [];
  let fileDeleted = false;
  const tx = {
    user: { findUnique: async () => who },
    operation: { findUnique: async () => null, create: async () => ({}) },
    importFile: { findUnique: async () => file, delete: async () => { fileDeleted = true; return file; } },
    sourceRow: { count: async () => imported },
    asset: { count: async () => imported },
    storedFile: {
      deleteMany: async ({ where }: { where: { key: string | { in: string[] } } }) => { deletedKeys.push(...(typeof where.key === 'string' ? [where.key] : where.key.in)); return { count: 1 }; },
      createMany: async ({ data }: { data: Array<{ key: string }> }) => { createdKeys.push(...data.map(d => d.key)); return { count: data.length }; },
    },
    audit: { create: async ({ data }: { data: { action: string } }) => { audits.push(data.action); return {}; } },
  };
  const restore = useMemoryDatabase({
    user: { findUnique: async () => who },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  return { restore, deletedKeys, createdKeys, audits, wasDeleted: () => fileDeleted };
}

test('ลบไฟล์ต้นฉบับที่ยังไม่นำเข้าเลย: ลบไฟล์ ข้อมูลที่อ่านแล้ว การเปลี่ยนประเภทแถว และเครื่องหมายคลัง พร้อมบันทึกประวัติ', async () => {
  const s = setup(0);
  try {
    assert.deepEqual(await mutate(staff, { action: 'sourceDelete', sourceId: 'src-1' }), { ok: true });
    assert.ok(s.wasDeleted());
    assert.deepEqual(s.deletedKeys, ['imports/src-1', 'imports/src-1.json', 'imports/src-1-overrides.json', 'imports/src-1-archived.json']);
    assert.deepEqual(s.audits, ['ลบไฟล์ต้นฉบับ']);
  } finally { s.restore(); }
});

test('ลบไฟล์ที่นำเข้าทะเบียนไปแล้วไม่ได้ ให้ใช้เก็บเข้าคลังแทน และไม่ลบอะไรเลย', async () => {
  const s = setup(1180);
  try {
    await assert.rejects(mutate(staff, { action: 'sourceDelete', sourceId: 'src-1' }), /นำเข้าทะเบียนไปแล้ว 1,180 แถว/);
    assert.equal(s.wasDeleted(), false);
    assert.deepEqual(s.deletedKeys, []);
  } finally { s.restore(); }
});

test('เก็บไฟล์เข้าคลังและนำออกจากคลัง: สร้าง/ลบไฟล์เครื่องหมาย ไม่แตะไฟล์ต้นฉบับ', async () => {
  const s = setup(1180);
  try {
    await mutate(staff, { action: 'sourceArchive', sourceId: 'src-1', archived: true });
    await mutate(staff, { action: 'sourceArchive', sourceId: 'src-1', archived: false });
    assert.deepEqual(s.createdKeys, ['imports/src-1-archived.json']);
    assert.deepEqual(s.deletedKeys, ['imports/src-1-archived.json']);
    assert.equal(s.wasDeleted(), false);
    assert.deepEqual(s.audits, ['เก็บไฟล์ต้นฉบับเข้าคลัง', 'นำไฟล์ต้นฉบับออกจากคลัง']);
  } finally { s.restore(); }
});

test('ผู้ที่ไม่ใช่เจ้าหน้าที่พัสดุหรือแอดมิน ลบหรือเก็บไฟล์ต้นฉบับไม่ได้', async () => {
  const s = setup(0, dean);
  try {
    await assert.rejects(mutate(dean, { action: 'sourceDelete', sourceId: 'src-1' }), /สิทธิ์/);
    await assert.rejects(mutate(dean, { action: 'sourceArchive', sourceId: 'src-1', archived: true }), /สิทธิ์/);
    assert.equal(s.wasDeleted(), false);
  } finally { s.restore(); }
});
