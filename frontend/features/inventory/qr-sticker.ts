'use client';

import { toast } from 'sonner';
import {
  buildStickerHtml,
  DEFAULT_STICKER_SIZE,
  isStickerSize,
  stickerCopies,
  type StickerItem,
  type StickerSize,
} from '@/shared/qr-sticker-document';

// งานฝั่งเบราว์เซอร์ของสติกเกอร์ QR: สร้างภาพ QR · จำขนาดม้วนที่เลือก · เปิดหน้าพิมพ์
// หน้าตาของดวงอยู่ที่ backend/contracts/qr-sticker-document.ts (ใช้ร่วมกับหน้าจอตัวอย่าง)

export type StickerAsset = { id: string; code: string; name: string; location?: string | null };

// ลิงก์ใน QR: เปิดหน้าข้อมูลครุภัณฑ์รายการนั้น (รหัสประจำรายการ ไม่เปลี่ยนตามสถานที่)
export const stickerLink = (id: string) => `${location.origin}/?asset=${encodeURIComponent(id)}`;

// QR เป็นภาพเวกเตอร์ (SVG): เครื่องพิมพ์ความร้อน 203 dpi พิมพ์แล้วขอบคม ไม่เบลอเหมือนภาพ PNG ที่ถูกขยาย
export async function stickerQr(id: string): Promise<string> {
  const QR = (await import('qrcode')).default;
  const svg = await QR.toString(stickerLink(id), {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ขนาดม้วนที่เลือกล่าสุด จำไว้ในเบราว์เซอร์เครื่องนี้ (อ่าน/เขียนไม่ได้ก็ใช้ 50 × 30 มม.)
const SIZE_KEY = 'ksu.stickerSize';
export function savedStickerSize(): StickerSize {
  try {
    const value = localStorage.getItem(SIZE_KEY);
    if (isStickerSize(value)) return value;
  } catch {}
  return DEFAULT_STICKER_SIZE;
}
export function saveStickerSize(size: StickerSize) {
  try {
    localStorage.setItem(SIZE_KEY, size);
  } catch {}
}

// เปิดหน้าพิมพ์สติกเกอร์ในแท็บใหม่ (ดวงละหน้า ขนาดหน้าเท่าดวง)
// ต้องเปิดหน้าต่างทันทีตอนกดปุ่ม ถ้ารอสร้าง QR เสร็จก่อน เบราว์เซอร์จะบล็อกว่าเป็นป๊อปอัป
export async function printStickers(list: { asset: StickerAsset; copies: number }[], size: StickerSize) {
  if (!list.length) return false;
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('เปิดหน้าพิมพ์ไม่ได้ กรุณาอนุญาตป๊อปอัปของเว็บนี้');
    return false;
  }
  win.document.write('<p style="font-family:Tahoma,sans-serif;padding:16px">กำลังเตรียมสติกเกอร์…</p>');
  try {
    // QR ต่อรายการสร้างครั้งเดียว ถึงจะพิมพ์รายการนั้นหลายดวง
    const qrs = new Map<string, Promise<string>>();
    const items: StickerItem[] = await Promise.all(
      list.map(async ({ asset, copies }) => {
        if (!qrs.has(asset.id)) qrs.set(asset.id, stickerQr(asset.id));
        return {
          code: asset.code,
          name: asset.name,
          location: asset.location,
          qr: await qrs.get(asset.id)!,
          copies: stickerCopies(copies),
        };
      }),
    );
    if (win.closed) return false;
    win.document.open();
    win.document.write(buildStickerHtml(items, size));
    win.document.close();
    return true;
  } catch {
    win.close();
    toast.error('สร้าง QR ไม่สำเร็จ');
    return false;
  }
}
