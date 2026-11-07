import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma, disconnectDatabase } from '../db/client';

// ⚠️ สำรองข้อมูลเป็นไฟล์ JSON แล้ว "ลบครุภัณฑ์และประวัติทั้งหมด" ในฐานข้อมูลที่ DATABASE_URL ชี้อยู่
// ฐานข้อมูลนี้ใช้ร่วมกับเว็บจริง (Vercel) จึงต้องพิมพ์ยืนยันเองทุกครั้ง และควรสร้าง backup branch ใน Neon ก่อน:
//   npx tsx backend/scripts/backup-and-wipe.ts --yes-wipe-everything
// เก็บไว้: บัญชีผู้ใช้ สาขา หมวด และการตั้งค่า · ไฟล์สำรองตั้งชื่อตามเวลา จึงไม่ทับไฟล์สำรองเก่า
if (!process.argv.includes('--yes-wipe-everything')) {
  console.error('สคริปต์นี้ลบข้อมูลทั้งหมด ถ้าแน่ใจให้รันพร้อม --yes-wipe-everything');
  process.exit(1);
}

async function main() {
  console.log('--- Step 1: Backing up current database tables ---');

  const data = {
    assets: await prisma.asset.findMany(),
    assetSets: await prisma.assetSet.findMany(),
    repairRecords: await prisma.repairRecord.findMany(),
    requests: await prisma.assetRequest.findMany(),
    approvals: await prisma.approval.findMany(),
    stocktakes: await prisma.stocktake.findMany(),
    stocktakeItems: await prisma.stocktakeItem.findMany(),
    audits: await prisma.audit.findMany(),
    operations: await prisma.operation.findMany(),
    imports: await prisma.importFile.findMany(),
    sourceRows: await prisma.sourceRow.findMany(),
    locations: await prisma.location.findMany(),
    // รูปครุภัณฑ์และไฟล์นำเข้าเก็บเป็น bytes จึงแปลงเป็น base64 เพื่อให้กู้คืนจากไฟล์ JSON ได้
    storedFiles: (await prisma.storedFile.findMany()).map(f => ({
      key: f.key,
      createdAt: f.createdAt,
      bodyBase64: Buffer.from(f.body).toString('base64'),
    })),
  };
  const counts = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));

  const dataDir = path.resolve(process.cwd(), 'backend/data');
  fs.mkdirSync(dataDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dataDir, `backup_before_wipe_${stamp}.json`);
  const json = JSON.stringify({ backupDate: new Date().toISOString(), counts, data }, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  fs.writeFileSync(backupPath, json, { encoding: 'utf-8', flag: 'wx' });

  // อ่านไฟล์สำรองกลับมาตรวจก่อน ถ้าจำนวนไม่ตรงให้หยุดทันที ยังไม่ลบอะไร
  const saved = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  for (const [name, rows] of Object.entries(data)) {
    if (saved.data[name]?.length !== rows.length) throw new Error(`ไฟล์สำรองไม่ครบ: ${name}`);
  }
  console.log(`✓ Backup verified at ${backupPath} (${Math.round(json.length / 1024)} KB)`);
  console.log('Backup summary:', JSON.stringify(counts, null, 2));

  console.log('\n--- Step 2: Executing Clean Wipe of Assets & History ---');

  const result = await prisma.$transaction(async tx => {
    const stocktakeItems = await tx.stocktakeItem.deleteMany();
    const stocktakes = await tx.stocktake.deleteMany();
    const approvals = await tx.approval.deleteMany();
    const requests = await tx.assetRequest.deleteMany();
    const repairRecords = await tx.repairRecord.deleteMany();
    const assets = await tx.asset.deleteMany();
    const assetSets = await tx.assetSet.deleteMany();
    const locations = await tx.location.deleteMany();
    const audit = await tx.audit.deleteMany();
    const operations = await tx.operation.deleteMany();
    const sourceRows = await tx.sourceRow.deleteMany();
    const imports = await tx.importFile.deleteMany();
    const storedFiles = await tx.storedFile.deleteMany();

    return {
      stocktakeItems: stocktakeItems.count,
      stocktakes: stocktakes.count,
      approvals: approvals.count,
      requests: requests.count,
      repairRecords: repairRecords.count,
      assets: assets.count,
      assetSets: assetSets.count,
      locations: locations.count,
      audit: audit.count,
      operations: operations.count,
      sourceRows: sourceRows.count,
      imports: imports.count,
      storedFiles: storedFiles.count,
    };
  });

  console.log('✓ Successfully wiped items:', JSON.stringify(result, null, 2));

  console.log('\n--- Step 3: Checking Database State ---');
  const remaining = {
    users: await prisma.user.count(),
    settings: await prisma.setting.count(),
    categories: await prisma.category.count(),
    branches: await prisma.branch.count(),
    assetGroups: await prisma.assetGroup.count(),
    locations: await prisma.location.count(),
    assets: await prisma.asset.count(),
    assetSets: await prisma.assetSet.count(),
    repairRecords: await prisma.repairRecord.count(),
    requests: await prisma.assetRequest.count(),
    approvals: await prisma.approval.count(),
    stocktakes: await prisma.stocktake.count(),
    audit: await prisma.audit.count(),
    operations: await prisma.operation.count(),
    imports: await prisma.importFile.count(),
    storedFiles: await prisma.storedFile.count(),
  };

  console.log('Remaining counts in database:', JSON.stringify(remaining, null, 2));
}

main()
  .catch(err => {
    console.error('Error during backup and wipe:', err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });
