'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Package, Plus, LogOut, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Toaster, toast } from 'sonner';
import { Asset, awaitingApprovalByAsset, pendingForUser } from '@/shared/domain';
import { Any, api, SESSION_EXPIRED_EVENT, readApiResponse, cancelApiRequests } from '@/frontend/components/common';
import { useAssetTools } from '@/frontend/hooks/use-asset-tools';
import Editor from './editor';
import ImportView from '@/frontend/features/imports/import-view';
import ExportView from '@/frontend/features/exports/export-view';
import Operations from '@/frontend/features/operations/operations';
import AssetDetailView from './asset-detail-view';
import QrScannerModal from '@/frontend/components/qr-scanner-modal';
import BulkEditModal from './bulk-edit-modal';
import { WorkspaceData } from '@/frontend/types/models';
import { LoginScreen } from '@/frontend/features/auth/login-screen';
import { AppSidebar } from '@/frontend/features/shell/app-sidebar';
import { NotificationBell } from '@/frontend/features/shell/notification-bell';
import { nav, viewDescription, canSeeView } from '@/frontend/features/shell/navigation';
import { OverviewDashboard } from './overview-dashboard';
import { RegistryView } from './registry-view';
import { useRegistry } from './use-registry';

// หน้าหลักของระบบหลังล็อกอิน (ทั้งเว็บเป็นหน้าเดียว สลับ "view" แทนการเปลี่ยนหน้า)
// ไฟล์นี้ดูแลเฉพาะงานกลาง:
// - เซสชัน: ล็อกอิน / ออกจากระบบ / หมดเวลา (clearSession)
// - โหลดข้อมูลทั้งระบบครั้งเดียวจาก GET /api/data (reload) แล้วส่งให้ทุกหน้า
// - บันทึกข้อมูลผ่าน write() → POST /api/data แล้วโหลดใหม่
// - จำหน้าที่เปิดอยู่ใน URL (?view= / ?asset=) ให้ปุ่ม Back และรีเฟรชใช้ได้
// - เปิด/ปิดหน้าต่าง (modal) ทุกชนิดผ่าน open() → Editor
// ส่วนแสดงผลแยกอยู่ใน: auth/login-screen, shell/app-sidebar, shell/notification-bell,
// inventory/overview-dashboard, inventory/registry-view (+ use-registry สำหรับตัวกรอง)
// อาร์เรย์ว่างตัวเดียวใช้ร่วมกัน ตัวจำผล (useMemo) จึงไม่คำนวณใหม่ทุกครั้งที่วาดตอนยังไม่มีข้อมูล
const NO_ASSETS: Asset[] = [];
// ข้อมูลที่โหลดไว้ถือว่ายังสดอยู่กี่มิลลิวินาที (ใช้ตอนกดเมนูและกลับมาที่หน้าต่าง)
const STALE_MS = 30_000;

