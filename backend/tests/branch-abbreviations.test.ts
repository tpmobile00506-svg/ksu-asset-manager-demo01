import assert from 'node:assert/strict';
import { test } from 'node:test';
import { branchAbbr, branchCandidates, classify, standardBranches } from '../contracts/domain';

// ค่าคาดหวังกำหนดมือจากตารางชื่อย่อที่ผู้ใช้ยืนยัน (13 ต.ค. 2569) ไม่ได้คัดลอกจากผลของโค้ด
const abbreviations: Array<[string, string]> = [
  ['วิศวกรรมคอมพิวเตอร์ (วค)', 'วค'],
  ['วิศวกรรมไฟฟ้า (วฟ)', 'วฟ'],
  ['เทคโนโลยีเครื่องจักรกลเกษตร (คจก)', 'คจก'],
  ['วิศวกรรมเครื่องกล (วคม/วศค)', 'วคม'],
  ['วิศวกรรมอุตสาหการ (วอ)', 'วอ'],
  ['วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)', 'วล'],
  ['วิศวกรรมเมคคาทรอนิกส์ (มค)', 'มค'],
  ['นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)', 'นอส'],
  ['สำนักงานคณะฯ / คณบดี (สนง.ควอ.)', 'สนง'],
  ['ส่วนกลาง / การศึกษา', 'ส่วนกลาง'],
];

test('ชื่อย่อของสาขามาตรฐานครบทั้ง 10 สาขา', () => {
  assert.equal(abbreviations.length, standardBranches.length);
  for (const [branch, abbr] of abbreviations) assert.equal(branchAbbr(branch), abbr, branch);
});

test('ชื่อสาขาที่ไฟล์ต้นฉบับเขียนหลายแบบ ได้ชื่อย่อเดียวกัน', () => {
  // ตัวอย่างจริงจากคอลัมน์สาขาใน "ครุภัณฑ์คงเหลือ ควอ งปม 2569"
  assert.equal(branchAbbr('วค.'), 'วค');
  assert.equal(branchAbbr('คจก.'), 'คจก');
  assert.equal(branchAbbr('ออกแบบ'), 'นอส');
  assert.equal(branchAbbr('ออบแบบ'), 'นอส');           // พิมพ์ผิดในต้นฉบับ
  assert.equal(branchAbbr('วศค.'), 'วคม');             // เจ้าหน้าที่จัดไว้ใต้ "สาขาวิชาวิศวกรรมเครื่องกลและเมคคาฯ"
  assert.equal(branchAbbr('สนง (วค)'), 'สนง');          // แผ่นชำรุดจัดรายการนี้ไว้ใต้สำนักงานคณะ
  assert.equal(branchAbbr('สนง ควอ.'), 'สนง');
});

test('ช่องว่างได้ค่าว่าง และชื่อที่ไม่รู้จักแสดงตามเดิม ไม่เดา', () => {
  assert.equal(branchAbbr(''), '');
  assert.equal(branchAbbr('   '), '');
  assert.equal(branchAbbr('มาจากนามน'), 'มาจากนามน');
});

test('ช่องที่ระบุหลายสาขาตรวจพบทุกสาขา ส่วนชื่อมาตรฐานที่มี "/" ในชื่อนับเป็นสาขาเดียว', () => {
  assert.deepEqual(branchCandidates('วอ /คจก'), ['วิศวกรรมอุตสาหการ (วอ)', 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)']);
  assert.deepEqual(branchCandidates('วค/วฟ'), ['วิศวกรรมคอมพิวเตอร์ (วค)', 'วิศวกรรมไฟฟ้า (วฟ)']);
  assert.deepEqual(branchCandidates('วค/เกษตร'), ['วิศวกรรมคอมพิวเตอร์ (วค)', 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)']);
  assert.deepEqual(branchCandidates('วล/โลจิสติก'), ['วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)']);
  assert.deepEqual(branchCandidates('ออกแบบ / ดูที่อยู่ใหม่'), ['นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)']);
  for (const branch of standardBranches) assert.deepEqual(branchCandidates(branch), [branch], branch);
  assert.deepEqual(branchCandidates(''), []);
});

const sheetWith = (branch: string) => ({ id: 't', name: 't', hash: '', sheets: [{ name: 'สำนักงาน', rows: [
  // ลำดับ, รหัส, รายการ, จำนวน, ราคาต่อหน่วย, จำนวนเงิน, หมายเหตุ, สาขา — 1 × 100.00 = 100.00 บาท
  { row: 6, values: [1, 'วข.กส.45/1 7110-002-0003', 'ตู้เก็บอุปกรณ์', 1, 100, 100, 'อ.เครื่องจักรกลเกษตร', branch] },
] }] });

test('นำเข้า: แถวที่ระบุหลายสาขาต้องให้เลือกสาขาก่อน ไม่ขึ้นว่าพร้อมนำเข้า', () => {
  const [row] = classify(sheetWith('วอ /คจก'));
  assert.equal(row.kind, 'asset');
  assert.equal(row.issueType, 'branch');
  assert.equal(row.issue, 'ระบุไว้หลายสาขา (วอ / คจก) ต้องเลือกสาขาก่อนนำเข้า');
});

test('นำเข้า: แถวที่ระบุสาขาเดียวพร้อมนำเข้าตามเดิม', () => {
  const [row] = classify(sheetWith('คจก.'));
  assert.equal(row.issueType, 'ready');
  assert.equal(row.issue, '');
  assert.equal(row.asset.branch, 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)');
});
