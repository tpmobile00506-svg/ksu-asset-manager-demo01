'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Pencil,
  ArrowLeftRight,
  Printer,
  Camera,
  Barcode,
  Scissors,
  Wrench,
  History,
  QrCode,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge, Activity, api } from '@/frontend/components/common';
import { Asset, money, conditions, groupFor, setRoles, type SetRole } from '@/shared/domain';
import type { RepairRecord } from '@/shared/models';
import AssetPhoto from './asset-photo';
import QRCode from 'qrcode';
import { toast } from 'sonner';

interface AssetDetailViewProps {
  asset: Asset;
  onBack: () => void;
  editable: boolean;
  onEdit: () => void;
  onRequest: () => void;
  onSplit?: () => void;
  onRepairComplete?: () => void;
  onSelectAsset?: (a: Asset) => void;
  onPhotoChanged: () => Promise<void>;
  rounds?: any[];
  onCheckRound?: (roundId: string) => void;
}

export default function AssetDetailView({
  asset,
  onBack,
  editable,
  onEdit,
  onRequest,
  onSplit,
  onRepairComplete,
  onSelectAsset,
  onPhotoChanged,
  rounds = [],
  onCheckRound
}: AssetDetailViewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [history, setHistory] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // สร้าง QR Code Data URL
  useEffect(() => {
    let active = true;
    const qrContent = typeof window !== 'undefined'
      ? `${window.location.origin}/?asset=${encodeURIComponent(asset.id)}`
      : asset.code;

    QRCode.toDataURL(qrContent, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        // Fallback or ignore
      });

    return () => {
      active = false;
    };
  }, [asset.id, asset.code]);

  // ดึงประวัติไทม์ไลน์และรายการที่แยกย่อย (History & Children)
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    api('?view=history&asset=' + encodeURIComponent(asset.id))
      .then(res => {
        if (!cancelled) {
          setHistory(res);
          setLoadingHistory(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setHistory({ error: e.message || 'โหลดประวัติไม่สำเร็จ', events: [], children: [] });
          setLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.version]);

  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาตป๊อปอัป');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>พิมพ์ฉลากครุภัณฑ์ - ${asset.code}</title>
          <style>
            @page { size: auto; margin: 10mm; }
            body { font-family: 'Leelawadee UI', Tahoma, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #fff; }
            .sticker {
              width: 90mm;
              border: 2px solid #0f172a;
              border-radius: 6px;
              overflow: hidden;
              box-sizing: border-box;
            }
            .header {
              background: #101f3c;
              color: #fff;
              font-size: 10px;
              font-weight: bold;
              text-align: center;
              padding: 5px 8px;
              line-height: 1.25;
            }
            .body {
              display: flex;
              align-items: center;
              padding: 8px 10px;
              gap: 12px;
            }
            .qr-box {
              width: 65px;
              height: 65px;
              flex-shrink: 0;
            }
            .qr-box img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .details {
              flex: 1;
              min-width: 0;
            }
            .code {
              font-family: monospace;
              font-weight: bold;
              font-size: 11px;
              color: #1d4ed8;
              margin-bottom: 2px;
            }
            .name {
              font-weight: bold;
              font-size: 10px;
              margin-bottom: 3px;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .dept {
              color: #475569;
              font-size: 8.5px;
            }
          </style>
        </head>
        <body>
          <div class="sticker">
            <div class="header">
              <img src="/logo-faculty.png" style="width:14px;height:14px;object-fit:contain;background:#fff;border-radius:2px;padding:1px;vertical-align:middle;margin-right:5px;display:inline-block;" />
              คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์
            </div>
            <div class="body">
              <div class="qr-box">
                <img src="${qrDataUrl}" alt="QR Code" />
              </div>
              <div class="details">
                <div style="font-size:8px; color:#64748b;">รหัสครุภัณฑ์</div>
                <div class="code">${asset.code}</div>
                <div style="font-size:8px; color:#64748b; margin-top:2px;">ชื่อรายการ</div>
                <div class="name">${asset.name}</div>
                <div class="dept">${asset.branch || 'คณะวิศวกรรมศาสตร์ฯ'}</div>
                <div style="font-size:8px; color:#64748b; margin-top:3px;">วันที่ได้มา: ${asset.receivedDate || '—'}</div>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 750);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const openRounds = rounds.filter(r => r.status === 'open');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Back button and page heading */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563eb] hover:text-[#1d4ed8] hover:underline cursor-pointer mb-2"
        >
          <ArrowLeft size={14} /> กลับสู่ทะเบียนครุภัณฑ์
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
              รายละเอียดครุภัณฑ์: {asset.code}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {asset.name} · บันทึกล่าสุดเมื่อ{' '}
              {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('th-TH') : '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && asset.lifecycle === 'active' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="h-9 px-3 text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer"
                >
                  <Pencil size={13} className="mr-1.5" /> แก้ไขข้อมูล
                </Button>
                {asset.quantity > 1 && onSplit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSplit}
                    className="h-9 px-3 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer"
                  >
                    <Scissors size={13} className="mr-1.5" /> แบ่งล็อต ({asset.quantity})
                  </Button>
                )}
                {asset.condition === 'repair' && onRepairComplete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRepairComplete}
                    className="h-9 px-3 text-xs font-semibold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                  >
                    <Wrench size={13} className="mr-1.5" /> บันทึกซ่อมเสร็จ
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              onClick={onRequest}
              className="h-9 px-3.5 text-xs font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white cursor-pointer shadow-sm"
            >
              <ArrowLeftRight size={14} className="mr-1.5" /> ส่งคำขอ (โอนย้าย/ซ่อม/จำหน่าย)
            </Button>
          </div>
        </div>
      </div>

      {/* Two-Column Responsive Layout (Mobile: Visual First, Desktop: Specs Left / Visual Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Details & Activity Timeline (Desktop: Order 1, Mobile: Order 2) */}
        <div className="lg:col-span-8 order-2 lg:order-1 space-y-6">
          {/* Main Specifications Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f172a]">
                ข้อมูลทั่วไปของครุภัณฑ์ (Asset Specification)
              </h2>
              <div className="flex items-center gap-1.5">
                <Badge value={asset.condition} />
                {asset.lifecycle !== 'active' && <Badge value={asset.lifecycle} />}
              </div>
            </div>

            {/* Row 1: Code & Serial */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสครุภัณฑ์ (Asset ID)
                </label>
                <div className="relative">
                  <Input
                    value={asset.code}
                    readOnly
                    className="font-mono text-sm font-bold text-blue-700 bg-slate-50 border-slate-200 select-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  หมายเลขเครื่อง / Serial No.
                </label>
                <Input
                  value={asset.serial || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
            </div>

            {/* Row 2: Asset Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ชื่อรายการครุภัณฑ์ (Asset Name)
              </label>
              <Input
                value={asset.name}
                readOnly
                className="text-sm font-semibold bg-white border-slate-200 text-slate-900"
              />
            </div>

            {/* Row 3: Category & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  หมวดหมู่ครุภัณฑ์ (Category)
                </label>
                <Input
                  value={asset.category || 'ทั่วไป'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  สาขาวิชา / หน่วยงานที่รับผิดชอบ
                </label>
                <Input
                  value={asset.branch || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
            </div>

            {/* Row 4: Location & Custodian */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  สถานที่ตั้ง / ห้อง (Location)
                </label>
                <Input
                  value={asset.location || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ผู้รับผิดชอบ / ผู้ดูแล (Custodian)
                </label>
                <Input
                  value={asset.custodian || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  หมวด (กลุ่มต่างๆ)
                </label>
                <Input value={groupFor(asset)} readOnly className="text-sm bg-white border-slate-200 text-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ทุน / โครงการ
                </label>
                <Input value={asset.fundName || '— ไม่ได้ระบุทุน'} readOnly title={asset.fundName || ''} className="text-sm bg-white border-slate-200 text-slate-800" />
              </div>
              {asset.setId && (
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชุด (ห้ามแยก — โอนย้าย/จำหน่ายต้องไปทั้งชุด)
                  </label>
                  <Input value={`${setRoles[asset.setRole as SetRole] ?? 'รายการในชุด'} · ${asset.setName ?? ''}`} readOnly className="text-sm bg-amber-50 border-amber-200 text-slate-800" />
                </div>
              )}
            </div>

            {/* Row 5: Acquisition Date & Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  วันที่ตรวจรับ / ได้มา
                </label>
                <Input
                  value={asset.receivedDate || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ราคาต่อหน่วย
                </label>
                <Input
                  value={`฿${money(asset.unitSatang)}`}
                  readOnly
                  className="text-sm font-semibold bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  มูลค่ารวม ({asset.quantity} ชิ้น)
                </label>
                <Input
                  value={`฿${money(asset.totalSatang)}`}
                  readOnly
                  className="text-sm font-bold bg-slate-50 border-slate-200 text-blue-700"
                />
              </div>
            </div>

            {/* Row 6: Life Years & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  อายุการใช้งานตามเกณฑ์
                </label>
                <Input
                  value={asset.lifeYears ? `${asset.lifeYears} ปี` : '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  สถานะสภาพการใช้งาน
                </label>
                <Input
                  value={conditions[asset.condition as keyof typeof conditions] || asset.condition}
                  readOnly
                  className="text-sm font-medium bg-white border-slate-200 text-slate-800"
                />
              </div>
            </div>

            {/* Row 7: Notes & Specification */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                หมายเหตุ / คุณลักษณะเฉพาะเพิ่มเติม
              </label>
              <Textarea
                value={asset.notes || '—'}
                readOnly
                rows={3}
                className="text-sm bg-white border-slate-200 text-slate-700 resize-none"
              />
            </div>

            {/* Action Row */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {editable && asset.lifecycle === 'active' && (
                <Button
                  onClick={onEdit}
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold px-5 h-10 rounded-lg cursor-pointer"
                >
                  <Pencil size={13} className="mr-1.5" /> แก้ไขข้อมูลครุภัณฑ์นี้
                </Button>
              )}
              <Button
                variant="outline"
                onClick={onBack}
                className="text-slate-600 border-slate-300 text-xs font-semibold px-5 h-10 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                ย้อนกลับ
              </Button>
            </div>
          </div>

          {/* Open Stocktake Rounds Notice & Action */}
          {editable && asset.lifecycle === 'active' && openRounds.length > 0 && onCheckRound && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-sm text-blue-900 block font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-blue-600" />
                  รอบตรวจนับที่เปิดอยู่สำหรับรายการนี้
                </strong>
                <p className="text-xs text-blue-700 mt-0.5">
                  คุณสามารถบันทึกผลการตรวจนับครุภัณฑ์ชิ้นนี้เข้ารอบที่กำลังเปิดอยู่ได้ทันที
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {openRounds.map(r => (
                  <Button
                    key={r.id}
                    size="sm"
                    onClick={() => onCheckRound(r.id)}
                    className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                  >
                    ตรวจรอบ {r.year || r.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Sub-items / Split Children */}
          {history?.children && history.children.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Scissors size={14} className="text-amber-700" />
                รายการที่แบ่งล็อตแยกออกมาจากรายการนี้
              </h3>
              <div className="space-y-1.5">
                {history.children.map((child: Asset) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSelectAsset && onSelectAsset(child)}
                    className="w-full text-left p-2.5 rounded-lg bg-white border border-amber-100 hover:border-amber-300 hover:bg-amber-50/50 transition-colors flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-blue-700 mr-2">{child.code}</span>
                      <span className="text-slate-800 font-medium">{child.name}</span>
                    </div>
                    <span className="text-slate-500 font-semibold">
                      {child.quantity} ชิ้น · ฿{money(child.totalSatang)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ประวัติการซ่อมบำรุง (ผู้ซ่อม ค่าใช้จ่าย ผลการซ่อม) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <Wrench size={17} className="text-orange-600" />
                ประวัติการซ่อมบำรุง
              </h2>
              <span className="text-xs text-slate-500">
                {history?.repairs?.length || 0} ครั้ง
                {history?.repairs?.length
                  ? ` · รวม ฿${money(history.repairs.reduce((sum: number, r: RepairRecord) => sum + r.costSatang, 0))}`
                  : ''}
              </span>
            </div>
            {history?.repairs && history.repairs.length > 0 ? (
              <div className="space-y-2">
                {history.repairs.map((r: RepairRecord) => (
                  <div key={r.id} className="rounded-lg border border-orange-100 bg-orange-50/40 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">ผู้ซ่อม: {r.repairedBy || '—'}</span>
                      <span className="font-bold text-orange-700">฿{money(r.costSatang)}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{r.result || '—'}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">ยังไม่มีประวัติการซ่อมที่บันทึกไว้</div>
            )}
          </div>

          {/* Activity Timeline Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <History size={17} className="text-blue-600" />
                ประวัติการทำรายการและความเคลื่อนไหว
              </h2>
              <span className="text-xs text-slate-500">
                {history?.events?.length || 0} เหตุการณ์
              </span>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                กำลังโหลดประวัติของรายการ…
              </div>
            ) : history?.events && history.events.length > 0 ? (
              <div className="space-y-3">
                {history.events.map((e: any) => (
                  <Activity key={e.id} event={e} />
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                ยังไม่มีบันทึกประวัติการเปลี่ยนแปลงสำหรับครุภัณฑ์นี้
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Assets (Desktop: Order 2, Mobile: Order 1) */}
        <div className="lg:col-span-4 order-1 lg:order-2 space-y-6">
          {/* Card 1: Asset Photo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                <Camera size={15} className="text-blue-600" /> รูปถ่ายครุภัณฑ์
              </h2>
            </div>

            <div className="w-full">
              <AssetPhoto
                assetId={asset.id}
                name={asset.name}
                imageVersion={asset.imageVersion}
                editable={editable}
                onChanged={onPhotoChanged}
              />
            </div>
          </div>

          {/* Card 2: Physical QR Code Sticker Preview */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                <Barcode size={15} className="text-blue-600" /> ฉลากติดครุภัณฑ์
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrintQr}
                className="h-7 px-2 text-xs font-bold text-blue-600 hover:bg-blue-50 cursor-pointer"
                title="พิมพ์ฉลาก"
              >
                <Printer size={13} className="mr-1" /> พิมพ์ฉลาก
              </Button>
            </div>

            {/* Simulated Physical Sticker (Matching desktop_8_asset_detail.svg) */}
            <div className="border-2 border-[#0f172a] rounded-lg overflow-hidden bg-white shadow-sm">
              {/* Header Ribbon */}
              <div className="bg-[#101f3c] text-white text-[10px] font-bold text-center py-1.5 px-2 leading-tight">
                คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์
              </div>

              {/* Tag Body */}
              <div className="p-3 flex items-center gap-3">
                {/* QR Code image */}
                <div className="w-24 h-24 bg-white border border-slate-200 rounded p-1 shrink-0 flex items-center justify-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-100 animate-pulse rounded" />
                  )}
                </div>

                {/* Tag Text Info */}
                <div className="min-w-0 flex-1 space-y-1 text-left">
                  <div>
                    <span className="text-[10px] text-slate-500 block leading-none">รหัสครุภัณฑ์:</span>
                    <strong className="font-mono text-xs text-[#0f172a] block truncate select-all">
                      {asset.code}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block leading-none">ชื่อรายการ:</span>
                    <span className="text-[11px] font-bold text-slate-800 block truncate">
                      {asset.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] text-slate-600 block truncate">
                      {asset.branch || 'คณะวิศวกรรมศาสตร์ฯ'}
                    </span>
                    <span className="text-[9px] text-slate-400 block truncate">
                      วันที่ได้มา: {asset.receivedDate || '—'}
                    </span>
                  </div>
                  <div className="text-[9px] font-bold text-blue-600 pt-0.5">
                    สแกนเพื่อตรวจสอบสถานะ
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handlePrintQr}
              className="w-full h-9 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg cursor-pointer"
            >
              <Printer size={13} className="mr-1.5" /> พิมพ์ฉลากติดครุภัณฑ์นี้ (Print Tag)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
