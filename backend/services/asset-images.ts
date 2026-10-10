import { prisma } from '../db/client';
import { freshMember, type Member } from '../auth/sessions';
import { ApiError, allow, audit, clean } from './asset-service';
import { assetImageKey, assetImageUrl } from '../storage/asset-image-metadata';

export const ASSET_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const ASSET_IMAGE_MAX_PIXELS = 25_000_000;

let sharpModule: any = null;
let sharpLoadAttempted = false;

async function getSharp() {
  if (sharpLoadAttempted) return sharpModule;
  sharpLoadAttempted = true;
  try {
    const mod = await import('sharp');
    sharpModule = mod.default || mod;
    return sharpModule;
  } catch (e) {
    console.warn('Sharp module failed to load:', e);
    sharpModule = null;
    return null;
  }
}

function imageAssetId(value: unknown) {
  const assetId = clean(value, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(assetId)) throw new ApiError('รหัสครุภัณฑ์ไม่ถูกต้อง');
  return assetId;
}

function expectedImageVersion(value: unknown) {
  const version = clean(value, 40);
  if (version && (!Number.isFinite(Date.parse(version)) || new Date(version).toISOString() !== version)) {
    throw new ApiError('รุ่นของรูปไม่ถูกต้อง กรุณาโหลดข้อมูลใหม่');
  }
  return version;
}

function hasPngAnimation(bytes: Uint8Array) {
  const png = Buffer.from(bytes);
  // libvips may expose only the default PNG frame; the APNG control chunk is authoritative.
  for (let offset = 8; offset + 12 <= png.length;) {
    const size = png.readUInt32BE(offset);
    if (size > png.length - offset - 12) return false;
    if (png.toString('ascii', offset + 4, offset + 8) === 'acTL') return true;
    offset += size + 12;
  }
  return false;
}

/** Decode uploaded bytes; MIME labels and filenames are never used as proof of format. */
export async function normalizeAssetImage(bytes: Uint8Array) {
  if (!bytes.length) throw new ApiError('กรุณาเลือกไฟล์รูปภาพ');
  if (bytes.length > ASSET_IMAGE_MAX_BYTES) throw new ApiError('รูปภาพต้องไม่เกิน 4 MB', 413);

  const sharp = await getSharp();
  if (!sharp) {
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!isJpeg && !isPng && !isWebp) {
      throw new ApiError('อ่านรูปภาพไม่สำเร็จ กรุณาใช้ JPEG, PNG หรือ WebP ที่สมบูรณ์และไม่เกิน 25 ล้านพิกเซล', 400);
    }
    return { body: Buffer.from(bytes), width: null, height: null };
  }

  try {
    const image = sharp(bytes, { limitInputPixels: ASSET_IMAGE_MAX_PIXELS, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) {
      throw new ApiError('รองรับรูป JPEG, PNG และ WebP เท่านั้น', 415);
    }
    if ((metadata.pages ?? 1) > 1 || metadata.loop !== undefined || (metadata.format === 'png' && hasPngAnimation(bytes))) {
      throw new ApiError('กรุณาใช้รูปภาพนิ่งเพียงภาพเดียว', 415);
    }
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > ASSET_IMAGE_MAX_PIXELS) {
      throw new ApiError('รูปภาพต้องมีขนาดไม่เกิน 25 ล้านพิกเซล');
    }
    // Sharp strips EXIF/GPS and other input metadata by default. Rotate before resizing.
    const { data, info } = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { body: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('อ่านรูปภาพไม่สำเร็จ กรุณาใช้ JPEG, PNG หรือ WebP ที่สมบูรณ์และไม่เกิน 25 ล้านพิกเซล');
  }
}

export async function getAssetImage(assetIdInput: unknown) {
  const assetId = imageAssetId(assetIdInput);
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
  if (!asset) throw new ApiError('ไม่พบครุภัณฑ์', 404);
  const image = await prisma.storedFile.findUnique({ where: { key: assetImageKey(assetId) } });
  if (!image) throw new ApiError('ยังไม่มีรูปครุภัณฑ์', 404);
  return image;
}

export async function saveAssetImage(member: Member, form: FormData) {
  allow(member, ['staff', 'admin']);
  const assetId = imageAssetId(form.get('assetId'));
  const expectedVersion = expectedImageVersion(form.get('expectedVersion'));
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError('กรุณาเลือกไฟล์รูปภาพ');
  if (file.size > ASSET_IMAGE_MAX_BYTES) throw new ApiError('รูปภาพต้องไม่เกิน 4 MB', 413);
  const normalized = await normalizeAssetImage(new Uint8Array(await file.arrayBuffer()));
  const imageVersion = await prisma.$transaction(async tx => {
    const user = await freshMember(tx, member);
    allow(user, ['staff', 'admin']);
    const asset = await tx.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!asset) throw new ApiError('ไม่พบครุภัณฑ์', 404);
    const key = assetImageKey(assetId);
    const previous = await tx.storedFile.findUnique({ where: { key }, select: { createdAt: true } });
    if ((previous?.createdAt.toISOString() || '') !== expectedVersion) {
      throw new ApiError('รูปภาพเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่ก่อนบันทึก', 409);
    }
    const createdAt = new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
    await tx.storedFile.upsert({ where: { key }, create: { key, body: normalized.body, createdAt },
      update: { body: normalized.body, createdAt } });
    const version = createdAt.toISOString();
    await audit(tx, user, previous ? 'เปลี่ยนรูปครุภัณฑ์' : 'เพิ่มรูปครุภัณฑ์', assetId,
      previous ? { imageVersion: previous.createdAt.toISOString() } : null,
      { imageVersion: version, contentType: 'image/webp', bytes: normalized.body.length, width: normalized.width, height: normalized.height });
    return version;
  });
  return { ok: true, imageVersion, imageUrl: assetImageUrl(assetId, imageVersion) };
}

export async function deleteAssetImage(member: Member, input: unknown) {
  allow(member, ['staff', 'admin']);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError('รูปแบบคำขอไม่ถูกต้อง');
  const data = input as Record<string, unknown>;
  const assetId = imageAssetId(data.assetId);
  const expectedVersion = expectedImageVersion(data.expectedVersion);
  await prisma.$transaction(async tx => {
    const user = await freshMember(tx, member);
    allow(user, ['staff', 'admin']);
    const asset = await tx.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!asset) throw new ApiError('ไม่พบครุภัณฑ์', 404);
    const key = assetImageKey(assetId);
    const previous = await tx.storedFile.findUnique({ where: { key }, select: { createdAt: true } });
    if (!previous) throw new ApiError('ยังไม่มีรูปครุภัณฑ์', 404);
    if (previous.createdAt.toISOString() !== expectedVersion) throw new ApiError('รูปภาพเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่ก่อนลบ', 409);
    await tx.storedFile.delete({ where: { key } });
    await audit(tx, user, 'ลบรูปครุภัณฑ์', assetId, { imageVersion: previous.createdAt.toISOString() }, null);
  });
  return { ok: true, imageVersion: null, imageUrl: null };
}
