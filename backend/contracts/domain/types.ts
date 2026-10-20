// รูปร่างข้อมูลหลัก (TypeScript type) ที่หน้าบ้านและหลังบ้านใช้ตรงกัน
// Asset = ครุภัณฑ์ 1 รายการ · Candidate = แถวจากไฟล์ Excel ที่ระบบอ่านแล้ว รอเจ้าหน้าที่ตรวจก่อนนำเข้า · Source = ไฟล์ Excel ทั้งไฟล์
export type Asset = {
  imageVersion?: string | null;
  imageUrl?: string | null;
  id: string;
  code: string;
  name: string;
  quantity: number;
  unitSatang: number;
  totalSatang: number;
  notes: string;
  location: string;
  branch: string;
  groupName: string;
  category: string;
  condition: string;
  lifecycle: string;
  version: number;
  parentId: string | null;
  sourceId: string | null;
  sourceRow: string | null;
  receivedDate: string;
  lifeYears: number;
  salvageSatang: number;
  serial: string;
  brand: string;
  custodian: string;
  createdAt: string;
  setId?: string | null;
  setRole?: string | null;
  setName?: string | null;
  setKind?: string | null;
  fundId?: string | null;
  fundHintId?: string | null;
  fundName?: string | null;
};
// ชุดครุภัณฑ์ที่ห้ามแยก: package = หัวชุดไม่มีลำดับแต่มีราคา, lot = หัวชุดมีลำดับและราคา, heading = หัวข้อชุดไม่มีราคา
// ชุดห้ามแยก (package/lot) · heading = บรรทัดหัวทุน/โครงการในไฟล์ต้นฉบับ (ใช้ระหว่างตรวจไฟล์เท่านั้น)
export type SetKind = 'package' | 'lot' | 'heading' | 'fund';
export type SetRole = 'header' | 'part' | 'member';
export const setRoles: Record<SetRole, string> = { header: 'หัวชุด', part: 'ชิ้นส่วนในชุด', member: 'รายการในชุด' };
export type CandidateSet = { key: string; name: string; kind: SetKind; role?: SetRole };
// fund = หัวทุนที่อยู่เหนือแถวนี้ในไฟล์ต้นฉบับ: เป็นแค่ "รายการแนะนำ" เจ้าหน้าที่ต้องยืนยันเองว่ามาจากทุนนั้นจริง
export type CandidateFund = { key: string; name: string };
// เจ้าหน้าที่เปลี่ยนประเภทแถวต้นฉบับเองในหน้านำเข้าแบบ Excel (ระบบเดาผิด): หัวทุน / บรรทัดต่อของหัวด้านบน / ครุภัณฑ์ / ข้าม
export type RowOverride = 'fund' | 'continue' | 'asset' | 'skip';
export const rowOverrideLabels: Record<RowOverride, string> = {
  fund: 'หัวทุน',
  continue: 'บรรทัดต่อของหัวด้านบน',
  asset: 'ครุภัณฑ์',
  skip: 'ไม่ใช่ครุภัณฑ์ (ข้าม)',
};
export const isRowOverride = (value: unknown): value is RowOverride =>
  typeof value === 'string' && Object.hasOwn(rowOverrideLabels, value);
export type Candidate = {
  key: string;
  sheet: string;
  row: number;
  kind: string;
  issue: string;
  issueType?: string;
  groupName: string;
  values: unknown[];
  asset: Partial<Asset>;
  set?: CandidateSet;
  fund?: CandidateFund;
  override?: RowOverride;
};
export type Source = {
  id: string;
  name: string;
  hash: string;
  sheets: { name: string; rows: { row: number; values: unknown[] }[] }[];
};
