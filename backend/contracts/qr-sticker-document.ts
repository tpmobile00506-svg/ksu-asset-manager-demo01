import { escapeHtml as esc } from './html';

// สติกเกอร์ QR สำหรับเครื่องพิมพ์ฉลากแบบม้วน: พิมพ์ 1 ดวงต่อ 1 หน้า ขนาดหน้าเท่าดวงสติกเกอร์ (ไม่ใช้ A4)
// ฟังก์ชันล้วน ไม่แตะ DOM จึงทดสอบได้ใน Node · ทุกค่าที่มาจากทะเบียนต้องผ่าน esc()
// เพราะเจ้าหน้าที่พิมพ์รหัส/ชื่อ/สถานที่เองได้ทุกตัวอักษร
// หน้าจอตัวอย่าง (หน้าต่างพิมพ์สติกเกอร์ และหน้าข้อมูลครุภัณฑ์) ใช้ stickerMarkup() ตัวเดียวกับตอนพิมพ์
// ภาพที่เห็นบนจอจึงตรงกับดวงที่พิมพ์ออกมา

// ขนาดทุกส่วนเป็นมิลลิเมตร กำหนดตรงๆ ต่อขนาดม้วน (ไม่คำนวณจากสูตร จะได้ไม่มีเศษทศนิยมแปลกๆ)
// qr = ด้านของ QR · pad = ขอบขาวรอบดวง · gap = ระยะระหว่าง QR กับข้อความ · ที่เหลือคือขนาดตัวอักษรแต่ละบรรทัด
export const stickerSizes = {
  '50x30': {
    label: '50 × 30 มม. (แนะนำ)',
    w: 50,
    h: 30,
    qr: 23,
    pad: 1.5,
    gap: 1.5,
    top: 1.7,
    code: 2.2,
    name: 2.1,
    place: 1.8,
  },
  '40x30': {
    label: '40 × 30 มม.',
    w: 40,
    h: 30,
    qr: 21,
    pad: 1.5,
    gap: 1.2,
    top: 1.6,
    code: 2,
    name: 1.9,
    place: 1.7,
  },
  '60x40': {
    label: '60 × 40 มม.',
    w: 60,
    h: 40,
    qr: 30,
    pad: 2,
    gap: 2,
    top: 2.2,
    code: 2.9,
    name: 2.7,
    place: 2.4,
  },
} as const;

export type StickerSize = keyof typeof stickerSizes;
export const DEFAULT_STICKER_SIZE: StickerSize = '50x30';
// พิมพ์ได้ครั้งละไม่เกิน 500 ดวง: มากกว่านั้นหน้าพิมพ์ใหญ่และช้า ให้แบ่งพิมพ์เป็นรอบ
export const MAX_STICKERS = 500;
// บรรทัดบนสุดของทุกดวง (ชื่อเดียวกับป้าย A4 เดิม)
export const STICKER_OWNER = 'ม.กาฬสินธุ์ · ควอ.';

export function isStickerSize(value: unknown): value is StickerSize {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(stickerSizes, value);
}

// จำนวนดวงต่อรายการ: จำนวนเต็มตั้งแต่ 1 ถึง MAX_STICKERS (ค่าที่พิมพ์ผิด/ว่าง ถือเป็น 1 ดวง)
export function stickerCopies(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_STICKERS);
}

export type StickerItem = {
  code: string;
  name: string;
  location?: string | null;
  // ภาพ QR เป็น data URL (SVG) ที่สร้างจากลิงก์ของรายการ
  qr: string;
  copies?: number;
};

