import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitEvenly, pieceCodes } from '../contracts/domain';
import { mutate } from '../services/asset-mutations';
import type { Member } from '../auth/sessions';
import { installMemoryDatabase } from './helpers/memory-db';

// ติด QR แยกรายชิ้น (ผู้ใช้ขอ 8 พ.ย. 2569): เพิ่มครุภัณฑ์หลายชิ้นแบบแยกรายการละชิ้น และแยกรายการกลุ่มเดิมเป็นรายชิ้น
// ค่าคาดหวังทุกตัวคำนวณมือ (เขียนวิธีคิดไว้ข้างแต่ละค่า) ไม่ได้คัดลอกจากผลของโค้ด

test('splitEvenly: แบ่งสตางค์เท่าๆ กัน เศษให้ชิ้นแรกๆ ชิ้นละ 1 สตางค์ รวมกลับเท่าเดิม', () => {
  // 1,000 ÷ 3 = 333 เศษ 1 → ชิ้นแรกได้ 334 · 334 + 333 + 333 = 1,000
  assert.deepEqual(splitEvenly(1000, 3), [334, 333, 333]);
  // 10,560,000 ÷ 2 = 5,280,000 ลงตัว (คอม 52,800 บาท 2 เครื่อง)
  assert.deepEqual(splitEvenly(10560000, 2), [5280000, 5280000]);
  // 2 ÷ 3 = 0 เศษ 2 → 1, 1, 0
  assert.deepEqual(splitEvenly(2, 3), [1, 1, 0]);
  assert.deepEqual(splitEvenly(0, 2), [0, 0]);
  assert.deepEqual(splitEvenly(7, 1), [7]);
  assert.throws(() => splitEvenly(100, 0));
  assert.throws(() => splitEvenly(-1, 2));
  assert.throws(() => splitEvenly(1.5, 2));
});

test('pieceCodes: ไล่หมายเลขรายชิ้น 3 รูปแบบ', () => {
  // padded: เลขอย่างน้อย 3 หลัก ในวงเล็บคือเลขชิ้นสุดท้าย
  assert.deepEqual(pieceCodes('KSU-01', 1, 3, 'padded'), ['KSU-01-001(003)', 'KSU-01-002(003)', 'KSU-01-003(003)']);
  assert.deepEqual(pieceCodes('KSU-01', 1, 3, 'plain'), ['KSU-01-1(3)', 'KSU-01-2(3)', 'KSU-01-3(3)']);
  assert.deepEqual(pieceCodes('KSU-01', 1, 3, 'slash'), ['KSU-01/1', 'KSU-01/2', 'KSU-01/3']);
  // เริ่มที่ 21 จำนวน 20 → ชิ้นสุดท้ายคือ 21 + 20 − 1 = 40
  const late = pieceCodes('A', 21, 20, 'padded');
  assert.equal(late.length, 20);
  assert.equal(late[0], 'A-021(040)');
  assert.equal(late[19], 'A-040(040)');
  // ชิ้นสุดท้าย 1,000 มี 4 หลัก → เติมศูนย์ให้ครบ 4 หลัก
  assert.equal(pieceCodes('B', 999, 2, 'padded')[0], 'B-0999(1000)');
  // ช่องว่างหน้า-หลังหมายเลขหลักถูกตัดออก
  assert.equal(pieceCodes('  C  ', 1, 1, 'slash')[0], 'C/1');
  assert.deepEqual(pieceCodes('A', 0, 3, 'padded'), []);
  assert.deepEqual(pieceCodes('A', 1, 0, 'padded'), []);
});

const staff: Member = {
  id: 'staff-1',
  email: 'staff@example.test',
  name: 'Staff',
  role: 'staff',
  branch: null,
  active: 1,
  createdAt: '',
};

// ฐานข้อมูลจำลอง: เก็บทุกคำสั่งที่เขียน · existing = หมายเลขที่มีในทะเบียนแล้ว · lot = รายการกลุ่มเดิม (สำหรับ splitEach)
function environment({
  existing = [] as Array<{ id: string; code: string }>,
  lot = null as Record<string, unknown> | null,
  photo = null as Buffer | null,
} = {}) {
  const created: Array<Record<string, any>> = [];
  const many: Array<Record<string, any>> = [];
  const updates: unknown[] = [];
  const audits: Array<Record<string, any>> = [];
  const photoCopies: Array<{ data: Array<{ key: string }> }> = [];
  const noop = { createMany: async () => ({}) };
  const tx = {
    user: { findUnique: async () => staff },
    operation: { findUnique: async () => null, create: async () => ({}) },
    location: noop,
    branch: noop,
    category: noop,
    assetGroup: noop,
    asset: {
      create: async ({ data }: { data: Record<string, any> }) => {
        created.push(data);
        return data;
      },
      createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
        many.push(...data);
        return { count: data.length };
      },
      findUnique: async () => (lot ? { ...lot } : null),
      findMany: async () => existing.map(e => ({ ...e, name: 'ของเดิม', branch: '', lifecycle: 'active' })),
      update: async (args: unknown) => {
        updates.push(args);
        return {};
      },
    },
    assetRequest: { findFirst: async () => null },
    storedFile: {
      findUnique: async () => (photo ? { key: 'x', body: photo } : null),
      createMany: async (args: { data: Array<{ key: string }> }) => {
        photoCopies.push(args);
        return { count: args.data.length };
      },
    },
    audit: {
      create: async ({ data }: { data: Record<string, any> }) => {
        audits.push(data);
        return {};
      },
    },
  };
  const restore = installMemoryDatabase(
    { $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx), operation: tx.operation },
    { strict: true },
  );
  return { created, many, updates, audits, photoCopies, restore };
}

