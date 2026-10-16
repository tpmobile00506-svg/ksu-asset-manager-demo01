import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fiscalYearOf, type Asset } from '../contracts/domain';
import { createAssetWorkbook } from '../../frontend/services/excel-export';

test('ปีงบประมาณเริ่ม 1 ตุลาคม', () => {
  assert.equal(fiscalYearOf(new Date(2026, 7, 13)), 2569);   // 13 ส.ค. 2569 (ชื่อไฟล์ต้นฉบับ 13082569)
  assert.equal(fiscalYearOf(new Date(2026, 8, 30)), 2569);   // 30 ก.ย. 2569 วันสุดท้ายของปีงบ 2569
  assert.equal(fiscalYearOf(new Date(2026, 9, 1)), 2570);    // 1 ต.ค. 2569 ขึ้นปีงบ 2570
});

const asset = (code: string, category: string, branch: string, i = 0) => ({
  id: code, code, name: 'รายการ ' + code, quantity: 1, unitSatang: 100000, totalSatang: 100000, // 1 × 1,000.00 บาท
  notes: '', location: 'ห้อง 1', branch, groupName: 'โต๊ะ', category, lifecycle: 'active', condition: 'normal',
} as unknown as Asset);

test('Export แยกแผ่นตามประเภท เรียงตามไฟล์ต้นฉบับ เลขหน้าต่อกัน และใช้ชื่อย่อสาขา', async () => {
  const wb = await createAssetWorkbook([
    asset('C-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วิศวกรรมคอมพิวเตอร์ (วค)'),
    asset('S-1', 'ครุภัณฑ์สำนักงาน', 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)'),
  ], { fiscalYear: 2569 });
  assert.deepEqual(wb.worksheets.map((s: any) => s.name), ['สำนักงาน', 'คอม']);   // ชื่อแผ่นสั้นแบบไฟล์ต้นฉบับ
  const [office, computer] = wb.worksheets;
  assert.equal(office.getCell('A1').font.name, 'TH Sarabun New');
  assert.equal(office.getCell('A3').value, 'ประจำปีงบประมาณ 2569');
  assert.equal(office.getCell('A5').value, 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ครุภัณฑ์สำนักงาน');
  assert.equal(computer.getCell('A5').value, 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ครุภัณฑ์คอมพิวเตอร์');
  assert.equal(office.getCell('J2').value, 1);
  assert.equal(computer.getCell('J2').value, 2);
  assert.equal(office.getCell('H6').value, 'สนง');
  assert.equal(computer.getCell('H6').value, 'วค');
  assert.equal(computer.getCell('I6').value, 'คอม');   // หมวด = ชื่อแผ่นงานของประเภท
  assert.equal(computer.getCell('J6').value, 'ครุภัณฑ์คอมพิวเตอร์');
});

test('Export ชุด: หัวชุดไม่มีลำดับ ชิ้นส่วนขึ้น "รวมในชุด" หัวทุนไม่มีลำดับ และยอดรวมไม่นับชิ้นส่วนซ้ำ', async () => {
  const inSet = (a: Asset, setId: string, setRole: string, setKind: string, setName: string) => ({ ...a, setId, setRole, setKind, setName } as Asset);
  const plain = asset('X-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค');                                                    // 1,000.00
  const header = inSet({ ...asset('S-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), name: 'ชุดตัดต่อ ประกอบด้วย', totalSatang: 16050000, unitSatang: 16050000 }, 'set-a', 'header', 'package', 'ชุดตัดต่อ ประกอบด้วย');
  const part1 = inSet({ ...asset('S-1-ชิ้น1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), totalSatang: 0, unitSatang: 0 }, 'set-a', 'part', 'package', 'ชุดตัดต่อ ประกอบด้วย');
  const part2 = inSet({ ...asset('S-1-ชิ้น2', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), totalSatang: 0, unitSatang: 0 }, 'set-a', 'part', 'package', 'ชุดตัดต่อ ประกอบด้วย');
  const member = (code: string) => ({ ...asset(code, 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), totalSatang: 2760425, unitSatang: 2760425, fundId: 'fund-b', fundName: 'ชุดครุภัณฑ์ทดแทน' } as Asset);
  const wb = await createAssetWorkbook([plain, header, part1, part2, member('M-1'), member('M-2')], { fiscalYear: 2569 });
  const s = wb.worksheets[0];
  // แถว 6: ลำดับ 1 / 7: หัวชุดไม่มีลำดับ / 8–9: ชิ้นส่วนลำดับ 2–3 / 10: หัวข้อชุด / 11–12: ลำดับ 4–5 / 13: รวม
  assert.deepEqual([s.getCell('A6').value, s.getCell('B6').value], [1, 'X-1']);
  assert.deepEqual([s.getCell('A7').value, s.getCell('B7').value, s.getCell('C7').value, s.getCell('F7').value], [null, 'ชุดตัดต่อ ประกอบด้วย', null, 160500]);
  assert.deepEqual([s.getCell('A8').value, s.getCell('B8').value, s.getCell('E8').value, s.getCell('F8').value], [2, 'S-1-ชิ้น1', null, 'รวมในชุด']);
  assert.equal(s.getCell('A9').value, 3);
  assert.deepEqual([s.getCell('A10').value, s.getCell('B10').value, s.getCell('C10').value], [null, 'ชุดครุภัณฑ์ทดแทน', null]);
  assert.deepEqual([s.getCell('A11').value, s.getCell('A12').value], [4, 5]);
  assert.equal(s.getCell('B7').font.bold, false);
  assert.equal(s.getRow(7).height, s.getRow(6).height);
  assert.equal(s.getCell('A13').value, 'รวม');
  // 1,000.00 + 160,500.00 + 27,604.25 × 2 = 216,708.50 บาท (ข้อความ "รวมในชุด" ไม่ถูกบวก)
  const numeric = [6, 7, 8, 9, 10, 11, 12].map(r => s.getCell('F' + r).value).filter(v => typeof v === 'number') as number[];
  assert.equal(Math.round(numeric.reduce((a, b) => a + b, 0) * 100), 21670850);
});

test('Export 49 รายการ: หน้าแรก 48 รายการ ยอดยกไปแถว 54 หน้าสองยกยอดมาแถว 59 รวมแถว 61', async () => {
  const wb = await createAssetWorkbook(
    Array.from({ length: 49 }, (_, i) => asset('C-' + i, 'ครุภัณฑ์คอมพิวเตอร์', 'วิศวกรรมคอมพิวเตอร์ (วค)', i)),
    { fiscalYear: 2569 });
  const s = wb.worksheets[0];
  // หน้า 1: หัว 3 แถว + หัวตาราง (4) + แถวคณะ (5) + ข้อมูลแถว 6–53 + ยอดยกไปแถว 54
  assert.equal(s.getCell('E54').value, 'ยอดยกไป');
  assert.deepEqual(s.getCell('F54').value, { formula: 'SUM(F6:F53)' });
  // หน้า 2: หัว 55–57 + หัวตาราง 58 + แถวคณะ/ยอดยกมา 59 + ข้อมูลแถว 60 + รวมแถว 61
  assert.equal(s.getCell('A55').value, 'มหาวิทยาลัยกาฬสินธุ์');
  assert.equal(s.getCell('J56').value, 2);
  assert.equal(s.getCell('E59').value, 'ยอดยกมา');
  assert.deepEqual(s.getCell('F59').value, { formula: 'F54' });
  assert.equal(s.getCell('B60').value, 'C-48');
  assert.equal(s.getCell('A61').value, 'รวม');
  assert.deepEqual(s.getCell('F61').value, { formula: 'SUM(F59, F60:F60)' });
  assert.equal(s.pageSetup.printArea, 'A1:J61');
});

test('หน้าส่งออก: เลือกสาขา วค ได้เฉพาะของ วค รายการชำรุดแยกไปแนบท้าย แถวสีน้ำเงินยังเป็นชื่อคณะ', async () => {
  const { reportSelection, createReportWorkbook, reportFileName } = await import('../../frontend/services/excel-export');
  const damaged = { ...asset('D-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), condition: 'damaged' } as Asset;
  const disposed = { ...asset('Z-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), lifecycle: 'disposed' } as Asset;
  const all = [asset('C-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), asset('S-1', 'ครุภัณฑ์สำนักงาน', 'วค.'), asset('E-1', 'ครุภัณฑ์คอมพิวเตอร์', 'วฟ'), damaged, disposed];
  const r = { kind: 'both' as const, branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', fiscalYear: 2569, layout: 'portrait' as const, excludeDamaged: true };
  const sel = reportSelection(all, r);
  // วค ที่ยังใช้งาน 3 รายการ (C-1, S-1, D-1): คงเหลือ 2 (ไม่รวมชำรุด) + ชำรุด 1 · จำหน่ายแล้วและสาขาอื่นไม่นับ
  assert.deepEqual(sel.remaining.map(a => a.code), ['C-1', 'S-1']);
  assert.deepEqual(sel.damaged.map(a => a.code), ['D-1']);
  assert.equal(sel.mainPages, 2);                  // 2 ประเภท แผ่นละ 1 หน้า
  assert.equal(sel.remainingSatang, 200000);       // 2 × 1,000.00 บาท
  assert.equal(reportFileName(r), 'รายงานครุภัณฑ์คงเหลือและชำรุด-วค-ปีงบ2569.xlsx');
  const wb = await createReportWorkbook(all, r);
  assert.deepEqual(wb.worksheets.map((s: any) => s.name), ['สำนักงาน', 'คอม', 'พัสดุชำรุด']);
  assert.equal(wb.worksheets[0].getCell('A5').value, 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ครุภัณฑ์สำนักงาน');
  const damagedSheet = wb.worksheets[2];
  assert.equal(damagedSheet.getCell('G2').value, 'แนบท้ายหน้า 3');
  assert.equal(damagedSheet.getCell('A5').value, 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม');
  assert.equal(damagedSheet.getCell('B6').value, 'สาขาวิชาวิศวกรรมคอมพิวเตอร์');   // หัวข้อสาขาอยู่แถวถัดไป
});

test('แบบหน้าแนวนอน: 16 แถวต่อหน้า และตั้งกระดาษแนวนอน', async () => {
  const { createAssetWorkbook: create, assetReportPageCount } = await import('../../frontend/services/excel-export');
  const list = Array.from({ length: 17 }, (_, i) => asset('L-' + i, 'ครุภัณฑ์คอมพิวเตอร์', 'วค'));
  assert.equal(assetReportPageCount(list, 'landscape'), 2);   // 17 รายการ / 16 ต่อหน้า = 2 หน้า
  assert.equal(assetReportPageCount(list, 'portrait'), 1);
  const s = (await create(list, { fiscalYear: 2569, layout: 'landscape' })).worksheets[0];
  assert.equal(s.pageSetup.orientation, 'landscape');
  // หน้า 1: ข้อมูลแถว 6–21 (16 รายการ) ยอดยกไปแถว 22
  assert.equal(s.getCell('E22').value, 'ยอดยกไป');
});

test('แบบเต็มหน้า: 64 แถวต่อหน้า ยอดยกไปแถว 70', async () => {
  const { createAssetWorkbook: create, assetReportPageCount } = await import('../../frontend/services/excel-export');
  const list = Array.from({ length: 65 }, (_, i) => asset('F-' + i, 'ครุภัณฑ์คอมพิวเตอร์', 'วค'));
  assert.equal(assetReportPageCount(list, 'full'), 2);       // 65 รายการ / 64 ต่อหน้า = 2 หน้า
  assert.equal(assetReportPageCount(list, 'portrait'), 2);
  const s = (await create(list, { fiscalYear: 2570, layout: 'full' })).worksheets[0];
  // หน้า 1: ข้อมูลแถว 6–69 (64 รายการ) ยอดยกไปแถว 70
  assert.equal(s.getCell('E70').value, 'ยอดยกไป');
  assert.equal(s.pageSetup.orientation, 'portrait');
});

test('หัวทุน: ขึ้นเหนือเฉพาะรายการที่ใส่เข้าทุน รายการในทุนอยู่ติดกัน รายการอื่นไม่มีหัวทุน', async () => {
  const inFund = (code: string) => ({ ...asset(code, 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), fundId: 'fund-lab', fundName: 'ทุนห้องปฏิบัติการ' } as Asset);
  // ลำดับในทะเบียน: A(ทุน) B(ไม่มีทุน) C(ทุน) D(ไม่มีทุน)
  const list = [inFund('A'), asset('B', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), inFund('C'), asset('D', 'ครุภัณฑ์คอมพิวเตอร์', 'วค')];
  const s = (await createAssetWorkbook(list, { fiscalYear: 2570 })).worksheets[0];
  const rows = [6, 7, 8, 9, 10].map(r => [s.getCell('A' + r).value, s.getCell('B' + r).value]);
  assert.deepEqual(rows, [[null, 'ทุนห้องปฏิบัติการ'], [1, 'A'], [2, 'C'], [3, 'B'], [4, 'D']]);
  assert.equal(s.getCell('B6').font.bold, true);
  assert.equal(s.getCell('H6').value, null);   // ทุนเดียวมีหลายสาขาได้ ช่องสาขาของหัวทุนจึงว่าง
});

test('ชุดห้ามแยกที่บางชิ้นอยู่ในทุน บางชิ้นไม่มีทุน: ทั้งชุดอยู่ติดกันใต้ทุนของหัวชุด', async () => {
  const inSet = (a: Asset, setRole: string) => ({ ...a, setId: 'set-x', setRole, setKind: 'lot', setName: 'ชุดทดสอบ' } as Asset);
  const fund = { fundId: 'fund-lab', fundName: 'ทุนห้องปฏิบัติการ' };
  // ลำดับในทะเบียน: P1(ชิ้นในชุด ไม่มีทุน) B(ไม่มีทุน) H(หัวชุด อยู่ในทุน) P2(ชิ้นในชุด ไม่มีทุน)
  const list = [
    inSet(asset('P1', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), 'member'),
    asset('B', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'),
    inSet({ ...asset('H', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), ...fund } as Asset, 'header'),
    inSet(asset('P2', 'ครุภัณฑ์คอมพิวเตอร์', 'วค'), 'member'),
  ];
  const s = (await createAssetWorkbook(list, { fiscalYear: 2570 })).worksheets[0];
  const codes = [6, 7, 8, 9, 10].map(r => s.getCell('B' + r).value);
  // หัวทุนอยู่ตำแหน่งรายการแรกของชุด ตามด้วยหัวชุดและชิ้นในชุดทั้งหมด แล้วจึงเป็น B
  assert.deepEqual(codes, ['ทุนห้องปฏิบัติการ', 'H', 'P1', 'P2', 'B']);
});
