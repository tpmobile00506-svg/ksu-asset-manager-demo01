import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutate } from '../services/asset-mutations';
import { getData } from '../services/asset-service';
import { ApiError } from '../services/errors';
import type { Member } from '../auth/sessions';

const staff: Member = { id: 'staff-a', email: 'a@example.test', name: 'A', role: 'staff', active: 1, createdAt: '' };
const secondStaff: Member = { ...staff, id: 'staff-b' };
const hasStatus = (status: number) => (error: unknown) => error instanceof ApiError && error.status === status;

// The application's Prisma proxy uses this cache. Unknown methods and any pool
// access throw, so these tests cannot fall through to a real database connection.
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

test('stocktake versions reject stale forms and advance even within one millisecond', async () => {
  let item = { id: 'item', assetId: 'asset', snapshot: JSON.stringify({ quantity: 2 }),
    result: 'pending', quantity: null as number | null, checkedAt: null as string | null,
    actor: null as string | null, round: { status: 'open' } };
  const tx = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => where.id === staff.id ? staff : secondStaff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    stocktakeItem: {
      findUnique: async () => structuredClone(item),
      update: async ({ data }: { data: Partial<typeof item> }) => (item = { ...item, ...data }),
    },
    audit: { create: async () => ({}) },
  };
  const restore = useMemoryDatabase({ $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) });
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-09-26T00:00:00.000Z');
  try {
    const check = { action: 'check', id: item.id, result: 'missing', quantity: 0, expectedCheckedAt: null };
    await assert.rejects(mutate(staff, { ...check, expectedCheckedAt: undefined }), hasStatus(400));
    await mutate(staff, check);
    const firstVersion = item.checkedAt!;
    await assert.rejects(mutate(secondStaff, { ...check, result: 'normal', quantity: 2 }), hasStatus(409));
    assert.equal(item.result, 'missing');
    assert.equal(item.actor, staff.id);
    await mutate(staff, { ...check, expectedCheckedAt: firstVersion, result: 'mismatch', quantity: 3 });
    assert.equal(item.quantity, 3);
    assert.equal(Date.parse(item.checkedAt!), Date.parse(firstVersion) + 1);
    await assert.rejects(mutate(staff, { ...check, expectedCheckedAt: firstVersion }), hasStatus(409));
    for (const quantity of [-1, 1.5, 2147483648]) {
      await assert.rejects(mutate(staff, { ...check, expectedCheckedAt: item.checkedAt, result: 'mismatch', quantity }), hasStatus(400));
    }
    await assert.rejects(mutate(staff, { ...check, expectedCheckedAt: item.checkedAt, result: 'normal', quantity: 3 }), hasStatus(400));
    await assert.rejects(mutate(staff, { ...check, expectedCheckedAt: item.checkedAt, result: 'missing', quantity: 1 }), hasStatus(400));
  } finally { Date.now = originalNow; restore(); }
});

test('stocktake display and ordering use the names and codes saved in the round', async () => {
  const items = [
    { id: 'one', snapshot: JSON.stringify({ code: 'B-OLD', name: 'Name B at count' }) },
    { id: 'two', snapshot: JSON.stringify({ code: 'A-OLD', name: 'Name A at count' }) },
  ];
  const restore = useMemoryDatabase({ stocktakeItem: { findMany: async (query: object) => {
    assert.equal('include' in query, false, 'Historical identity must not join the mutable asset record');
    return items;
  } } });
  try {
    const data = await getData(staff, new URL('http://test.invalid/?view=stocktake&round=closed'));
    assert.ok('items' in data);
    assert.deepEqual(data.items.map(item => [item.id, item.code, item.name]), [
      ['two', 'A-OLD', 'Name A at count'], ['one', 'B-OLD', 'Name B at count'],
    ]);
  } finally { restore(); }
});

