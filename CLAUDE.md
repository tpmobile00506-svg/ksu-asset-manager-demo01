# KSU Asset Manager — คำแนะนำและบริบทโปรเจค

เอกสารนี้รวบรวมบริบท สถาปัตยกรรม กฎธุรกิจ และสถานะปัจจุบันของระบบจัดการครุภัณฑ์ สำหรับนักพัฒนาและ AI ที่เข้ามารับช่วงต่อ

---

## 1. ภาพรวมโปรเจค (Project Overview)
- **ระบบคืออะไร**: ระบบทะเบียนครุภัณฑ์ ตรวจนับพัสดุประจำปี QR Code สายอนุมัติโอนย้าย/ซ่อมบำรุง/จำหน่าย และรายงานคำนวณค่าเสื่อมราคา
- **หน่วยงานเป้าหมาย**: คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์ (KSU)
- **ผู้รับผิดชอบโครงการ**: โครงงานปีสุดท้ายของนักศึกษา 2 คน
- **เป้าหมายหลัก**: ตรงตามมาตรฐานบัญชีและระเบียบพัสดุภาครัฐ ปลอดภัยต่อการใช้งานจริง และสอดคล้องกับโครงสร้างสาขาวิชาของคณะ (7 สาขาวิชา + สำนักงานคณบดี ตามไฟล์ "ตัวย่อของสาขาวิชา" ของเจ้าหน้าที่พัสดุ)

---

## 2. Tech Stack และโครงสร้างโฟลเดอร์ (Architecture & Directory Structure)
- **Runtime & Language**: Node.js >= 22.13.0 (ESM, `"type": "module"`), TypeScript 5.9.3
- **Frontend Framework**: Next.js 16.4.0 (App Router), React 19.2.6, Tailwind CSS 4.2.1, Radix UI, Base UI, Lucide React, Sonner
- **Backend & Database**: Next.js API Routes เชื่อมต่อ Node route handlers ในโปรเซสเดียวกัน, PostgreSQL บน Neon Cloud, Prisma ORM 7.10.0 (`@prisma/adapter-pg` + `pg` 8.23.0)
- **Image Processing**: Sharp 0.35.5 (แปลงไฟล์เป็น WebP, ขนาดด้านยาวสุดไม่เกิน 1,600px, ลบ EXIF/GPS)
- **Excel & Documents**: ExcelJS 4.4.0 (ส่งออก 10 คอลัมน์ และ parser รองรับไฟล์ดั้งเดิม 11 คอลัมน์)
- **Testing**: Node.js Built-in Test Runner (`node:test`, `node:assert/strict`), tsx 4.23.13

### โครงสร้างโฟลเดอร์สำคัญ
- `frontend/`:
  - `features/inventory/`: หน้าทะเบียนครุภัณฑ์, รายละเอียด, ฟอร์มเพิ่ม/แก้ไข, แบ่งล็อต (`workspace.tsx`, `editor.tsx`, `asset-detail-sheet.tsx`, `qr-label-modal.tsx`)
  - `features/requests/`: หน้าคำขออนุมัติและการติดตามสถานะ (`requests-view.tsx`)
  - `features/stocktakes/`: หน้าตรวจนับพัสดุประจำปีและเครื่องสแกน QR (`stocktakes-view.tsx`)
  - `features/reports/`: หน้ารายงานสรุปและคำนวณค่าเสื่อมราคา (`reports-view.tsx`)
  - `features/users/`: หน้าจัดการบัญชีผู้ใช้และสิทธิ์ (`users-view.tsx`)
  - `features/audit/`: หน้าตรวจสอบประวัติกิจกรรม (`audit-view.tsx`)
- `backend/`:
  - `contracts/`: โค้ด Domain logic และ Types ที่ใช้ร่วมกันทั้งหน้าบ้านและหลังบ้าน (`domain.ts`, `models.ts`)
  - `routes/`: Next.js API route handlers (`data.ts`, `source.ts`)
  - `services/`: ตรรกะฝั่งเซิร์ฟเวอร์ (`asset-service.ts`, `asset-mutations.ts`, `asset-images.ts`)
  - `auth/`: ระบบยืนยันตัวตน เซสชัน และสิทธิ์ (`sessions.ts`)
  - `validation/`: Zod schemas แยกไฟล์ (`auth.ts`, `users.ts`, `requests.ts`, `helpers.ts`, `index.ts`)
  - `prisma/`: Prisma schema และประวัติ Migration (`schema.prisma`, `migrations/`)
  - `storage/`: จัดเก็บไฟล์รูปภาพและไฟล์นำเข้าลงตาราง `stored_files` (bytea ใน PostgreSQL)
  - `tests/`: ชุดทดสอบ Unit tests และ Regression tests (`*.test.ts`, `critical-workflows.mjs`)

