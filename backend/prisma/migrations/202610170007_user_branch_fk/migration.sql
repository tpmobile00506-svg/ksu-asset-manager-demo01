-- สาขาของผู้ใช้ต้องอยู่ในตาราง branches (17 ต.ค. 2569)
-- ตรวจแล้วก่อนสร้าง: ผู้ใช้ทุกคนมีสาขาว่าง หรือเป็นชื่อที่อยู่ใน branches อยู่แล้ว จึงไม่ต้องแก้ข้อมูล

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_fkey" FOREIGN KEY ("branch") REFERENCES "branches"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
