-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "stored_files" (
    "key" TEXT NOT NULL,
    "body" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" INTEGER NOT NULL DEFAULT 1,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "invites" (
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "categories" (
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "branches" (
    "name" TEXT NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "locations" (
    "name" TEXT NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "asset_groups" (
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "asset_groups_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL,
    "actor" TEXT NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_rows" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRow" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "source_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitSatang" BIGINT NOT NULL,
    "totalSatang" BIGINT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'normal',
    "lifecycle" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "sourceId" TEXT,
    "sourceRow" TEXT,
    "receivedDate" TEXT NOT NULL DEFAULT '',
    "lifeYears" INTEGER NOT NULL DEFAULT 0,
    "salvageSatang" BIGINT NOT NULL DEFAULT 0,
    "serial" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "custodian" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "valid" INTEGER NOT NULL DEFAULT 1,
    "actor" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL DEFAULT '',
    "response" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "actor" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "chain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TEXT NOT NULL,
    "closedAt" TEXT,

    CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_items" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "quantity" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "actor" TEXT,
    "checkedAt" TEXT,

    CONSTRAINT "stocktake_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "imports_hash" ON "imports"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "source_row_once" ON "source_rows"("sourceId", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "asset_code_unique" ON "assets"("code");

-- CreateIndex
CREATE INDEX "asset_lifecycle_branch" ON "assets"("lifecycle", "branch");

-- CreateIndex
CREATE INDEX "asset_parent" ON "assets"("parentId");

-- CreateIndex
CREATE INDEX "audit_asset" ON "audit"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "request_status" ON "requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_stage_once" ON "approvals"("requestId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_asset_once" ON "stocktake_items"("roundId", "assetId");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_fkey" FOREIGN KEY ("location") REFERENCES "locations"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_branch_fkey" FOREIGN KEY ("branch") REFERENCES "branches"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_fkey" FOREIGN KEY ("category") REFERENCES "categories"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_groupName_fkey" FOREIGN KEY ("groupName") REFERENCES "asset_groups"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "stocktakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial reference values.
INSERT INTO "categories" ("name") VALUES ('ครุภัณฑ์สำนักงาน'), ('ครุภัณฑ์คอมพิวเตอร์'), ('ครุภัณฑ์การศึกษา'), ('ครุภัณฑ์ยานพาหนะ'), ('ครุภัณฑ์ทั่วไป') ON CONFLICT DO NOTHING;
INSERT INTO "branches" ("name") VALUES ('สาขาวิชาวิศวกรรมคอมพิวเตอร์'), ('สาขาวิชาวิศวกรรมอุตสาหการ'), ('สำนักงานคณบดี') ON CONFLICT DO NOTHING;
INSERT INTO "locations" ("name") VALUES ('อาคาร 1 ชั้น 2'), ('อาคารปฏิบัติการรวม'), ('ห้องพักอาจารย์'), ('ไม่ระบุสถานที่') ON CONFLICT DO NOTHING;
INSERT INTO "asset_groups" ("name", "description") VALUES ('ทั่วไป', 'ครุภัณฑ์ทั่วไป') ON CONFLICT DO NOTHING;