---

## 3. คำสั่งที่ใช้บ่อย (Common Commands)
*หมายเหตุบน Windows: หากติด Execution Policy ของ PowerShell ให้รันผ่าน `cmd.exe /c "npm ..."`*

- **รันเซิร์ฟเวอร์พัฒนา**: `npm run dev` (เปิดที่ `http://127.0.0.1:3000` ห้ามเปลี่ยนพอร์ตเนื่องจาก Origin check)
- **รัน Unit Tests ทั้งหมด**: `npm test` (`node --import tsx --test backend/tests/*.test.ts`)
- **รัน Domain Tests**: `npm run test:domain` (ทดสอบคณิตศาสตร์สตางค์, แปลงคอลัมน์ Excel, ช่วงรหัส)
- **ตรวจสอบ Type TypeScript**: `npm run typecheck` (ตรวจทั้ง frontend และ backend แบบ `--noEmit`)
- **ตรวจสถานะ Migration**: `npm run db:status` (`prisma migrate status`)
- **นำ Migration เข้าฐานข้อมูลจริง**: `npm run db:deploy` (`prisma migrate deploy`)
- **สร้าง Prisma Client ใหม่**: `npm run db:generate` (`prisma generate`)
- **Build ตรวจสอบก่อนส่งงาน**: `npm run build`

---

## 4. โมดูลและสถานะการพัฒนา (Modules & Implementation Status)
*(ตรวจสอบจากโค้ดจริงและชุดทดสอบ ณ ปัจจุบัน)*

| โมดูล | สถานะ | รายละเอียดในโค้ด |
|---|---|---|
| **ทะเบียนครุภัณฑ์ (Asset Registry)** | **เสร็จสิ้น** | ลงทะเบียน, แก้ไขข้อมูลทั่วไป, แนบรูป WebP, แบ่งล็อตพร้อมหลักฐาน, ตรวจจับรหัสช่วง, ป้องกันการแก้ไขยอดเงินตรง ๆ |
| **โอนย้าย (Transfer)** | **เสร็จสิ้น** | ยื่นคำขอโอนย้าย, กำหนดสถานที่และสาขาปลายทาง, ผ่านสายอนุมัติ 3 ระดับ, อัปเดตสาขา/สถานที่เมื่ออนุมัติเสร็จสิ้น |
| **ซ่อมบำรุง (Maintenance)** | **เสร็จสิ้น** | ยื่นคำขอซ่อมพร้อมประมาณการค่าซ่อม, อนุมัติเข้าสถานะ `repair`, บันทึกผลซ่อมเสร็จพร้อมค่าใช้จ่ายจริงและเหตุผล |
| **QR / บาร์โค้ด (QR Tracking)** | **เสร็จสิ้น** | สร้าง QR Code ฉลากติดครุภัณฑ์, ปริ้นท์สติกเกอร์, สแกนด้วยกล้องบนหน้าตรวจนับพัสดุประจำปี |
| **จำหน่าย / ตัดบัญชี (Disposal)** | **เสร็จสิ้น** | ยื่นคำขอจำหน่ายพัสดุชำรุด/เสื่อมสภาพ, ผ่านสายอนุมัติ, ปรับ lifecycle เป็น `disposed` |
| **รายงาน / ค่าเสื่อมราคา (Reports)** | **เสร็จสิ้น** | คำนวณค่าเสื่อมสะสมเส้นตรง, มูลค่าสุทธิตามบัญชี, แสดงเปอร์เซ็นต์ตัดค่าเสื่อม, ส่งออกรายงาน Excel 10 คอลัมน์ |
| **อายุการใช้งานคงเหลือ (Remaining Life)** | **ทำบางส่วน** | มีฟิลด์ `lifeYears` และ `receivedDate`, คำนวณวันหมดอายุในสูตรค่าเสื่อมและระบุครุภัณฑ์ที่หมดอายุแล้ว แต่ยังไม่มีคอลัมน์แสดงจำนวนปีคงเหลือในตารางหลัก |

---

## 5. กฎธุรกิจและการตัดสินใจทางสถาปัตยกรรม (Business Rules & Decisions Made)

