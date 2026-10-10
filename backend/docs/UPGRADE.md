# การติดตั้ง อัปเกรด และทดสอบ

รันคำสั่งจาก root ของ asset-manager ใช้ Node.js 22.13 ขึ้นไปและ PostgreSQL

## ฐานข้อมูลใหม่

สร้าง `.env` ที่ root ตาม `.env.example` ตั้ง DATABASE_URL, FRONTEND_ORIGIN และบัญชี ADMIN ที่ต้องการ จากนั้น:

```powershell
npm ci
npm run db:deploy
npm run db:seed
npm run source:seed
npm run build
npm start
```

`source:seed` เป็นทางเลือกเมื่อมีไฟล์ต้นฉบับใน backend/data อยู่ในเครื่อง หากไม่มี ให้อัปโหลด Excel ผ่านหน้าเว็บภายหลัง

Next.js config อ่าน root `.env` สำหรับ dev/build/start โดยไม่ทับ environment ของผู้ให้บริการ การ build ไม่สร้างตารางหรือ seed ข้อมูล และ runtime ตรวจ readiness ด้วยการอ่านเท่านั้น

## ฐานข้อมูลเดิมที่สร้างโดย db/init.ts

ระบบเดิมอาจมีครบ 19 ตารางโดยยังไม่มี `_prisma_migrations` ห้ามรัน reset หรือ db push --accept-data-loss เพื่อข้ามขั้นตอน สำรองด้วย pg_dump ก่อนทำการเปลี่ยนโครงสร้าง

ตรวจความต่างโดยไม่เขียนฐานข้อมูล:

```powershell
npx prisma migrate diff --from-config-datasource --to-schema backend/prisma/schema.prisma --script
```

ให้ผู้ดูแลตรวจความต่าง รวมถึงชื่อ unique indexes และ foreign keys ของระบบเก่า แล้วทำให้ schema ตรงกับ migration เริ่มต้นโดยเก็บข้อมูลเดิมครบ ก่อนบันทึก baseline:

```powershell
npx prisma migrate resolve --applied 202609160001_initial
npm run db:status
npm run db:deploy
```

`migrate resolve` เป็นการรับรองว่างานของ migration ถูกทำแล้ว จึงใช้เฉพาะเมื่อยืนยัน schema เดิมจริง การปรับปรุงครั้งนี้ไม่ได้ baseline หรือเปลี่ยน schema ฐานข้อมูลทะเบียนเดิมให้อัตโนมัติ เว็บยังอ่าน schema เดิมที่ครบได้

## เว็บที่ใช้งานและการทดสอบอัตโนมัติ

ใช้งานและตรวจหน้าเว็บที่ `http://localhost:3000` เท่านั้น เว็บนี้ใช้ข้อมูลและบัญชีเดิมจากฐานข้อมูลที่ตั้งใน root `.env` ไม่ต้องมีเว็บตัวอย่างหรือบัญชีทดสอบอีกชุดสำหรับผู้ใช้งาน

```powershell
npm test
npm run test:domain
npm run typecheck
npm run build
$env:ASSET_TEST_DATABASE_URL='postgresql://TEST_USER@127.0.0.1:55432/postgres'
npm run test:integration
```

คำสั่ง `test:integration` เป็นการทดสอบอัตโนมัติที่สร้างและแก้ข้อมูล จึงต้องใช้ PostgreSQL สำหรับทดสอบเท่านั้นและบัญชีที่สร้างฐานข้อมูลได้ runner ไม่โหลด `.env` และรับเฉพาะ loopback server สร้างฐานข้อมูลชื่อสุ่ม `asset_test_...` และรหัสสุ่มที่ใช้เฉพาะระหว่างรัน จากนั้นติดตั้ง migrations, seed และทดสอบ API ผ่าน port ชั่วคราวที่ระบบเลือกให้ โดยไม่ใช้ port 3000

เมื่อจบหรือพบข้อผิดพลาด runner จะปิด process ชั่วคราวและลบเฉพาะฐานข้อมูลที่สร้างเอง รองรับการยกเลิกด้วย SIGINT/SIGTERM โดยไม่เขียนรหัสลงไฟล์ ไม่เก็บเว็บทดสอบค้างไว้ และไม่รองรับ `--keep` อีกต่อไป หากจำเป็นต้องกำหนด port ของการทดสอบ ใช้ ASSET_TEST_PORT ที่ไม่ใช่ 3000 ได้ การปิดเครื่องหรือบังคับฆ่า process อาจข้ามการล้างข้อมูล จึงควรปล่อยให้ runner จบตามปกติ

ห้ามนำ TEST credentials ไปใช้เป็นบัญชีจริง และห้ามชี้ critical-workflows โดยตรงไปยังเว็บที่มีทะเบียนจริง

## พฤติกรรมที่ควรรู้

- การนำเข้าแบบกลุ่มรับเฉพาะแถวพร้อมนำเข้า เมื่อมีรหัสซ้ำจะยกเลิกทั้งชุดและแจ้งให้ตรวจทาน ไม่เติมจำนวนหรือเดายอดเงินให้แถวที่ข้อมูลไม่ครบ
- แก้ชื่อสถานที่/สาขาที่บันทึกผิดได้พร้อมเหตุผลและ audit การโอนย้ายจริงใช้คำขอและสายอนุมัติ
- ผลตรวจนับแยกจากสภาพครุภัณฑ์ในทะเบียน การแก้หมายเหตุจะรักษาผลตรวจเดิมไว้
- ค่า branch ที่แก้ใน parser มีผลกับการตรวจทาน/นำเข้าใหม่ ไม่เขียนทับสาขาของรายการเดิม เพราะอาจมีการโอนย้ายหรือแก้ไขภายหลังแล้ว
- การส่งออกใช้ totalSatang ที่บันทึกจริง แม้ยอดต่างจากจำนวนคูณราคาต่อหน่วยจากการปัดเศษหรือหลักฐานที่ยืนยันไว้
