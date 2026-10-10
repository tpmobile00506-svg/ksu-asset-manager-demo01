import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApprovalDocumentHtml, type ApprovalDocumentInput } from '../contracts/approval-document';

const base: ApprovalDocumentInput = {
  requestCode: 'REQ-69-E0F4',
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
  assert.ok(html.includes('REQ-69-E0F4'));
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

test('ส่งกลับแก้ไข: แสดงผล "ส่งกลับแก้ไข"', () => {
  const html = buildApprovalDocumentHtml({ ...base, approvals: [{ ...base.approvals[0], decision: 'reject', note: 'ข้อมูลไม่ครบ' }] });
  assert.ok(html.includes('ส่งกลับแก้ไข'));
  assert.ok(html.includes('ข้อมูลไม่ครบ'));
});

test('โอนย้าย: แสดงปลายทางและผู้รับผิดชอบใหม่ ส่วนซ่อมแสดงประมาณการ (125,050 สตางค์ = 1,250.50 บาท)', () => {
  const transfer = buildApprovalDocumentHtml({ ...base, kind: 'transfer', payload: { location: 'ห้อง 202', branch: 'วิศวกรรมไฟฟ้า (วฟ)', custodian: 'นางสาวบี' } });
  assert.ok(transfer.includes('ห้อง 202 (วิศวกรรมไฟฟ้า (วฟ))'));
  assert.ok(transfer.includes('นางสาวบี'));
  const repair = buildApprovalDocumentHtml({ ...base, kind: 'repair', payload: { estimateSatang: 125_050 } });
  assert.ok(repair.includes('1,250.50 บาท'));
});

test('ข้อความจากผู้ใช้ถูก escape กัน HTML แทรก', () => {
  const html = buildApprovalDocumentHtml({ ...base, reason: '<script>alert(1)</script>', asset: { ...base.asset!, name: 'โต๊ะ "A" & B' } });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('โต๊ะ &quot;A&quot; &amp; B'));
});
