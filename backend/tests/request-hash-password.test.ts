import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { json } from '../db/client';
import type { Member } from '../auth/sessions';

// requestHash ในตาราง operations ต้องไม่มาจากรหัสผ่านจริง (sha256 ไม่มี salt เดาย้อนได้เร็ว)
const admin: Member = { id: 'admin-1', email: 'admin@example.test', name: 'Admin', role: 'admin', branch: null, active: 1, createdAt: '' };
const staff: Member = { id: 'staff-1', email: 'staff@example.test', name: 'Staff', role: 'staff', branch: null, active: 1, createdAt: '' };

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

// สร้างบัญชีใหม่ 1 ครั้ง แล้วคืน requestHash ที่ถูกบันทึกลงตาราง operations
async function storedHash(input: Record<string, unknown>) {
  const operations: Array<{ requestHash: string }> = [];
  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => (where.id === admin.id ? admin : null),
      create: async () => ({}),
    },
    invite: { findUnique: async () => null, upsert: async () => ({}) },
    branch: { createMany: async () => ({}) },
    session: { deleteMany: async () => ({}) },
    audit: { create: async () => ({}) },
    operation: { findUnique: async () => null, create: async ({ data }: { data: { requestHash: string } }) => { operations.push(data); return data; } },
  };
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try { await mutate(admin, input); } finally { restore(); }
  assert.equal(operations.length, 1);
  return operations[0].requestHash;
}

const newUser = (password: string, token = 'token-1') => ({ action: 'user', token, name: 'ผู้ใช้ทดสอบ', email: 'new@example.test', role: 'staff', branch: null, active: 1, password });

test('requestHash ไม่ใช่ sha256 ของคำขอที่มีรหัสผ่านจริง และไม่ใช่ sha256 ของคำขอที่ตัดรหัสผ่านทิ้งเฉย ๆ', async () => {
  const input = newUser('correct-horse-battery');
  const hash = await storedHash(input);
  const { password: _password, ...withoutPassword } = input;
  assert.notEqual(hash, createHash('sha256').update(json(input)).digest('hex'));
  assert.notEqual(hash, createHash('sha256').update(json(withoutPassword)).digest('hex'));
});

test('ส่งซ้ำด้วยรหัสผ่านเดิม → requestHash เท่ากัน (replay ได้) · เปลี่ยนรหัสผ่าน → requestHash ต่างกัน (ตอบ 409)', async () => {
  const first = await storedHash(newUser('correct-horse-battery'));
  const same = await storedHash(newUser('correct-horse-battery'));
  const changed = await storedHash(newUser('another-password-123'));
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('คำขอที่ไม่มีรหัสผ่าน: requestHash = sha256 ของคำขอเดิม (คำขอที่บันทึกไว้ก่อนแก้ยัง replay ได้)', async () => {
  const input = { action: 'user', token: 'token-2', name: 'ผู้ใช้ทดสอบ', email: 'new@example.test', role: 'staff', branch: null, active: 1 };
  const operations: Array<{ requestHash: string }> = [];
  const target = { id: 'user-9', email: 'new@example.test', name: 'เดิม', role: 'staff', branch: null, active: 1, createdAt: '' };
  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => (where.id === admin.id ? admin : where.email === target.email ? target : null),
      update: async () => ({}),
    },
    invite: { findUnique: async () => null, upsert: async () => ({}) },
    branch: { createMany: async () => ({}) },
    session: { deleteMany: async () => ({}) },
    audit: { create: async () => ({}) },
    operation: { findUnique: async () => null, create: async ({ data }: { data: { requestHash: string } }) => { operations.push(data); return data; } },
  };
  const restore = useMemoryDatabase({ $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) });
  try { await mutate(admin, input); } finally { restore(); }
  assert.equal(operations[0].requestHash, createHash('sha256').update(json(input)).digest('hex'));
});

test('ผู้ใช้ที่ไม่ใช่ Admin ส่งรหัสผ่านมา → ถูกปฏิเสธ 403 ก่อนเปิด transaction (ไม่คำนวณ scrypt ให้)', async () => {
  let opened = 0;
  const restore = useMemoryDatabase({ $transaction: async () => { opened++; throw new Error('ไม่ควรเปิด transaction'); } });
  try {
    await assert.rejects(mutate(staff, newUser('correct-horse-battery')), (e: any) => e?.status === 403);
    assert.equal(opened, 0);
  } finally { restore(); }
});
