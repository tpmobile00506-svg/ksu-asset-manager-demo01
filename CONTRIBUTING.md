# คู่มือสำหรับผู้พัฒนาต่อ

อ่าน [ARCHITECTURE.md](ARCHITECTURE.md) ก่อน เพื่อเข้าใจว่าโค้ดแต่ละส่วนอยู่ไหน
คำสั่งทั้งหมดรันในโฟลเดอร์ `asset-manager/` (บน Windows ถ้า PowerShell บล็อก `npm` ให้ใช้ `npm.cmd` แทน)

## 1. เริ่มต้น

```bash
npm ci                 # ติดตั้งแพ็กเกจ (สร้าง Prisma Client ให้อัตโนมัติ)
cp .env.example .env   # แล้วใส่ DATABASE_URL ของฐานข้อมูลทดลองของคุณเอง
npm run db:deploy      # สร้างตารางตาม migrations
npm run db:seed        # สร้างบัญชี Admin จาก ADMIN_EMAIL / ADMIN_PASSWORD ใน .env
npm run dev            # เปิด http://127.0.0.1:3000 (ห้ามเปลี่ยนพอร์ต: cookie และการตรวจ Origin ผูกกับพอร์ตนี้)
```

> ⚠️ ฐานข้อมูลของโปรเจกต์นี้ใช้ร่วมกับเว็บจริงบน Vercel ถ้าจะทดลองแก้ข้อมูล ให้สร้าง branch ใหม่ใน Neon แล้วใช้ URL ของ branch นั้น

## 2. คำสั่งที่ใช้ประจำ

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | เปิดเว็บสำหรับพัฒนา (แก้โค้ดแล้วหน้าเว็บอัปเดตเอง) |
| `npm run dev:trace` | เหมือน dev แต่พิมพ์ทุกขั้นที่หลังบ้านทำออกมาในหน้าจอ (ตรวจสิทธิ์ เปิด transaction คำสั่ง SQL) เหมาะกับการเรียนรู้ระบบ |
| `npm test` | เทสต์อัตโนมัติทั้งหมด (ไม่แตะฐานข้อมูลจริง ใช้ฐานข้อมูลจำลอง) |
| `npm run test:domain` | เทสต์สูตรเงิน ช่วงรหัส และการอ่านไฟล์ต้นฉบับ 4,312 แถว |
| `npm run typecheck` | ตรวจชนิดข้อมูล TypeScript ทั้งหน้าบ้านและหลังบ้าน |
| `npm run lint` | ตรวจคุณภาพโค้ด (ต้อง 0 error) |
| `npm run format` | จัดรูปแบบโค้ดอัตโนมัติด้วย Prettier |
| `npm run build` | build แบบเดียวกับที่ Vercel ทำ |
| `npm run db:status` / `db:deploy` | ดูสถานะ / ติดตั้ง migration |

**ก่อน commit ทุกครั้ง** ต้องผ่าน: `npm run format` → `npm run lint` → `npm run typecheck` → `npm test`

## 3. กฎที่ห้ามละเมิด

1. **ห้ามรัน `prisma db push` หรือ `prisma migrate reset`** (ข้อมูลจริงหายได้) แก้โครงสร้างฐานข้อมูลผ่าน migration เท่านั้น:
   แก้ `schema.prisma` → `npx prisma migrate diff --from-config-datasource --to-schema backend/prisma/schema.prisma --script`
   (อ่านโครงสร้างจากฐานข้อมูลอย่างเดียว ไม่เขียนอะไร) → ตรวจ SQL → บันทึกเป็น `migration.sql` ในโฟลเดอร์ใหม่ใต้ `backend/prisma/migrations/`
   → สร้าง backup branch ใน Neon → `npm run db:deploy`
2. **ห้ามใส่ข้อมูลลับในโค้ดหรือเอกสาร** (connection string, รหัสผ่าน, อีเมลจริง) repository นี้เป็นสาธารณะ
3. **เงินเป็นสตางค์จำนวนเต็ม** ห้ามคำนวณด้วยทศนิยม
4. **ค่าคาดหวังในเทสต์ต้องคำนวณมือ** ถ้าเทสต์ล้ม ห้ามแก้สูตรหรือแก้ค่าคาดหวังเพื่อให้ผ่าน ให้หาสาเหตุก่อน
5. **ห้ามรัน `npm run test:integration` กับฐานข้อมูลหลัก** (ลบข้อมูลทั้งหมด) ต้องตั้ง `ASSET_TEST_DATABASE_URL` เป็นฐานข้อมูลแยก
6. **กฎทางบัญชีและสายอนุมัติต้องถามเจ้าหน้าที่พัสดุ/อาจารย์ก่อน** ห้ามเดาเอง และจดวันที่ตัดสินใจไว้ในคอมเมนต์
7. ไม่แก้ไฟล์ที่เครื่องมือสร้าง: `backend/generated/`, `frontend/.next/`, `backend/.cache/`

