import test from 'node:test';
import assert from 'node:assert/strict';
import { stocktakeDifference } from '../contracts/domain';

// ค่าคาดหวังทุกข้อคำนวณมือ: ผลต่าง = จำนวนในทะเบียน - จำนวนที่พบ (ขาด) หรือ จำนวนที่พบ - จำนวนในทะเบียน (เกิน)

test('พบครบตามทะเบียน: 150 พบ 150 → ตรง ผลต่าง 0', () => {
  assert.deepEqual(stocktakeDifference(150, 150), { kind: 'match', amount: 0 });
});

test('พบน้อยกว่าทะเบียน: 150 พบ 148 → ขาด 2 (150 - 148)', () => {
  assert.deepEqual(stocktakeDifference(150, 148), { kind: 'short', amount: 2 });
});

test('ไม่พบเลย: 50 พบ 0 → ขาด 50', () => {
  assert.deepEqual(stocktakeDifference(50, 0), { kind: 'short', amount: 50 });
});

test('พบมากกว่าทะเบียน: 1 พบ 3 → เกิน 2 (3 - 1)', () => {
  assert.deepEqual(stocktakeDifference(1, 3), { kind: 'over', amount: 2 });
});

test('ยังไม่ได้ตรวจ (ไม่มีจำนวนที่พบ) → unchecked ไม่นับเป็นขาด', () => {
  assert.deepEqual(stocktakeDifference(10, null), { kind: 'unchecked', amount: 0 });
  assert.deepEqual(stocktakeDifference(10, undefined), { kind: 'unchecked', amount: 0 });
});

test('จำนวนที่ไม่ใช่จำนวนเต็มไม่ติดลบถูกปฏิเสธ', () => {
  assert.throws(() => stocktakeDifference(10, -1));
  assert.throws(() => stocktakeDifference(10, 2.5));
  assert.throws(() => stocktakeDifference(-1, 0));
});
