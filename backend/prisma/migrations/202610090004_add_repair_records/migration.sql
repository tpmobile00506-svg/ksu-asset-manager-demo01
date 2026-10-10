-- CreateTable
CREATE TABLE "repair_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "requestId" TEXT,
    "repairedBy" TEXT NOT NULL DEFAULT '',
    "costSatang" BIGINT NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL DEFAULT '',
    "actor" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "repair_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_asset_id" ON "repair_records"("assetId");

-- AddForeignKey
ALTER TABLE "repair_records" ADD CONSTRAINT "repair_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