## 4. ตัวอย่าง: เพิ่มคำสั่งบันทึกใหม่ 1 อย่าง

สมมติต้องการคำสั่ง **"ย้ายห้องเก็บชั่วคราว"** (`park`) ที่เจ้าหน้าที่เปลี่ยนสถานที่ได้ทันทีโดยไม่ผ่านสายอนุมัติ

### ขั้น 1 — เขียนฟังก์ชันหลังบ้าน (`backend/services/mutations/assets.ts`)

```ts
// ย้ายไปห้องเก็บชั่วคราว (ไม่ผ่านสายอนุมัติ) — ตัดสินใจกับเจ้าหน้าที่พัสดุเมื่อ <วันที่>
export async function parkAsset(ctx: MutationContext) {
  const { tx, m, b } = ctx;
  // ตรวจร่วม: เป็น staff/admin · รายการยังใช้งาน · version ตรง · ไม่มีคำขอค้าง · อ่านเหตุผล
  const { a, reason } = await loadEditableAsset(ctx);
  if (!reason) throw new ApiError('กรุณาระบุเหตุผล');
  const location = clean(b.location ?? '', 200);
  if (!location) throw new ApiError('กรุณาระบุห้องที่ย้ายไป');
  await dimensions(tx, { ...a, location }); // สร้างชื่อห้องในตาราง locations ถ้ายังไม่มี
  await tx.asset.update({ where: { id: a.id }, data: { location, version: { increment: 1 } } });
  await audit(tx, m, 'ย้ายห้องเก็บชั่วคราว', a.id, a, { location }, reason); // ทุกการเปลี่ยนแปลงต้องมีประวัติ
  return { ok: true };
}
```

สิ่งที่ได้ฟรีจาก `mutate()`: transaction, กันกดซ้ำ, ลองใหม่เมื่อชนกัน, ตรวจ Origin/cookie, อ่านสิทธิ์สด

### ขั้น 2 — ลงทะเบียนในตารางคำสั่ง (`backend/services/mutations/index.ts`)

```ts
const handlers: Record<string, Handler> = {
  // ...
  park: parkAsset,
};
```

(ถ้าใช้โหมด trace ให้เพิ่มคำอธิบายภาษาไทยใน `ACTIONS` ของ `backend/debug/trace.ts` ด้วย)

### ขั้น 3 — เขียนเทสต์ (`backend/tests/park-asset.test.ts`)

ใช้ฐานข้อมูลจำลอง `installMemoryDatabase()` จาก `backend/tests/helpers/memory-db.ts`
ดูตัวอย่างสั้น ๆ ได้ที่ `split-photo.test.ts` อย่างน้อยควรทดสอบ: ทำสำเร็จ, ไม่มีเหตุผล → error, บทบาทที่ไม่มีสิทธิ์ → 403

### ขั้น 4 — เรียกจากหน้าเว็บ

หน้าเว็บบันทึกผ่าน `write()` ใน `workspace.tsx` เสมอ (ส่ง token กันกดซ้ำ + โหลดข้อมูลใหม่ + แจ้งผลให้)

- ปุ่มเปิดหน้าต่าง: `open('park', { asset })` (เช่นในเมนู `row-actions.tsx` หรือ `asset-detail-view.tsx`)
- หน้าต่าง: เพิ่มชื่อใน `titleMap` และฟอร์มใน `frontend/features/inventory/editor.tsx`
  ครอบช่องด้วย `<div className="form-grid">` (เพิ่ม `form-grid-single` ถ้าคอลัมน์เดียว) และให้ทุกช่องมีป้ายใน `<label><span>…</span>…</label>` ช่องที่อยู่แถวเดียวกันจึงจะสูงเท่ากันและตรงระดับ
