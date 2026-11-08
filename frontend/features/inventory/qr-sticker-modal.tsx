'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pick } from '@/frontend/components/common';
import type { Asset } from '@/shared/domain';
import {
  DEFAULT_STICKER_SIZE,
  MAX_STICKERS,
  isStickerSize,
  stickerCopies,
  stickerSizes,
  type StickerSize,
} from '@/shared/qr-sticker-document';
import StickerPreview from './sticker-preview';
import { printStickers, savedStickerSize, saveStickerSize } from './qr-sticker';

// หน้าต่างพิมพ์สติกเกอร์ QR (แทนป้าย A4 เดิม): ค้นหาและติ๊กเลือกครุภัณฑ์เอง กำหนดจำนวนดวงต่อรายการ
// ดูตัวอย่างดวงจริงด้านขวา แล้วพิมพ์ดวงละหน้าตามขนาดม้วนสติกเกอร์
// แสดงรายการในหน้าต่างครั้งละไม่เกิน 100 แถว (ทะเบียนมีหลายพันรายการ) ค้นหาเพื่อหารายการอื่น
const SHOW = 100;
// เรียงตามหมายเลขแบบตัวเลข: -2 มาก่อน -10 · ชิ้นของกลุ่มเดียวกันเรียงต่อกันทั้งในรายการและตอนพิมพ์
const byCode = new Intl.Collator('th', { numeric: true });

