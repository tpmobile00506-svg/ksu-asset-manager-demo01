'use client';

import { useState, useEffect } from 'react';
import {
  QrCode,
  Scissors,
  ArrowLeftRight,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Asset, money } from '@/shared/domain';
import { Any, api, Badge, Activity } from '@/frontend/components/common';
import AssetPhoto from './asset-photo';

function formatThaiDate(dateStr: string) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!y || !m || !d) return '';
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return `${d} ${thaiMonths[m - 1] || ''} พ.ศ. ${y + 543}`;
}

export default function AssetDetailSheet({
  selected,
  setSelected,
  editable,
  data,
  historyRevision,
  open,
  onPhotoChanged
}: {
  selected: Asset | null;
  setSelected: (a: Asset | null) => void;
  editable: boolean;
  data: Any;
  historyRevision: number;
  open: (k: string, a?: Any) => void;
  onPhotoChanged: () => Promise<void>;
}) {
  const [historyResult, setHistory] = useState<Any | null>(null);

  const history =
    selected &&
    historyResult?.assetId === selected.id &&
    historyResult?.version === selected.version &&
    historyResult?.revision === historyRevision
      ? historyResult
      : null;

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    if (!selected) return;
    const { id: assetId, version } = selected;
    const revision = historyRevision;

    api('?view=history&asset=' + encodeURIComponent(assetId))
      .then(result => {
        if (!cancelled) setHistory({ ...result, assetId, version, revision });
      })
      .catch(e => {
        if (!cancelled)
          setHistory({
            assetId,
            version,
            revision,
            events: [],
            children: [],
            error: e.message || 'โหลดประวัติไม่สำเร็จ'
          });
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.version, historyRevision]);

  return (
    <Sheet
      open={!!selected}
      onOpenChange={v => {
        if (!v) setSelected(null);
      }}
    >
      <SheetContent className="detail-sheet">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl pr-8">{selected?.name}</SheetTitle>
          <SheetDescription className="mono">{selected?.code}</SheetDescription>
        </SheetHeader>

        {selected && (
          <>
            <div className="status-line mt-4">
              <Badge value={selected.condition} />
              <Badge value={selected.lifecycle} />
              <span className="badge">{selected.quantity} ชิ้น</span>
            </div>

            <AssetPhoto
              assetId={selected.id}
              name={selected.name}
              imageVersion={selected.imageVersion}
              editable={false}
              onChanged={onPhotoChanged}
            />

            <div className="detail-amount">
              <small>มูลค่าทุนของรายการ</small>
              {money(selected.totalSatang)}{' '}
              <span className="text-sm font-normal">บาท</span>
            </div>

            <dl className="detail-grid">
              {[
                ['สถานที่', selected.location],
                ['สาขา', selected.branch],
                ['ประเภท', selected.category],
                ['ผู้รับผิดชอบ', selected.custodian],
                ['Serial', selected.serial],
                ['ยี่ห้อ / รุ่น', selected.brand],
                [
                  'วันที่รับ',
                  selected.receivedDate
                    ? `${selected.receivedDate} (${formatThaiDate(selected.receivedDate)})`
                    : ''
                ],
                ['อายุใช้งาน', selected.lifeYears ? selected.lifeYears + ' ปี' : '']
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || 'ยังไม่ระบุ'}</dd>
                </div>
              ))}
              <div className="span-2">
                <dt>หมวด / ชุด / โครงการ</dt>
                <dd>{selected.groupName || '—'}</dd>
              </div>
              <div className="span-2">
                <dt>หมายเหตุ</dt>
                <dd>{selected.notes || '—'}</dd>
              </div>
              <div className="span-2">
                <dt>ข้อมูลต้นทาง</dt>
                <dd>{selected.sourceRow || 'บันทึกใหม่ในระบบ'}</dd>
              </div>
            </dl>

            <div className="actions">
              {editable && selected.lifecycle === 'active' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => open('edit', { asset: selected })}
                  >
                    <Pencil size={15} className="mr-1.5" />
                    แก้ไขข้อมูล
                  </Button>
                  <Button onClick={() => open('request', { asset: selected })}>
                    <ArrowLeftRight size={16} />
                    ส่งคำขอ
                  </Button>
                  {selected.quantity > 1 && (
                    <Button
                      variant="outline"
                      onClick={() => open('split', { asset: selected })}
                    >
                      <Scissors size={16} />
                      แบ่งล็อต
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => open('qr', { assets: [selected] })}
                  >
                    <QrCode size={16} />
                    QR
                  </Button>
                  {selected.condition === 'repair' && (
                    <Button
                      variant="outline"
                      onClick={() => open('repairComplete', { asset: selected })}
                    >
                      บันทึกซ่อมเสร็จ
                    </Button>
                  )}
                </>
              )}
            </div>

            {editable &&
              selected.lifecycle === 'active' &&
              data.rounds.some((r: Any) => r.status === 'open') && (
                <div className="notice">
                  <b>บันทึกตรวจนับรายการนี้</b>
                  <div className="actions mt-3">
                    {data.rounds
                      .filter((r: Any) => r.status === 'open')
                      .map((r: Any) => (
                        <Button
                          key={r.id}
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const d = await api(
                                '?view=stocktake&round=' + encodeURIComponent(r.id)
                              );
                              const item = d.items.find(
                                (x: Any) => x.assetId === selected.id
                              );
                              if (item) open('check', { item });
                              else
                                toast.info(
                                  'รายการนี้ไม่ได้อยู่ในทะเบียน ณ วันที่เปิดรอบ'
                                );
                            } catch (e: any) {
                              toast.error(e.message);
                            }
                          }}
                        >
                          {r.name}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

            <h2 className="mt-8">ประวัติของรายการ</h2>
            {history?.children?.length > 0 && (
              <div className="notice">
                <b>รายการที่แยกออกมา</b>
                {history?.children.map((a: Asset) => (
                  <button
                    className="block text-left text-sm text-blue-700 mt-2"
                    key={a.id}
                    onClick={() => setSelected(a)}
                  >
                    {a.code} · {a.quantity} ชิ้น · {money(a.totalSatang)} บาท
                  </button>
                ))}
              </div>
            )}
            {history?.events.map((e: Any) => (
              <Activity key={e.id} event={e} />
            ))}
            {history?.error && (
              <div className="error mt-4" role="alert">
                {history.error}
                <p>กรุณาปิดรายละเอียดแล้วเปิดใหม่เพื่อลองอีกครั้ง</p>
              </div>
            )}
            {!history && (
              <div role="status" aria-label="กำลังโหลดประวัติ">
                <Skeleton className="h-20 mt-4" />
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