test('bulk import prepares immutable sources before its transaction and checks decisions inside it', async () => {
  const source = { id: 'source', name: 'fixture.xlsx', hash: 'fixture', sheets: [{ name: 'S', rows: [
    { row: 1, values: [1, 'DONE', 'Already imported', 1, 100, 100] },
    { row: 2, values: [2, 'NEW', 'New asset', 1, 100, 100] },
  ] }] };
  let inTransaction = false, sourceReads = 0;
  let insertedAssets: Array<{ code: string }> = [], insertedDecisions: Array<{ sourceRow: string }> = [];
  const dimensions = { createMany: async () => ({ count: 1 }) };
  const tx = {
    user: { findUnique: async () => staff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    sourceRow: {
      findMany: async () => { assert.equal(inTransaction, true); return [{ sourceRow: 'S:1' }]; },
      createMany: async ({ data }: { data: typeof insertedDecisions }) => { insertedDecisions = data; return { count: data.length }; },
    },
    asset: {
      findFirst: async () => { assert.equal(inTransaction, true); return null; },
      findMany: async () => { assert.equal(inTransaction, true); return []; },   // ตรวจรหัสซ้ำในทะเบียน (ว่าง)
      createMany: async ({ data }: { data: typeof insertedAssets }) => { insertedAssets = data; return { count: data.length }; },
    },
    location: dimensions, branch: dimensions, category: dimensions, assetGroup: dimensions,
    audit: { create: async () => ({}) },
  };
  const restore = useMemoryDatabase({
    user: { findUnique: async () => staff },
    importFile: { findUnique: async () => { assert.equal(inTransaction, false); sourceReads++; return { objectKey: 'imports/source' }; } },
    storedFile: { findUnique: async () => { assert.equal(inTransaction, false); return { body: Buffer.from(JSON.stringify(source)) }; } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      assert.equal(sourceReads, 1);
      inTransaction = true;
      try { return await callback(tx); } finally { inTransaction = false; }
    },
  });
  try {
    const result = await mutate(staff, { action: 'batchImport', sourceId: source.id, allReady: true });
    assert.equal(result.count, 1);
    assert.deepEqual(insertedAssets.map(asset => asset.code), ['NEW']);
    assert.deepEqual(insertedDecisions.map(row => row.sourceRow), ['S:2']);
  } finally { restore(); }
});

test('request action with splitQuantity does NOT split at request time (split happens at final approval)', async () => {
  let parentAsset: any = {
    id: 'parent-1',
    code: 'CHAIR-200',
    name: 'เก้าอี้บรรยาย',
    quantity: 200,
    unitSatang: 125000n,
    totalSatang: 25000000n,
    salvageSatang: 0n,
    condition: 'normal',
    lifecycle: 'active',
    version: 1,
    location: 'ห้อง 101',
    branch: 'คอมพิวเตอร์',
    category: 'คอมพิวเตอร์',
    groupName: 'ครุภัณฑ์สำนักงาน',
    notes: '',
    receivedDate: '2026-01-01',
    lifeYears: 5,
    serial: '',
    brand: '',
    custodian: '',
    parentId: null,
    sourceId: null,
    sourceRow: null,
    createdAt: '2026-01-01'
  };
  const createdAssets: any[] = [];
  let createdRequest: any = null;
  const tx = {
    user: { findUnique: async () => staff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    asset: {
      findUnique: async () => structuredClone(parentAsset),
      create: async ({ data }: { data: any }) => {
        createdAssets.push(data);
        return data;
      },
      update: async ({ where, data }: { where: { id: string }, data: any }) => {
        if (where.id === parentAsset.id) {
          parentAsset = { ...parentAsset, ...data, version: parentAsset.version + (data.version?.increment || 0) };
          return parentAsset;
        }
        const child = createdAssets.find(c => c.id === where.id);
        if (child) {
          Object.assign(child, data, { version: child.version + (data.version?.increment || 0) });
          return child;
        }
        return data;
      }
    },
    assetRequest: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: any }) => {
        createdRequest = data;
        return data;
      }
    },
    setting: {
      findUnique: async () => ({ value: '["head","deputy","dean"]' })
    },
    storedFile: {
      findUnique: async () => null,
      create: async () => ({})
    },
    audit: { create: async () => ({}) }
  };
  const restore = useMemoryDatabase({
    user: { findUnique: async () => staff },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
  });

  try {
    // 1. Invalid splitQuantity is rejected
    await assert.rejects(
      mutate(staff, {
        action: 'request',
        id: parentAsset.id,
        version: parentAsset.version,
        kind: 'repair',
        splitQuantity: 0,
        reason: 'ทดสอบ'
      }),
      hasStatus(400)
    );
    await assert.rejects(
      mutate(staff, {
        action: 'request',
        id: parentAsset.id,
        version: parentAsset.version,
        kind: 'repair',
        splitQuantity: 200,
        reason: 'ทดสอบ'
      }),
      hasStatus(400)
    );

    // 2. Valid splitQuantity: split 50 from 200
    const res = await mutate(staff, {
      action: 'request',
      id: parentAsset.id,
      version: parentAsset.version,
      kind: 'repair',
      splitQuantity: 50,
      reason: 'เบาะขาด 50 ตัว'
    });

    assert.equal(res.ok, true);
    // กฎใหม่: ยังไม่แบ่งล็อตตอนยื่นคำขอ ครุภัณฑ์เดิมยังเป็น 200 ตัวและใช้งานอยู่
    assert.equal(parentAsset.lifecycle, 'active');
    assert.equal(parentAsset.quantity, 200);
    assert.equal(createdAssets.length, 0);
    // คำขอผูกกับครุภัณฑ์เดิม และเก็บจำนวนที่ขอ (50) ไว้ใน payload เพื่อแบ่งตอนอนุมัติขั้นสุดท้าย
    assert.equal(createdRequest.assetId, 'parent-1');
    assert.equal(JSON.parse(createdRequest.payload).splitQuantity, 50);
    assert.equal(createdRequest.assetVersion, 2);
  } finally {
    restore();
  }
});

