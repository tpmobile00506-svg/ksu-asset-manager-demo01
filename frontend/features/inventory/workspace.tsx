'use client';
import {useState,useEffect,useCallback,useRef} from 'react';import {Package,LayoutDashboard,Upload,ArrowLeftRight,QrCode,BarChart3,Users,History,Plus,Search,Download,ChevronRight,ArrowUpDown,FileSpreadsheet,Coins,TriangleAlert,FileCheck2,ArrowRight,LogOut,Pencil,X,Bell,Lock,Eye,EyeOff,Check,Eye as ViewIcon,ScanLine,Wrench,CheckCircle2,ClipboardCheck,Clock} from 'lucide-react';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';import {SidebarProvider,Sidebar,SidebarContent,SidebarHeader,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarInset,SidebarTrigger,useSidebar} from '@/components/ui/sidebar';import {Skeleton} from '@/components/ui/skeleton';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';import {Toaster,toast} from 'sonner';
import {Asset,Role,roles,conditions,headers11,money,standardBranches,thaiDateOnly,fiscalYearOf,awaitsApprovalBy,groupFor,assetGroups,branchAbbr,conditionSummary,awaitingApprovalByAsset} from '@/shared/domain';import {reportHeaders} from '@/frontend/services/excel-export';import {Any,api,Badge,ConditionBadge,Pick,Empty,Metric,Pager,Activity,getInitials,SESSION_EXPIRED_EVENT,readApiResponse,cancelApiRequests} from '@/frontend/components/common';import {useAssetTools} from '@/frontend/hooks/use-asset-tools';import Editor from './editor';import AssetThumbnail from './asset-thumbnail';import ImportView from '@/frontend/features/imports/import-view';import ExportView from '@/frontend/features/exports/export-view';import Operations from '@/frontend/features/operations/operations';import OverviewCharts from './overview-charts';import AssetDetailView from './asset-detail-view';
import QrScannerModal from '@/frontend/components/qr-scanner-modal';
import BulkEditModal from './bulk-edit-modal';
import {RowActions} from './row-actions';
import {WorkspaceData} from '@/frontend/types/models';
const nav=[['overview','ภาพรวม (Dashboard)',LayoutDashboard],['registry','ทะเบียนครุภัณฑ์',Package],['imports','นำเข้าข้อมูล Excel',Upload],['requests','คำขอและโอนย้าย',ArrowLeftRight],['stocktakes','ตรวจนับประจำปี (QR)',QrCode],['reports','รายงานและค่าเสื่อม',BarChart3],['audit','ประวัติการทำงาน (Audit)',History],['users','ผู้ใช้งานและสิทธิ์',Users]] as const;

function formatImportDate(isoStr?: string, receivedDate?: string) {
  if (!isoStr && !receivedDate) return { main: '—', sub: '' };
  try {
    const d = isoStr ? new Date(isoStr) : null;
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let main = '—';
    let sub = '';

    if (d && !isNaN(d.getTime())) {
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = (d.getFullYear() + 543) % 100;
      main = `${day} ${month} ${year}`;

      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) sub = 'เมื่อสักครู่';
      else if (mins < 60) sub = `${mins} น.ที่แล้ว`;
      else {
        const hours = Math.floor(mins / 60);
        if (hours < 24) sub = `${hours} ชม.ที่แล้ว`;
        else {
          const days = Math.floor(hours / 24);
          if (days === 1) sub = 'เมื่อวานนี้';
          else if (days < 30) sub = `${days} วันที่แล้ว`;
          else sub = `${Math.floor(days / 30)} ด.ที่แล้ว`;
        }
      }
    } else if (receivedDate) {
      main = thaiDateOnly(receivedDate);
    }

    if (receivedDate && receivedDate !== main) {
      sub = `รับ: ${thaiDateOnly(receivedDate)}`;
    }

    return { main, sub };
  } catch {
    return { main: isoStr || receivedDate || '—', sub: '' };
  }
}

type NavEntry = readonly [string, string, React.ComponentType<{ className?: string }>];

