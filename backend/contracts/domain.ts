// กฎธุรกิจ (domain) ที่หน้าบ้านและหลังบ้านใช้ร่วมกัน — import ผ่านไฟล์นี้เสมอ: '@/shared/domain' หรือ '../contracts/domain'
// โค้ดจริงแยกตามเรื่องอยู่ในโฟลเดอร์ domain/ ไฟล์นี้แค่รวมส่งออก (barrel) import เดิมทั้งโปรเจกต์จึงไม่ต้องแก้
//
//   constants.ts        บทบาท สภาพ ประเภทคำขอ หัวคอลัมน์ Excel
//   types.ts            รูปร่างข้อมูล Asset / Candidate / Source
//   money.ts            เงินเป็นสตางค์จำนวนเต็ม
//   dates.ts            ปีงบประมาณ วันที่ พ.ศ.
//   depreciation.ts     ค่าเสื่อมราคา อายุคงเหลือ
//   asset-types.ts      ประเภทครุภัณฑ์ และหมวด
//   branches.ts         สาขามาตรฐาน ตัวย่อ
//   requests.ts         เลขที่คำขอ สายอนุมัติ
//   assets.ts           หมายเลขครุภัณฑ์ ยกเลิก/กู้คืน ตรวจนับ
//   import-classify.ts  อ่านแถว Excel ต้นฉบับ จัดชุด/หัวทุน
//
// ไฟล์ใน domain/ ใส่นามสกุล .ts ตอน import กันเอง เพราะ npm run test:domain รันด้วย Node ตรง ๆ
// (node --experimental-strip-types) ซึ่งต้องระบุนามสกุลเต็ม · ห้าม import แพ็กเกจภายนอกในโฟลเดอร์นี้
export * from './domain/constants.ts';
export * from './domain/types.ts';
export * from './domain/money.ts';
export * from './domain/dates.ts';
export * from './domain/depreciation.ts';
export * from './domain/asset-types.ts';
export * from './domain/branches.ts';
export * from './domain/requests.ts';
export * from './domain/assets.ts';
export * from './domain/import-classify.ts';