// สติกเกอร์ 1 ดวง (HTML ล้วน ใส่ style ในตัว ใช้ได้ทั้งหน้าพิมพ์และหน้าจอตัวอย่าง)
export function stickerMarkup(item: StickerItem, size: StickerSize): string {
  const s = stickerSizes[size];
  // ข้อความชิดขอบบน/ล่างของ QR พอดี: ระยะที่ QR เหลือในแนวตั้งแบ่งครึ่งบนล่าง
  const textPad = Math.max(0, Math.round(((s.h - 2 * s.pad - s.qr) / 2) * 10) / 10);
  const place = item.location?.trim();
  return (
    `<div class="ksu-sticker" style="width:${s.w}mm;height:${s.h}mm;padding:${s.pad}mm;gap:${s.gap}mm;` +
    `display:flex;box-sizing:border-box;overflow:hidden;background:#fff;color:#000;` +
    `font-family:'Leelawadee UI',Tahoma,sans-serif;line-height:1.2">` +
    `<img src="${esc(item.qr)}" alt="QR ${esc(item.code)}" ` +
    `style="width:${s.qr}mm;height:${s.qr}mm;flex-shrink:0;align-self:center;display:block" />` +
    `<div style="min-width:0;flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:${textPad}mm 0">` +
    `<div style="font-size:${s.top}mm">${esc(STICKER_OWNER)}</div>` +
    `<div style="font-family:Consolas,'Courier New',monospace;font-weight:700;font-size:${s.code}mm;overflow-wrap:anywhere">${esc(item.code)}</div>` +
    `<div style="font-size:${s.name}mm;font-weight:600;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(item.name)}</div>` +
    (place
      ? `<div style="font-size:${s.place}mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(place)}</div>`
      : '') +
    `</div></div>`
  );
}

export function stickerTotal(items: Pick<StickerItem, 'copies'>[]): number {
  return items.reduce((sum, item) => sum + stickerCopies(item.copies), 0);
}

// หน้าพิมพ์ทั้งชุด: ขนาดหน้า = ขนาดดวง ขอบ 0 · ดวงละหน้า เรียงตามรายการ แต่ละรายการซ้ำตามจำนวนดวง
export function buildStickerHtml(items: StickerItem[], size: StickerSize): string {
  const s = stickerSizes[size];
  const total = stickerTotal(items);
  const pages = items
    .flatMap(item => Array.from({ length: stickerCopies(item.copies) }, () => stickerMarkup(item, size)))
    .map(sticker => `<div class="page">${sticker}</div>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>สติกเกอร์ QR ${total} ดวง (${s.w} × ${s.h} มม.)</title>
    <style>
      @page { size: ${s.w}mm ${s.h}mm; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .page { width: ${s.w}mm; height: ${s.h}mm; overflow: hidden; break-after: page; page-break-after: always; }
      main > .page:last-child { break-after: auto; page-break-after: auto; }
      @media screen {
        body { background: #e2e8f0; }
        main { display: flex; flex-wrap: wrap; gap: 4mm; padding: 6mm 6mm 96px; }
        .page { box-shadow: 0 0 0 0.3mm #94a3b8; }
      }
      .touch-actions { display: none; position: fixed; left: 16px; right: 16px; bottom: 16px; gap: 12px; }
      .touch-actions button { flex: 1; min-height: 48px; font: inherit; font-size: 16px; border: 1px solid #0f172a; border-radius: 8px; background: #fff; color: #0f172a; }
      .touch-actions button:first-child { background: #174ae4; border-color: #174ae4; color: #fff; }
      @media (hover: none) { .touch-actions { display: flex; } }
      @media print { .touch-actions { display: none !important; } }
    </style>
  </head>
  <body>
    <main>${pages}</main>
    <div class="touch-actions">
      <button type="button" onclick="window.print()">พิมพ์สติกเกอร์</button>
      <button type="button" onclick="window.close()">ปิดหน้านี้</button>
    </div>
    <script>
      window.onload = function() {
        window.print();
        // คอมหยุดรอที่ print() จนปิดหน้าต่างพิมพ์ แต่มือถืออาจไม่รอ ถ้าปิดหน้านี้ตามเวลาจะพิมพ์ไม่ทัน
        if (window.matchMedia('(hover: hover)').matches) {
          setTimeout(function() { window.close(); }, 750);
        }
      };
    </script>
  </body>
</html>`;
}