function NavList({
  items,
  view,
  onSelect,
  pendingCount,
  isAdmin
}: {
  items: readonly NavEntry[];
  view: string;
  onSelect: (k: string) => void;
  pendingCount: number;
  isAdmin: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.filter(x => x[0] !== 'users' || isAdmin).map(([key, label, Icon]) => (
        <SidebarMenuItem key={key}>
          <SidebarMenuButton
            className="nav-item"
            isActive={view === key}
            onClick={() => {
              onSelect(key);
              if (isMobile) setOpenMobile(false);
            }}
          >
            <Icon className={view === key ? 'text-blue-300' : 'text-slate-400'} />
            <span>{label}</span>
            {key === 'requests' && pendingCount > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                {pendingCount}
              </span>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export default function Workspace(){
 const [data,setData]=useState<WorkspaceData|null>(null),[error,setError]=useState(''),[view,setView]=useState('overview'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(''),[branch,setBranch]=useState('all'),[condition,setCondition]=useState('all'),[category,setCategory]=useState('all'),[lifecycle,setLifecycle]=useState('active'),[page,setPage]=useState(0),[sort,setSort]=useState<{key:keyof Asset;dir:number}>({key:'createdAt',dir:-1});
 const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
 const [modal,setModal]=useState<Any|null>(null),[selected,setSelected]=useState<Asset|null>(null),[formError,setFormError]=useState(''),[revision,setRevision]=useState(0);
 const [scannerOpen, setScannerOpen] = useState(false);
 const [exportOpen, setExportOpen] = useState(false);
 const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [loggingIn, setLoggingIn] = useState(false);
 const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
 const [notifOpen, setNotifOpen] = useState(false);
 const notifRef = useRef<HTMLDivElement>(null);
 const hadSession=useRef(false),sessionGeneration=useRef(0),reloadGeneration=useRef(0);
 const clearSession=useCallback(()=>{
   const expired=hadSession.current;
   sessionGeneration.current++;reloadGeneration.current++;cancelApiRequests();hadSession.current=false;
   setData(null);setModal(null);setSelected(null);setPassword('');setView('overview');setBusy(false);setLoading(false);
   setSearch('');setBranch('all');setCondition('all');setCategory('all');setLifecycle('active');setPage(0);setSelectedAssetIds([]);
   setNotifOpen(false);
   if(expired)setError('หมดเวลาเข้าใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง');
 },[]);
 const reload=useCallback(async()=>{
   const generation=sessionGeneration.current,request=++reloadGeneration.current;
   const current=()=>generation===sessionGeneration.current&&request===reloadGeneration.current;
   try{const next=await api<WorkspaceData>();if(current()){setData(next);setSelected(current=>current?next.assets.find((a:Asset)=>a.id===current.id)||null:null);setRevision(n=>n+1);hadSession.current=true;setError('');}}
   catch(e:any){if(current()){if(e.status===401)clearSession();else if(e.name!=='AbortError')setError(e.message);}}
   finally{if(current()){setLoading(false);}}
 },[clearSession]);
 useEffect(()=>{window.addEventListener(SESSION_EXPIRED_EVENT,clearSession);return()=>window.removeEventListener(SESSION_EXPIRED_EVENT,clearSession);},[clearSession]);
 useEffect(()=>{const refreshOnFocus=()=>{if(hadSession.current)void reload();};window.addEventListener('focus',refreshOnFocus);return()=>window.removeEventListener('focus',refreshOnFocus);},[reload]);
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
 const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    sessionGeneration.current++;cancelApiRequests();
    setLoggingIn(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const text = await res.text();
      let result: Any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = {};
      }
      if (!res.ok) {
        throw new Error(result.error || (res.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ'));
      }
      setPassword('');
      // เข้าสู่ระบบใหม่เริ่มที่หน้าภาพรวมเสมอ: ล้าง ?view= ที่ค้างจากรอบก่อน/ผู้ใช้ก่อน (เดิมออกจากระบบที่หน้าประวัติ ล็อกอินกลับมาก็ไปหน้าประวัติ)
      // เก็บ ?asset= ไว้ ลิงก์จาก QR ที่ต้องล็อกอินก่อนยังเปิดรายการนั้นได้ ส่วนการรีเฟรชระหว่างใช้งานไม่ผ่านตรงนี้ จึงยังอยู่หน้าเดิม
      const url = new URL(location.href);
      if (url.searchParams.has('view')) { url.searchParams.delete('view'); history.replaceState(null, '', url); }
      await reload();
    } catch (err: any) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoggingIn(false);
    }
  };
  const handleLogout = async () => {
    try { await readApiResponse(await fetch('/api/auth/logout', { method: 'POST' }));clearSession();setError('');history.replaceState(null, '', location.pathname); } catch { toast.error('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่'); }
  };
 useEffect(()=>{reload();},[reload]);useEffect(()=>{setPage(0);setSelectedAssetIds([]);},[search,branch,condition,category,lifecycle,view]);
 useEffect(()=>{if(data){const a=new URL(location.href).searchParams.get('asset');if(a){const found=data.assets.find((x:Asset)=>x.id===a);if(found){setView('registry');setSelected(found);}}}},[!!data]);
 // เก็บหน้าที่เปิดอยู่ไว้ใน URL (?view=) เพื่อให้ปุ่ม Back, รีเฟรช และแชร์ลิงก์ใช้ได้
 const viewFromUrl=()=>{const v=new URL(location.href).searchParams.get('view')||'overview';return nav.some(n=>n[0]===v)&&(v!=='users'||data?.me.role==='admin')?v:'overview';};
 useEffect(()=>{if(data&&!new URL(location.href).searchParams.get('asset'))setView(viewFromUrl());},[!!data]);
 useEffect(()=>{if(!data)return;const url=new URL(location.href);if(url.searchParams.get('asset')&&view==='registry')return;if((url.searchParams.get('view')||'overview')===view)return;url.searchParams.delete('asset');url.searchParams.set('view',view);history.pushState(null,'',url);},[view,!!data]);
 useEffect(()=>{const onPop=()=>{setSelected(null);setView(viewFromUrl());};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);});
 const open=(kind:string,rest:Any={})=>{setFormError('');setModal({kind,token:crypto.randomUUID(),...rest});};
 const write=async(body:Any)=>{
   const generation=sessionGeneration.current;
   setBusy(true);setFormError('');
   try{const r=await api('',{token:modal?.token||crypto.randomUUID(),...body});if(generation!==sessionGeneration.current)return null;await reload();if(generation!==sessionGeneration.current)return null;setModal(null);setSelected(null);toast.success('บันทึกเรียบร้อยแล้ว');return r;}
   catch(e:any){if(generation===sessionGeneration.current&&e.name!=='AbortError'){setFormError(e.message);toast.error(e.message);}return null;}
   finally{if(generation===sessionGeneration.current)setBusy(false);}
 };
 useAssetTools(data?.assets||[],open);
 const switchView=(v:string)=>{setSelected(null);setView(v);setSearch('');void reload();};
 const assets:Asset[]=data?.assets||[],active=assets.filter(a=>a.lifecycle==='active');
 const total=active.reduce((s,a)=>s+a.totalSatang,0),quantity=active.reduce((s,a)=>s+a.quantity,0),damaged=active.filter(a=>a.condition==='damaged').reduce((s,a)=>s+a.quantity,0),pending=data?.requests.filter((r:Any)=>r.status==='pending')||[],conditionCount=conditionSummary(assets),awaiting=awaitingApprovalByAsset(data?.requests||[],assets);
 const editable=data&&['staff','admin'].includes(data.me.role);
 const filtered=assets.filter(a=>(lifecycle==='all'||a.lifecycle===lifecycle)&&(branch==='all'||a.branch===branch)&&(category==='all'||groupFor(a)===category)&&(condition==='all'||a.condition===condition)&&[a.code,a.name,a.serial,a.location,a.branch,a.groupName].join(' ').toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>{const av=a[sort.key]??'',bv=b[sort.key]??'';const main=(typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'th',{numeric:true}))*sort.dir;
   // ค่าเท่ากัน (เช่น แยกรายชิ้นพร้อมกัน วันที่นำเข้าเดียวกัน) เรียงตามรหัสแบบตัวเลข: (1), (2), … (10) ไม่ใช่ (1), (10), (2)
   return main||a.code.localeCompare(b.code,'th',{numeric:true});});
 const pageAssets=filtered.slice(page*40,(page+1)*40);
 const isAllPageSelected=pageAssets.length>0&&pageAssets.every(a=>selectedAssetIds.includes(a.id));
 const isSomePageSelected=pageAssets.some(a=>selectedAssetIds.includes(a.id));
 const selectedActiveAssets=filtered.filter(a=>selectedAssetIds.includes(a.id)&&a.lifecycle==='active');
 const toggleSelectAsset=(id:string,e?:React.MouseEvent|React.ChangeEvent)=>{if(e&&'stopPropagation' in e)e.stopPropagation();setSelectedAssetIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);};
 const toggleSelectAllPage=()=>{if(isAllPageSelected){const pageIds=new Set(pageAssets.map(x=>x.id));setSelectedAssetIds(prev=>prev.filter(id=>!pageIds.has(id)));}else{const next=new Set([...selectedAssetIds,...pageAssets.map(x=>x.id)]);setSelectedAssetIds(Array.from(next));}};
 const selectAllFiltered=()=>{setSelectedAssetIds(filtered.map(x=>x.id));};
 const clearSelection=()=>{setSelectedAssetIds([]);};
 const branchTotals=Object.entries(active.reduce((s:Record<string,number>,a)=>{s[a.branch]=(s[a.branch]||0)+a.totalSatang;return s;},{})).sort((a,b)=>b[1]-a[1]);
 const handleScanRegistry=(scannedText:string)=>{
   let cleanCode=scannedText.trim();
   try{
     if(cleanCode.startsWith('http://')||cleanCode.startsWith('https://')){
       const url=new URL(cleanCode);
       const assetParam=url.searchParams.get('asset');
       if(assetParam)cleanCode=assetParam;
     }else{
       const match=cleanCode.match(/[?&]asset=([^&]+)/);
       if(match)cleanCode=decodeURIComponent(match[1]);
     }
   }catch{}
   const target=cleanCode.toLowerCase();
   const rawTarget=scannedText.trim().toLowerCase();
   const found=(data?.assets||[]).find((a:Asset)=>
     a.id.toLowerCase()===target||
     a.code.toLowerCase()===target||
     a.code.toLowerCase()===rawTarget||
     (a.serial&&a.serial.toLowerCase()===target)||
     (a.serial&&a.serial.toLowerCase()===rawTarget)
   );
   if(found){
     setScannerOpen(false);
     setSelected(found);
     toast.success(`พบครุภัณฑ์: ${found.name}`,{description:`รหัส: ${found.code}`});
     return true;
   }else{
     toast.error(`ไม่พบครุภัณฑ์ '${scannedText}' ในทะเบียน`);
     return false;
   }
 };
 if(loading)return <div className="loading-box"><Package size={36}/><h1 className="my-6">ทะเบียนครุภัณฑ์</h1><Skeleton className="h-14 w-full mb-4"/><Skeleton className="h-40 w-full"/><p className="mt-5">กำลังเชื่อมต่อทะเบียนกลาง…</p></div>;
  if(!data)return (
    <div className="min-h-screen w-full relative flex flex-col justify-between bg-[#f0f4f9] overflow-hidden py-4 sm:py-8 px-3 sm:px-4 font-sans">
      <div className="absolute top-10 left-10 w-96 h-96 rounded-full bg-[#e0eaf8] blur-3xl pointer-events-none opacity-80" />
      <div className="absolute bottom-10 right-10 w-[30rem] h-[30rem] rounded-full bg-[#e2ebf8] blur-3xl pointer-events-none opacity-80" />
      <div className="absolute top-1/3 right-1/4 w-60 h-60 rounded-full bg-[#e8eff9] blur-2xl pointer-events-none opacity-60" />

      <header className="relative z-10 max-w-6xl w-full mx-auto flex items-center gap-3 sm:gap-4 pt-2 sm:pt-3 pb-3 sm:pb-5">
        <div className="w-12 h-12 sm:w-[68px] sm:h-[68px] rounded-xl sm:rounded-2xl bg-white p-1.5 sm:p-2.5 shadow-xs sm:shadow-sm border border-slate-200/90 flex items-center justify-center shrink-0">
          <img src="/logo-university.png" alt="ตราสัญลักษณ์ มหาวิทยาลัยกาฬสินธุ์" className="w-full h-full object-contain" />
        </div>
        <div>
          <h2 className="text-[#0f172a] text-sm sm:text-xl font-bold leading-tight tracking-tight">
            มหาวิทยาลัยกาฬสินธุ์ · KALASIN UNIVERSITY
          </h2>
          <p className="text-slate-600 text-sm mt-0.5 font-medium">
            คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม
          </p>
        </div>
      </header>

      <div className="relative z-10 max-w-[460px] w-full mx-auto my-auto bg-white rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-200/80 p-5 sm:p-9 transition-all">
        <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
          <div className="w-18 h-18 sm:w-[104px] sm:h-[104px] rounded-xl sm:rounded-2xl bg-white border border-slate-200/90 p-2 sm:p-3 shadow-sm sm:shadow-md flex items-center justify-center mb-3 sm:mb-4 hover:shadow-lg transition-shadow">
            <img src="/logo-faculty.png" alt="คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
            เข้าสู่ระบบ
          </h1>
          <span className="text-sm sm:text-base font-bold text-[#1d4ed8] mt-0.5 sm:mt-1">
            ระบบบริหารจัดการครุภัณฑ์
          </span>
          <span className="text-sm text-slate-500 mt-0.5">
            คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม
          </span>
        </div>

        <div className="h-px w-full bg-slate-100 mb-5 sm:mb-6" />

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-start gap-2" role="alert">
            <TriangleAlert size={16} className="shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
          <div>
            <label htmlFor="login-email" className="block text-sm font-bold text-slate-700 mb-1.5">
              อีเมล / บัญชีผู้ใช้งาน
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-400 pointer-events-none">
                <Users size={17} />
              </span>
              <Input
                id="login-email"
                name="email"
                autoComplete="off"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="กรอกอีเมลหรือชื่อบัญชีผู้ใช้งาน"
                className="pl-10 h-11 bg-slate-50/70 border-slate-300 text-sm focus:bg-white transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-bold text-slate-700 mb-1.5">
              รหัสผ่าน (Password)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-400 pointer-events-none">
                <Lock size={17} />
              </span>
              <Input
                id="login-password"
                name="password"
                aria-label="รหัสผ่าน"
                autoComplete="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                className="pl-10 pr-10 h-11 bg-slate-50/70 border-slate-300 text-sm focus:bg-white transition-colors tracking-wide"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg cursor-pointer"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end text-sm pt-1">
            <button
              type="button"
              onClick={() => setForgotPasswordOpen(true)}
              className="text-[#2563eb] hover:underline font-bold cursor-pointer py-2 px-1 shrink-0 whitespace-nowrap"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>

          <Button
            type="submit"
            disabled={loggingIn}
            className="w-full h-11 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm rounded-lg shadow-md shadow-blue-500/20 transition-all mt-2 cursor-pointer"
          >
            {loggingIn ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ (Sign In)'}
          </Button>

          <div className="mt-4 p-2.5 rounded-lg bg-slate-100/90 border border-slate-200/70 text-center">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              รองรับ 5 สิทธิ์: เจ้าหน้าที่พัสดุ · หัวหน้าสาขา · รองคณบดี · คณบดี · ผู้ดูแลระบบ
            </p>
          </div>
        </form>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock size={18} className="text-[#2563eb]" />ลืมรหัสผ่าน</DialogTitle>
            <DialogDescription>กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อตั้งรหัสผ่านใหม่</DialogDescription>
          </DialogHeader>
          <Button type="button" onClick={() => setForgotPasswordOpen(false)} className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold">รับทราบ</Button>
        </DialogContent>
      </Dialog>

      <footer className="relative z-10 text-center text-xs text-slate-400 py-3 mt-4">
        © 2026 ระบบบริหารจัดการครุภัณฑ์ คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์
      </footer>
    </div>
  );
 const heading=nav.find(x=>x[0]===view)?.[1];
  return (
    <SidebarProvider style={{'--sidebar-width':'250px'} as React.CSSProperties}>
      <Sidebar>
        <SidebarHeader className="p-0 border-b border-slate-800/80">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-sm border border-slate-700/60 overflow-hidden">
              <img src="/logo-faculty.png" alt="คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <strong className="text-white text-[15px] font-bold block leading-tight truncate">ระบบครุภัณฑ์</strong>
              <small className="text-slate-300 text-xs block mt-0.5 font-medium truncate">คณะวิศวกรรมศาสตร์ฯ</small>
              <small className="text-slate-400 text-[10px] block leading-tight truncate">มหาวิทยาลัยกาฬสินธุ์</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <div className="nav-caption">พื้นที่ทำงาน</div>
          <NavList
            items={nav as unknown as readonly NavEntry[]}
            view={view}
            onSelect={switchView}
            pendingCount={pending.length}
            isAdmin={data.me.role === 'admin'}
          />
        </SidebarContent>
        <SidebarFooter className="p-3 border-t border-slate-800/80">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-800/90 border border-slate-700/60">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm leading-none">
              {getInitials(data.me.name)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-xs font-bold text-slate-100 truncate">{data.me.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{data.me.email}</div>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

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
          {(() => {
            // ผู้อนุมัติ (head/deputy/dean) เห็นเฉพาะคำขอที่รอตัวเองอนุมัติ (เงื่อนไขเดียวกับหน้าคำขอ)
            // staff/admin เห็นคำขอค้างทั้งหมดและรอบตรวจนับที่เปิดอยู่ เพราะเป็นผู้ติดตามงาน
            const approver = ['head', 'deputy', 'dean', 'tester'].includes(data.me.role);
            const awaitsMe = (r: WorkspaceData['requests'][number]) => awaitsApprovalBy(r, data.me, data.assets.find((a: Asset) => a.id === r.assetId)?.branch);
            const pendingRequests = data.requests?.filter(r => r.status === 'pending' && (!approver || awaitsMe(r))) || [];
            const openRounds = approver ? [] : data.rounds?.filter((r: Any) => r.status === 'open') || [];
            const totalNotifications = pendingRequests.length + openRounds.length;

            return (
              <div className="flex items-center gap-3 shrink-0">
                {/* Notification Bell with Dropdown */}
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
                      className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 text-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
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
                            <p className="text-[11px] text-slate-500 mt-0.5">คำขอและการตรวจนับทั้งหมดได้รับการจัดการเรียบร้อยแล้ว</p>
                          </div>
                        ) : (
                          <>
                            {/* Pending Requests Section */}
                            {pendingRequests.length > 0 && (
                              <div className="p-2">
                                <div className="px-2 py-1 text-[11px] font-bold text-slate-600 flex items-center justify-between">
                                  <span>คำขอที่รอการดำเนินการ ({pendingRequests.length})</span>
                                </div>
                                <div className="space-y-1 mt-1">
                                  {pendingRequests.slice(0, 5).map((r: Any) => {
                                    const kindLabel = 
                                      r.kind === 'transfer' ? 'คำขอโอนย้าย' :
                                      r.kind === 'repair' ? 'แจ้งส่งซ่อม' :
                                      r.kind === 'dispose' || r.kind === 'disposal' ? 'ขอจำหน่าย' : 'คำขอ';
                                    const IconComp = 
                                      r.kind === 'transfer' ? ArrowLeftRight :
                                      r.kind === 'repair' ? Wrench :
                                      TriangleAlert;
                                    const badgeColor = 
                                      r.kind === 'transfer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                      r.kind === 'repair' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      'bg-rose-50 text-rose-700 border-rose-200';
                                    const dateInfo = formatImportDate(r.createdAt);

                                    return (
                                      <div
                                        key={r.id}
                                        onClick={() => {
                                          setSelected(null);
                                          setView('requests');
                                          setNotifOpen(false);
                                        }}
                                        className="p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer transition-all"
                                      >
                                        <div className="flex items-start gap-2.5">
                                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${badgeColor}`}>
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
                                                {r.reason ? `เหตุผล: ${r.reason}` : 'รอการพิจารณา'}
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
                                      onClick={() => { setSelected(null); setView('requests'); setNotifOpen(false); }}
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
                                          setSelected(null);
                                          setView('stocktakes');
                                          setNotifOpen(false);
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
                          onClick={() => { setSelected(null); setView('requests'); setNotifOpen(false); }}
                          className="flex-1 text-center py-1.5 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px] transition-colors cursor-pointer"
                        >
                          คำขอและโอนย้าย
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelected(null); setView('stocktakes'); setNotifOpen(false); }}
                          className="flex-1 text-center py-1.5 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px] transition-colors cursor-pointer"
                        >
                          ตรวจนับประจำปี
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLogout} 
                  className="h-8 px-3 text-xs bg-slate-800 text-slate-200 hover:bg-rose-900/60 hover:text-rose-200 border border-slate-700/50 cursor-pointer"
                >
                  <LogOut size={13} className="mr-1.5" /> ออกจากระบบ
                </Button>
              </div>
            );
          })()}
        </header>
  <main className="workspace">
    {selected ? (
      <AssetDetailView
        asset={selected}
        awaiting={awaiting.get(selected.id)}
        onBack={()=>setSelected(null)}
        editable={Boolean(editable)}
        onEdit={()=>open('edit',{asset:selected})}
        onRequest={()=>open('request',{asset:selected})}
        onSplit={()=>open('split',{asset:selected})}
        onRepairComplete={()=>open('repairComplete',{asset:selected})}
        onVoid={()=>open('void',{asset:selected})}
        onRestore={()=>open('restore',{asset:selected})}
        onSelectAsset={(a)=>setSelected(a)}
        onPhotoChanged={reload}
        rounds={data.rounds}
        funds={data.funds}
        onCheckRound={async (roundId) => {
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
            <p>{({
              registry: `ค้นหา ตรวจสอบข้อมูล ติดตามสถานะ และจัดการประวัติรายการครุภัณฑ์ทั้งหมด (${active.length.toLocaleString('th-TH')} รายการ)`,
              overview: `สรุปมูลค่าสินทรัพย์ การกระจายตัวตามสาขาวิชา และความพร้อมใช้งานประจำปีงบประมาณ ${fiscalYearOf(new Date())}`,
              imports: 'ตรวจสอบข้อมูลจาก Excel ก่อนเพิ่มเข้าสู่ทะเบียนกลาง',
              requests: 'ติดตามสถานะสายอนุมัติ 3 ระดับ: หัวหน้าสาขาวิชา (Head) → รองคณบดี (Deputy) → คณบดี (Dean)',
              stocktakes: 'ตรวจสอบรายการจริงในพื้นที่เทียบกับฐานข้อมูลทะเบียนกลาง',
              reports: 'คำนวณค่าเสื่อมราคาวิธีเส้นตรง (Straight-Line Depreciation) อัตราตามระเบียบกระทรวงการคลัง',
              users: 'กำหนดสิทธิ์การเข้าถึงข้อมูลตามลำดับขั้นสายอนุมัติ: Staff → Head → Deputy → Dean → Admin',
              audit: 'ผู้ดำเนินการ เวลา และรายละเอียดการเปลี่ยนแปลงของทุกรายการ'
            } as Any)[view]}</p>
          </div>
          <div className="actions">
            {view==='registry'&&<>
              {editable&&<Button className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer" onClick={()=>open('create')}><Plus size={16} className="mr-1"/>เพิ่มครุภัณฑ์</Button>}
            </>}

          </div>
        </div>
        {error&&<div className="error mb-4">{error}</div>}

        {view==='overview'&&<>
          {/* 4 Dashboard Overview KPI Cards matching desktop_2_dashboard.svg */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Package size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-500 font-medium block">ครุภัณฑ์ทั้งหมดในระบบ</span>
                <strong className="text-xl font-bold text-slate-900 block leading-tight">{active.length.toLocaleString('th-TH')} รายการ</strong>
                <span className="text-[11px] font-bold text-blue-600 block mt-0.5">มูลค่ารวม {money(total)} บาท</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <Check size={22} className="stroke-[3]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-500 font-medium block">สภาพปกติพร้อมใช้งาน</span>
                <strong className="text-xl font-bold text-emerald-600 block leading-tight">
                  {active.filter(a=>a.condition==='normal').length.toLocaleString('th-TH')} รายการ ({active.length ? ((active.filter(a=>a.condition==='normal').length/active.length)*100).toFixed(1) : 0}%)
                </strong>
                <span className="text-[11px] text-emerald-700 block mt-0.5">ใช้งานในห้องปฏิบัติการและสำนักงาน</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                <TriangleAlert size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-500 font-medium block">ชำรุด / ส่งซ่อม</span>
                <strong className="text-xl font-bold text-rose-600 block leading-tight">
                  {(conditionCount.damaged+conditionCount.repair).toLocaleString('th-TH')} รายการ
                </strong>
                <span className="text-[11px] text-rose-700 block mt-0.5">
                  ชำรุด {conditionCount.damaged.toLocaleString('th-TH')} · กำลังซ่อม {conditionCount.repair.toLocaleString('th-TH')} · จำหน่ายแล้ว {conditionCount.disposed.toLocaleString('th-TH')}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <FileCheck2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-500 font-medium block">คำขอรอการอนุมัติ</span>
                <strong className="text-xl font-bold text-amber-600 block leading-tight">{pending.length} รายการ</strong>
                <span className="text-[11px] text-amber-700 block mt-0.5">
                  โอนย้าย {pending.filter((r:Any)=>r.kind==='transfer').length} · ซ่อม {pending.filter((r:Any)=>r.kind==='repair').length} · อื่นๆ {pending.filter((r:Any)=>r.kind!=='transfer'&&r.kind!=='repair').length}
                </span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <OverviewCharts assets={assets} onSelectBranch={(b)=>{setBranch(b);switchView('registry');}}/>

          {/* Bottom Section: Recent Activities & Requests Table matching desktop_2_dashboard.svg */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden mb-6">
            <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">รายการความเคลื่อนไหวและคำขอล่าสุด (Recent Activities)</h2>
                <p className="text-xs text-slate-500 mt-0.5">คำขอโอนย้าย ซ่อมบำรุง และจำหน่ายล่าสุดในระบบ</p>
              </div>
              <button 
                type="button" 
                onClick={()=>switchView('requests')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                ดูคำขอทั้งหมด →
              </button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 text-slate-600 text-xs">
                    <TableHead className="font-bold">รหัสคำขอ</TableHead>
                    <TableHead className="font-bold">ประเภทคำขอ</TableHead>
                    <TableHead className="font-bold">รายการครุภัณฑ์ / รหัส</TableHead>
                    <TableHead className="font-bold">ผู้ยื่นคำขอ</TableHead>
                    <TableHead className="font-bold">สถานะคำขอ</TableHead>
                    <TableHead className="font-bold text-right">เวลาทำรายการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.requests || []).slice(0, 5).map((req: Any) => (
                    <TableRow 
                      key={req.id} 
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                      onClick={() => {
                        const found = assets.find(a => a.id === req.assetId || a.code === req.code);
                        if (found) {
                          setView('registry');
                          setSelected(found);
                        } else {
                          switchView('requests');
                        }
                      }}
                    >
                      <TableCell className="font-mono text-xs font-bold text-blue-600">
                        {req.requestNo}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          req.kind === 'transfer' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          req.kind === 'repair' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {req.kind === 'transfer' ? 'โอนย้ายสถานที่' : req.kind === 'repair' ? 'แจ้งส่งซ่อม' : 'ขอจำหน่าย'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-xs text-slate-900 line-clamp-1">{req.name || 'ครุภัณฑ์'}</div>
                        <div className="font-mono text-[11px] text-slate-500">{req.code || '—'}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {req.requesterName || 'ไม่พบชื่อผู้ยื่น'}
                      </TableCell>
                      <TableCell>
                        <Badge value={req.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-500 whitespace-nowrap">
                        {req.createdAt ? new Date(req.createdAt).toLocaleDateString('th-TH') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!data.requests.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-400">
                        ยังไม่มีคำขอล่าสุดในระบบ
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>}

        {view==='registry'&&<div className="panel"><div className="panel-head"><h2>รายการครุภัณฑ์ <span className="badge ml-2">{filtered.length}</span></h2><div className="actions"><Button variant="outline" size="sm" className="cursor-pointer bg-white text-blue-700 hover:bg-blue-50 border-blue-200" onClick={()=>setScannerOpen(true)}><ScanLine size={15}/>สแกน QR</Button><Button variant="outline" size="sm" disabled={busy||!active.length} onClick={()=>setExportOpen(true)}><Download size={15}/>ส่งออก Excel</Button>{editable&&selectedAssetIds.length===0&&<Button variant="ghost" size="sm" className="cursor-pointer" disabled={!filtered.some(a=>a.lifecycle==='active')} onClick={()=>open('qr',{assets:filtered.filter(a=>a.lifecycle==='active')})}><QrCode size={16}/>พิมพ์ QR</Button>}</div></div><div className="toolbar"><div className="searchbox relative flex items-center"><Search/><Input aria-label="ค้นหาครุภัณฑ์" placeholder="ค้นหาหมายเลข ชื่อ หรือ Serial…" value={search} onChange={e=>setSearch(e.target.value)} className={search ? 'pr-8' : ''}/>{search&&<button type="button" onClick={()=>setSearch('')} className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none p-1" aria-label="ล้างคำค้นหา" title="ล้างคำค้นหา"><X size={15}/></button>}</div><Pick label="สาขา" value={branch} onChange={setBranch} options={[['all','ทุกสาขา'],...Array.from(new Set([...standardBranches, ...assets.map(x=>x.branch)].filter(Boolean))).map(x=>[x,x] as [string,string])]}/><Pick label="สถานะ" value={condition} onChange={setCondition} options={[['all','ทุกสถานะ'],...Object.entries(conditions)]}/><Pick label="หมวดหมู่" value={category} onChange={setCategory} options={[['all','ทุกหมวดหมู่'],...assetGroups.map(x=>[x,x] as [string,string])]}/><Pick label="ทะเบียน" value={lifecycle} onChange={setLifecycle} options={[['active','ทะเบียนที่ถือครอง'],['disposed','จำหน่ายแล้ว'],['split','ประวัติการแบ่ง'],['voided','ข้อมูลผิดพลาด'],['all','ทั้งหมดรวมประวัติ']]}/></div>
        {selectedAssetIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50/70 border border-blue-200 rounded-xl mb-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs">
                {selectedAssetIds.length}
              </span>
              <span className="text-sm font-semibold text-slate-800">
                เลือกอยู่ <span className="text-blue-700 font-bold">{selectedAssetIds.length}</span> รายการ
              </span>
              {selectedAssetIds.length < filtered.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-xs text-blue-600 hover:text-blue-800 underline font-medium ml-1 cursor-pointer"
                >
                  (เลือกทั้งหมด {filtered.length} รายการ)
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editable && (
                <Button
                  size="sm"
                  disabled={!selectedActiveAssets.length}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer h-8 px-3"
                  onClick={() => open('qr', { assets: selectedActiveAssets })}
                >
                  <QrCode size={14} className="mr-1.5" />
                  พิมพ์ QR Code ({selectedActiveAssets.length} รายการ)
                </Button>
              )}
              {editable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedActiveAssets.length}
                  className="bg-white text-blue-700 border-blue-300 hover:bg-blue-50 text-xs font-semibold cursor-pointer h-8 px-3"
                  onClick={() => open('bulkEdit', { assets: selectedActiveAssets })}
                >
                  <Pencil size={14} className="mr-1.5" />
                  แก้ไขที่เลือก ({selectedActiveAssets.length})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-800 bg-white border-slate-300 cursor-pointer"
                onClick={clearSelection}
              >
                <X size={13} className="mr-1" />
                ยกเลิก
              </Button>
            </div>
          </div>
        )}
        {filtered.length?<><div className="asset-table-wrapper hidden md:block">{/* ตารางพอดีจอ บรรทัดเดียวต่อแถว ไม่เลื่อนซ้ายขวา: จอแคบลงซ่อนคอลัมน์สำคัญน้อยทีละอัน (สถานที่ → หมวด → สาขา/จำนวน) ข้อมูลครบในหน้ารายละเอียด */}<Table className="registry-table" containerClassName="table-scroll-container registry-scroll"><TableHeader><TableRow><TableHead className="w-10 text-center"><input type="checkbox" aria-label="เลือกทั้งหมดในหน้านี้" title="เลือกทั้งหมดในหน้านี้" checked={isAllPageSelected} ref={el=>{if(el)el.indeterminate=!isAllPageSelected&&isSomePageSelected;}} onChange={toggleSelectAllPage} className="select-check"/></TableHead>{([
          { label: 'รหัสครุภัณฑ์', key: 'code', cls: 'w-[200px]' },
          { label: 'รายการ', key: 'name', cls: '' },
          { label: 'สาขา', key: 'branch', cls: 'w-[80px] text-center hidden lg:table-cell' },
          { label: 'หมวด', key: 'groupName', cls: 'w-[92px] hidden xl:table-cell' },
          { label: 'สถานที่', key: 'location', cls: 'w-[160px] hidden 2xl:table-cell' },
          { label: 'จำนวน', key: 'quantity', cls: 'w-[84px] num hidden lg:table-cell' },
          { label: 'มูลค่า (บาท)', key: 'totalSatang', cls: 'w-[124px] num' },
          { label: 'สถานะ', key: 'condition', cls: 'w-[88px] text-center' },
          { label: '', key: null, cls: 'w-[76px]' },
        ] as Array<{label:string;key:keyof Asset|null;cls:string}>).map((col) =>
          <TableHead key={col.label||'actions'} className={col.cls}>
            {col.key ? (
              <button className="inline-flex items-center gap-1 cursor-pointer max-w-full" onClick={() => setSort({ key: col.key!, dir: sort.key === col.key ? -sort.dir : 1 })}>
                <span className="truncate">{col.label}</span>
                <ArrowUpDown size={11} className={`flex-shrink-0 ${sort.key === col.key ? 'text-blue-600 opacity-100' : 'opacity-40'}`} />
              </button>
            ) : <span className="sr-only">จัดการ</span>}
          </TableHead>
        )}</TableRow></TableHeader><TableBody>{pageAssets.map(a=>{const isSelected=selectedAssetIds.includes(a.id);return <TableRow key={a.id} className={`cursor-pointer ${isSelected?'is-selected':''}`} onClick={()=>setSelected(a)}><TableCell className="text-center" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`เลือก ${a.name}`} checked={isSelected} onChange={e=>toggleSelectAsset(a.id,e)} className="select-check"/></TableCell><TableCell className="font-mono text-[12px] font-semibold text-blue-700" title={a.code}>{a.code}</TableCell><TableCell className="font-medium text-slate-900" title={a.name}>{a.name}</TableCell><TableCell className="text-center text-slate-700 hidden lg:table-cell" title={a.branch}>{branchAbbr(a.branch)||'—'}</TableCell><TableCell className="text-slate-700 hidden xl:table-cell" title={a.category}>{groupFor(a)}</TableCell><TableCell className="text-slate-600 hidden 2xl:table-cell" title={a.location}>{a.location||'—'}</TableCell><TableCell className="num text-slate-700 hidden lg:table-cell">{a.quantity.toLocaleString('th-TH')}</TableCell><TableCell className="num font-semibold text-slate-900">{money(a.totalSatang)}</TableCell><TableCell className="text-center"><ConditionBadge condition={a.condition} awaiting={awaiting.get(a.id)}/>{a.lifecycle!=='active'&&<Badge value={a.lifecycle}/>}</TableCell><TableCell className="text-right" onClick={e=>e.stopPropagation()}><RowActions asset={a} editable={!!editable} open={open} view={()=>setSelected(a)}/></TableCell></TableRow>;})}</TableBody></Table></div><div className="md:hidden asset-mobile-cards">{pageAssets.map(a=>{const isSelected=selectedAssetIds.includes(a.id);const cleanGroup=groupFor(a);const importDate=formatImportDate(a.createdAt, a.receivedDate);return <div key={a.id} className={`asset-card-item cursor-pointer transition-colors ${isSelected?'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20':''}`} onClick={()=>setSelected(a)}><div className="flex items-start gap-3"><AssetThumbnail name={a.name} imageUrl={a.imageUrl} onClick={()=>setSelected(a)}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-1 mb-1"><div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`เลือก ${a.name}`} checked={isSelected} onChange={e=>toggleSelectAsset(a.id,e)} className="select-check select-check-lg"/><span className="text-xs font-semibold text-slate-400">{a.code}</span></div><div className="flex items-center gap-1"><ConditionBadge condition={a.condition} awaiting={awaiting.get(a.id)}/>{a.lifecycle!=='active'&&<Badge value={a.lifecycle}/>}</div></div><span className="asset-name text-left font-bold text-slate-900 block line-clamp-2 leading-snug">{a.name}</span><div className="font-mono text-xs font-bold text-blue-700 bg-blue-50/60 px-1.5 py-0.5 rounded border border-blue-100 inline-block mt-1 select-all">{a.code}</div></div></div><div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs"><div><span className="text-slate-400 block text-xs">ราคาและจำนวน</span><strong className="text-slate-900 text-sm">฿{money(a.unitSatang)}</strong><span className="text-slate-500 text-xs block">{a.quantity.toLocaleString('th-TH')} ชิ้น · รวม ฿{money(a.totalSatang)}</span></div><div><span className="text-slate-400 block text-xs">สังกัด / วันที่นำเข้า</span><span className="text-slate-800 font-medium block truncate">{a.branch}</span><span className="text-slate-500 text-xs block truncate">นำเข้า: {importDate.main}</span></div></div><div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-slate-100" onClick={e=>e.stopPropagation()}><Button variant="ghost" size="sm" className="h-9 px-4 text-sm font-bold text-blue-600 bg-blue-50" onClick={()=>setSelected(a)}><ViewIcon size={12} className="mr-1"/>เปิดดู</Button>{editable&&a.lifecycle==='active'&&<Button variant="outline" size="sm" className="h-9 px-4 text-sm font-medium text-slate-600" onClick={()=>open('edit',{asset:a})}><Pencil size={12} className="mr-1"/>แก้ไข</Button>}</div></div>;})}</div><Pager page={page} total={filtered.length} onChange={setPage}/></>:<Empty title={active.length?'ไม่พบรายการที่ตรงกับตัวกรอง':'ยังไม่มีรายการที่ยืนยันเข้าทะเบียน'}><p>{active.length?'ลองเปลี่ยนคำค้นหาหรือตัวกรอง':'ตรวจสอบข้อมูลต้นฉบับ แล้วนำเข้ารายการที่เจ้าหน้าที่ยืนยันแล้ว'}</p>{editable&&!active.length&&<Button variant="outline" onClick={()=>switchView('imports')}>เปิดข้อมูลต้นฉบับ</Button>}</Empty>}</div>}
        {view==='imports'&&<ImportView data={{me:data.me,imports:data.imports}} open={open} revision={revision} reload={reload}/>}
        {['requests','stocktakes','reports','users','audit'].includes(view)&&<Operations view={view} data={data} open={open} write={write} busy={busy} revision={revision} select={setSelected}/>}
      </>
    )}
  </main></SidebarInset><Editor historyRevision={revision} onPhotoChanged={reload} data={data} selected={selected} setSelected={setSelected} modal={modal} setModal={setModal} open={open} write={write} busy={busy} error={formError} setError={setFormError}/>{modal?.kind==='bulkEdit'&&<BulkEditModal assets={modal.assets} busy={busy} error={formError} onClose={()=>setModal(null)} onSubmit={async body=>{if(await write(body))clearSelection();}}/>}<QrScannerModal open={scannerOpen} onClose={()=>setScannerOpen(false)} onScan={handleScanRegistry} title="สแกนค้นหาครุภัณฑ์" description="ส่องกล้องไปที่ QR Code หรือ Barcode เพื่อเปิดดูข้อมูลครุภัณฑ์" /><Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet size={18} className="text-emerald-600"/>ส่งออกรายงานครุภัณฑ์ (Excel)</DialogTitle><DialogDescription>เลือกรายงาน สาขา และประเภท แล้วกดส่งออก</DialogDescription></DialogHeader>{exportOpen&&<ExportView data={data} initialBranch={branch} onDone={()=>setExportOpen(false)} write={write} busy={busy}/>}</DialogContent></Dialog><Toaster position="bottom-right" richColors closeButton/></SidebarProvider>
  );
}
