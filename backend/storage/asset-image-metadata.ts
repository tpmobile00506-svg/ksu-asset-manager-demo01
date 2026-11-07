import { prisma } from '../db/client';

export const assetImageKey = (assetId: string) => `asset-images/${assetId}.webp`;
export const assetImageUrl = (assetId: string, version: string) =>
  `/api/asset-image?asset=${encodeURIComponent(assetId)}&v=${encodeURIComponent(version)}`;

const ASSET_IMAGE_PREFIX = 'asset-images/';

// รุ่นของรูปทุกรูปในคราวเดียว (หน้าทะเบียนทั้งหมด): ค้นคีย์ที่ขึ้นต้น asset-images/ ได้เฉพาะรายการที่มีรูปจริง
// เดิมส่งรหัสครุภัณฑ์ทุกตัวเป็นรายการ IN (20,000 รายการใช้ 94 ms) วิธีนี้ใช้ ~1 ms และไม่ต้องรอผลครุภัณฑ์ก่อน
export async function assetImageVersions(): Promise<Map<string, string>> {
  const files = await prisma.storedFile.findMany({
    where: { key: { startsWith: ASSET_IMAGE_PREFIX } },
    select: { key: true, createdAt: true },
  });
  return new Map(files.map(file => [file.key, file.createdAt.toISOString()]));
}
export function attachAssetImages<T extends { id: string }>(assets: T[], versions: Map<string, string>) {
  return assets.map(asset => {
    const imageVersion = versions.get(assetImageKey(asset.id)) ?? null;
    return { ...asset, imageVersion, imageUrl: imageVersion ? assetImageUrl(asset.id, imageVersion) : null };
  });
}

// Never load image bytes into registry JSON or Excel exports.
// ใช้กับรายการไม่กี่ตัว (เช่น รายการที่แยกออกมาของครุภัณฑ์หนึ่งชิ้น)
export async function withAssetImages<T extends { id: string }>(assets: T[]) {
  if (!assets.length) return [];
  const files = await prisma.storedFile.findMany({
    where: { key: { in: assets.map(asset => assetImageKey(asset.id)) } },
    select: { key: true, createdAt: true },
  });
  return attachAssetImages(assets, new Map(files.map(file => [file.key, file.createdAt.toISOString()])));
}