- ตอนกดบันทึก: `write({ action: 'park', id: modal.asset.id, version: modal.asset.version, location, reason })`

### ขั้น 5 — ตรวจก่อน commit

`npm run format && npm run lint && npm run typecheck && npm test` แล้วลองกดจริงใน `npm run dev`

## 5. เพิ่มหน้าใหม่ในเมนู

1. เพิ่มรายการใน `nav` และคำอธิบายใน `viewDescription()` ที่ `frontend/features/shell/navigation.ts`
2. สร้างคอมโพเนนต์ใน `frontend/features/<เรื่อง>/` รับ `data` (WorkspaceData) และ `open` / `write` ตามที่ต้องใช้
3. แสดงผลใน `workspace.tsx` (หรือใน `operations.tsx` สำหรับหน้าที่ไม่ต้องใช้ตัวกรองทะเบียน)
4. ถ้าต้องการข้อมูลใหม่จากฐานข้อมูล เพิ่มใน `getData()` (`backend/services/asset-service.ts`) และ `WorkspaceData` (`backend/contracts/models.ts`)

## 6. เขียนโค้ดให้เหมือนส่วนที่มีอยู่

- คอมเมนต์และข้อความถึงผู้ใช้เป็นภาษาไทย ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษ
- คอมเมนต์อธิบาย **ทำไม** (กฎธุรกิจ เหตุผลที่เลือกวิธีนี้ วันที่ตัดสินใจ) ไม่ต้องอธิบายว่าโค้ดทำอะไรทีละบรรทัด
- โยน `new ApiError('ข้อความไทย', status)` เมื่อข้อมูลไม่ถูกต้อง (400), ไม่มีสิทธิ์ (403), ข้อมูลเปลี่ยนแล้ว (409)
- กฎที่หน้าบ้านและหลังบ้านต้องใช้ตรงกัน (สูตร การตรวจ ป้ายภาษาไทย) ให้อยู่ใน `backend/contracts/domain/`
- **ใช้คำเดียวต่อหนึ่งความหมาย** (ตกลงกัน 7 พ.ย. 2569 ดูรายละเอียดใน `reports/ตรวจภาษา ตัวอักษร และลิสต์ UX.md`):
  ประเภทครุภัณฑ์ (ไม่ใช่ หมวดหมู่) · หมวด · สภาพ (ของ) / สถานะ (คำขอ บัญชี) · สาขา/หน่วยงาน · ยื่นคำขอ · โอนย้าย / ส่งซ่อม / จำหน่าย ·
  อนุมัติ / ไม่อนุมัติ (ไม่ใช่ ส่งกลับ) · แยกรายการ (ไม่ใช่ แบ่งล็อต) · ป้าย QR (ปุ่ม/หน้าต่างพิมพ์ใช้ สติกเกอร์ QR) · หมายเลขครุภัณฑ์ · ผู้รับผิดชอบ · วันที่ได้มา ·
  ราคาทุน / ค่าเสื่อมราคาสะสม / มูลค่าสุทธิตามบัญชี · ไม่ใส่อังกฤษในวงเล็บ ยกเว้นชื่อที่คนใช้จริง (QR, Excel, Serial Number)
- ชื่อบทบาทใช้ `roles` ประเภทคำขอใช้ `requestTypes` (`contracts/domain/constants.ts`) ไม่พิมพ์ซ้ำในหน้า
- วันที่ใช้ `thaiDateTime()` / `thaiDateOnly()` (`31 ก.ค. 2569 07:00 น.`) เงินใช้ `baht()` (`1,250.00 บาท`) ในตารางใส่ (บาท) ที่หัวคอลัมน์แล้วใช้ `money()`
- ปุ่มยืนยันในหน้าต่างบอกสิ่งที่จะเกิด (อนุมัติ / ยกเลิกคำขอนี้) ไม่ใช้แค่ "บันทึก" และปุ่มปิดหน้าต่างใช้คำว่า "ปิด" เมื่อปุ่มยืนยันมีคำว่ายกเลิก
- ขนาดตัวอักษรคงตามเดิม (ผู้ใช้ตัดสินใจ 7 พ.ย. 2569) ตัวหนังสือสีเทาบนพื้นสว่างใช้อย่างน้อย `text-slate-500`
- commit เล็ก ๆ ทีละเรื่อง ข้อความ commit บอกว่าเปลี่ยนอะไรและทำไม
