import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, type Source } from '../contracts/domain';

// จำลองแถวจริงในแผ่น "คอม" ของไฟล์ "ครุภัณฑ์คงเหลือ ควอ งปม 2569" (ลำดับ 24–32) และหัวกระดาษหน้าถัดไป
const คอม: unknown[][] = [
  ['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ครุภัณฑ์คอมพิวเตอร์'],
  [24, '156-034-15-15.55-23-30', 'เครื่องคอมพิวเตอร์โน๊ตบุ๊ค Dell vostro', 1, 31030, 31030, 'อ.ออกแบบ', 'นอส'],
  [null, 'ชุดตัดต่อแบบ NonLinear แบบตั้งโต๊ะ จำนวน 1 เซท ประกอบด้วย', null, 1, 160500, 160500, 'อาคารโรงงานวิศวคอมฯ', 'วค'],
  [25, '156-034-15-15.58-1-1', '1. ชุดตัดต่อแบบ NonLinear แบบตั้งโต๊ะ', null, null, null, null, 'วค'],
  [26, '156-034-15-15.58-1-1', '2. เครื่องคอมฯ สำหรับงานตัดต่อ HP Z220 CMT', null, null, null, null, 'วค'],
  [27, '254-034-15-15.32-2-5', 'เครื่องสำรองไฟ ขนาด 500VA', 1, 2500, 2500, 'อาคารโรงงานวิศวคอมฯ', 'วค'],
  [null, 'ชุดครุภัณฑ์ทดแทนของมหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตกาฬสินธุ์ จำนวน 1 ชุด', null, null, null, null, null, 'วค'],
  [28, '4159-4332-060-03-44', 'เครื่องคอมพิวเตอร์ HP PRODESK 400 G3', 1, 27604.25, 27604.25, 'อ.โรงงาน', 'วค'],
  [null, null, null, null, 'ยอดยกไป', 1283703.25],
  ['มหาวิทยาลัยกาฬสินธุ์'],
  ['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม', null, null, null, 'ยอดยกมา', 1283703.25],
  [29, '4159-4332-060-03-45', 'เครื่องคอมพิวเตอร์ HP PRODESK 400 G3', 1, 27604.25, 27604.25, 'อ.โรงงาน', 'วค'],
  [null, 'ครุภัณฑ์ห้องปฏิบัติการเขียนแบบคอมพิวเตอร์ทางด้านวิศวกรรม'],
  [null, 'ประกอบด้วยครุภัณฑ์ 11 รายการ'],
  [63, 'KSU161-2.09-060-004-1(32)', 'เครื่องคอมพิวเตอร์ Lenovo รุ่น V520', 1, 30000, 30000, 'อ. 14 ห้อง 1445', 'วศค.'],
];
const ห้องแล็บ: unknown[][] = [
  ['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม   ครุภัณฑ์คอมพิวเตอร์'],
  [4, '4155-4332-025-99-1(1)', 'ครุภัณฑ์ห้องปฏิบัติการคอมพิวเตอร์', 1, 899922, 899922, null, 'สนง (วค)'],
  [5, '4155-4332-025-99-1(1)/1-2(36)', 'คอมพิวเตอร์ OPTIMAX รุ่น MAX SERIES', 1, null, null, 'อ.โรงงานวิศวะคอมฯ', 'วค'],
  [6, '4155-4332-025-99-1(1)/1-4(36)', 'คอมพิวเตอร์ OPTIMAX รุ่น MAX SERIES', 1, 'ครุภัณฑ์ประกอบ', null, 'อ.คอมฯ ชั้น 1', 'วค'],
  [7, '255-034-02-02.25-1-4', 'หุ่นยนต์ LEGO (NXT) พร้อม Software', 1, 0, 0, 'อ.โรงงาน', 'วค'],
];
const source = (name: string, rows: unknown[][]): Source => ({ id: 't', name: 't', hash: '', sheets: [{ name, rows: rows.map((values, i) => ({ row: i + 1, values })) }] });
const byName = (rows: ReturnType<typeof classify>, name: string) => rows.find(r => r.kind === 'asset' && r.asset.name === name)!;

