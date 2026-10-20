// แปลงอักขระพิเศษของ HTML ก่อนนำข้อความที่ผู้ใช้กรอก (รหัส ชื่อ สาขา หมายเหตุ ...) ไปต่อเป็นหน้า HTML
// ใช้ทุกครั้งที่สร้าง HTML ด้วยการต่อข้อความ (หน้าพิมพ์ที่เปิดด้วย window.open + document.write)
// ไม่เช่นนั้นชื่อครุภัณฑ์อย่าง <img src=x onerror=...> จะกลายเป็นสคริปต์ที่รันในเว็บของเรา (Stored XSS)
export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
