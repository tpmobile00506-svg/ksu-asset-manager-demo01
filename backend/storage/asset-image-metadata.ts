import { prisma } from '../db/client';

export const assetImageKey = (assetId: string) => `asset-images/${assetId}.webp`;
export const assetImageUrl = (assetId: string, version: string) =>
  `/api/asset-image?asset=${encodeURIComponent(assetId)}&v=${encodeURIComponent(version)}`;

// Never load image bytes into registry JSON or Excel exports.
export async function withAssetImages<T extends { id: string }>(assets: T[]) {
  if (!assets.length) return [];
  const files = await prisma.storedFile.findMany({
    where: { key: { in: assets.map(asset => assetImageKey(asset.id)) } },
    select: { key: true, createdAt: true },
  });
  const versions = new Map(files.map(file => [file.key, file.createdAt.toISOString()]));
  return assets.map(asset => {
    const imageVersion = versions.get(assetImageKey(asset.id)) ?? null;
    return { ...asset, imageVersion, imageUrl: imageVersion ? assetImageUrl(asset.id, imageVersion) : null };
  });
}
