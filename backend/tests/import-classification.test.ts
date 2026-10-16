import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classify, headers11, type Asset, type Source } from '../contracts/domain';
import { parseWorkbook } from '../imports/workbook';
import { createAssetWorkbook } from '../../frontend/services/excel-export';

const source = (rows: unknown[][]): Source => ({ id: 'test', name: 'test.xlsx', hash: '', sheets: [
  { name: 'ทะเบียน', rows: rows.map((values, index) => ({ row: index + 1, values })) },
] });

test('asset names and notes cannot turn complete rows into report headings or totals', () => {
  const annotations = ['เจ้าหน้าที่พัสดุ', 'ซื้อรวมเป็นเงิน 10000 บาท', 'ยอดยกมา', 'รายละเอียดครุภัณฑ์คงเหลือ', 'หมายเลขครุภัณฑ์และราคาต่อหน่วย'];
  const input = [headers11, ...annotations.map((notes, index) => [
    index + 1, `A-${index}`, 'โต๊ะเจ้าหน้าที่พัสดุ', 1, 10000, 10000, notes,
    'ห้อง 101', 'ทดสอบ', 'โต๊ะ', 'ครุภัณฑ์สำนักงาน',
  ])];
  const rows = classify(source(input)).slice(1);
  assert.equal(rows.length, annotations.length);
  rows.forEach((row, index) => {
    assert.equal(row.kind, 'asset');
    assert.equal(row.issue, '');
    assert.equal(row.asset.notes, annotations[index]);
    assert.equal(row.asset.groupName, 'สำนักงาน');   // หมวด = ชื่อแผ่นงานของประเภท
    assert.equal(row.asset.category, 'ครุภัณฑ์สำนักงาน');
    assert.equal(row.asset.location, 'ห้อง 101');
  });
});

