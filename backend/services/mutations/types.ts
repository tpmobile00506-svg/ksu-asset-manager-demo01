import type { Transaction } from '../../db/client';
import type { Member } from '../../auth/sessions';
import type { Candidate } from '../../contracts/domain';

// ข้อมูลที่ส่งมากับคำสั่ง (body ของ POST /api/data) ยังไม่ได้ตรวจ แต่ละคำสั่งตรวจเองก่อนใช้
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Input = Record<string, any>;

// สิ่งที่ทุกคำสั่งได้รับ: เปิด transaction ไว้แล้ว และอ่านผู้ใช้สดจากฐานข้อมูลแล้ว (สิทธิ์ล่าสุด)
export type MutationContext = {
  tx: Transaction; // ใช้ tx แทน prisma ทุกครั้ง ทุกคำสั่งในนี้จะสำเร็จหรือย้อนกลับพร้อมกัน
  m: Member; // ผู้ที่สั่ง
  action: string; // ชื่อคำสั่ง เช่น 'create', 'approve'
  b: Input; // ข้อมูลที่ส่งมา
  passwordHash?: string; // คำสั่ง user: รหัสผ่านที่ hash ไว้ก่อนเปิด transaction
  sourceRows?: Candidate[]; // คำสั่ง import/batchImport: แถวจากไฟล์ Excel ที่อ่านไว้ก่อนเปิด transaction
};

// คำสั่งหนึ่งคำสั่ง = ฟังก์ชันหนึ่งตัว คืนผลลัพธ์ที่ส่งกลับไปหน้าเว็บ (และเก็บไว้ตอบซ้ำเมื่อกดซ้ำ)
export type Handler = (ctx: MutationContext) => Promise<Input>;
