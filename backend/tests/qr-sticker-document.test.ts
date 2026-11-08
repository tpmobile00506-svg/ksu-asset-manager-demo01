import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildStickerHtml,
  isStickerSize,
  MAX_STICKERS,
  stickerCopies,
  stickerMarkup,
  stickerSizes,
  stickerTotal,
} from '../contracts/qr-sticker-document';

const qr = 'data:image/svg+xml;charset=utf-8,AAAA';

test('จำนวนดวง: จำนวนเต็ม 1 ถึง 500 · ค่าว่าง/ติดลบ/ไม่ใช่ตัวเลข ถือเป็น 1 ดวง', () => {
  assert.equal(MAX_STICKERS, 500);
  assert.equal(stickerCopies('3'), 3);
  assert.equal(stickerCopies(2.9), 2);
  assert.equal(stickerCopies(0), 1);
  assert.equal(stickerCopies(-2), 1);
  assert.equal(stickerCopies(''), 1);
  assert.equal(stickerCopies('abc'), 1);
  assert.equal(stickerCopies(undefined), 1);
  assert.equal(stickerCopies(500), 500);
  assert.equal(stickerCopies(501), 500);
  // 2 + 1 (ไม่ระบุ) + 4 = 7 ดวง
  assert.equal(stickerTotal([{ copies: 2 }, {}, { copies: 4 }]), 7);
});

test('ขนาดม้วน: รับเฉพาะ 3 ขนาดที่มี', () => {
  assert.equal(isStickerSize('50x30'), true);
  assert.equal(isStickerSize('40x30'), true);
  assert.equal(isStickerSize('60x40'), true);
  assert.equal(isStickerSize('A4'), false);
  assert.equal(isStickerSize('toString'), false);
  assert.equal(isStickerSize(null), false);
});

test('ขนาดม้วน: QR กับขอบพอดีความสูง และเหลือที่ให้ข้อความ (คิดมือ)', () => {
  const textWidth = (size: keyof typeof stickerSizes) => {
    const s = stickerSizes[size];
    return Math.round((s.w - 2 * s.pad - s.qr - s.gap) * 10) / 10;
  };
  // 50 − 1.5×2 − 23 − 1.5 = 22.5 · 40 − 1.5×2 − 21 − 1.2 = 14.8 · 60 − 2×2 − 30 − 2 = 24
  assert.equal(textWidth('50x30'), 22.5);
  assert.equal(textWidth('40x30'), 14.8);
  assert.equal(textWidth('60x40'), 24);
  for (const s of Object.values(stickerSizes)) assert.ok(2 * s.pad + s.qr <= s.h);
  // ข้อความชิดขอบบน/ล่างของ QR: (30 − 3 − 23) ÷ 2 = 2 มม. · (40 − 4 − 30) ÷ 2 = 3 มม.
  assert.ok(stickerMarkup({ code: 'K', name: 'N', qr }, '50x30').includes('padding:2mm 0'));
  assert.ok(stickerMarkup({ code: 'K', name: 'N', qr }, '60x40').includes('padding:3mm 0'));
});

test('หน้าพิมพ์: ขนาดหน้าเท่าดวง ขอบ 0 · ดวงละหน้า เรียงตามรายการ ซ้ำตามจำนวนดวง', () => {
  const html = buildStickerHtml(
    [
      { code: 'A-1', name: 'โต๊ะ', qr, copies: 3 },
      { code: 'B-1', name: 'เก้าอี้', qr },
    ],
    '40x30',
  );
  assert.ok(html.includes('@page { size: 40mm 30mm; margin: 0; }'));
  assert.ok(html.includes('<title>สติกเกอร์ QR 4 ดวง (40 × 30 มม.)</title>'));
  assert.equal(html.split('<div class="page">').length - 1, 4);
  assert.deepEqual(
    [...html.matchAll(/alt="QR ([^"]+)"/g)].map(m => m[1]),
    ['A-1', 'A-1', 'A-1', 'B-1'],
  );
  // บรรทัดบนสุดของทุกดวง
  assert.equal(html.split('ม.กาฬสินธุ์ · ควอ.').length - 1, 4);
});
