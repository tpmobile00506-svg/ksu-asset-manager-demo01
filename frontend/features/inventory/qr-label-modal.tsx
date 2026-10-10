'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Asset } from '@/shared/domain';

export default function QrLabelModal({
  open,
  onClose,
  assets
}: {
  open: boolean;
  onClose: () => void;
  assets: Asset[];
}) {
  const [qrResult, setQrResult] = useState<{
    assets: Asset[];
    images: { a: Asset; url: string }[];
    pending: boolean;
  } | null>(null);

  // A new selection must never render or print labels from an earlier request,
  // including the render before its effect runs.
  const currentResult = open && qrResult?.assets === assets ? qrResult : null;
  const qrImages = currentResult?.images ?? [];
  const qrBusy = open && assets.length > 0 && (!currentResult || currentResult.pending);

  useEffect(() => {
    if (!open || !assets.length) {
      setQrResult(null);
      return;
    }
    let cancelled = false;
    setQrResult({ assets, images: [], pending: true });

    import('qrcode')
      .then(async QR => {
        const result = await Promise.all(
          assets.slice(0, 100).map(async a => ({
            a,
            url: await QR.toDataURL(
              location.origin + '/?asset=' + encodeURIComponent(a.id),
              {
                width: 220,
                margin: 2,
                errorCorrectionLevel: 'M'
              }
            )
          }))
        );
        if (!cancelled) setQrResult({ assets, images: result, pending: false });
      })
      .catch(() => {
        if (!cancelled) {
          setQrResult({ assets, images: [], pending: false });
          toast.error('สร้าง QR ไม่สำเร็จ');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, assets]);

  const qrContent = (
    <div className="qr-grid">
      {qrImages.map(x => (
        <div className="qr-label" key={x.a.id}>
          <div className="qr-inst-title flex items-center justify-center gap-1.5">
            <span
              aria-hidden="true"
              style={{
                width: 15,
                height: 15,
                display: 'inline-block',
                backgroundImage: "url('/logo-faculty.png')",
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundColor: '#ffffff',
                borderRadius: '2px',
                flexShrink: 0
              }}
            />
            <span>มหาวิทยาลัยกาฬสินธุ์ · ควอ.</span>
          </div>
          <img src={x.url} alt={'QR ' + x.a.code} />
          <b>{x.a.code}</b>
          <p>{x.a.name}</p>
          <p>{x.a.quantity > 1 ? `${x.a.quantity} ชิ้น` : '1 ชิ้น'}{x.a.location ? ` · ${x.a.location}` : ''}</p>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="dialog-wide print:hidden no-print">
          <DialogHeader className="dialog-header-sticky">
            <DialogTitle>ป้าย QR ประจำครุภัณฑ์ {assets.length > 0 ? `(${assets.length} รายการที่เลือก)` : ''}</DialogTitle>
            <DialogDescription>
              {assets.length > 0
                ? `พิมพ์สติกเกอร์ QR Code สำหรับ ${assets.length} รายการที่เลือก พร้อมรหัสทางการและสถานที่ตั้ง`
                : 'พิมพ์ครั้งละไม่เกิน 100 ป้าย · QR ใช้รหัสประจำรายการที่ไม่เปลี่ยนตามสถานที่'}
            </DialogDescription>
          </DialogHeader>

          <div className="dialog-scroll-body">
            {qrBusy ? (
              <Skeleton className="h-40" />
            ) : (
              qrContent
            )}

            <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">
                {qrImages.length > 0 ? `พร้อมพิมพ์ ${qrImages.length} ป้าย` : ''}
              </span>
              <Button
                disabled={qrBusy || !qrImages.length}
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
              >
                <Printer size={16} />
                พิมพ์ป้าย QR {qrImages.length > 0 ? `(${qrImages.length} ป้าย)` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {open &&
        qrImages.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="print-only">
            <h2>มหาวิทยาลัยกาฬสินธุ์ · ทะเบียนครุภัณฑ์ คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม</h2>
            {qrContent}
          </div>,
          document.body
        )}
    </>
  );
}
