import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApprovalDocumentHtml, transferOrigin, type ApprovalDocumentInput } from '../contracts/approval-document';

const base: ApprovalDocumentInput = {
  requestCode: 'REQ-2569-0001',
  kind: 'disposal',
  status: 'approved',
  reason: 'ชำรุดเกินซ่อม ไม่คุ้มค่า',
  createdAt: '2026-10-01T09:00:00.000Z',
  requesterName: 'เจ้าหน้าที่พัสดุ',
  payload: {},
  chain: ['head', 'deputy', 'dean'],
  asset: { code: '4253-001', name: 'เก้าอี้เลคเชอร์', quantity: 50, totalSatang: 6_250_000, location: 'ห้อง 201', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', custodian: 'นายเอ' },
  approvals: [
    { stage: 0, actorName: 'หัวหน้า ก', decision: 'approve', note: 'เห็นควร', createdAt: '2026-10-02T09:00:00.000Z' },
    { stage: 1, actorName: 'รอง ข', decision: 'approve', note: '', createdAt: '2026-10-03T09:00:00.000Z' },
    { stage: 2, actorName: 'คณบดี ค', decision: 'approve', note: 'อนุมัติ', createdAt: '2026-10-04T09:00:00.000Z' },
  ],
};

const count = (text: string, part: string) => text.split(part).length - 1;

test('เอกสารจำหน่าย: แสดงประเภท เลขที่คำขอ มูลค่า และเหตุผล', () => {
  const html = buildApprovalDocumentHtml(base);
  assert.ok(html.includes('เอกสารอนุมัติจำหน่าย / ตัดบัญชีครุภัณฑ์'));
  assert.ok(html.includes('REQ-2569-0001'));
  assert.ok(html.includes('50 ชิ้น · 62,500.00 บาท'));   // 6,250,000 สตางค์ ÷ 100 = 62,500.00 บาท
  assert.ok(html.includes('ชำรุดเกินซ่อม ไม่คุ้มค่า'));
});

test('ช่องลงนามเท่ากับจำนวนขั้นในสายอนุมัติ (3 ขั้น = 3 ช่อง)', () => {
  const html = buildApprovalDocumentHtml(base);
  assert.equal(count(html, 'ลงชื่อ ....'), 3);
  assert.ok(html.includes('1. หัวหน้าสาขา (Head)'));
  assert.ok(html.includes('3. คณบดี (Dean)'));
});

test('ขั้นที่ยังไม่อนุมัติแสดง "รอดำเนินการ" ส่วนขั้นที่อนุมัติแล้วแสดงชื่อผู้ลงนามและหมายเหตุ', () => {
  const html = buildApprovalDocumentHtml({ ...base, status: 'pending', approvals: [base.approvals[0]] });
  assert.equal(count(html, 'รอดำเนินการ'), 2);            // ขั้น 2 และ 3
  assert.ok(html.includes('หัวหน้า ก'));
  assert.ok(html.includes('เห็นควร'));
});

// ไม่อนุมัติ = คำขอสิ้นสุด (สถานะ rejected) ไม่ได้ส่งกลับไปแก้ จึงต้องไม่ใช้คำว่า "ส่งกลับแก้ไข" (ผู้ใช้ยืนยัน 18 ต.ค. 2569)
test('ไม่อนุมัติที่ขั้น 1: แสดง "ไม่อนุมัติ" ขั้น 2–3 แสดง "—" ไม่ใช่ "รอดำเนินการ"', () => {
  const html = buildApprovalDocumentHtml({ ...base, status: 'rejected', approvals: [{ ...base.approvals[0], decision: 'reject', note: 'ข้อมูลไม่ครบ' }] });
  assert.ok(html.includes('<td>ไม่อนุมัติ</td>'));
  assert.ok(!html.includes('ส่งกลับแก้ไข'));
  assert.ok(html.includes('ข้อมูลไม่ครบ'));
  assert.equal(count(html, 'รอดำเนินการ'), 0);
  assert.equal(count(html, '<td>—</td>'), 2);              // ขั้น 2 และ 3
});

test('โอนย้าย: แสดงปลายทางและผู้รับผิดชอบใหม่ ส่วนซ่อมแสดงประมาณการ (125,050 สตางค์ = 1,250.50 บาท)', () => {
  const transfer = buildApprovalDocumentHtml({ ...base, kind: 'transfer', payload: { location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', custodian: 'นางสาวบี' } });
  assert.ok(transfer.includes('ห้อง 202 (วิศวกรรมไฟฟ้า (วฟ))'));
  assert.ok(transfer.includes('นางสาวบี'));
  const repair = buildApprovalDocumentHtml({ ...base, kind: 'repair', payload: { estimateSatang: 125_050 } });
  assert.ok(repair.includes('1,250.50 บาท'));
});

// ---------- โอนย้าย: ต้นทางมาจากข้อมูลที่เก็บไว้ตอนยื่นคำขอ ไม่ใช่ทะเบียนปัจจุบัน ----------
const moved = { ...base.asset!, location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', custodian: 'นางสาวบี' }; // ทะเบียนหลังอนุมัติ = ปลายทาง
const transferPayload = { location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', custodian: 'นางสาวบี' };

test('โอนย้ายที่อนุมัติแล้ว: แสดง "จาก ห้อง 201 → ไป ห้อง 202" จากต้นทางที่เก็บไว้ แม้ทะเบียนจะเป็นปลายทางแล้ว', () => {
  const html = buildApprovalDocumentHtml({ ...base, kind: 'transfer', asset: moved,
    payload: { ...transferPayload, from: { location: 'ห้อง 201', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', custodian: 'นายเอ' } } });
  assert.ok(html.includes('<tr><th>ย้ายจาก (ต้นทาง)</th><td>ห้อง 201 (วิศวกรรมคอมพิวเตอร์ (วค))</td></tr>'));
  assert.ok(html.includes('<tr><th>ย้ายไป (ปลายทาง)</th><td>ห้อง 202 (วิศวกรรมไฟฟ้า (วฟ))</td></tr>'));
  assert.ok(html.includes('<tr><th>ผู้รับผิดชอบ</th><td>นายเอ → นางสาวบี</td></tr>'));
  assert.ok(!html.includes('สังกัด / สถานที่ตั้ง'));          // ไม่แสดงทะเบียนปัจจุบันซ้ำ (จะเป็นปลายทาง ทำให้สับสน)
});

test('โอนย้ายคำขอเก่าที่ไม่มีต้นทาง: ยังไม่อนุมัติใช้ทะเบียนปัจจุบัน · อนุมัติแล้วแจ้งว่าไม่มีข้อมูลต้นทาง', () => {
  assert.deepEqual(transferOrigin({ payload: transferPayload, status: 'pending', asset: base.asset }),
    { location: 'ห้อง 201', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', custodian: 'นายเอ' });
  assert.equal(transferOrigin({ payload: transferPayload, status: 'approved', asset: moved }), null);
  const html = buildApprovalDocumentHtml({ ...base, kind: 'transfer', asset: moved, payload: transferPayload });
  assert.ok(html.includes('ไม่มีข้อมูลต้นทาง'));
  assert.ok(!html.includes('<tr><th>ย้ายจาก (ต้นทาง)</th><td>ห้อง 202'));   // ไม่เอาทะเบียนปัจจุบัน (ปลายทาง) มาแสดงเป็นต้นทาง
});

test('โอนย้ายที่ไม่เปลี่ยนผู้รับผิดชอบ: แสดงผู้รับผิดชอบเดิมพร้อม "(ไม่เปลี่ยน)"', () => {
  const html = buildApprovalDocumentHtml({ ...base, kind: 'transfer', asset: moved,
    payload: { location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', from: { location: 'ห้อง 201', branch: 'วิศวกรรมคอมพิวเตอร์ (วค)', custodian: 'นายเอ' } } });
  assert.ok(html.includes('<tr><th>ผู้รับผิดชอบ</th><td>นายเอ (ไม่เปลี่ยน)</td></tr>'));
});

test('ข้อความจากผู้ใช้ถูก escape กัน HTML แทรก', () => {
  const html = buildApprovalDocumentHtml({ ...base, reason: '<script>alert(1)</script>', asset: { ...base.asset!, name: 'โต๊ะ "A" & B' } });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('โต๊ะ &quot;A&quot; &amp; B'));
});
