import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from '../contracts/html';
import { buildQrLabelHtml } from '../contracts/qr-label-document';
import { buildApprovalDocumentHtml } from '../contracts/approval-document';

// ข้อความที่ผู้โจมตี (บัญชีเจ้าหน้าที่) อาจกรอกเป็นชื่อ/รหัสครุภัณฑ์ เพื่อให้สคริปต์รันตอนผู้บริหารกดพิมพ์
const attack = `<img src=x onerror="fetch('/api/data')">'`;

test('escapeHtml แปลงอักขระพิเศษของ HTML ครบ 5 ตัว', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(12), '12');
});

test('ฉลาก QR: รหัส ชื่อ สาขา วันที่ ที่มีแท็ก HTML ไม่กลายเป็นแท็กจริง', () => {
  const html = buildQrLabelHtml(
    { code: attack, name: attack, branch: attack, receivedDate: attack },
    'data:image/png;base64,AAAA',
  );
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('onerror="'), false);
  // ข้อความยังแสดงครบ แค่เป็นตัวอักษรธรรมดา (title 1 + รหัส 1 + ชื่อ 1 + สาขา 1 + วันที่ 1)
  assert.equal(html.split('&lt;img src=x onerror=&quot;').length - 1, 5);
  // สคริปต์ที่มีอยู่ในหน้าพิมพ์เองมีแค่ตัวสั่งพิมพ์ 1 ตัว
  assert.equal(html.split('<script>').length - 1, 1);
  assert.ok(html.includes('<img src="data:image/png;base64,AAAA" alt="QR Code" />'));
});

test('ฉลาก QR: ไม่มีสาขา/วันที่ ใช้ค่าแทนเดิม', () => {
  const html = buildQrLabelHtml({ code: '7440-001', name: 'โต๊ะ', branch: '', receivedDate: null }, 'data:x');
  assert.ok(html.includes('<div class="dept">คณะวิศวกรรมศาสตร์ฯ</div>'));
  assert.ok(html.includes('วันที่ได้มา: —'));
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
