import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionSummary, pieceSummary } from '../contracts/domain';

// การ์ด "ชำรุด / ส่งซ่อม" บนแดชบอร์ด: ค่าคาดหวังนับมือจากรายการตัวอย่างด้านล่าง
const a = (condition: string, lifecycle: string) => ({ condition, lifecycle });

test('นับเฉพาะรายการที่ยังใช้งาน: ชำรุด 2 · กำลังซ่อม 1 · จำหน่ายแล้ว 2', () => {
  const assets = [
    a('damaged', 'active'),
    a('damaged', 'active'), // ชำรุดที่ยังใช้งาน 2
    a('repair', 'active'), // กำลังซ่อม 1
    a('normal', 'active'),
    a('missing', 'active'), // ไม่นับ
    a('damaged', 'disposed'),
    a('normal', 'disposed'), // จำหน่ายแล้ว 2 (ไม่นับเป็นชำรุดซ้ำ)
  ];
  assert.deepEqual(conditionSummary(assets), { damaged: 2, repair: 1, disposed: 2 });
});

test('แม่ที่แบ่งล็อตแล้ว (split) ไม่นับซ้ำกับลูก: แม่ชำรุด 1 + ลูกชำรุด 3 → ชำรุด 3', () => {
  const assets = [a('damaged', 'split'), a('damaged', 'active'), a('damaged', 'active'), a('damaged', 'active')];
  assert.deepEqual(conditionSummary(assets), { damaged: 3, repair: 0, disposed: 0 });
});

test('ไม่มีรายการ → ทุกค่าเป็น 0', () => {
  assert.deepEqual(conditionSummary([]), { damaged: 0, repair: 0, disposed: 0 });
});

// นับเป็นชิ้น: โต๊ะ 200 ตัว 1 รายการ + เก้าอี้ชำรุด 78 ตัว 1 รายการ + คอมกำลังซ่อม 2 เครื่อง + ไม่พบ 1
// รายการที่จำหน่ายแล้ว 5 ชิ้นไม่นับ · รวม 200 + 78 + 2 + 1 = 281 ชิ้น 4 รายการ
test('pieceSummary: 4 รายการ 281 ชิ้น · ปกติ 200 · ชำรุด 78 · กำลังซ่อม 2 · ไม่พบ 1 · จำหน่ายแล้วไม่นับ', () => {
  const q = (condition: string, lifecycle: string, quantity: number) => ({ condition, lifecycle, quantity });
  assert.deepEqual(
    pieceSummary([
      q('normal', 'active', 200),
      q('damaged', 'active', 78),
      q('repair', 'active', 2),
      q('missing', 'active', 1),
      q('normal', 'disposed', 5),
    ]),
    { items: 4, total: 281, normal: 200, damaged: 78, repair: 2, missing: 1 },
  );
});
