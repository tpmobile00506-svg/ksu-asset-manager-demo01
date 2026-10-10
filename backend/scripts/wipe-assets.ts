import 'dotenv/config';
import { prisma, disconnectDatabase } from '../db/client';

async function main() {
  console.log('--- Starting Asset & History Wipe ---');

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

  console.log('Successfully wiped:', JSON.stringify(result, null, 2));

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

  console.log('Remaining counts:', JSON.stringify(remaining, null, 2));

  const usersList = await prisma.user.findMany({
    select: { email: true, name: true, role: true, active: true },
  });
  console.log('Active users check:', JSON.stringify(usersList, null, 2));
}

main()
  .catch((err) => {
    console.error('Error during wipe:', err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });
