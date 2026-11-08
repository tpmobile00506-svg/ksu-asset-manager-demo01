import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dropFromOpenRounds, moveInOpenRounds, replaceInOpenRounds } from '../services/mutations/stocktake-sync';

// รอบตรวจนับที่เปิดอยู่ต้องตามทะเบียน (ผู้ใช้เลือกแบบ ก. 8 พ.ย. 2569)
// แตะเฉพาะรายการที่ยังไม่ได้ตรวจในรอบที่ยังเปิด · รอบที่ปิดแล้วและรายการที่ตรวจแล้วคงเดิมทุกอย่าง

type Item = { id: string; roundId: string; assetId: string; snapshot: string; result: string };
const snap = (code: string, quantity: number, location = 'ห้อง 301', branch = 'วิศวกรรมคอมพิวเตอร์ (วค)') =>
  JSON.stringify({ code, name: 'เก้าอี้', quantity, location, branch, totalSatang: quantity * 85000 });

function fakeTx(items: Item[], rounds: Record<string, string>) {
  const hit = (i: Item, where: any) =>
    (!where.assetId || where.assetId.in.includes(i.assetId)) &&
    (!where.result || i.result === where.result) &&
    (!where.round || rounds[i.roundId] === where.round.status);
  return {
    stocktakeItem: {
      findMany: async ({ where }: any) => items.filter(i => hit(i, where)).map(i => ({ ...i })),
      delete: async ({ where }: any) =>
        items.splice(
          items.findIndex(i => i.id === where.id),
          1,
        )[0],
      createMany: async ({ data }: any) => {
        for (const d of data) items.push({ result: 'pending', ...d });
        return { count: data.length };
      },
      deleteMany: async ({ where }: any) => {
        const gone = items.filter(i => hit(i, where));
        for (const g of gone) items.splice(items.indexOf(g), 1);
        return { count: gone.length };
      },
      update: async ({ where, data }: any) => Object.assign(items.find(i => i.id === where.id)!, data),
    },
  } as any;
}

const rounds = { open: 'open', done: 'closed', open2: 'open' };
const base = (): Item[] => [
  { id: 'openlot', roundId: 'open', assetId: 'lot', snapshot: snap('CH-LOT', 3), result: 'pending' },
  { id: 'donelot', roundId: 'done', assetId: 'lot', snapshot: snap('CH-LOT', 3), result: 'pending' },
  { id: 'open2lot', roundId: 'open2', assetId: 'lot', snapshot: snap('CH-LOT', 3), result: 'normal' },
];

test('แยกระหว่างเปิดรอบ: รายการเดิมที่ยังไม่ตรวจถูกแทนด้วยชิ้นใหม่ · รอบปิดแล้ว/ตรวจแล้วไม่แตะ', async () => {
  const items = base();
  const kids = [1, 2, 3].map(n => ({
    id: 'p' + n,
    code: 'CH-LOT-' + n,
    name: 'เก้าอี้',
    quantity: 1,
    location: 'ห้อง 301',
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
    totalSatang: 85000,
  }));
  await replaceInOpenRounds(fakeTx(items, rounds), 'lot', kids);
  const inOpen = items.filter(i => i.roundId === 'open');
  // รอบที่เปิด: แม่ออก ชิ้นใหม่ 3 ชิ้นเข้า (รหัสรายการ = รหัสรอบต่อท้ายด้วยรหัสครุภัณฑ์ แบบเดียวกับตอนเปิดรอบ)
  assert.deepEqual(
    inOpen.map(i => [i.id, i.assetId, i.result]),
    [
      ['openp1', 'p1', 'pending'],
      ['openp2', 'p2', 'pending'],
      ['openp3', 'p3', 'pending'],
    ],
  );
  assert.deepEqual(JSON.parse(inOpen[0].snapshot), {
    code: 'CH-LOT-1',
    name: 'เก้าอี้',
    quantity: 1,
    location: 'ห้อง 301',
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
    totalSatang: 85000,
  });
  // รอบที่ปิดแล้ว และรอบที่ตรวจรายการเดิมไปแล้ว: คงเดิม (นับแล้วเป็นล็อต 3 ชิ้น)
  assert.deepEqual(
    items.filter(i => i.roundId !== 'open').map(i => [i.id, i.result]),
    [
      ['donelot', 'pending'],
      ['open2lot', 'normal'],
    ],
  );
});

test('โอนย้ายระหว่างเปิดรอบ: รายการที่ยังไม่ตรวจแสดงสถานที่และสาขาใหม่ ข้อมูลอื่นคงเดิม', async () => {
  const items = base();
  await moveInOpenRounds(fakeTx(items, rounds), ['lot'], 'ห้อง 501', 'วิศวกรรมไฟฟ้า (วฟ)');
  assert.deepEqual(JSON.parse(items[0].snapshot), JSON.parse(snap('CH-LOT', 3, 'ห้อง 501', 'วิศวกรรมไฟฟ้า (วฟ)')));
  // รอบปิดแล้ว และรายการที่ตรวจแล้ว ยังเป็นห้องเดิม
  assert.equal(JSON.parse(items[1].snapshot).location, 'ห้อง 301');
  assert.equal(JSON.parse(items[2].snapshot).location, 'ห้อง 301');
});

test('จำหน่ายระหว่างเปิดรอบ: เอาออกจากรอบเฉพาะที่ยังไม่ตรวจ', async () => {
  const items = base();
  await dropFromOpenRounds(fakeTx(items, rounds), ['lot']);
  assert.deepEqual(
    items.map(i => i.id),
    ['donelot', 'open2lot'],
  );
});
