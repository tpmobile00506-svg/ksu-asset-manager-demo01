import assert from 'node:assert/strict';
import { test } from 'node:test';
import { thaiDateOnly, thaiDateTime } from '../contracts/domain';

// ค่าคาดหวังกำหนดมือ: ปี พ.ศ. = ปี ค.ศ. + 543, เดือนตามตัวย่อราชการ

test('แปลงวันที่ ISO เป็น พ.ศ.: 2026-10-01 → 1 ต.ค. 2569', () => {
  assert.equal(thaiDateOnly('2026-10-01'), '1 ต.ค. 2569');
});

test('วันสุดท้ายของปี/ปีอธิกสุรทิน: 2026-12-31 → 31 ธ.ค. 2569, 2024-02-29 → 29 ก.พ. 2567', () => {
  assert.equal(thaiDateOnly('2026-12-31'), '31 ธ.ค. 2569');
  assert.equal(thaiDateOnly('2024-02-29'), '29 ก.พ. 2567');
});

test('ค่าที่ไม่ใช่วันที่จริงคืนข้อความเดิม (ไม่เดา): ว่าง, 2024-02-31, 1/10/2026', () => {
  assert.equal(thaiDateOnly(''), '');
  assert.equal(thaiDateOnly('2024-02-31'), '2024-02-31');
  assert.equal(thaiDateOnly('1/10/2026'), '1/10/2026');
});

// สร้างวันที่ด้วยเวลาเครื่อง จึงได้ผลเดียวกันทุกเขตเวลา: 31 ก.ค. 2026 07:05 → ปี 2026 + 543 = 2569
test('เวลาที่บันทึก: 31 ก.ค. 2569 07:05 น. · ไม่เอาเวลา: 31 ก.ค. 2569 · ค่าเสียคืนข้อความเดิม', () => {
  const t = new Date(2026, 6, 31, 7, 5);
  assert.equal(thaiDateTime(t), '31 ก.ค. 2569 07:05 น.');
  assert.equal(thaiDateTime(t, false), '31 ก.ค. 2569');
  assert.equal(thaiDateTime(new Date(2024, 1, 29, 23, 59)), '29 ก.พ. 2567 23:59 น.');
  assert.equal(thaiDateTime('ไม่ใช่วันที่'), 'ไม่ใช่วันที่');
});
