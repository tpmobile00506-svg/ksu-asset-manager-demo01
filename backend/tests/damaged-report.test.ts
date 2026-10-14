import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Asset } from '../contracts/domain';
import { assetReportPageCount, createDamagedWorkbook } from '../../frontend/services/excel-export';

const asset = (code: string, branch: string, totalSatang: number, category = 'ครุภัณฑ์คอมพิวเตอร์') => ({
  id: code, code, name: 'รายการ ' + code, quantity: 1, unitSatang: totalSatang, totalSatang,
  notes: '', location: 'ห้อง 1', branch, groupName: '', category, lifecycle: 'active', condition: 'damaged',
} as unknown as Asset);

test('จำนวนหน้ารายงานคงเหลือ: นับแยกแผ่นตามประเภท แผ่นละ 48 รายการ', () => {
  // คอมพิวเตอร์ 49 รายการ = 2 หน้า, สำนักงาน 1 รายการ = 1 หน้า → รวม 3 หน้า
  const assets = [
    ...Array.from({ length: 49 }, (_, i) => asset('C-' + i, 'วค', 100)),
    asset('S-1', 'สนง', 100, 'ครุภัณฑ์สำนักงาน'),
  ];
  assert.equal(assetReportPageCount(assets), 3);
  assert.equal(assetReportPageCount([]), 1);
});

test('รายงานพัสดุชำรุด: หัวรายงาน แนบท้ายหน้า หัวข้อสาขาเรียงตามเอกสาร และลำดับต่อเนื่อง', async () => {
  const wb = await createDamagedWorkbook([
    asset('V-1', 'วิศวกรรมคอมพิวเตอร์ (วค)', 350000),          // 3,500.00
    asset('S-1', 'สนง', 99938),                                  // 999.38
    asset('V-2', 'วค.', 2471700),                                // 24,717.00
  ], { fiscalYear: 2569, mainReportPages: 10 });
  const s = wb.worksheets[0];
  assert.equal(s.getCell('G1').value, 'พัสดุชำรุด');
  assert.equal(s.getCell('C2').value, 'รายละเอียดครุภัณฑ์ชำรุด เสื่อมสภาพ');
  assert.equal(s.getCell('G2').value, 'แนบท้ายหน้า 11');
  assert.equal(s.getCell('C3').value, 'ประจำปีงบประมาณ 2569');
  assert.equal(s.getCell('A5').value, 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม');
  // สำนักงานคณะมาก่อนสาขาคอมพิวเตอร์ ตามลำดับในเอกสารแนบท้ายของเจ้าหน้าที่
  assert.equal(s.getCell('B6').value, 'สำนักงานคณะวิศวกรรมศาสตร์ฯ');
  assert.deepEqual([s.getCell('A7').value, s.getCell('B7').value], [1, 'S-1']);
  assert.equal(s.getCell('B8').value, 'สาขาวิชาวิศวกรรมคอมพิวเตอร์');
  assert.deepEqual([s.getCell('A9').value, s.getCell('B9').value], [2, 'V-1']);
  assert.deepEqual([s.getCell('A10').value, s.getCell('B10').value], [3, 'V-2']);
  assert.equal(s.getCell('A11').value, 'รวม');
  assert.deepEqual(s.getCell('F11').value, { formula: 'SUM(F6:F10)' });
  // 999.38 + 3,500.00 + 24,717.00 = 29,216.38 บาท
  const amounts = [7, 9, 10].map(r => Math.round(Number(s.getCell('F' + r).value) * 100));
  assert.equal(amounts.reduce((a, b) => a + b, 0), 2921638);
});

test('รายงานพัสดุชำรุด: เกิน 32 บรรทัดขึ้นหน้าใหม่ พร้อมยอดยกไป/ยอดยกมา และแนบท้ายหน้าถัดไป', async () => {
  // หัวข้อสาขา 1 บรรทัด + 40 รายการ = 41 บรรทัด → หน้าแรก 32 บรรทัด (แถว 6–37) ยอดยกไปแถว 38
  const wb = await createDamagedWorkbook(Array.from({ length: 40 }, (_, i) => asset('V-' + i, 'วค', 100)), { fiscalYear: 2569, mainReportPages: 10 });
  const s = wb.worksheets[0];
  assert.equal(s.getCell('C38').value, 'ยอดยกไป');
  assert.deepEqual(s.getCell('F38').value, { formula: 'SUM(F6:F37)' });
  // หน้า 2: หัว 39–41 + หัวตาราง 42 + ยอดยกมา 43 + รายการ 44–52 (9 รายการ) + รวม 53
  assert.equal(s.getCell('G40').value, 'แนบท้ายหน้า 12');
  assert.equal(s.getCell('C43').value, 'ยอดยกมา');
  assert.deepEqual(s.getCell('F43').value, { formula: 'F38' });
  assert.equal(s.getCell('A52').value, 40);
  assert.equal(s.getCell('A53').value, 'รวม');
  assert.equal(s.pageSetup.printArea, 'A1:G53');
});
