'use client';

import { useEffect, useState } from 'react';
import { stickerMarkup, stickerSizes, type StickerSize } from '@/shared/qr-sticker-document';
import { stickerQr, type StickerAsset } from './qr-sticker';

// ภาพตัวอย่างสติกเกอร์ตามสัดส่วนจริง ใช้ HTML ชุดเดียวกับหน้าพิมพ์ (stickerMarkup) แล้วขยายให้พอดีกรอบ
const PX_PER_MM = 96 / 25.4;
// สี่เหลี่ยมเทาอ่อนแทน QR ระหว่างรอสร้าง (ไม่ให้เห็น QR ของรายการก่อนหน้า)
const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="#e2e8f0"/></svg>',
  );

export default function StickerPreview({
  asset,
  size,
  maxWidth = 280,
  maxHeight = 180,
}: {
  asset: StickerAsset;
  size: StickerSize;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const [qr, setQr] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    stickerQr(asset.id)
      .then(url => {
        if (active) setQr({ id: asset.id, url });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [asset.id]);

  const s = stickerSizes[size];
  const zoom = Math.min(maxWidth / (s.w * PX_PER_MM), maxHeight / (s.h * PX_PER_MM));
  const url = qr?.id === asset.id ? qr.url : PLACEHOLDER;
  return (
    <div
      className="sticker-preview"
      role="img"
      aria-label={`ตัวอย่างสติกเกอร์ ${s.w} × ${s.h} มม. ของ ${asset.code}`}
      style={{ width: Math.round(s.w * PX_PER_MM * zoom), height: Math.round(s.h * PX_PER_MM * zoom) }}
    >
      {/* ทุกค่าจากทะเบียนผ่าน escape ใน stickerMarkup แล้ว */}
      <div
        aria-hidden="true"
        style={{ zoom }}
        dangerouslySetInnerHTML={{
          __html: stickerMarkup({ code: asset.code, name: asset.name, location: asset.location, qr: url }, size),
        }}
      />
    </div>
  );
}
