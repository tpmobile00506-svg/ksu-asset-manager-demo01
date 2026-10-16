import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, headers11, type Source } from '../contracts/domain';

// เจ้าหน้าที่เปลี่ยนประเภทแถวต้นฉบับเองในหน้านำเข้าแบบ Excel (ผู้ใช้ขอ 16 ต.ค. 2569)
const source = (rows: unknown[][]): Source => ({ id: 'src', name: 'src.xlsx', hash: '', sheets: [{ name: 'โฆษณา', rows: rows.map((values, i) => ({ row: i + 1, values })) }] });
const sheet = () => source([
  headers11,
  [null, null, 'ครุภัณฑ์เครื่องมัลติมีเดียโปรเจคเตอร์ งบประมาณ 2563'],                       // 2 หัวทุน (ระบบเดาเอง)
  ['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม ตำบลกาฬสินธุ์ อำเภอเมือง จังหวัดกาฬสินธุ์'],     // 3 ตกบรรทัด แต่ระบบเดาเป็นหัวกระดาษ
  [1, 'P-1', 'เครื่องโปรเจคเตอร์', 1, 31500, 31500, 'อาคาร 14', 'วค'],                        // 4
  ['เริ่มลงข้อมูล งปม2569'],                                                                  // 5 บันทึกของเจ้าหน้าที่
  ['16. แหล่งจ่ายแรงดันไฟฟ้าสำหรับการทดสอบ 1 เครื่อง'],                                        // 6 ของจริงที่พิมพ์รวมช่องเดียว
]);
const row = (rows: ReturnType<typeof classify>, n: number) => rows.find(r => r.row === n)!;

test('ไม่มีการเปลี่ยน: ระบบเดาบรรทัดที่ 3 เป็นหัวกระดาษ ชื่อทุนจึงขาดครึ่งหลัง', () => {
  const rows = classify(sheet());
  assert.equal(row(rows, 3).kind, 'header');
  assert.equal(row(rows, 4).fund?.name, 'ครุภัณฑ์เครื่องมัลติมีเดียโปรเจคเตอร์ งบประมาณ 2563');
});

test('บรรทัดต่อ: ข้อความไปต่อท้ายชื่อหัวทุนด้านบน รายการข้างล่างได้ชื่อทุนเต็ม', () => {
  const rows = classify(sheet(), { 'โฆษณา:3': 'continue' });
  assert.equal(row(rows, 3).kind, 'note');
  assert.equal(row(rows, 3).override, 'continue');
  assert.equal(row(rows, 4).fund?.name, 'ครุภัณฑ์เครื่องมัลติมีเดียโปรเจคเตอร์ งบประมาณ 2563 คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม ตำบลกาฬสินธุ์ อำเภอเมือง จังหวัดกาฬสินธุ์');
});

test('หัวทุน / ข้าม / ครุภัณฑ์: เปลี่ยนตามที่เจ้าหน้าที่เลือก', () => {
  const rows = classify(sheet(), { 'โฆษณา:5': 'fund', 'โฆษณา:6': 'asset' });
  assert.equal(row(rows, 5).kind, 'group');
  assert.equal(row(rows, 6).fund?.name, 'เริ่มลงข้อมูล งปม2569');          // รายการข้างล่างอยู่ใต้หัวทุนใหม่
  assert.equal(row(rows, 6).kind, 'asset');
  assert.equal(row(rows, 6).asset.name, '16. แหล่งจ่ายแรงดันไฟฟ้าสำหรับการทดสอบ 1 เครื่อง');
  assert.match(row(rows, 6).issue, /ต้องตรวจรหัส ชื่อ จำนวน และราคา/);
  const skipped = classify(sheet(), { 'โฆษณา:4': 'skip' });
  assert.equal(row(skipped, 4).kind, 'note');
  assert.equal(skipped.filter(r => r.kind === 'asset').length, 0);
});