// คอม 3 เครื่อง เครื่องละ 333.33 บาท รวม 1,000.00 บาท (กรอกยอดรวมเองพร้อมเหตุผล) มูลค่าซาก 3 บาท
const computers = {
  action: 'create',
  reason: 'ยอดตามใบส่งของ',
  asset: {
    code: 'PC-68',
    name: 'คอมพิวเตอร์',
    quantity: 3,
    unitSatang: 33333,
    totalSatang: 100000,
    salvageSatang: 300,
    location: 'ห้อง 301',
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
    category: 'ครุภัณฑ์คอมพิวเตอร์',
    condition: 'normal',
  },
  pieces: [
    { code: 'PC-68-001(003)', serial: 'SN-A' },
    { code: 'PC-68-002(003)', serial: '' },
    { code: 'PC-68-003(003)', serial: 'SN-C' },
  ],
};

test('เพิ่มแบบแยกรายชิ้น: แม่ 1 รายการเก็บเป็นประวัติ + ลูก 3 รายการ หมายเลขและ Serial ตามที่กรอก ยอดเงินรวมเท่าเดิม', async () => {
  const env = environment();
  try {
    const result = await mutate(staff, computers);
    assert.equal(result.ok, true);
    assert.equal(result.pieceIds.length, 3);
    // แม่: สร้างครั้งเดียว lifecycle = split จำนวนและยอดเดิม
    assert.equal(env.created.length, 1);
    assert.equal(env.created[0].lifecycle, 'split');
    assert.equal(env.created[0].quantity, 3);
    assert.equal(env.created[0].totalSatang, 100000n);
    // ลูก: สร้างด้วย createMany คำสั่งเดียว
    assert.deepEqual(
      env.many.map(c => [c.code, c.serial, c.quantity, c.lifecycle, c.parentId]),
      [
        ['PC-68-001(003)', 'SN-A', 1, 'active', result.id],
        ['PC-68-002(003)', '', 1, 'active', result.id],
        ['PC-68-003(003)', 'SN-C', 1, 'active', result.id],
      ],
    );
    // 100,000 ÷ 3 = 33,333 เศษ 1 → 33,334 / 33,333 / 33,333 (รวม 100,000) · ราคาต่อหน่วยของลูก = ยอดของชิ้นนั้น
    assert.deepEqual(
      env.many.map(c => c.totalSatang),
      [33334n, 33333n, 33333n],
    );
    assert.deepEqual(
      env.many.map(c => c.unitSatang),
      [33334n, 33333n, 33333n],
    );
    // ซาก 300 ÷ 3 = 100 ลงตัว
    assert.deepEqual(
      env.many.map(c => c.salvageSatang),
      [100n, 100n, 100n],
    );
    assert.equal(env.audits.length, 1);
    assert.equal(env.audits[0].action, 'เพิ่มครุภัณฑ์ (แยกรายชิ้น)');
    assert.deepEqual(JSON.parse(env.audits[0].after).pieces, {
      count: 3,
      first: 'PC-68-001(003)',
      last: 'PC-68-003(003)',
    });
  } finally {
    env.restore();
  }
});

test('ไม่ส่งรายชิ้นมา = QR เดียวทั้งกลุ่ม เหมือนเดิม (1 รายการ active)', async () => {
  const env = environment();
  try {
    const { pieces: _skip, ...group } = computers;
    await mutate(staff, group);
    assert.equal(env.created.length, 1);
    assert.equal(env.created[0].lifecycle, 'active');
    assert.equal(env.many.length, 0);
  } finally {
    env.restore();
  }
});

