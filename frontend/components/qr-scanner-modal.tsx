'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  Zap,
  ZapOff,
  Upload,
  X,
  Search,
  ScanLine,
  AlertTriangle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => boolean | void | Promise<boolean | void>;
  title?: string;
  description?: string;
}

export default function QrScannerModal({
  open,
  onClose,
  onScan,
  title = 'สแกน QR Code / Barcode ครุภัณฑ์',
  description = 'หันกล้องไปที่ฉลาก QR Code หรือ Barcode บนตัวครุภัณฑ์'
}: QrScannerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const scannerRef = useRef<any>(null);
  const isLockedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerId = 'qr-reader-viewport';

  // เล่นเสียง Beep สัญญาณการสแกนสำเร็จ
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // ignore audio errors
    }
  }, []);

  // การสั่นสะเทือนแบบ Haptic เมื่อสแกนติด
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([70, 40, 70]);
      }
    } catch {
      // ignore vibrate errors
    }
  }, []);

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    if (isLockedRef.current || !decodedText) return;
    isLockedRef.current = true;
    setIsProcessing(true);

    playBeep();
    triggerHaptic();

    try {
      const result = await onScan(decodedText);
      // หาก handler คืนค่า false แปลว่าไม่พบรายการหรือยังต้องการสแกนต่อ
      if (result === false) {
        setTimeout(() => {
          isLockedRef.current = false;
          setIsProcessing(false);
        }, 1500);
      } else {
        setIsProcessing(false);
      }
    } catch {
      setTimeout(() => {
        isLockedRef.current = false;
        setIsProcessing(false);
      }, 1500);
    }
  }, [onScan, playBeep, triggerHaptic]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch {
        // ignore stop errors
      }
      try {
        scannerRef.current.clear();
      } catch {
        // ignore clear errors
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async (cameraIdOrFacing: string | { facingMode: string }) => {
    setError(null);
    setLoading(true);
    setTorchOn(false);
    setTorchAvailable(false);

    try {
      await stopScanner();

      // ตรวจสอบ secure context
      if (typeof window !== 'undefined' && !window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error('เบราว์เซอร์อนุญาตให้เปิดกล้องเฉพาะเว็บไซต์ที่ใช้ HTTPS เท่านั้น');
      }

      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      // ตรวจสอบว่า container พร้อมใน DOM หรือไม่
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error('ไม่พบพื้นที่แสดงผลกล้อง');
      }

      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ],
        verbose: false
      });

      scannerRef.current = scanner;

      // ค้นหากล้องที่สามารถใช้ได้
      try {
        const devs = await Html5Qrcode.getCameras();
        if (devs && devs.length > 0) {
          setCameras(devs);
        }
      } catch {
        // กล้องอาจยังไม่ได้รับสิทธิ์ getCameras
      }

      const qrConfig = {
        fps: 15,
        qrbox: (w: number, h: number) => {
          // html5-qrcode โยน error ถ้า qrbox เล็กกว่า 50px (เกิดเมื่อพื้นที่กล้องยังไม่ถูกจัดขนาดหรือหน้าต่างแคบมาก)
          const size = Math.max(50, Math.floor(Math.min(w, h) * 0.75));
          return { width: size, height: size };
        },
        aspectRatio: 1.0
      };

      await scanner.start(
        cameraIdOrFacing,
        qrConfig,
        (decodedText: string) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // ignore frame decode errors
        }
      );

      setLoading(false);

      // ตรวจสอบการรองรับไฟฉาย (Torch)
      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        if (capabilities && (capabilities as unknown as { torch?: boolean }).torch) {
          setTorchAvailable(true);
        }
      } catch {
        setTorchAvailable(false);
      }
    } catch (err: unknown) {
      setLoading(false);
      const errMsg = err instanceof Error ? err.message : String(err);

      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission') || errMsg.includes('denied')) {
        setError('เบราว์เซอร์ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณากดอนุญาตสิทธิ์การใช้กล้อง (Camera Permission) ในการตั้งค่าเบราว์เซอร์ หรือใช้วิธีถ่ายรูป/อัปโหลดไฟล์แทน');
      } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
        setError('ไม่พบอุปกรณ์กล้องบนเครื่องนี้ คุณสามารถใช้วิธีถ่ายภาพหรืออัปโหลดรูปภาพแทนได้');
      } else if (errMsg.includes('NotReadableError') || errMsg.includes('TrackStartError')) {
        setError('กล้องกำลังถูกใช้งานโดยแอปพลิเคชันอื่น กรุณาปิดแอปอื่นที่เปิดกล้องค้างไว้แล้วลองใหม่');
      } else {
        setError(errMsg || 'ไม่สามารถเปิดกล้องได้');
      }
    }
  }, [handleScanSuccess, stopScanner]);

  // สลับกล้อง (หน้า/หลัง)
  const handleSwitchCamera = useCallback(async () => {
    if (cameras.length > 1) {
      const nextIndex = (selectedCameraIndex + 1) % cameras.length;
      setSelectedCameraIndex(nextIndex);
      await startScanner(cameras[nextIndex].id);
    } else {
      // Toggle facing mode
      await startScanner({ facingMode: 'environment' });
    }
  }, [cameras, selectedCameraIndex, startScanner]);

  // เปิด/ปิดไฟฉาย
  const handleToggleTorch = useCallback(async () => {
    if (!scannerRef.current || !torchAvailable) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch {
      toast.error('ไม่สามารถเปิดใช้งานไฟฉายบนอุปกรณ์นี้ได้');
    }
  }, [torchAvailable, torchOn]);

  // สแกนจากไฟล์รูปภาพหรือภาพที่ถ่ายจากกล้องมือถือ (File Fallback)
  const handleFileScan = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setIsProcessing(true);

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const tempScanner = scannerRef.current || new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13
        ],
        verbose: false
      });

      const decodedText = await tempScanner.scanFile(file, false);
      if (decodedText) {
        await handleScanSuccess(decodedText);
      }
    } catch {
      toast.error('ไม่พบ QR Code หรือ Barcode ในรูปภาพนี้ กรุณาถ่ายภาพให้ชัดเจนหรือลองใหม่');
    } finally {
      setLoading(false);
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [handleScanSuccess]);

  // เมื่อเปิด Modal ให้เริ่มเปิดกล้อง
  useEffect(() => {
    if (!open) {
      stopScanner();
      isLockedRef.current = false;
      setIsProcessing(false);
      setError(null);
      return;
    }

    isLockedRef.current = false;
    const timer = setTimeout(() => {
      startScanner({ facingMode: 'environment' });
    }, 150);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [open, startScanner, stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleScanSuccess(manualCode.trim());
    setManualCode('');
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      {/* ปุ่มปิดของ header ด้านล่างใช้แทนปุ่มปิดมาตรฐาน จึงปิดตัวมาตรฐานเพื่อไม่ให้มี X ซ้อนสองปุ่ม */}
      <DialogContent showCloseButton={false} className="sm:max-w-md w-[95vw] p-0 overflow-hidden bg-slate-950 text-white border-slate-800 rounded-2xl shadow-2xl">
        <style>{`
          #${containerId} {
            width: 100% !important;
            border: none !important;
            background: transparent !important;
          }
          #${containerId} video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            border-radius: 0.85rem;
          }
          #${containerId} img[alt="Info icon"] {
            display: none !important;
          }
          #${containerId}__scan_region {
            border: none !important;
          }
          @keyframes scan-laser {
            0% { top: 8%; opacity: 0.6; }
            50% { top: 88%; opacity: 1; }
            100% { top: 8%; opacity: 0.6; }
          }
          .scan-laser-line {
            animation: scan-laser 2.2s ease-in-out infinite;
          }
        `}</style>

        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <ScanLine size={18} />
            </div>
            <div>
              {/* ใช้ inline style เพราะ globals.css ตั้ง h2 { color } แบบไม่อยู่ใน @layer จึงทับ text-white ปกติ */}
              <DialogTitle className="text-sm font-bold tracking-wide" style={{ color: '#fff' }}>
                {title}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-400">
                {description}
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X size={16} />
          </button>
        </div>

        {/* Camera Viewport Area */}
        <div className="p-4 flex flex-col items-center">
          <div className="relative w-full aspect-square max-w-[340px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
            {/* Viewport for html5-qrcode */}
            <div id={containerId} className="w-full h-full" />

            {/* Loading Indicator */}
            {loading && !error && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 z-10">
                <div className="w-12 h-12 rounded-full border-3 border-blue-500/20 border-t-blue-500 animate-spin mb-3" />
                <span className="text-xs font-semibold text-slate-300">กำลังเชื่อมต่อกล้อง…</span>
                <span className="text-[11px] text-slate-500 mt-1">กรุณากด "อนุญาต" หากมีป็อปอัปขอสิทธิ์</span>
              </div>
            )}

            {/* Error Message & Permission Fallback */}
            {error && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center text-center p-5 z-20">
                <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-3">
                  <CameraOff size={24} />
                </div>
                <h4 className="text-xs font-bold text-white mb-1.5">ไม่สามารถเปิดกล้องได้</h4>
                <p className="text-[11.5px] text-slate-400 leading-relaxed max-w-xs mb-4">
                  {error}
                </p>
                <div className="flex flex-col gap-2 w-full max-w-[240px]">
                  <Button
                    size="sm"
                    onClick={() => startScanner({ facingMode: 'environment' })}
                    className="w-full h-8 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  >
                    <RefreshCw size={13} className="mr-1.5" /> ลองใหม่อีกครั้ง
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-8 text-xs font-medium border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                  >
                    <Upload size={13} className="mr-1.5" /> ถ่ายรูป / อัปโหลดภาพ
                  </Button>
                </div>
              </div>
            )}

            {/* High-tech Viewfinder Overlay (When active) */}
            {!loading && !error && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                {/* Target Frame with Glowing Cyan Corners */}
                <div className="relative w-[75%] h-[75%]">
                  {/* Top-Left */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-sky-400 rounded-tl-md shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                  {/* Top-Right */}
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-sky-400 rounded-tr-md shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                  {/* Bottom-Left */}
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-sky-400 rounded-bl-md shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                  {/* Bottom-Right */}
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-sky-400 rounded-br-md shadow-[0_0_8px_rgba(56,189,248,0.6)]" />

                  {/* Animated Laser Scanning Line */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 shadow-[0_0_12px_#38bdf8] scan-laser-line pointer-events-none" />
                </div>

                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-[2px] flex items-center justify-center">
                    <span className="text-xs font-bold text-white bg-slate-900/90 px-3 py-1.5 rounded-full border border-blue-500/40 shadow-lg">
                      กำลังอ่านรหัส…
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Camera Quick Controls */}
          <div className="flex items-center justify-center gap-2 mt-3.5 w-full">
            {/* Flashlight Button */}
            {torchAvailable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleTorch}
                className={`h-8 px-3 text-xs border-slate-800 bg-slate-900/80 hover:bg-slate-800 cursor-pointer ${
                  torchOn ? 'text-amber-400 border-amber-500/40' : 'text-slate-300'
                }`}
                title={torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}
              >
                {torchOn ? <Zap size={14} className="mr-1.5 fill-amber-400" /> : <ZapOff size={14} className="mr-1.5" />}
                {torchOn ? 'ปิดไฟ' : 'เปิดไฟ'}
              </Button>
            )}

            {/* Switch Camera Button */}
            {cameras.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSwitchCamera}
                className="h-8 px-3 text-xs border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 cursor-pointer"
                title="สลับกล้องหน้า/หลัง"
              >
                <RefreshCw size={14} className="mr-1.5" /> สลับกล้อง
              </Button>
            )}

            {/* Capture / Upload Photo fallback */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-3 text-xs border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 cursor-pointer"
              title="ถ่ายภาพหรือเลือกไฟล์รูปภาพเพื่อสแกน"
            >
              <Upload size={14} className="mr-1.5" /> อัปโหลดรูป
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileScan}
              className="hidden"
            />
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="w-full mt-4 pt-3 border-t border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
              หรือกรอกรหัสครุภัณฑ์ด้วยตนเอง:
            </span>
            <div className="flex gap-2">
              <Input
                placeholder="เช่น 254-034-01-01.93-1-4"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                className="h-8 text-xs bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 focus:border-blue-500"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!manualCode.trim()}
                className="h-8 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shrink-0 cursor-pointer"
              >
                <Search size={13} className="mr-1" /> ค้นหา
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
