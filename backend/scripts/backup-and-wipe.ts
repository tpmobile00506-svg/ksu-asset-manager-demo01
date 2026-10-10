import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma, disconnectDatabase } from '../db/client';

async function main() {
  console.log('--- Step 1: Backing up current database tables ---');

  const assets = await prisma.asset.findMany();
  const requests = await prisma.assetRequest.findMany();
  const approvals = await prisma.approval.findMany();
  const stocktakes = await prisma.stocktake.findMany();
  const stocktakeItems = await prisma.stocktakeItem.findMany();
  const audits = await prisma.audit.findMany();
  const operations = await prisma.operation.findMany();
  const imports = await prisma.importFile.findMany();
  const sourceRows = await prisma.sourceRow.findMany();

  const backupData = {
    backupDate: new Date().toISOString(),
    counts: {
      assets: assets.length,
      requests: requests.length,
      approvals: approvals.length,
      stocktakes: stocktakes.length,
      stocktakeItems: stocktakeItems.length,
      audits: audits.length,
      operations: operations.length,
      imports: imports.length,
      sourceRows: sourceRows.length,
    },
    data: {
      assets,
      requests,
      approvals,
      stocktakes,
      stocktakeItems,
      audits,
      operations,
      imports,
      sourceRows,
    },
  };

  const dataDir = path.resolve(process.cwd(), 'backend/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const backupPath = path.join(dataDir, 'backup_assets_and_history.json');
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      backupData,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2
    ),
    'utf-8'
  );
  console.log(`✓ Backup successfully saved to ${backupPath}`);
  console.log('Backup summary:', JSON.stringify(backupData.counts, null, 2));

  console.log('\n--- Step 2: Executing Clean Wipe of Assets & History ---');

  const result = await prisma.$transaction(async (tx) => {
    const deletedStocktakeItems = await tx.stocktakeItem.deleteMany();
    const deletedStocktakes = await tx.stocktake.deleteMany();
    const deletedApprovals = await tx.approval.deleteMany();
    const deletedRequests = await tx.assetRequest.deleteMany();
    const deletedAssets = await tx.asset.deleteMany();
    const deletedAudit = await tx.audit.deleteMany();
    const deletedOperations = await tx.operation.deleteMany();
    const deletedSourceRows = await tx.sourceRow.deleteMany();
    const deletedImports = await tx.importFile.deleteMany();
    const deletedStoredFiles = await tx.storedFile.deleteMany();

    return {
      stocktakeItems: deletedStocktakeItems.count,
      stocktakes: deletedStocktakes.count,
      approvals: deletedApprovals.count,
      requests: deletedRequests.count,
      assets: deletedAssets.count,
      audit: deletedAudit.count,
      operations: deletedOperations.count,
      sourceRows: deletedSourceRows.count,
      imports: deletedImports.count,
      storedFiles: deletedStoredFiles.count,
    };
  });

  console.log('✓ Successfully wiped items:', JSON.stringify(result, null, 2));

  console.log('\n--- Step 3: Checking Database State ---');
  const remaining = {
    users: await prisma.user.count(),
    settings: await prisma.setting.count(),
    categories: await prisma.category.count(),
    branches: await prisma.branch.count(),
    locations: await prisma.location.count(),
    assetGroups: await prisma.assetGroup.count(),
    assets: await prisma.asset.count(),
    requests: await prisma.assetRequest.count(),
    approvals: await prisma.approval.count(),
    audit: await prisma.audit.count(),
    operations: await prisma.operation.count(),
    storedFiles: await prisma.storedFile.count(),
  };

  console.log('Remaining counts in database:', JSON.stringify(remaining, null, 2));

  const usersList = await prisma.user.findMany({
    select: { email: true, name: true, role: true, active: true },
  });
  console.log('Active user accounts preserved:', JSON.stringify(usersList, null, 2));
}

main()
  .catch((err) => {
    console.error('Error during backup and wipe:', err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });
