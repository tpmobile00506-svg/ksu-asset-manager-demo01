import { escapeHtml as esc } from './html';

// ฉลาก QR หนึ่งดวงสำหรับพิมพ์จากหน้ารายละเอียดครุภัณฑ์ — ฟังก์ชันล้วน ไม่แตะ DOM จึงทดสอบได้ใน Node
// ทุกค่าที่มาจากทะเบียนต้องผ่าน esc() เพราะเจ้าหน้าที่พิมพ์รหัส/ชื่อเองได้ทุกตัวอักษร

export type QrLabelInput = {
  code: string;
  name: string;
  branch?: string | null;
  receivedDate?: string | null;
};

export function buildQrLabelHtml(asset: QrLabelInput, qrDataUrl: string): string {
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>พิมพ์ป้าย QR - ${esc(asset.code)}</title>
          <style>
            @page { size: auto; margin: 10mm; }
            .touch-actions { display: none; position: fixed; left: 16px; right: 16px; bottom: 16px; gap: 12px; }
            .touch-actions button { flex: 1; min-height: 48px; font: inherit; font-size: 16px; border: 1px solid #0f172a; border-radius: 8px; background: #fff; color: #0f172a; }
            .touch-actions button:first-child { background: #174ae4; border-color: #174ae4; color: #fff; }
            @media (hover: none) { .touch-actions { display: flex; } }
            @media print { .touch-actions { display: none !important; } }
            body { font-family: 'Leelawadee UI', Tahoma, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #fff; }
            .sticker {
              width: 90mm;
              border: 2px solid #0f172a;
              border-radius: 6px;
              overflow: hidden;
              box-sizing: border-box;
            }
            .header {
              background: #101f3c;
              color: #fff;
              font-size: 10px;
              font-weight: bold;
              text-align: center;
              padding: 5px 8px;
              line-height: 1.25;
            }
            .body {
              display: flex;
              align-items: center;
              padding: 8px 10px;
              gap: 12px;
            }
            .qr-box {
              width: 65px;
              height: 65px;
              flex-shrink: 0;
            }
            .qr-box img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .details {
              flex: 1;
              min-width: 0;
            }
            .code {
              font-family: monospace;
              font-weight: bold;
              font-size: 11px;
              color: #1d4ed8;
              margin-bottom: 2px;
            }
            .name {
              font-weight: bold;
              font-size: 10px;
              margin-bottom: 3px;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .dept {
              color: #475569;
              font-size: 8.5px;
            }
          </style>
        </head>
        <body>
          <div class="sticker">
            <div class="header">
              <img src="/logo-faculty.png" style="width:14px;height:14px;object-fit:contain;background:#fff;border-radius:2px;padding:1px;vertical-align:middle;margin-right:5px;display:inline-block;" />
              คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์
            </div>
            <div class="body">
              <div class="qr-box">
                <img src="${esc(qrDataUrl)}" alt="QR Code" />
              </div>
              <div class="details">
                <div style="font-size:8px; color:#475569;">หมายเลขครุภัณฑ์</div>
                <div class="code">${esc(asset.code)}</div>
                <div style="font-size:8px; color:#64748b; margin-top:2px;">ชื่อรายการ</div>
                <div class="name">${esc(asset.name)}</div>
                <div class="dept">${esc(asset.branch || 'คณะวิศวกรรมศาสตร์ฯ')}</div>
                <div style="font-size:8px; color:#64748b; margin-top:3px;">วันที่ได้มา: ${esc(asset.receivedDate || '—')}</div>
              </div>
            </div>
          </div>
          <div class="touch-actions">
            <button type="button" onclick="window.print()">พิมพ์ป้าย</button>
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
      </html>
    `;
}