test('เพิ่มแบบแยกรายชิ้น: ปฏิเสธเมื่อหมายเลขไม่ครบ ว่าง ซ้ำกันเอง ซ้ำกับทะเบียน หรือมีชิ้นเดียว', async () => {
  const cases: Array<[Record<string, unknown>, RegExp, Array<{ id: string; code: string }>?]> = [
    [{ pieces: computers.pieces.slice(0, 2) }, /ให้ครบ 3 ชิ้น/],
    [{ pieces: [{ code: 'A' }, { code: '' }, { code: 'C' }] }, /ชิ้นที่ 2/],
    [{ pieces: [{ code: 'A' }, { code: 'a ' }, { code: 'C' }] }, /ซ้ำกันเอง/],
    [{ pieces: 'PC-68' }, /ข้อมูลรายชิ้นไม่ถูกต้อง/],
    [{ asset: { ...computers.asset, quantity: 1, totalSatang: 33333 }, pieces: [{ code: 'A' }] }, /ตั้งแต่ 2 ชิ้น/],
    [{}, /PC-68-002\(003\) ซ้ำกับรายการที่มีในทะเบียนแล้ว/, [{ id: 'old', code: 'pc-68-002(003)' }]],
  ];
  for (const [over, message, existing] of cases) {
    const env = environment({ existing });
    try {
      await assert.rejects(mutate(staff, { ...computers, ...over }), message);
      assert.equal(env.created.length + env.many.length, 0, String(message));
    } finally {
      env.restore();
    }
  }
});

// รายการกลุ่มเดิม: เก้าอี้ 3 ตัว รวม 10.00 บาท มูลค่าซาก 0.02 บาท
const chairs = {
  id: 'lot-1',
  code: 'CH-01',
  name: 'เก้าอี้',
  quantity: 3,
  unitSatang: 333,
  totalSatang: 1000,
  salvageSatang: 2,
  notes: '',
  location: 'ห้อง 1',
  branch: 'วิศวกรรมอุตสาหการ (วอ)',
  groupName: 'สำนักงาน',
  category: 'ครุภัณฑ์สำนักงาน',
  condition: 'normal',
  lifecycle: 'active',
  version: 4,
  parentId: null,
  sourceId: null,
  sourceRow: null,
  receivedDate: '',
  lifeYears: 0,
  serial: '',
  brand: '',
  custodian: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  setId: null,
};
const splitEach = {
  action: 'splitEach',
  id: 'lot-1',
  version: 4,
  reason: 'ติด QR รายชิ้น',
  pieces: [{ code: 'CH-01/1' }, { code: 'CH-01/2' }, { code: 'CH-01/3' }],
};

test('แยกรายการกลุ่มเดิมเป็นรายชิ้น: เดิมเป็นประวัติ ลูก 3 รายการ ยอดรวมเท่าเดิม และได้รูปเดียวกับแม่', async () => {
  const photo = Buffer.from('webp');
  const env = environment({ lot: chairs, photo });
  try {
    const result = await mutate(staff, splitEach);
    assert.equal(result.pieceIds.length, 3);
    assert.deepEqual(env.updates, [
      { where: { id: 'lot-1' }, data: { lifecycle: 'split', version: { increment: 1 } } },
    ]);
    assert.deepEqual(
      env.many.map(c => [c.code, c.quantity, c.parentId, c.location]),
      [
        ['CH-01/1', 1, 'lot-1', 'ห้อง 1'],
        ['CH-01/2', 1, 'lot-1', 'ห้อง 1'],
        ['CH-01/3', 1, 'lot-1', 'ห้อง 1'],
      ],
    );
    // 1,000 ÷ 3 → 334, 333, 333 · ซาก 2 ÷ 3 → 1, 1, 0
    assert.deepEqual(
      env.many.map(c => c.totalSatang),
      [334n, 333n, 333n],
    );
    assert.deepEqual(
      env.many.map(c => c.salvageSatang),
      [1n, 1n, 0n],
    );
    assert.deepEqual(
      env.photoCopies[0].data.map(f => f.key),
      result.pieceIds.map((id: string) => `asset-images/${id}.webp`),
    );
    assert.equal(env.audits[0].action, 'แยกเป็นรายชิ้น');
    assert.equal(env.audits[0].reason, 'ติด QR รายชิ้น');
  } finally {
    env.restore();
  }
});

test('แยกรายการกลุ่มเดิมเป็นรายชิ้น: ปฏิเสธของในชุด ระหว่างซ่อม ไม่มีเหตุผล ข้อมูลเก่า หรือหมายเลขไม่ครบ', async () => {
  const cases: Array<[Record<string, unknown>, Record<string, unknown>, RegExp]> = [
    [{ setId: 'set-1' }, {}, /ชุดห้ามแยก/],
    [{ condition: 'repair' }, {}, /บันทึกผลการซ่อมก่อน/],
    [{}, { reason: '' }, /เหตุผล/],
    [{}, { version: 3 }, /โหลดใหม่/],
    [{}, { pieces: splitEach.pieces.slice(1) }, /ให้ครบ 3 ชิ้น/],
    [{ quantity: 1, totalSatang: 333 }, { pieces: [{ code: 'X' }] }, /ตั้งแต่ 2 ชิ้น/],
  ];
  for (const [lotOver, inputOver, message] of cases) {
    const env = environment({ lot: { ...chairs, ...lotOver } });
    try {
      await assert.rejects(mutate(staff, { ...splitEach, ...inputOver }), message);
      assert.equal(env.many.length + env.updates.length, 0, String(message));
    } finally {
      env.restore();
    }
  }
});
