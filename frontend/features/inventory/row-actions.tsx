'use client';
import { MoreHorizontal, Eye, Pencil, Scissors, ArrowLeftRight, QrCode, Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Asset } from '@/shared/domain';

type Open = (kind: string, rest?: Record<string, unknown>) => void;

// ปุ่ม ⋯ ท้ายแถวทะเบียน: สั่งงานได้โดยไม่ต้องเข้าหน้ารายละเอียด (ผู้ใช้ขอ 17 ต.ค. 2569)
// เมนูแสดงเฉพาะคำสั่งที่ใช้ได้กับรายการนั้นและสิทธิ์ของผู้ใช้
export function RowActions({ asset, editable, open, view }: { asset: Asset; editable: boolean; open: Open; view: () => void }) {
  const active = asset.lifecycle === 'active';
  const can = editable && active;
  const many = asset.quantity > 1 && !asset.setId;
  // ยกเลิกรายการที่บันทึกผิด: ซ่อนเมื่อรู้แน่ว่ายกเลิกไม่ได้ (ลูกจากแบ่งล็อต/ของในชุด) ที่เหลือเซิร์ฟเวอร์ตรวจประวัติอีกชั้น
  const voidable = can && !asset.parentId && !asset.setId;
  const restorable = editable && asset.lifecycle === 'voided';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600" aria-label={`คำสั่งสำหรับ ${asset.name}`} title="คำสั่ง">
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 bg-white">
        <DropdownMenuItem onSelect={view}><Eye size={14} />เปิดดูรายละเอียด</DropdownMenuItem>
        {can && <DropdownMenuItem onSelect={() => open('edit', { asset })}><Pencil size={14} />แก้ไขข้อมูล</DropdownMenuItem>}
        {can && many && <DropdownMenuItem onSelect={() => open('split', { asset })}><Scissors size={14} />แบ่งล็อต ({asset.quantity.toLocaleString('th-TH')} ชิ้น)</DropdownMenuItem>}
        {can && <DropdownMenuSeparator />}
        {can && <DropdownMenuItem onSelect={() => open('request', { asset })}><ArrowLeftRight size={14} />ยื่นโอนย้าย / ซ่อม / จำหน่าย</DropdownMenuItem>}
        {can && <DropdownMenuItem onSelect={() => open('qr', { assets: [asset] })}><QrCode size={14} />พิมพ์ QR</DropdownMenuItem>}
        {voidable && <DropdownMenuSeparator />}
        {voidable && <DropdownMenuItem className="text-rose-700 focus:text-rose-700" onSelect={() => open('void', { asset })}><Ban size={14} />ยกเลิกรายการ (บันทึกผิด)</DropdownMenuItem>}
        {restorable && <DropdownMenuSeparator />}
        {restorable && <DropdownMenuItem className="text-emerald-700 focus:text-emerald-700" onSelect={() => open('restore', { asset })}><RotateCcw size={14} />กู้คืนรายการ</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
