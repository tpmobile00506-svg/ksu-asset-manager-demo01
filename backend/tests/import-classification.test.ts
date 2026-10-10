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
    'ห้อง 101', 'ทดสอบ', 'ชุดสำนักงาน', 'ครุภัณฑ์สำนักงาน',
  ])];
  const rows = classify(source(input)).slice(1);
  assert.equal(rows.length, annotations.length);
  rows.forEach((row, index) => {
    assert.equal(row.kind, 'asset');
    assert.equal(row.issue, '');
    assert.equal(row.asset.notes, annotations[index]);
    assert.equal(row.asset.groupName, 'ชุดสำนักงาน');
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
    branch: 'ทดสอบ', groupName: `ชุดสำนักงาน ${index}`, category: 'ครุภัณฑ์สำนักงาน', lifecycle: 'active',
  } as Asset));
  const workbook = await createAssetWorkbook(assets);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await parseWorkbook(new File([bytes as BlobPart], 'exported.xlsx'));
  const candidates = classify(parsed).filter(row => row.kind === 'asset');
  assert.equal(candidates.length, assets.length, 'Repeated headers and totals must not add or hide assets');
  candidates.forEach((row, index) => {
    const expected = assets[index];
    assert.equal(row.issue, '');
    for (const key of ['code', 'name', 'quantity', 'unitSatang', 'totalSatang', 'branch', 'groupName', 'category'] as const) {
      assert.equal(row.asset[key], expected[key], key);
    }
    // This report intentionally combines location and notes into one column.
    assert.equal(row.asset.notes, `${expected.notes} • ${expected.location}`);
  });
});

test('exported ten-column workbook with standard faculty categories maps correctly on import', async () => {
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
    assert.equal(row.asset.category, 'คอมพิวเตอร์');
    assert.equal(row.asset.groupName, `โต๊ะคอมพิวเตอร์ ${index}`);
  });
});

test('provided legacy workbook retains all rows, ready counts and project context', () => {
  const provided = JSON.parse(readFileSync(new URL('../data/provided.json', import.meta.url), 'utf8')) as Source;
  const rows = classify(provided);
  assert.equal(rows.length, 4312);
  assert.equal(rows.filter(row => row.kind === 'asset').length, 3127);
  assert.equal(rows.find(row => row.key === 'วิทยาศาสตร์:36')!.kind, 'subtotal', 'The source final total is not an asset');
  assert.equal(rows.filter(row => row.kind === 'asset' && !row.issue).length, 1194);
  const project = rows.find(row => row.key === 'คอม:32')!;
  assert.match(project.groupName, /NonLinear/);
  assert.match(project.groupName, /160500/);
  assert.ok(project.issue);
  assert.match(rows.find(row => row.key === 'คอม:36')!.groupName, /มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน/);
});
