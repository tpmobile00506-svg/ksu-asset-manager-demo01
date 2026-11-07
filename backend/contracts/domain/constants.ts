// ค่าคงที่และป้ายภาษาไทยที่ใช้ทั้งระบบ: บทบาทผู้ใช้ สภาพครุภัณฑ์ ประเภทคำขอ และหัวคอลัมน์ Excel 11 ช่อง
export const roles = {
  staff: 'เจ้าหน้าที่พัสดุ (Staff)',
  head: 'หัวหน้าสาขา (Head)',
  deputy: 'รองคณบดี (Deputy)',
  dean: 'คณบดี (Dean)',
  admin: 'ผู้ดูแลระบบ (Admin)',
} as const;
export type Role = keyof typeof roles;
// สวิตช์สาธิต (เปิด 18 ต.ค. 2569 ช่วงสอบ ปิดแล้ว 19 ต.ค. 2569 หลังสอบเสร็จ): true = Admin อนุมัติคำขอได้ กดครั้งเดียวจบทุกขั้น
// กฎปกติคือ false — Admin อนุมัติไม่ได้ เพื่อแบ่งแยกหน้าที่ระหว่างคนดูแลระบบกับผู้อนุมัติ
export const ADMIN_APPROVES_ALL = false;
export const conditions = { normal: 'ปกติ', damaged: 'ชำรุด', repair: 'กำลังซ่อม', missing: 'ไม่พบ' } as const;
export const requestTypes = { transfer: 'โอนย้าย', repair: 'ซ่อมบำรุง', disposal: 'จำหน่าย / ตัดบัญชี' } as const;
export const headers11 = [
  'ลำดับ',
  'หมายเลขครุภัณฑ์',
  'รายการ',
  'จำนวน',
  'ราคาต่อหน่วย',
  'จำนวนเงิน',
  'หมายเหตุ',
  'สถานที่',
  'สาขา',
  'หมวด (กลุ่มต่างๆ)',
  'สำนักงาน',
];