export default function QrStickerModal({
  open,
  onClose,
  assets,
  initial,
  token,
}: {
  open: boolean;
  onClose: () => void;
  // ครุภัณฑ์ทั้งหมด: เลือกพิมพ์ได้เฉพาะที่ใช้อยู่ (ประวัติการแยก/จำหน่าย/ยกเลิก ไม่ต้องติดสติกเกอร์)
  assets: Asset[];
  // รายการที่ติ๊กมาจากหน้าทะเบียน (เลือกไว้ให้ตอนเปิด)
  initial: Asset[];
  // เปิดหน้าต่างใหม่ทุกครั้งได้ token ใหม่ → ล้างค่าที่เลือกค้างไว้
  token?: string;
}) {
  const [seen, setSeen] = useState<string | undefined>(undefined);
  // จำนวนดวงต่อรายการ: เก็บค่าที่พิมพ์ไว้ตามจริงระหว่างแก้ (ลบจนว่างได้) แปลงเป็นตัวเลขตอนใช้ด้วย stickerCopies()
  const [picked, setPicked] = useState<Map<string, number | string>>(() => new Map());
  const [query, setQuery] = useState('');
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [size, setSize] = useState<StickerSize>(DEFAULT_STICKER_SIZE);
  const [printing, setPrinting] = useState(false);
  if (open && token !== seen) {
    setSeen(token);
    const ids = initial.map(a => a.id);
    setPicked(new Map(ids.map(id => [id, 1])));
    setQuery('');
    // ติ๊กมาจากทะเบียน → แสดงเฉพาะที่เลือกก่อน จะได้เห็นว่าจะพิมพ์อะไรบ้าง (เอาติ๊กออกเพื่อเพิ่มรายการอื่น)
    setOnlyPicked(ids.length > 0);
    setFocus(ids[0] ?? null);
    setSize(savedStickerSize());
  }

  const sorted = useMemo(
    () => assets.filter(a => a.lifecycle === 'active').sort((a, b) => byCode.compare(a.code, b.code)),
    [assets],
  );
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      sorted.filter(
        a =>
          (!onlyPicked || picked.has(a.id)) &&
          (!q || [a.code, a.name, a.location, a.serial].join(' ').toLowerCase().includes(q)),
      ),
    [sorted, onlyPicked, picked, q],
  );
  const shown = matches.slice(0, SHOW);
  // พิมพ์เรียงตามหมายเลข เหมือนรายการที่เห็น
  const pickedList = useMemo(() => sorted.filter(a => picked.has(a.id)), [sorted, picked]);
  const total = pickedList.reduce((sum, a) => sum + stickerCopies(picked.get(a.id)), 0);
  const tooMany = total > MAX_STICKERS;
  const allMatchesPicked = matches.length > 0 && matches.every(a => picked.has(a.id));
  const preview = pickedList.find(a => a.id === focus) ?? pickedList[0] ?? null;
  const sizeInfo = stickerSizes[size];

  const update = (change: (next: Map<string, number | string>) => void) =>
    setPicked(prev => {
      const next = new Map(prev);
      change(next);
      return next;
    });
  const toggle = (a: Asset) => {
    update(m => {
      if (m.has(a.id)) m.delete(a.id);
      else m.set(a.id, 1);
    });
    setFocus(a.id);
  };
  const toggleAll = () =>
    update(m => {
      for (const a of matches) {
        if (allMatchesPicked) m.delete(a.id);
        else if (!m.has(a.id)) m.set(a.id, 1);
      }
    });
  const step = (id: string, by: number) => update(m => m.set(id, stickerCopies(stickerCopies(m.get(id)) + by)));
  const changeSize = (value: string) => {
    if (!isStickerSize(value)) return;
    setSize(value);
    saveStickerSize(value);
  };
  const print = async () => {
    if (!pickedList.length || tooMany || printing) return;
    setPrinting(true);
    try {
      // printStickers เปิดแท็บพิมพ์ทันที (ก่อน await แรก) เบราว์เซอร์จึงไม่บล็อกป๊อปอัป
      await printStickers(
        pickedList.map(a => ({ asset: a, copies: stickerCopies(picked.get(a.id)) })),
        size,
      );
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="dialog-wide sticker-dialog print:hidden no-print">
        <DialogHeader className="dialog-header-sticky">
          <DialogTitle>พิมพ์สติกเกอร์ QR</DialogTitle>
          <DialogDescription>
            ติ๊กเลือกครุภัณฑ์ที่จะพิมพ์ได้หลายรายการ · พิมพ์ดวงละหน้าตามขนาดม้วนสติกเกอร์
          </DialogDescription>
        </DialogHeader>

        <div className="dialog-scroll-body">
          <div className="sticker-picker">
            <section className="min-w-0">
              <div className="searchbox relative flex items-center">
                <Search />
                <Input
                  aria-label="ค้นหาครุภัณฑ์ที่จะพิมพ์"
                  placeholder="ค้นหาหมายเลข ชื่อ สถานที่ หรือ Serial…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-[13px] text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="select-check"
                    checked={allMatchesPicked}
                    disabled={!matches.length}
                    onChange={toggleAll}
                  />
                  เลือกทั้งหมดที่ค้นเจอ ({matches.length.toLocaleString('th-TH')})
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="select-check"
                    checked={onlyPicked}
                    onChange={e => setOnlyPicked(e.target.checked)}
                  />
                  แสดงเฉพาะที่เลือก ({pickedList.length.toLocaleString('th-TH')})
                </label>
              </div>
              <ul className="sticker-list" aria-label="ครุภัณฑ์ที่เลือกพิมพ์ได้">
                {shown.map(a => {
                  const on = picked.has(a.id);
                  return (
                    <li
                      key={a.id}
                      className={`sticker-row ${on ? 'is-on' : ''} ${preview?.id === a.id ? 'is-focus' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="select-check"
                        aria-label={`เลือก ${a.code} ${a.name}`}
                        checked={on}
                        onChange={() => toggle(a)}
                      />
                      <button
                        type="button"
                        className="sticker-row-main"
                        title={on ? 'ดูตัวอย่างสติกเกอร์ของรายการนี้' : 'เลือกรายการนี้'}
                        onClick={() => (on ? setFocus(a.id) : toggle(a))}
                      >
                        <span className="block truncate font-mono text-[12px] font-semibold text-blue-700">
                          {a.code}
                        </span>
                        <span className="block truncate text-[13px] text-slate-800">
                          {a.name}
                          {a.location ? <span className="text-slate-500"> · {a.location}</span> : null}
                        </span>
                        {a.quantity > 1 && (
                          <span className="block text-[11.5px] text-amber-700">
                            {a.quantity.toLocaleString('th-TH')} ชิ้นใช้ QR เดียวกัน
                          </span>
                        )}
                      </button>
                      {on && (
                        <span className="sticker-copies">
                          <button type="button" aria-label={`ลดจำนวนดวงของ ${a.code}`} onClick={() => step(a.id, -1)}>
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={MAX_STICKERS}
                            aria-label={`จำนวนดวงของ ${a.code}`}
                            value={picked.get(a.id)}
                            onChange={e => update(m => m.set(a.id, e.target.value))}
                            onBlur={() => update(m => m.set(a.id, stickerCopies(m.get(a.id))))}
                          />
                          <button type="button" aria-label={`เพิ่มจำนวนดวงของ ${a.code}`} onClick={() => step(a.id, 1)}>
                            <Plus size={13} />
                          </button>
                          <span className="text-xs text-slate-500">ดวง</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!matches.length && (
                <p className="py-6 text-center text-[13px] text-slate-500">
                  {onlyPicked && !pickedList.length ? 'ยังไม่ได้เลือกรายการ' : 'ไม่พบรายการที่ตรงกับคำค้น'}
                </p>
              )}
              {matches.length > SHOW && (
                <p className="mt-2 text-xs text-slate-500">
                  แสดง {SHOW} จาก {matches.length.toLocaleString('th-TH')} รายการ · พิมพ์คำค้นให้แคบลงเพื่อหารายการอื่น
                </p>
              )}
            </section>

            <aside className="sticker-side">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-slate-600">ขนาดสติกเกอร์</span>
                <Pick
                  label="ขนาดสติกเกอร์"
                  value={size}
                  onChange={changeSize}
                  options={Object.entries(stickerSizes).map(([key, s]) => [key, s.label] as [string, string])}
                />
              </div>
              <div className="sticker-stage">
                {preview ? (
                  <StickerPreview asset={preview} size={size} />
                ) : (
                  <span className="text-[13px] text-slate-500">ติ๊กเลือกครุภัณฑ์ทางซ้าย</span>
                )}
              </div>
              {preview && (
                <p className="text-center text-xs text-slate-500">
                  ตัวอย่างของ {preview.code}
                  {pickedList.length > 1 ? ' · กดที่รายการเพื่อดูดวงอื่น' : ''}
                </p>
              )}
              <p className="sticker-note">
                ก่อนพิมพ์ ตั้งขนาดกระดาษของเครื่องพิมพ์ให้ตรงกับม้วน ({sizeInfo.w} × {sizeInfo.h} มม.)
                และตั้งขอบกระดาษเป็น &quot;ไม่มี&quot;
              </p>
            </aside>
          </div>
        </div>

        <div className="dialog-footer-sticky qr-print-bar">
          <span className="text-[13px] font-medium text-slate-600">
            {tooMany ? (
              <span className="text-rose-700">
                รวม {total.toLocaleString('th-TH')} ดวง เกินครั้งละ {MAX_STICKERS} ดวง กรุณาแบ่งพิมพ์
              </span>
            ) : (
              `เลือก ${pickedList.length.toLocaleString('th-TH')} รายการ · รวม ${total.toLocaleString('th-TH')} ดวง`
            )}
          </span>
          <Button
            disabled={!pickedList.length || tooMany || printing}
            onClick={print}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
          >
            <Printer size={16} />
            พิมพ์สติกเกอร์{total ? ` (${total.toLocaleString('th-TH')} ดวง)` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