export default function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(''),
    [view, setView] = useState('overview'),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Any | null>(null),
    [selected, setSelected] = useState<Asset | null>(null),
    [formError, setFormError] = useState(''),
    [revision, setRevision] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // ค่าเริ่มต้นของหน้าต่างส่งออก: เปิดจากหน้าทะเบียนใช้สาขาที่กรองอยู่ เปิดจากหน้ารายงานใช้สาขาและปีงบที่เลือกไว้
  const [exportPreset, setExportPreset] = useState<{ branch: string; fiscalYear?: number }>({ branch: '' });
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [loggingIn, setLoggingIn] = useState(false);
  const hadSession = useRef(false),
    sessionGeneration = useRef(0),
    reloadGeneration = useRef(0),
    loadedAt = useRef(0);
  const assets: Asset[] = data?.assets ?? NO_ASSETS;
  const registry = useRegistry(assets, view);
  const { reset: resetRegistry } = registry;
  const clearSession = useCallback(() => {
    const expired = hadSession.current;
    sessionGeneration.current++;
    reloadGeneration.current++;
    cancelApiRequests();
    hadSession.current = false;
    setData(null);
    setModal(null);
    setSelected(null);
    setPassword('');
    setView('overview');
    setBusy(false);
    setLoading(false);
    resetRegistry();
    if (expired) setError('หมดเวลาเข้าใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง');
  }, [resetRegistry]);
  const reload = useCallback(async () => {
    const generation = sessionGeneration.current,
      request = ++reloadGeneration.current;
    const current = () => generation === sessionGeneration.current && request === reloadGeneration.current;
    try {
      const next = await api<WorkspaceData>();
      if (current()) {
        loadedAt.current = Date.now();
        setData(next);
        setSelected(current => (current ? next.assets.find((a: Asset) => a.id === current.id) || null : null));
        setRevision(n => n + 1);
        hadSession.current = true;
        setError('');
      }
    } catch (e: any) {
      if (current()) {
        if (e.status === 401) clearSession();
        else if (e.name !== 'AbortError') setError(e.message);
      }
    } finally {
      if (current()) {
        setLoading(false);
      }
    }
  }, [clearSession]);
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, clearSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearSession);
  }, [clearSession]);
  useEffect(() => {
    // กลับมาที่หน้าต่าง: โหลดใหม่ถ้าข้อมูลเก่ากว่า 30 วินาที (เดิมโหลดทั้งก้อนทุกครั้งที่สลับแท็บ/แอป)
    const refreshOnFocus = () => {
      if (hadSession.current && Date.now() - loadedAt.current > STALE_MS) void reload();
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [reload]);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    sessionGeneration.current++;
    cancelApiRequests();
    setLoggingIn(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      let result: Any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = {};
      }
      if (!res.ok) {
        throw new Error(
          result.error ||
            (res.status === 401
              ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
              : 'ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ'),
        );
      }
      setPassword('');
      // เข้าสู่ระบบใหม่เริ่มที่หน้าภาพรวมเสมอ: ล้าง ?view= ที่ค้างจากรอบก่อน/ผู้ใช้ก่อน (เดิมออกจากระบบที่หน้าประวัติ ล็อกอินกลับมาก็ไปหน้าประวัติ)
      // เก็บ ?asset= ไว้ ลิงก์จาก QR ที่ต้องล็อกอินก่อนยังเปิดรายการนั้นได้ ส่วนการรีเฟรชระหว่างใช้งานไม่ผ่านตรงนี้ จึงยังอยู่หน้าเดิม
      const url = new URL(location.href);
      if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        history.replaceState(null, '', url);
      }
      await reload();
    } catch (err: any) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoggingIn(false);
    }
  };
  const handleLogout = async () => {
    try {
      await readApiResponse(await fetch('/api/auth/logout', { method: 'POST' }));
      clearSession();
      setError('');
      history.replaceState(null, '', location.pathname);
    } catch {
      toast.error('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
    }
  };
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (data) {
      const a = new URL(location.href).searchParams.get('asset');
      if (a) {
        const found = data.assets.find((x: Asset) => x.id === a);
        if (found) {
          setView('registry');
          setSelected(found);
        }
      }
    }
  }, [!!data]);
  // เก็บหน้าที่เปิดอยู่ไว้ใน URL (?view=) เพื่อให้ปุ่ม Back, รีเฟรช และแชร์ลิงก์ใช้ได้
  const viewFromUrl = () => {
    const v = new URL(location.href).searchParams.get('view') || 'overview';
    return nav.some(n => n[0] === v) && canSeeView(v, data?.me.role ?? '') ? v : 'overview';
  };
  useEffect(() => {
    if (data && !new URL(location.href).searchParams.get('asset')) setView(viewFromUrl());
  }, [!!data]);
  useEffect(() => {
    if (!data) return;
    const url = new URL(location.href);
    if (url.searchParams.get('asset') && view === 'registry') return;
    if ((url.searchParams.get('view') || 'overview') === view) return;
    url.searchParams.delete('asset');
    url.searchParams.set('view', view);
    history.pushState(null, '', url);
  }, [view, !!data]);
  useEffect(() => {
    const onPop = () => {
      setSelected(null);
      setView(viewFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });
  const open = (kind: string, rest: Any = {}) => {
    setFormError('');
    setModal({ kind, token: crypto.randomUUID(), ...rest });
  };
  const write = async (body: Any) => {
    const generation = sessionGeneration.current;
    setBusy(true);
    setFormError('');
    try {
      const r = await api('', { token: modal?.token || crypto.randomUUID(), ...body });
      if (generation !== sessionGeneration.current) return null;
      // เปลี่ยนรหัสผ่านเองแล้ว เซิร์ฟเวอร์ออกจากระบบทุกเครื่อง → กลับหน้าเข้าสู่ระบบพร้อมบอกเหตุผล
      if ((r as Any)?.signedOut) {
        clearSession();
        setError('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
        return r;
      }
      await reload();
      if (generation !== sessionGeneration.current) return null;
      setModal(null);
      setSelected(null);
      toast.success('บันทึกเรียบร้อยแล้ว');
      return r;
    } catch (e: any) {
      if (generation === sessionGeneration.current && e.name !== 'AbortError') {
        setFormError(e.message);
        toast.error(e.message);
      }
      return null;
    } finally {
      if (generation === sessionGeneration.current) setBusy(false);
    }
  };
  useAssetTools(data?.assets || [], open);
  const switchView = (v: string) => {
    setSelected(null);
    setView(v);
    registry.setSearch('');
    // กดเมนู: ใช้ข้อมูลที่มีอยู่ถ้าเพิ่งโหลดไม่ถึง 30 วินาที (เดิมโหลดทั้งก้อนทุกครั้ง มือถือรอ 1.5–3 วินาทีต่อการกด)
    // หลังบันทึกยังโหลดใหม่ทันทีใน write() เสมอ
    if (Date.now() - loadedAt.current > STALE_MS) void reload();
  };
  // ผลคำนวณรวมจำไว้จนกว่าข้อมูลจะเปลี่ยน (ไม่คำนวณใหม่ทุกครั้งที่กดเมนูหรือพิมพ์)
  const requests = data?.requests;
  const active = useMemo(() => assets.filter(a => a.lifecycle === 'active'), [assets]);
  const total = useMemo(() => active.reduce((s, a) => s + a.totalSatang, 0), [active]);
  const pending = useMemo(() => requests?.filter((r: Any) => r.status === 'pending') || [], [requests]);
  const awaiting = useMemo(() => awaitingApprovalByAsset(requests || [], assets), [requests, assets]);
  const me = data?.me;
  const pendingForMe = useMemo(
    () => (me ? pendingForUser(requests || [], me, assets).length : 0),
    [requests, me, assets],
  );
  const editable = data && ['staff', 'admin'].includes(data.me.role);
  const handleScanRegistry = (scannedText: string) => {
    let cleanCode = scannedText.trim();
    try {
      if (cleanCode.startsWith('http://') || cleanCode.startsWith('https://')) {
        const url = new URL(cleanCode);
        const assetParam = url.searchParams.get('asset');
        if (assetParam) cleanCode = assetParam;
      } else {
        const match = cleanCode.match(/[?&]asset=([^&]+)/);
        if (match) cleanCode = decodeURIComponent(match[1]);
      }
    } catch {}
    const target = cleanCode.toLowerCase();
    const rawTarget = scannedText.trim().toLowerCase();
    const found = (data?.assets || []).find(
      (a: Asset) =>
        a.id.toLowerCase() === target ||
        a.code.toLowerCase() === target ||
        a.code.toLowerCase() === rawTarget ||
        (a.serial && a.serial.toLowerCase() === target) ||
        (a.serial && a.serial.toLowerCase() === rawTarget),
    );
    if (found) {
      setScannerOpen(false);
      setSelected(found);
      toast.success(`พบครุภัณฑ์: ${found.name}`, { description: `หมายเลข: ${found.code}` });
      return true;
    } else {
      toast.error(`ไม่พบครุภัณฑ์ '${scannedText}' ในทะเบียน`);
      return false;
    }
  };
  if (loading)
    return (
      <div className="loading-box">
        <Package size={36} />
        <h1 className="my-6">ทะเบียนครุภัณฑ์</h1>
        <Skeleton className="h-14 w-full mb-4" />
        <Skeleton className="h-40 w-full" />
        <p className="mt-5">กำลังโหลดทะเบียน…</p>
      </div>
    );
  if (!data)
    return (
      <LoginScreen
        email={email}
        onEmail={setEmail}
        password={password}
        onPassword={setPassword}
        loggingIn={loggingIn}
        error={error}
        onSubmit={handleLogin}
      />
    );
  const heading = nav.find(x => x[0] === view)?.[1];
  return (
    <SidebarProvider style={{ '--sidebar-width': '250px' } as React.CSSProperties}>
      <AppSidebar
        view={view}
        onSelect={switchView}
        pendingCount={pendingForMe}
        me={data.me}
        onChangePassword={() => open('password')}
      />

      <SidebarInset className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <SidebarTrigger className="text-slate-300 hover:text-white hover:bg-slate-800" />
            <div className="flex items-center min-w-0">
              {/* Short title on mobile */}
              <b className="text-white text-xs font-semibold tracking-wide truncate sm:hidden">
                ระบบครุภัณฑ์ · คณะวิศวกรรมฯ
              </b>
              {/* Full title on sm+ */}
              <b className="text-white text-[14px] font-semibold tracking-wide truncate hidden sm:block max-w-[420px] lg:max-w-none">
                ระบบบริหารจัดการครุภัณฑ์ · คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์
              </b>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell
              data={data}
              onGo={v => {
                setSelected(null);
                setView(v);
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-8 px-3 text-xs bg-slate-800 text-slate-200 hover:bg-rose-900/60 hover:text-rose-200 border border-slate-700/50 cursor-pointer"
            >
              <LogOut size={13} className="mr-1.5" /> ออกจากระบบ
            </Button>
          </div>
        </header>
        <main className="workspace">
          {selected ? (
            <AssetDetailView
              asset={selected}
              awaiting={awaiting.get(selected.id)}
              onBack={() => setSelected(null)}
              editable={Boolean(editable)}
              onEdit={() => open('edit', { asset: selected })}
              onRequest={() => open('request', { asset: selected })}
              onSplit={() => open('split', { asset: selected })}
              onRepairComplete={() => open('repairComplete', { asset: selected })}
              onVoid={() => open('void', { asset: selected })}
              onRestore={() => open('restore', { asset: selected })}
              onSelectAsset={a => setSelected(a)}
              onPhotoChanged={reload}
              rounds={data.rounds}
              funds={data.funds}
              onCheckRound={async roundId => {
                try {
                  const d = await api('?view=stocktake&round=' + encodeURIComponent(roundId));
                  const item = (d as Any).items.find((x: Any) => x.assetId === selected.id);
                  if (item) open('check', { item });
                  else toast.info('รายการนี้ไม่ได้อยู่ในทะเบียน ณ วันที่เปิดรอบ');
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>{heading}</h1>
                  <p>{viewDescription(view, active.length)}</p>
                </div>
                <div className="actions">
                  {view === 'registry' && (
                    <>
                      {editable && (
                        <Button
                          className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer"
                          onClick={() =>
                            open('create', { initialBranch: registry.branch !== 'all' ? registry.branch : '' })
                          }
                        >
                          <Plus size={16} className="mr-1" />
                          เพิ่มครุภัณฑ์
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {error && <div className="error mb-4">{error}</div>}

              {view === 'overview' && (
                <OverviewDashboard
                  data={data}
                  assets={assets}
                  active={active}
                  total={total}
                  pending={pending}
                  onSelectBranch={b => {
                    registry.setBranch(b);
                    switchView('registry');
                  }}
                  onOpenView={switchView}
                  onOpenAsset={found => {
                    setView('registry');
                    setSelected(found);
                  }}
                />
              )}

              {view === 'registry' && (
                <RegistryView
                  registry={registry}
                  assets={assets}
                  activeCount={active.length}
                  awaiting={awaiting}
                  editable={Boolean(editable)}
                  busy={busy}
                  open={open}
                  onSelect={setSelected}
                  onScan={() => setScannerOpen(true)}
                  onExport={() => {
                    setExportPreset({ branch: registry.branch !== 'all' ? registry.branch : '' });
                    setExportOpen(true);
                  }}
                  onOpenImports={() => switchView('imports')}
                />
              )}
              {view === 'imports' && (
                <ImportView
                  data={{ me: data.me, imports: data.imports }}
                  open={open}
                  revision={revision}
                  reload={reload}
                />
              )}
              {['requests', 'stocktakes', 'reports', 'users', 'audit'].includes(view) && (
                <Operations
                  view={view}
                  data={data}
                  open={open}
                  write={write}
                  busy={busy}
                  revision={revision}
                  select={setSelected}
                  onExport={(branch, fiscalYear) => {
                    setExportPreset({ branch, fiscalYear });
                    setExportOpen(true);
                  }}
                />
              )}
            </>
          )}
        </main>
      </SidebarInset>
      <Editor
        onPhotoChanged={reload}
        data={data}
        setSelected={setSelected}
        modal={modal}
        setModal={setModal}
        write={write}
        busy={busy}
        error={formError}
        setError={setFormError}
      />
      {modal?.kind === 'bulkEdit' && (
        <BulkEditModal
          assets={modal.assets}
          busy={busy}
          error={formError}
          onClose={() => setModal(null)}
          onSubmit={async body => {
            if (await write(body)) registry.clearSelection();
          }}
        />
      )}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanRegistry}
        title="สแกนค้นหาครุภัณฑ์"
        description="ส่องกล้องไปที่ป้าย QR เพื่อเปิดดูข้อมูลครุภัณฑ์"
      />
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-600" />
              ส่งออกรายงานครุภัณฑ์เป็น Excel
            </DialogTitle>
            <DialogDescription>เลือกรายงาน สาขา และประเภท แล้วกดส่งออก</DialogDescription>
          </DialogHeader>
          {exportOpen && (
            <ExportView
              data={data}
              initialBranch={exportPreset.branch}
              initialFiscalYear={exportPreset.fiscalYear}
              onDone={() => setExportOpen(false)}
              write={write}
              busy={busy}
            />
          )}
        </DialogContent>
      </Dialog>
      <Toaster theme="light" position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
}
