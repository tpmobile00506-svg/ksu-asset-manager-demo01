'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Bell, CheckCircle2, ClipboardCheck, Clock, TriangleAlert, Wrench, X } from 'lucide-react';
import { pendingForUser, requestTypes } from '@/shared/domain';
import type { Any } from '@/frontend/components/common';
import type { WorkspaceData } from '@/frontend/types/models';
import { formatImportDate } from '@/frontend/utils/relative-date';

// กระดิ่งแจ้งเตือนบนแถบด้านบน
// - ผู้อนุมัติ (head/deputy/dean) เห็นเฉพาะคำขอที่รอตัวเองอนุมัติ (เงื่อนไขเดียวกับหน้าคำขอ)
// - staff/admin เห็นคำขอค้างทั้งหมด และรอบตรวจนับที่เปิดอยู่ เพราะเป็นผู้ติดตามงาน
// กดรายการ = ไปหน้านั้น (onGo) · กดนอกกล่องหรือกด Esc = ปิด
export function NotificationBell({ data, onGo }: { data: WorkspaceData; onGo: (view: string) => void }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen]);
  const approver = ['head', 'deputy', 'dean'].includes(data.me.role);
  const pendingRequests = pendingForUser(data.requests || [], data.me, data.assets || []);
  const openRounds = approver ? [] : data.rounds?.filter((r: Any) => r.status === 'open') || [];
  const totalNotifications = pendingRequests.length + openRounds.length;
  const go = (view: string) => {
    onGo(view);
    setNotifOpen(false);
  };

  return (
    <div className="relative" ref={notifRef}>
      <button
        type="button"
        onClick={() => setNotifOpen(prev => !prev)}
        className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
          notifOpen
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
        }`}
        title={`การแจ้งเตือน (${totalNotifications} รายการ)`}
        aria-label="การแจ้งเตือน"
        aria-expanded={notifOpen}
      >
        <Bell size={15} />
        {totalNotifications > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#0f172a] shadow-sm animate-pulse">
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </span>
        )}
      </button>

      {/* Notification Popover Dropdown */}
      {notifOpen && (
        <div
          className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 text-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          role="dialog"
          aria-label="กล่องแจ้งเตือน"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-blue-600" />
              <span className="font-semibold text-xs text-slate-800">ศูนย์แจ้งเตือน</span>
              {totalNotifications > 0 ? (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                  {totalNotifications} ค้างดำเนินการ
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  เป็นปัจจุบัน
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotifOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
              title="ปิด"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {totalNotifications === 0 ? (
              <div className="py-8 px-4 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                  <CheckCircle2 size={20} />
                </div>
                <p className="text-xs font-semibold text-slate-700">ไม่มีรายการแจ้งเตือนค้าง</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  คำขอและการตรวจนับทั้งหมดได้รับการจัดการเรียบร้อยแล้ว
                </p>
              </div>
            ) : (
              <>
                {/* Pending Requests Section */}
                {pendingRequests.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>
                        {approver ? 'รอคุณอนุมัติ' : 'คำขอที่รออนุมัติ'} ({pendingRequests.length})
                      </span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {pendingRequests.slice(0, 5).map((r: Any) => {
                        const kindLabel =
                          requestTypes[(r.kind === 'dispose' ? 'disposal' : r.kind) as keyof typeof requestTypes] ??
                          'คำขอ';
                        const IconComp =
                          r.kind === 'transfer' ? ArrowLeftRight : r.kind === 'repair' ? Wrench : TriangleAlert;
                        const badgeColor =
                          r.kind === 'transfer'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : r.kind === 'repair'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200';
                        const dateInfo = formatImportDate(r.createdAt);

                        return (
                          <div
                            key={r.id}
                            onClick={() => {
                              go('requests');
                            }}
                            className="p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer transition-all"
                          >
                            <div className="flex items-start gap-2.5">
                              <div
                                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${badgeColor}`}
                              >
                                <IconComp size={13} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="text-[11px] font-semibold text-slate-800 truncate">
                                    {r.code || 'คำขอ'}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium border ${badgeColor}`}>
                                    {kindLabel}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 truncate font-medium">
                                  {r.name || 'ไม่มีชื่อรายการ'}
                                </p>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                                  <span className="truncate max-w-[180px]">
                                    {r.reason ? `เหตุผล: ${r.reason}` : 'รออนุมัติ'}
                                  </span>
                                  <span className="shrink-0 flex items-center gap-1">
                                    <Clock size={10} />
                                    {dateInfo.sub || dateInfo.main}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {pendingRequests.length > 5 && (
                        <button
                          type="button"
                          onClick={() => {
                            go('requests');
                          }}
                          className="w-full text-center py-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                        >
                          ดูคำขอที่รอทั้งหมด ({pendingRequests.length} รายการ) →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Open Stocktake Rounds Section */}
                {openRounds.length > 0 && (
                  <div className="p-2 bg-slate-50/50">
                    <div className="px-2 py-1 text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>รอบการตรวจนับที่เปิดอยู่ ({openRounds.length})</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {openRounds.map((round: Any) => {
                        const progress = round.total > 0 ? Math.round((round.checked / round.total) * 100) : 0;
                        return (
                          <div
                            key={round.id}
                            onClick={() => {
                              go('stocktakes');
                            }}
                            className="p-2.5 rounded-lg bg-white hover:bg-slate-100/70 border border-slate-200 cursor-pointer transition-all"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                                <ClipboardCheck size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="text-[11px] font-semibold text-slate-800 truncate">
                                    {round.name || `รอบตรวจนับปี ${round.year}`}
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    กำลังนับ {progress}%
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500">
                                  ตรวจนับแล้ว {round.checked} / {round.total} รายการ
                                </p>
                                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1.5 overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, progress)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs gap-2">
            <button
              type="button"
              onClick={() => {
                go('requests');
              }}
              className="flex-1 text-center py-1.5 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px] transition-colors cursor-pointer"
            >
              คำขอและโอนย้าย
            </button>
            <button
              type="button"
              onClick={() => {
                go('stocktakes');
              }}
              className="flex-1 text-center py-1.5 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px] transition-colors cursor-pointer"
            >
              ตรวจนับประจำปี
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
