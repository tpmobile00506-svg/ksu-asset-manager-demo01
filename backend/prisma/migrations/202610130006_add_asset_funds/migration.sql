-- ทุน / โครงการที่มาของครุภัณฑ์ แยกจากชุดห้ามแยก (ครุภัณฑ์ชิ้นเดียวอาจเป็นทั้งชิ้นส่วนชุดและมาจากทุน)
ALTER TABLE "assets" ADD COLUMN "fundId" TEXT;
ALTER TABLE "assets" ADD COLUMN "fundHintId" TEXT;
CREATE INDEX "asset_fund_id" ON "assets"("fundId");
CREATE INDEX "asset_fund_hint_id" ON "assets"("fundHintId");
ALTER TABLE "assets" ADD CONSTRAINT "assets_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "asset_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