1. **บทบาท 5 ระดับ และการควบคุมสิทธิ์ตามสาขา (Role & Branch Authorization)**:
   - บทบาท: `staff` (เจ้าหน้าที่พัสดุ), `head` (หัวหน้าสาขาวิชา), `deputy` (รองคณบดี), `dean` (คณบดี), `admin` (ผู้ดูแลระบบ)
   - สายอนุมัติเริ่มต้น: `head` -> `deputy` -> `dean`
   - **การป้องกัน BOLA/IDOR สำหรับ `head`**:
     - `head` สามารถอนุมัติหรือปฏิเสธได้ **เฉพาะคำขอของสาขาตนเองเท่านั้น** โดยตรวจเทียบกับสาขาเจ้าของครุภัณฑ์ (`asset.branch` ต้นทาง)
     - `head` ที่ไม่มีสังกัดสาขา (`branch` เป็น `null` หรือว่าง) จะถูกปฏิเสธสิทธิ์ (HTTP 403) ทั้ง approve และ reject
     - `deputy` และ `dean` มีสิทธิ์ระดับคณะ สามารถข้ามเงื่อนไขสาขาได้ (อนุมัติได้ทุกสาขา)
     - `admin` ดูแลบัญชีและตั้งค่าระบบ แต่ **ไม่มีสิทธิ์อนุมัติคำขอครุภัณฑ์**
     - ห้ามอนุมัติคำขอของตนเอง (`r.actor === m.id`)
2. **การตรวจสอบข้อมูลฝั่งเซิร์ฟเวอร์ด้วย Zod (Server-side Validation)**:
   - โค้ด Schema ทั้งหมดแยกไว้ที่ `backend/validation/` โดยใช้ Zod v3 (`^3.25.76`)
   - `loginSchema`: ตรวจสอบรูปแบบอีเมลและความยาวรหัสผ่าน หากไม่ผ่านทุกกรณี ต้องตอบกลับด้วย `ApiError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401)` เพื่อป้องกัน Account/Password Enumeration
   - `userMutationSchema`: ตรวจสอบบทบาทจาก `roles`, สาขาจาก `standardBranches`, แปลง `active` จาก boolean (frontend) เป็น integer (0 หรือ 1)
   - `assetRequestSchema`: ใช้ `z.discriminatedUnion('kind', ...)` แยกตรวจ payload ของ `transfer` (ต้องมี location และ branch), `repair` (ต้องมี estimateSatang ไม่เกิน 10^14 สตางค์), `disposal` (ไม่บังคับ payload)
   - ใน Services ต้องนำผลลัพธ์ที่ parse แล้ว (`result.data`) ไปประมวลผลต่อเสมอ
3. **Database Indexing**:
   - เพิ่มเฉพาะ Index ที่มี query ใช้งานจริง:
     - `Audit`: `@@index([createdAt])` — แก้ปัญหาคอขวด `orderBy: { createdAt: 'desc' }, take: 100` ใน `getData()`
     - `AssetRequest`: `@@index([assetId])` — รองรับ FK join กับ Asset ใน `getData()`
     - `StocktakeItem`: `@@index([assetId])` — รองรับ FK join กับ Asset
   - ข้ามฟิลด์อื่น (เช่น `category`, `location`, `groupName` บน Asset) เนื่องจาก backend ไม่มี query `where` บนฟิลด์เหล่านั้น (frontend ทำ in-memory filtering) เพื่อหลีกเลี่ยง write amplification
4. **ลำดับ Prisma Migration**:
   - `202609160001_initial`: Baseline โครงสร้างตารางทั้งหมด
   - `202610080002_add_user_branch`: เพิ่มคอลัมน์ `branch String?` ใน `User` และ `Invite`
   - `202610080003_add_database_indexes`: เพิ่ม index 3 ตัว (`audit_created_at`, `request_asset_id`, `stocktake_item_asset_id`)
   - `202610090004_add_repair_records`: เพิ่มตาราง `repair_records` (ประวัติผลซ่อม)
5. **สูตรการคำนวณค่าเสื่อมราคา (`bookValue` ใน `domain.ts`)**:
   - **วิธีเส้นตรง**: คำนวณตามจำนวนวันจริง `days = Math.max(0, Math.floor((at - start) / 86400000))`
   - **อายุการใช้งานรวมเป็นวัน**: `lifeYears * 365.25` วัน (เฉลี่ยปีอธิกสุรทิน)
   - **การปัดเศษ**: ปัดเศษสตางค์ของค่าเสื่อมสะสมทิ้งด้วย `Math.floor(...)`
   - **Floor Value**: ไม่ต่ำกว่ามูลค่าซาก (`salvageSatang`) แม้ใช้งานเกินอายุ
   - **Calendar Validation**: ตรวจสอบวันที่จริงในปฏิทิน (`start.toISOString().slice(0, 10) === d`) หากเป็นวันที่ไม่มีจริง เช่น `2024-02-31` จะคืนค่า `null`
6. **ความปลอดภัยทางการเงินและความสอดคล้องของข้อมูล**:
   - ยอดเงินทุกจุดจัดเก็บเป็นจำนวนเต็มสตางค์ (`BigInt` / `Number.isSafeInteger`) ห้ามใช้เลขทศนิยม float ในฐานข้อมูล
   - การแก้ไขข้อมูลใช้ Prisma `$transaction` ระดับ `Serializable` พร้อมตรวจจับการชนกันด้วย `version` (Optimistic Concurrency Control)