test('หัวชุดไม่มีลำดับแต่มีราคา: เป็นครุภัณฑ์ถือมูลค่าทั้งชุด ใช้หมายเลขของชิ้นส่วน ชิ้นส่วนต่อท้าย -ชิ้น', () => {
  const rows = classify(source('คอม', คอม));
  const header = byName(rows, 'ชุดตัดต่อแบบ NonLinear แบบตั้งโต๊ะ จำนวน 1 เซท ประกอบด้วย');
  assert.equal(header.set?.kind, 'package');
  assert.equal(header.set?.role, 'header');
  assert.equal(header.asset.code, '156-034-15-15.58-1-1');
  assert.equal(header.asset.totalSatang, 16050000);                 // 160,500.00 บาท
  assert.equal(header.issueType, 'set');
  const p1 = byName(rows, '1. ชุดตัดต่อแบบ NonLinear แบบตั้งโต๊ะ');
  const p2 = byName(rows, '2. เครื่องคอมฯ สำหรับงานตัดต่อ HP Z220 CMT');
  assert.deepEqual([p1.asset.code, p2.asset.code], ['156-034-15-15.58-1-1-ชิ้น1', '156-034-15-15.58-1-1-ชิ้น2']);
  for (const p of [p1, p2]) {
    assert.equal(p.set?.role, 'part');
    assert.equal(p.set?.key, header.set?.key);
    assert.equal(p.asset.totalSatang, 0);                            // มูลค่ารวมอยู่ที่หัวชุดแล้ว
    assert.equal(p.asset.quantity, 1);
  }
});

test('ชุดจบเมื่อเจอรายการที่มีราคาของตัวเอง: ลำดับ 27 เครื่องสำรองไฟไม่อยู่ในชุดตัดต่อ', () => {
  const rows = classify(source('คอม', คอม));
  assert.equal(byName(rows, 'เครื่องสำรองไฟ ขนาด 500VA').set, undefined);
  assert.equal(byName(rows, 'เครื่องคอมพิวเตอร์โน๊ตบุ๊ค Dell vostro').set, undefined);
});

test('หัวทุนไม่มีราคา: เป็นแค่รายการแนะนำ (ไม่ใช่ชุดห้ามแยก) ต่อเนื่องแม้ข้ามหน้า และหัวหลายบรรทัดรวมเป็นชื่อเดียว', () => {
  const rows = classify(source('คอม', คอม));
  const [hp1, hp2] = rows.filter(r => r.kind === 'asset' && r.asset.name === 'เครื่องคอมพิวเตอร์ HP PRODESK 400 G3');
  for (const hp of [hp1, hp2]) {
    assert.equal(hp.set, undefined);                                 // โอนย้ายทีละเครื่องได้
    assert.equal(hp.fund?.name, 'ชุดครุภัณฑ์ทดแทนของมหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตกาฬสินธุ์ จำนวน 1 ชุด');
    assert.equal(hp.asset.totalSatang, 2760425);                     // 27,604.25 บาท ของตัวเอง
  }
  assert.equal(hp1.fund?.key, hp2.fund?.key);
  const lenovo = byName(rows, 'เครื่องคอมพิวเตอร์ Lenovo รุ่น V520');
  assert.equal(lenovo.fund?.name, 'ครุภัณฑ์ห้องปฏิบัติการเขียนแบบคอมพิวเตอร์ทางด้านวิศวกรรม ประกอบด้วยครุภัณฑ์ 11 รายการ');
  assert.notEqual(lenovo.fund?.key, hp1.fund?.key);
});

test('หัวชุดมีลำดับและราคา: ชิ้นส่วนที่เว้นช่องราคา (รวมข้อความ "ครุภัณฑ์ประกอบ") รวมในชุด ส่วนราคา 0 ไม่ใช่ชิ้นส่วน', () => {
  const rows = classify(source('คอม', ห้องแล็บ));
  const header = byName(rows, 'ครุภัณฑ์ห้องปฏิบัติการคอมพิวเตอร์');
  assert.equal(header.set?.kind, 'lot');
  assert.equal(header.set?.role, 'header');
  assert.equal(header.asset.code, '4155-4332-025-99-1(1)');          // หัวชุดมีหมายเลขของตัวเอง ไม่เปลี่ยน
  assert.equal(header.asset.totalSatang, 89992200);
  const parts = rows.filter(r => r.set?.role === 'part');
  assert.deepEqual(parts.map(p => p.asset.code), ['4155-4332-025-99-1(1)/1-2(36)', '4155-4332-025-99-1(1)/1-4(36)']);
  assert.equal(byName(rows, 'หุ่นยนต์ LEGO (NXT) พร้อม Software').set, undefined);
});
