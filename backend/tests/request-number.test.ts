import assert from 'node:assert/strict';
import { test } from 'node:test';
import { thaiFiscalYear, formatRequestNo, nextRequestSeq, requestNumbers } from '../contracts/domain';

// เลขที่คำขอ REQ-<ปีงบ พ.ศ.>-<ลำดับ 4 หลัก> รันใหม่ทุกปีงบ (1 ต.ค.) ตามเวลาไทย · ค่าคาดหวังคำนวณมือ

test('ปีงบตามเวลาไทย: 30 ก.ย. 2569 23:59 น. (16:59Z) → 2569 · 1 ต.ค. 2569 00:00 น. (30 ก.ย. 17:00Z) → 2570', () => {
  assert.equal(thaiFiscalYear('2026-09-30T16:59:59.999Z'), 2569);   // ก.ย. 2026 → 2026 + 543 = 2569
  assert.equal(thaiFiscalYear('2026-09-30T17:00:00.000Z'), 2570);   // ต.ค. 2026 → 2569 + 1
  assert.equal(thaiFiscalYear('2027-01-15T03:00:00.000Z'), 2570);   // ม.ค. 2027 → 2027 + 543 = 2570
});

test('รูปแบบเลขที่: REQ-2570-0001 · REQ-2569-0123', () => {
  assert.equal(formatRequestNo(2570, 1), 'REQ-2570-0001');
  assert.equal(formatRequestNo(2569, 123), 'REQ-2569-0123');
});

test('ลำดับถัดไป: ไม่มีคำขอ → 1 · คำขอเก่า 2 รายการ → 3 · คำขอเก่า 1 + seq 5 → max(2, 5) + 1 = 6', () => {
  assert.equal(nextRequestSeq([]), 1);
  assert.equal(nextRequestSeq([{ payload: '{}' }, { payload: '{"location":"ห้อง 1"}' }]), 3);
  assert.equal(nextRequestSeq([{ payload: '{}' }, { payload: '{"seq":5}' }]), 6);
});

test('คำขอเก่าที่ไม่มี seq: เรียงตามเวลายื่นในแต่ละปีงบ และเริ่ม 0001 ใหม่เมื่อขึ้นปีงบใหม่', () => {
  const numbers = requestNumbers([
    { id: 'c', createdAt: '2026-10-02T02:00:00.000Z', payload: '{}' },   // ปีงบ 2570 รายการแรก
    { id: 'b', createdAt: '2026-08-20T02:00:00.000Z', payload: '{}' },   // ปีงบ 2569 ลำดับ 2
    { id: 'a', createdAt: '2026-08-01T02:00:00.000Z', payload: '{}' },   // ปีงบ 2569 ลำดับ 1
    { id: 'd', createdAt: '2026-09-30T16:00:00.000Z', payload: '{}' },   // 23:00 น. 30 ก.ย. → ปีงบ 2569 ลำดับ 3
  ]);
  assert.deepEqual(Object.fromEntries(numbers), { a: 'REQ-2569-0001', b: 'REQ-2569-0002', d: 'REQ-2569-0003', c: 'REQ-2570-0001' });
});

test('คำขอใหม่ใช้ seq ที่บันทึกไว้ · เวลาเท่ากันเรียงด้วย id', () => {
  const numbers = requestNumbers([
    { id: 'x2', createdAt: '2026-10-05T00:00:00.000Z', payload: '{}' },
    { id: 'x1', createdAt: '2026-10-05T00:00:00.000Z', payload: '{}' },
    { id: 'new', createdAt: '2026-10-06T00:00:00.000Z', payload: '{"location":"ห้อง 2","seq":3}' },
  ]);
  assert.deepEqual(Object.fromEntries(numbers), { x1: 'REQ-2570-0001', x2: 'REQ-2570-0002', new: 'REQ-2570-0003' });
});