---

## 6. สิ่งที่ยังไม่ได้ทำ / รอการตัดสินใจ (Pending Items & Roadmap)

1. **การยืนยันกฎการนับเวลาค่าเสื่อมราคาและปีงบประมาณจากอาจารย์ที่ปรึกษา**:
   - ปัจจุบันคำนวณตามวันจริงเฉลี่ย 365.25 วัน รอยืนยันว่าคณะต้องการให้นับเป็นวันจริง หรือนับเป็นเดือนเต็มตามแนวปฏิบัติกรมบัญชีกลาง
2. **ค่า Fallback ปีงบประมาณ 2569 ใน `fiscalYearAsOfDate`**:
   - ปัจจุบันฝังค่า fallback ไว้ที่ `2569` รอยืนยันว่าจะปรับเป็น Dynamic คำนวณตามวันที่ปัจจุบัน (ตัดรอบ 1 ต.ค.) หรือไม่
3. **ประสิทธิภาพของ `getData()`**:
   - ปัจจุบัน `getData()` ดึงข้อมูลครุภัณฑ์ทุกรายการขึ้นมาทั้งหมด รวมถึงรายการที่จำหน่ายแล้ว (`disposed`) ควรวางแผนทำ pagination หรือแยกโหลดเมื่อฐานข้อมูลมีขนาดใหญ่ขึ้น
4. **การ Refactor โค้ด Frontend**:
   - `frontend/features/inventory/workspace.tsx` มีขนาดใหญ่เกินไป ควรแยก Tab views และ Modal components ออกเป็นโมดูลย่อย
   - Audit Trail ปัจจุบันแสดงผล JSON ดิบ ควรทำ Diff Viewer ที่อ่านง่าย
5. **การปรับปรุงคู่มือและข้อมูลนำเข้า**:
   - อัปเดต `README.md` ให้สะท้อนขั้นตอนการติดตั้งและโครงสร้างปัจจุบัน
   - ตรวจสอบไฟล์ `backend/data/provided.json` ว่ามีข้อมูลวันรับเข้าครุภัณฑ์เพิ่มเติมหรือไม่

---

## 7. กฎการทำงานที่ต้องปฏิบัติตามอย่างเคร่งครัด (Working Guidelines)

1. **การแก้ไข Database Schema และ Migration**:
   - ทุกครั้งก่อนแก้ `schema.prisma` หรือรัน migration ต้องแจ้งแผนล่วงหน้า
   - ต้องให้ผู้ใช้สร้าง **backup branch ใน Neon** ก่อนเสมอ
   - **ห้ามรัน `prisma migrate reset` หรือ `prisma db push` เด็ดขาด** เพราะจะทำให้ข้อมูลในฐานข้อมูลสูญหาย
   - ต้องสร้าง migration ผ่าน `prisma migrate diff --script` และนำคำสั่ง SQL มาแสดงให้ผู้ใช้ตรวจก่อนรัน `db:deploy` เสมอ
2. **การเขียนชุดทดสอบ (Testing Rules)**:
   - ค่าที่คาดหวัง (Expected Value) ในเทสต์ **ต้องมาจากการคำนวณมือ (Hand Calculation)** ห้ามนำผลลัพธ์ที่รันได้จากโค้ดมาใส่เป็นค่าคาดหวังเด็ดขาด
   - **หากเทสต์ล้ม**: ห้ามแก้สูตรในโค้ดเอง และห้ามแก้ค่าคาดหวังเอง ให้หยุดและรายงานสาเหตุความต่างให้ผู้ใช้ทราบเพื่อตัดสินใจ
3. **กฎธุรกิจและนโยบายของคณะ**:
   - กฎระเบียบทางบัญชีหรือขั้นตอนการอนุมัติ ให้ถามผู้ใช้ก่อนเสมอ ห้ามคาดเดาเอาเอง
4. **ลำดับการทำงาน**:
   - ดำเนินการทีละข้อ อย่าทำหลายเรื่องพร้อมกัน และสรุปผลการทดสอบ (`npm test`, `test:domain`, `typecheck`) ทุกครั้งก่อนจบขั้นตอน
5. **การรักษาความปลอดภัยของข้อมูลลับ (Secrets Protection)**:
   - **ห้ามใส่ข้อมูลลับลงในโค้ดหรือเอกสาร Markdown เด็ดขาด**: ห้ามใส่ Connection String ของ Neon, ค่าในไฟล์ `.env`, รหัสผ่าน หรืออีเมลจริง ให้ใช้ตัวแปรอ้างอิง เช่น `DATABASE_URL`, `ADMIN_PASSWORD` เท่านั้น

