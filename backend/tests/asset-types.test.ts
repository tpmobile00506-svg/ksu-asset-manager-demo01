import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assetTypeOf, assetTypes, classify, headers11, UNKNOWN_ASSET_TYPE, type Source } from '../contracts/domain';

// ค่าคาดหวังกำหนดมือจากแถว "คณะวิศวกรรมศาสตร์ฯ ครุภัณฑ์…" ของแต่ละแผ่นในไฟล์ "ครุภัณฑ์คงเหลือ ควอ งปม 2569"
const sheetToType: Array<[string, string]> = [
  ['สำนักงาน', 'ครุภัณฑ์สำนักงาน'],
  ['คอม', 'ครุภัณฑ์คอมพิวเตอร์'],
  ['โฆษณา', 'ครุภัณฑ์โฆษณาและเผยแพร่'],
  ['วิทยาศาสตร์', 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์'],
  ['ไฟฟ้า', 'ครุภัณฑ์ไฟฟ้าและวิทยุ'],
  ['การศึกษา', 'ครุภัณฑ์การศึกษา'],
  ['เกษตร', 'ครุภัณฑ์การเกษตร'],
  ['โรงงาน', 'ครุภัณฑ์โรงงาน'],
  ['งานครัว', 'ครุภัณฑ์งานบ้านงานครัว'],
  ['สำรวจ', 'ครุภัณฑ์สำรวจ'],
  ['ยานพาหนะ', 'ครุภัณฑ์ยานพาหนะและขนส่ง'],
];

test('ชื่อแผ่นงานในไฟล์ต้นฉบับได้ประเภทครุภัณฑ์ครบ 11 ประเภท', () => {
  assert.equal(sheetToType.length, assetTypes.length);
  for (const [sheet, type] of sheetToType) assert.equal(assetTypeOf(sheet), type, sheet);
});

test('ประเภทอ่านได้จากแถวหัวของแผ่น และข้อความที่ไม่ใช่ประเภทได้ค่าว่าง', () => {
  assert.equal(assetTypeOf('คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ครุภัณฑ์โรงงาน'), 'ครุภัณฑ์โรงงาน');
  assert.equal(assetTypeOf('คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม พื้นที่นามน ครุภัณฑ์ยานพาหนะและขนส่ง'), 'ครุภัณฑ์ยานพาหนะและขนส่ง');
  assert.equal(assetTypeOf('คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม พัสดุชำรุด/เสื่อมสภาพฯ'), '');
  assert.equal(assetTypeOf('ลงข้อมูลตามพี่ปอ คอมเม้น ครั้งที่1'), '');
  assert.equal(assetTypeOf('ตัว'), '');
  assert.equal(assetTypeOf(''), '');
});

const sheet = (name: string, rows: unknown[][]) => ({ name, rows: rows.map((values, i) => ({ row: i + 1, values })) });
const faculty = (type: string) => ['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ' + type];

test('นำเข้า: ประเภทมาจากแผ่นที่รายการอยู่ ไม่ได้มาจากสาขา', () => {
  const source: Source = { id: 't', name: 't', hash: '', sheets: [
    // คอมพิวเตอร์ที่สาขาคอมแต่อยู่แผ่น "สำนักงาน" ยังเป็นครุภัณฑ์สำนักงานตามที่เจ้าหน้าที่ลงไว้
    sheet('สำนักงาน', [faculty('ครุภัณฑ์สำนักงาน'), [1, 'A-1', 'โต๊ะคอมพิวเตอร์', 1, 100, 100, 'ห้อง 1', 'วค']]),
    sheet('โรงงาน', [faculty('ครุภัณฑ์โรงงาน'), [1, 'B-1', 'เครื่องกลึง', 1, 100, 100, 'ห้อง 2', 'วอ']]),
  ] };
  const [a, b] = classify(source).filter(row => row.kind === 'asset');
  assert.equal(a.asset.category, 'ครุภัณฑ์สำนักงาน');
  assert.equal(b.asset.category, 'ครุภัณฑ์โรงงาน');
});

test('นำเข้า: แผ่นชำรุดใช้ประเภทของรหัสเดียวกันในแผ่นหลัก ไม่พบจึงเป็น "รอระบุประเภท"', () => {
  const source: Source = { id: 't', name: 't', hash: '', sheets: [
    sheet('คอม', [faculty('ครุภัณฑ์คอมพิวเตอร์'), [1, 'C-1', 'จอคอมพิวเตอร์', 1, 100, 100, '', 'วค']]),
    sheet('ชำรุด งปม 2568', [['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม พัสดุชำรุด/เสื่อมสภาพฯ'],
      [1, 'C-1', 'จอคอมพิวเตอร์', 1, 100, 100, '', 'วค'],
      [2, 'X-9', 'เก้าอี้', 1, 100, 100, '', 'สนง']]),
  ] };
  const rows = classify(source).filter(row => row.kind === 'asset' && row.sheet === 'ชำรุด งปม 2568');
  assert.equal(rows[0].asset.category, 'ครุภัณฑ์คอมพิวเตอร์');
  assert.equal(rows[1].asset.category, UNKNOWN_ASSET_TYPE);
});

test('นำเข้า: บันทึกช่วยจำในคอลัมน์ "สำนักงาน" ย้ายไปหมายเหตุ ไม่กลายเป็นประเภท', () => {
  const source: Source = { id: 't', name: 't', hash: '', sheets: [sheet('สำนักงาน', [
    headers11,
    faculty('ครุภัณฑ์สำนักงาน'),
    [1, 'D-1', 'ตู้เอกสาร', 1, 100, 100, 'อ.14', 'ห้อง 3', 'สนง', '', 'ลงข้อมูลตามพี่ปอ คอมเม้น ครั้งที่1'],
  ])] };
  const [row] = classify(source).filter(r => r.kind === 'asset');
  assert.equal(row.asset.category, 'ครุภัณฑ์สำนักงาน');
  assert.equal(row.asset.notes, 'อ.14 · ลงข้อมูลตามพี่ปอ คอมเม้น ครั้งที่1');
});

test('ไฟล์ต้นฉบับจริง: รายการในแผ่นหลักได้ประเภทตามแผ่นทุกรายการ', () => {
  const provided = JSON.parse(readFileSync(new URL('../data/provided.json', import.meta.url), 'utf8')) as Source;
  const rows = classify(provided).filter(row => row.kind === 'asset');
  for (const [sheetName, type] of sheetToType) {
    const inSheet = rows.filter(row => row.sheet === sheetName);
    assert.ok(inSheet.length > 0, sheetName);
    assert.ok(inSheet.every(row => row.asset.category === type), sheetName);
  }
});