test('real headers, carried totals and final totals remain outside asset candidates', () => {
  const rows = classify(source([
    ['มหาวิทยาลัยกาฬสินธุ์'],
    ['รายละเอียดครุภัณฑ์คงเหลือ หน้าที่ 1'],
    ['ณ วันที่ 26 กันยายน 2569'],
    headers11,
    ['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม'],
    [null, null, null, null, 'ยอดยกไป', { formula: 'SUM(F1:F5)', cached: 10000 }],
    [null, 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม', null, null, 'ยอดยกมา', 10000],
    ['รวมทั้งสิ้น', null, null, 10, null, 10000],
    [null, 'รวมเป็นเงิน', '(หนึ่งหมื่นบาทถ้วน)', null, null, 10000],
    ['รวม', { formula: 'BAHTTEXT(F10)', cached: '(หนึ่งหมื่นบาทถ้วน)' }, null, null, null, 10000],
  ]));
  assert.deepEqual(rows.map(row => row.kind), [
    'header', 'header', 'header', 'header', 'header', 'subtotal', 'subtotal', 'subtotal', 'subtotal', 'subtotal',
  ]);
});

test('exported ten-column workbook preserves branch, group and category when parsed for import', async () => {
  const assets = Array.from({ length: 49 }, (_, index) => ({
    id: `asset-${index}`, code: `CODE-${index}`, name: 'โต๊ะเจ้าหน้าที่พัสดุ', quantity: 2,
    unitSatang: 12345, totalSatang: 24690, notes: 'ซื้อรวมเป็นเงิน 246.90 บาท', location: 'ห้อง 101',
    branch: 'ทดสอบ', groupName: index % 2 ? 'โต๊ะ' : 'ตู้และชั้นวาง', category: 'ครุภัณฑ์สำนักงาน', lifecycle: 'active',
  } as Asset));
  const workbook = await createAssetWorkbook(assets);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await parseWorkbook(new File([bytes as BlobPart], 'exported.xlsx'));
  const candidates = classify(parsed).filter(row => row.kind === 'asset');
  assert.equal(candidates.length, assets.length, 'Repeated headers and totals must not add or hide assets');
  candidates.forEach((row, index) => {
    const expected = assets[index];
    assert.equal(row.issue, '');
    for (const key of ['code', 'name', 'quantity', 'unitSatang', 'totalSatang', 'branch', 'category'] as const) {
      assert.equal(row.asset[key], expected[key], key);
    }
    assert.equal(row.asset.groupName, 'สำนักงาน', 'groupName');   // หมวด = ชื่อแผ่นงานของประเภท ไม่ใช่หมวดเก่าที่ส่งออก
    // This report intentionally combines location and notes into one column.
    assert.equal(row.asset.notes, `${expected.notes} • ${expected.location}`);
  });
});

test('exported legacy category and unknown group become asset type and its sheet-name group on import', async () => {
  const assets = Array.from({ length: 10 }, (_, index) => ({
    id: `asset-${index}`, code: `COM-${index}`, name: 'เครื่องคอมพิวเตอร์แบบ All-in-One', quantity: 1,
    unitSatang: 3500000, totalSatang: 3500000, notes: 'ห้องปฏิบัติการคอมพิวเตอร์', location: 'ห้อง 401',
    branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', groupName: `โต๊ะคอมพิวเตอร์ ${index}`, category: 'คอมพิวเตอร์', lifecycle: 'active',
  } as Asset));
  const workbook = await createAssetWorkbook(assets);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await parseWorkbook(new File([bytes as BlobPart], 'exported-std.xlsx'));
  const candidates = classify(parsed).filter(row => row.kind === 'asset');
  assert.equal(candidates.length, assets.length);
  candidates.forEach((row, index) => {
    const expected = assets[index];
    assert.equal(row.issue, '');
    assert.equal(row.asset.code, expected.code);
    assert.equal(row.asset.name, expected.name);
    // หมวดหมู่เก่า "คอมพิวเตอร์" ส่งออกเป็นประเภท และหมวดเป็นชื่อแผ่นงานของประเภทนั้น
    assert.equal(row.asset.category, 'ครุภัณฑ์คอมพิวเตอร์');
    assert.equal(row.asset.groupName, 'คอม');
  });
});

test('provided legacy workbook retains all rows, ready counts and project context', () => {
  const provided = JSON.parse(readFileSync(new URL('../data/provided.json', import.meta.url), 'utf8')) as Source;
  const rows = classify(provided);
  assert.equal(rows.length, 4312);
  // 3,127 + 59 หัวชุดที่ไม่มีลำดับแต่มีราคา (เดิมเป็นหัวข้อ) — ผู้ใช้อนุมัติ 13 ต.ค. 2569
  // + 6 บรรทัดราคาชุดที่ไม่มีรหัส (เช่น "โต๊ะประชุมมีบังตา 2 × 5,900") เดิมถูกทิ้งเป็นหมายเหตุ ยอด 196,800 บาทหาย
  // = 3,192 — ผู้ใช้อนุมัติ 15 ต.ค. 2569
  assert.equal(rows.filter(row => row.kind === 'asset').length, 3192);
  assert.equal(rows.find(row => row.key === 'วิทยาศาสตร์:36')!.kind, 'subtotal', 'The source final total is not an asset');
  // 1,194 − 2 แถว "วค/วฟ" (ไฟฟ้า:28, ไฟฟ้า:29) ที่ต้องเลือกสาขาก่อน
  // − 2 หัวชุดมีลำดับที่ต้องยืนยันการจัดชุด (คอม:9, ไฟฟ้า:122) = 1,190 — ผู้ใช้อนุมัติ 13 ต.ค. 2569
  // − 10 หัวชุดแบบล็อตที่อยู่ใต้หัวทุน (เช่น ชุดฝึกทดสอบระบบนิวเมติกส์ไฟฟ้า) เดิมถูกนับเป็นรายการในหัวข้อชุดจึงไม่ถูกตรวจ
  // พอหัวทุนแยกจากชุดห้ามแยก ล็อตเหล่านี้ต้องยืนยันการจัดชุดก่อน = 1,180 — ผู้ใช้อนุมัติ 15 ต.ค. 2569
  assert.equal(rows.filter(row => row.kind === 'asset' && !row.issue).length, 1180);
  const project = rows.find(row => row.key === 'คอม:32')!;
  assert.match(project.groupName, /NonLinear/);
  assert.match(project.groupName, /160500/);
  assert.ok(project.issue);
  assert.match(rows.find(row => row.key === 'คอม:36')!.groupName, /มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน/);
});

test('นำเข้า: รหัสที่ต่างแค่ตัวพิมพ์/ช่องว่างนับว่าซ้ำในไฟล์ และรหัสที่มีในทะเบียนแล้วไม่ขึ้นว่าพร้อมนำเข้า', async () => {
  const { markExistingCodes } = await import('../contracts/domain');
  const row = (seq: number, code: string) => [seq, code, 'เครื่องทดสอบ', 1, 1000, 1000, 'ห้อง 1', 'วค'];
  const rows = classify(source([headers11, row(1, 'TEST-0002'), row(2, 'test-0002'), row(3, 'KSU-EXIST (1)'), row(4, 'NEW-0001')]));
  const byCode = (c: string) => rows.find(r => r.asset.code === c)!;
  assert.equal(byCode('TEST-0002').issueType, 'duplicate');
  assert.equal(byCode('test-0002').issueType, 'duplicate');
  assert.equal(byCode('KSU-EXIST (1)').issueType, 'ready');
  // ในทะเบียนมี "KSU-EXIST(1)" อยู่แล้ว (ไม่มีช่องว่าง) → แถว 3 ต้องเป็นรายการซ้ำ ส่วนแถวที่นำเข้าไปแล้ว (done) ไม่ถูกแตะ
  markExistingCodes(rows, new Map([['KSU-EXIST(1)', 'KSU-EXIST(1) · เครื่องเดิม · วค']]), new Set());
  assert.equal(byCode('KSU-EXIST (1)').issueType, 'duplicate');
  assert.match(byCode('KSU-EXIST (1)').issue, /มีหมายเลขนี้ในทะเบียนแล้ว: KSU-EXIST\(1\) · เครื่องเดิม/);
  assert.equal(byCode('NEW-0001').issueType, 'ready');
});

test('นำเข้า: รหัสช่วงที่รหัสย่อยตัวใดตัวหนึ่งมีในทะเบียนแล้ว ไม่ขึ้นว่าพร้อมนำเข้า', async () => {
  const { markExistingCodes } = await import('../contracts/domain');
  const rows = classify(source([headers11, [1, 'RNG-1(1) ถึง -2(1)', 'เครื่องทดสอบช่วง', 2, 1000, 2000, 'ห้อง 1', 'วค']]));
  const row = rows.find(r => r.kind === 'asset')!;
  // ในทะเบียนมีเฉพาะรหัสย่อยตัวที่สอง "RNG-2(1)" (ไม่มีรหัสช่วงเต็ม)
  markExistingCodes(rows, new Map([['RNG-2(1)', 'RNG-2(1) · เครื่องเดิม · วค']]), new Set());
  assert.equal(row.issueType, 'duplicate');
  assert.match(row.issue, /มีหมายเลขนี้ในทะเบียนแล้ว: RNG-2\(1\)/);
});

test('บรรทัดราคาชุดที่ไม่มีรหัส เป็นหัวชุดถือยอดเงิน และรายชิ้นข้างล่างเป็นชิ้นส่วนของชุดนี้ (ไม่ไปเข้าชุดก่อนหน้า)', () => {
  const rows = classify(source([
    headers11,
    [1, 'P-001', 'โต๊ะพับ ประกอบด้วย', 2, 2200, 4400, 'ห้อง 1', 'วค'],
    [2, 'P-001-1', 'โต๊ะพับ', null, null, null, 'ห้อง 1', 'วค'],
    [null, null, 'โต๊ะประชุมมีบังตา', 2, 5900, 11800, null, null],     // บรรทัดราคา ไม่มีรหัส
    [3, 'M-001', 'โต๊ะประชุมมีบังตา', null, null, null, 'ห้อง 2', 'วค'],
    [4, 'M-002', 'โต๊ะประชุมมีบังตา', null, null, null, 'ห้อง 2', 'วค'],
  ]));
  const header = rows.find(r => r.asset.name === 'โต๊ะประชุมมีบังตา' && r.set?.role === 'header')!;
  assert.equal(header.kind, 'asset');
  assert.equal(header.asset.totalSatang, 1180000);                   // 2 × 5,900.00 = 11,800.00 บาท
  assert.equal(header.asset.code, 'M-001');                          // หมายเลขมาจากชิ้นแรก
  const parts = rows.filter(r => r.set?.key === header.set!.key && r.set.role === 'part');
  assert.deepEqual(parts.map(p => p.asset.code), ['M-001-ชิ้น1', 'M-002']);
  assert.ok(parts.every(p => p.asset.totalSatang === 0));
  // ชิ้นของโต๊ะประชุมต้องไม่ไปอยู่ในชุดโต๊ะพับ
  const fold = rows.find(r => r.asset.code === 'P-001')!;
  assert.equal(rows.filter(r => r.set?.key === fold.set?.key).length, 2);
  // บรรทัดชื่อที่ราคา 0 ไม่ใช่บรรทัดราคาชุด
  const zero = classify(source([headers11, [null, null, 'เครื่องคอม Thinkstation', 1, 0, 0, null, null]]));
  assert.equal(zero[1].kind, 'note');
});

test('ตัวเลขในเซลล์: เลขไทยอ่านได้ เศษทศนิยมจากสูตรถูกตัด และข้อความเตือนบอกปัญหาตรงเหตุ', () => {
  const row = (seq: number, code: string, qty: unknown, unit: unknown, total: unknown) => [seq, code, 'เครื่องทดสอบ', qty, unit, total, 'ห้อง 1', 'วค'];
  const rows = classify(source([headers11,
    row(1, 'T-1', 1, '๑,๐๐๐', '๑,๐๐๐'),                 // 1,000.00
    row(2, 'T-2', 30, 42011.06, 1260331.7999999998),    // เศษจากสูตร = 1,260,331.80
    row(3, 'T-3', 1, 1000.555, 1000.555),
    row(4, 'T-4', 1, -500, -500),
    row(5, 'T-5', 0, 1000, 0),
  ])).slice(1);
  assert.deepEqual([rows[0].asset.unitSatang, rows[0].issueType], [100000, 'ready']);
  assert.deepEqual([rows[1].asset.totalSatang, rows[1].issueType], [126033180, 'ready']);
  assert.match(rows[2].issue, /ทศนิยมเกิน 2 ตำแหน่ง/);
  assert.match(rows[3].issue, /ราคาติดลบ/);
  assert.match(rows[4].issue, /จำนวนต้องมากกว่า 0/);
});
