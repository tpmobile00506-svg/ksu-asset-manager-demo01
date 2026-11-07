import { LayoutDashboard, Package, Upload, ArrowLeftRight, QrCode, BarChart3, History, Users } from 'lucide-react';
import { fiscalYearOf } from '@/shared/domain';

// เมนูหลักของระบบ: [รหัสหน้า, ชื่อที่แสดง, ไอคอน] · รหัสหน้าใช้ใน URL (?view=registry) ด้วย
export const nav = [
  ['overview', 'ภาพรวม', LayoutDashboard],
  ['registry', 'ทะเบียนครุภัณฑ์', Package],
  ['imports', 'นำเข้าข้อมูล Excel', Upload],
  ['requests', 'คำขอ', ArrowLeftRight],
  ['stocktakes', 'ตรวจนับประจำปี', QrCode],
  ['reports', 'รายงานและค่าเสื่อม', BarChart3],
  ['audit', 'ประวัติการทำรายการ', History],
  ['users', 'ผู้ใช้งานและสิทธิ์', Users],
] as const;

export type NavEntry = readonly [string, string, React.ComponentType<{ className?: string }>];

// บทบาทไหนเปิดหน้าไหนได้: ผู้ใช้งาน = ผู้ดูแลระบบ · นำเข้า = เจ้าหน้าที่และผู้ดูแลระบบ (ผู้อนุมัติไม่ได้นำเข้า จึงซ่อนไว้)
// ใช้ทั้งเมนูข้างและตอนอ่าน ?view= จาก URL · เซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำอีกชั้นทุกคำสั่ง
export function canSeeView(view: string, role: string): boolean {
  if (view === 'users') return role === 'admin';
  if (view === 'imports') return role === 'staff' || role === 'admin';
  return true;
}

// คำอธิบายใต้หัวข้อของแต่ละหน้า
export function viewDescription(view: string, activeCount: number): string {
  const text: Record<string, string> = {
    registry: `ครุภัณฑ์ที่ใช้อยู่ ${activeCount.toLocaleString('th-TH')} รายการ`,
    overview: `สรุปจำนวน มูลค่า และสภาพครุภัณฑ์ ปีงบประมาณ ${fiscalYearOf(new Date())}`,
    imports: 'ตรวจข้อมูลจากไฟล์ Excel ก่อนนำเข้าทะเบียน',
    requests: 'โอนย้าย ส่งซ่อม และจำหน่าย ต้องผ่านสายอนุมัติก่อนทะเบียนจะเปลี่ยน',
    stocktakes: 'ตรวจของจริงในพื้นที่เทียบกับทะเบียน',
    reports: 'ค่าเสื่อมราคาแบบเส้นตรง ตามหลักเกณฑ์กระทรวงการคลัง',
    users: 'บัญชีผู้ใช้ บทบาท และสายอนุมัติ',
    audit: 'ใครทำอะไร เมื่อไหร่ และข้อมูลก่อน/หลังแก้ไข',
  };
  return text[view] ?? '';
}
