import { LayoutDashboard, Package, Upload, ArrowLeftRight, QrCode, BarChart3, History, Users } from 'lucide-react';
import { fiscalYearOf } from '@/shared/domain';

// เมนูหลักของระบบ: [รหัสหน้า, ชื่อที่แสดง, ไอคอน] · รหัสหน้าใช้ใน URL (?view=registry) ด้วย
export const nav = [
  ['overview', 'ภาพรวม (Dashboard)', LayoutDashboard],
  ['registry', 'ทะเบียนครุภัณฑ์', Package],
  ['imports', 'นำเข้าข้อมูล Excel', Upload],
  ['requests', 'คำขอและโอนย้าย', ArrowLeftRight],
  ['stocktakes', 'ตรวจนับประจำปี (QR)', QrCode],
  ['reports', 'รายงานและค่าเสื่อม', BarChart3],
  ['audit', 'ประวัติการทำงาน (Audit)', History],
  ['users', 'ผู้ใช้งานและสิทธิ์', Users],
] as const;

export type NavEntry = readonly [string, string, React.ComponentType<{ className?: string }>];

// คำอธิบายใต้หัวข้อของแต่ละหน้า
export function viewDescription(view: string, activeCount: number): string {
  const text: Record<string, string> = {
    registry: `ค้นหา ตรวจสอบข้อมูล ติดตามสถานะ และจัดการประวัติรายการครุภัณฑ์ทั้งหมด (${activeCount.toLocaleString('th-TH')} รายการ)`,
    overview: `สรุปมูลค่าสินทรัพย์ การกระจายตัวตามสาขาวิชา และความพร้อมใช้งานประจำปีงบประมาณ ${fiscalYearOf(new Date())}`,
    imports: 'ตรวจสอบข้อมูลจาก Excel ก่อนเพิ่มเข้าสู่ทะเบียนกลาง',
    requests: 'ติดตามสถานะสายอนุมัติ 3 ระดับ: หัวหน้าสาขาวิชา (Head) → รองคณบดี (Deputy) → คณบดี (Dean)',
    stocktakes: 'ตรวจสอบรายการจริงในพื้นที่เทียบกับฐานข้อมูลทะเบียนกลาง',
    reports: 'คำนวณค่าเสื่อมราคาวิธีเส้นตรง (Straight-Line Depreciation) อัตราตามระเบียบกระทรวงการคลัง',
    users: 'กำหนดสิทธิ์การเข้าถึงข้อมูลตามลำดับขั้นสายอนุมัติ: Staff → Head → Deputy → Dean → Admin',
    audit: 'ผู้ดำเนินการ เวลา และรายละเอียดการเปลี่ยนแปลงของทุกรายการ',
  };
  return text[view] ?? '';
}
