-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "setId" TEXT,
ADD COLUMN     "setRole" TEXT;

-- CreateTable
CREATE TABLE "asset_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "asset_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_set_id" ON "assets"("setId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_setId_fkey" FOREIGN KEY ("setId") REFERENCES "asset_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
