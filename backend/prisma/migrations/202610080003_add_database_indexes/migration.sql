-- CreateIndex
CREATE INDEX "audit_created_at" ON "audit"("createdAt");

-- CreateIndex
CREATE INDEX "request_asset_id" ON "requests"("assetId");

-- CreateIndex
CREATE INDEX "stocktake_item_asset_id" ON "stocktake_items"("assetId");