test('นำเข้าจากมุมมองแบบ Excel: แถว "ต้องตรวจ" นำเข้าได้พร้อมหมายเหตุ ไม่มีจำนวนใส่ 1 ส่วนรหัสซ้ำข้ามและแจ้งกลับ', async () => {
  const source = { id: 'source', name: 'fixture.xlsx', hash: 'fixture', sheets: [{ name: 'S', rows: [
    { row: 1, values: [1, 'OK-1', 'ปกติ', 1, 100, 100] },
    { row: 2, values: [2, 'BAD-1', 'ยอดไม่ตรงสูตร', 2, 100, 300] },        // 2 × 1.00 ≠ 3.00 บาท
    { row: 3, values: [3, 'EXIST-1', 'รหัสมีในทะเบียนแล้ว', 1, 100, 100] },
    { row: 4, values: [4, 'ZERO-1', 'จำนวนศูนย์', 0, 100, 0] },
  ] }] };
  let insertedAssets: Array<{ code: string; notes: string }> = [];
  const dimensions = { createMany: async () => ({ count: 1 }) };
  const tx = {
    user: { findUnique: async () => staff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    sourceRow: { findMany: async () => [], createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }) },
    asset: {
      findMany: async () => [{ code: 'EXIST-1', name: 'ของเดิม', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', lifecycle: 'active' }],
      createMany: async ({ data }: { data: typeof insertedAssets }) => { insertedAssets = data; return { count: data.length }; },
    },
    location: dimensions, branch: dimensions, category: dimensions, assetGroup: dimensions,
    audit: { create: async () => ({}) },
  };
  const restore = useMemoryDatabase({
    user: { findUnique: async () => staff },
    importFile: { findUnique: async () => ({ objectKey: 'imports/source' }) },
    storedFile: { findUnique: async () => ({ body: Buffer.from(JSON.stringify(source)) }) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  try {
    const keys = ['S:1', 'S:2', 'S:3', 'S:4'];
    // ไม่ได้ขอรวมแถวต้องตรวจ: ปฏิเสธเหมือนเดิม
    await assert.rejects(mutate(staff, { action: 'batchImport', sourceId: source.id, keys }), /ต้องตรวจทาน/);
    const result = await mutate(staff, { action: 'batchImport', sourceId: source.id, keys, includeIssues: true });
    assert.equal(result.count, 3);
    assert.deepEqual(insertedAssets.map(a => a.code), ['OK-1', 'BAD-1', 'ZERO-1']);
    assert.match(insertedAssets[1].notes, /ต้องตรวจ:/);
    // ไม่มีจำนวน: นำเข้าเป็นจำนวน 1 พร้อมหมายเหตุ (ผู้ใช้อนุมัติ 16 ต.ค. 2569)
    assert.equal((insertedAssets[2] as unknown as { quantity: number }).quantity, 1);
    assert.match(insertedAssets[2].notes, /ไม่ระบุจำนวนในไฟล์/);
    assert.deepEqual(result.skipped.map((x: { row: number }) => x.row), [3]);
    assert.match(result.skipped[0].reason, /รหัสซ้ำกับรายการในทะเบียน: EXIST-1/);
  } finally { restore(); }
});

test('เลือกสาขาตอนนำเข้า: ทุกแถวเข้าสาขาที่เลือก แถว "หลายสาขา" ไม่ต้องตรวจอีก สาขานอกรายการถูกปฏิเสธ', async () => {
  const source = { id: 'source', name: 'fixture.xlsx', hash: 'fixture', sheets: [{ name: 'S', rows: [
    { row: 1, values: [1, 'A-1', 'โต๊ะ', 1, 100, 100, 'ห้อง 1', 'วค'] },
    { row: 2, values: [2, 'A-2', 'เก้าอี้', 1, 100, 100, 'ห้อง 1', 'วอ /คจก'] },   // ระบุ 2 สาขา
  ] }] };
  let insertedAssets: Array<{ code: string; branch: string; notes: string }> = [];
  const dimensions = { createMany: async () => ({ count: 1 }) };
  const tx = {
    user: { findUnique: async () => staff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    sourceRow: { findMany: async () => [], createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }) },
    asset: { findMany: async () => [], createMany: async ({ data }: { data: typeof insertedAssets }) => { insertedAssets = data; return { count: data.length }; } },
    location: dimensions, branch: dimensions, category: dimensions, assetGroup: dimensions,
    audit: { create: async () => ({}) },
  };
  const restore = useMemoryDatabase({
    user: { findUnique: async () => staff },
    importFile: { findUnique: async () => ({ objectKey: 'imports/source' }) },
    storedFile: { findUnique: async () => ({ body: Buffer.from(JSON.stringify(source)) }) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  });
  try {
    const keys = ['S:1', 'S:2'];
    await assert.rejects(mutate(staff, { action: 'batchImport', sourceId: source.id, keys, includeIssues: true, branch: 'สาขามั่ว' }), /สาขาไม่ถูกต้อง/);
    const picked = 'วิศวกรรมไฟฟ้า (วฟ)';
    const result = await mutate(staff, { action: 'batchImport', sourceId: source.id, keys, includeIssues: true, branch: picked });
    assert.equal(result.count, 2);
    assert.deepEqual(insertedAssets.map(a => a.branch), [picked, picked]);
    assert.doesNotMatch(insertedAssets[1].notes, /ต้องตรวจ/);
  } finally { restore(); }
});

test('ติ๊กหัวทุนพร้อมรายการข้างล่างแล้วนำเข้า: รายการที่เลือกผูกเข้าทุนทันที ไม่ติ๊กหัวทุน = แค่แนะนำ', async () => {
  const source = { id: 'source', name: 'fixture.xlsx', hash: 'fixture', sheets: [{ name: 'S', rows: [
    { row: 1, values: [null, null, 'นำเข้าคอมพิวเตอร์ 10 เครื่อง งบประมาณ 2568'] },   // หัวทุน
    { row: 2, values: [1, 'PC-1', 'คอมพิวเตอร์ เครื่องที่ 1', 1, 20000, 20000] },
    { row: 3, values: [2, 'PC-2', 'คอมพิวเตอร์ เครื่องที่ 2', 1, 20000, 20000] },
  ] }] };
  const run = async (keys: string[]) => {
    let inserted: Array<{ code: string; fundId?: string; fundHintId?: string }> = [];
    const dimensions = { createMany: async () => ({ count: 1 }) };
    const tx = {
      user: { findUnique: async () => staff },
      operation: { findUnique: async () => null, create: async () => ({}) },
      sourceRow: { findMany: async () => [], createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }) },
      asset: { findMany: async () => [], createMany: async ({ data }: { data: typeof inserted }) => { inserted = data; return { count: data.length }; } },
      assetSet: { findMany: async () => [], createMany: async () => ({ count: 1 }) },
      location: dimensions, branch: dimensions, category: dimensions, assetGroup: dimensions,
      audit: { create: async () => ({}) },
    };
    const restore = useMemoryDatabase({
      user: { findUnique: async () => staff },
      importFile: { findUnique: async () => ({ objectKey: 'imports/source' }) },
      storedFile: { findUnique: async () => ({ body: Buffer.from(JSON.stringify(source)) }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    });
    try { return { result: await mutate(staff, { action: 'batchImport', sourceId: source.id, keys, includeIssues: true }), inserted }; }
    finally { restore(); }
  };
  const withFund = await run(['S:1', 'S:2', 'S:3']);
  assert.equal(withFund.result.count, 2);
  assert.equal(withFund.result.linked, 2);
  assert.ok(withFund.inserted.every(a => a.fundId && a.fundId === a.fundHintId));
  const withoutFund = await run(['S:2', 'S:3']);
  assert.equal(withoutFund.result.linked, undefined);
  assert.ok(withoutFund.inserted.every(a => !a.fundId && a.fundHintId));   // ยังเป็นแค่รายการแนะนำ
});
