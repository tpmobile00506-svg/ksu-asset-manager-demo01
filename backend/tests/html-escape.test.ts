import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from '../contracts/html';
import { buildStickerHtml } from '../contracts/qr-sticker-document';
import { buildApprovalDocumentHtml } from '../contracts/approval-document';

// ข้อความที่ผู้โจมตี (บัญชีเจ้าหน้าที่) อาจกรอกเป็นชื่อ/รหัสครุภัณฑ์ เพื่อให้สคริปต์รันตอนผู้บริหารกดพิมพ์
const attack = `<img src=x onerror="fetch('/api/data')">'`;

test('escapeHtml แปลงอักขระพิเศษของ HTML ครบ 5 ตัว', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(12), '12');
});

// สติกเกอร์ QR แทนป้าย A4 เดิม (8 พ.ย. 2569): ตรวจเรื่องเดียวกับเทสต์ป้ายเดิม คือค่าจากทะเบียนต้องไม่กลายเป็นแท็กจริง
test('สติกเกอร์ QR: รหัส ชื่อ สถานที่ ที่มีแท็ก HTML ไม่กลายเป็นแท็กจริง', () => {
  const html = buildStickerHtml(
    [{ code: attack, name: attack, location: attack, qr: 'data:image/svg+xml;charset=utf-8,AAAA' }],
    '50x30',
  );
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('onerror="'), false);
  // ข้อความยังแสดงครบ แค่เป็นตัวอักษรธรรมดา (alt ของ QR 1 + รหัส 1 + ชื่อ 1 + สถานที่ 1)
  assert.equal(html.split('&lt;img src=x onerror=&quot;').length - 1, 4);
  // สคริปต์ที่มีอยู่ในหน้าพิมพ์เองมีแค่ตัวสั่งพิมพ์ 1 ตัว
  assert.equal(html.split('<script>').length - 1, 1);
  assert.ok(html.includes('<img src="data:image/svg+xml;charset=utf-8,AAAA" alt="QR &lt;img src=x'));
});

test('สติกเกอร์ QR: ไม่มีสถานที่ ไม่แสดงบรรทัดสถานที่ว่างๆ', () => {
  const html = buildStickerHtml([{ code: '7440-001', name: 'โต๊ะ', location: '  ', qr: 'data:x' }], '50x30');
  assert.ok(html.includes('>7440-001</div>'));
  assert.ok(html.includes('>โต๊ะ</div>'));
  assert.equal(html.includes('text-overflow:ellipsis'), false);
});

test('เอกสารอนุมัติ: ชื่อครุภัณฑ์ที่มีแท็ก HTML ถูก escape (ใช้ตัวแปลงเดียวกัน)', () => {
  const html = buildApprovalDocumentHtml({
    requestCode: attack,
    kind: 'disposal',
    status: 'pending',
    reason: attack,
    createdAt: '2026-10-01T09:00:00.000Z',
    payload: {},
    chain: ['head', 'deputy', 'dean'],
    asset: {
      code: attack,
      name: attack,
      quantity: 1,
      totalSatang: 100,
      location: attack,
      branch: attack,
      custodian: attack,
    },
    approvals: [],
  });
  assert.equal(html.includes('<img src=x'), false);
});

test('สติกเกอร์ QR: มือถือไม่ปิดหน้าเอง เพราะ print() อาจไม่รอผู้ใช้ และมีปุ่มพิมพ์กับปุ่มปิดให้กด', () => {
  const html = buildStickerHtml([{ code: 'K1', name: 'โต๊ะ', qr: 'data:image/svg+xml;charset=utf-8,AAAA' }], '50x30');
  assert.match(html, /matchMedia\('\(hover: hover\)'\)\.matches\) \{\s*setTimeout\(function\(\) \{ window\.close\(\);/);
  assert.match(html, /class="touch-actions"/);
});
