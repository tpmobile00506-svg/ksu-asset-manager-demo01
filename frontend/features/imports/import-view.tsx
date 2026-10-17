'use client';
import {useState,useEffect,useRef} from 'react';
import {Upload,Search,FileSpreadsheet,Package,TriangleAlert,Check,Download,Filter,Sparkles,Zap,CheckSquare,MapPin} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import SourceSheetGrid from './source-sheet-grid';
import SourceFileList from './source-file-list';
import type {ImportFileRecord} from '@/shared/models';
import {Skeleton} from '@/components/ui/skeleton';
import {toast} from 'sonner';
import {Candidate,money,setRoles,rowOverrideLabels,academicBranches,officeBranches,type RowOverride} from '@/shared/domain';
import type {BatchImportInput,SourceViewResponse} from '@/shared/imports';
import {createBatchImporter,sourceResponse} from './import-requests';
import {api,Metric,Pick,Pager,Empty} from '@/frontend/components/common';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const sheetLabels: Record<string, string> = {
  'สำนักงาน': 'สำนักงาน',
  'คอม': 'คอมพิวเตอร์',
  'ไฟฟ้า': 'ไฟฟ้า',
  'โฆษณา': 'โฆษณาและเผยแพร่',
  'การศึกษา': 'ครุภัณฑ์การศึกษา',
  'โรงงาน': 'ช่างกลโรงงาน',
  'เกษตร': 'เครื่องจักรกลเกษตร',
  'งานครัว': 'งานครัว / สุขาภิบาล',
  'วิทยาศาสตร์': 'วิทยาศาสตร์',
  'สำรวจ': 'สำรวจ',
  'ยานพาหนะ': 'ยานพาหนะ',
  'ชำรุด งปม 2568': 'ชำรุด งปม 2568',
  'ชำรุด งปม67': 'ชำรุด งปม 2567',
  'ชำรุดปี 66': 'ชำรุดปี 2566',
  'ไม่มีตัวตน': 'สินทรัพย์ไม่มีตัวตน',
  'รถจีวากอนเป็นวัสดุฝึกสอน': 'วัสดุฝึกสอน (จีวากอน)',
};

const branchOptions: [string, string][] = [
  ['all', 'ทุกสาขาวิชา'],
  ['วิศวกรรมคอมพิวเตอร์ (วค)', 'วศ.คอมพิวเตอร์ (วค)'],
  ['วิศวกรรมไฟฟ้า (วฟ)', 'วศ.ไฟฟ้า (วฟ)'],
  ['วิศวกรรมเครื่องจักรกลเกษตร (คจก)', 'วศ.เครื่องจักรกลเกษตร (คจก)'],
  ['วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)', 'วศ.เครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)'],
  ['วิศวกรรมอุตสาหการ (วอ)', 'วศ.อุตสาหการ (วอ)'],
  ['วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)', 'วศ.โลจิสติกส์และเทคโนโลยีขนส่ง (วล)'],
  ['นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)', 'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)'],
  ['สำนักงานคณะฯ / คณบดี (สนง.ควอ.)', 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)'],
];

const kindOptions: [string, string][] = [
  ['pending', 'รายการรอนำเข้าทั้งหมด'],
  ['ready', 'ข้อมูลสมบูรณ์ (พร้อมนำเข้า)'],
  ['issue-range', 'รหัสช่วง (เช่น 0001 ถึง 0008)'],
  ['issue-name', 'ชื่อว่างเปล่า (จาก Merge Cell)'],
  ['issue-price', 'ราคาเป็น 0 / เป็นชุด'],
  ['issue-duplicate', 'รหัสซ้ำ / ชีตชำรุด'],
  ['review', 'ต้องตรวจทานทั้งหมด'],
  ['annotations', 'หัวตารางและยอดยก'],
  ['all', 'ทุกแถวต้นทาง'],
];

type ImportViewProps = {
  data: { me: { role: string }; imports: ImportFileRecord[] };
  open: (kind: string, value?: Record<string, unknown>) => void;
  revision: number;
  reload: () => Promise<void>;
};
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const aborted = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export default function ImportView({data,open,revision,reload}:ImportViewProps){
  const firstActive=()=>data.imports.find(f=>!f.archived)?.id||'';
  const [id,setId]=useState(firstActive),
    [source,setSource]=useState<SourceViewResponse|null>(null),
    [loadedQuery,setLoadedQuery]=useState(''),
    [loadedRevision,setLoadedRevision]=useState(-1),
    [dirty,setDirty]=useState(false),
    [sheet,setSheet]=useState('all'),
    [branch,setBranch]=useState('all'),
    [kind,setKind]=useState('pending'),
    [search,setSearch]=useState(''),
    [page,setPage]=useState(0),
    [loading,setLoading]=useState(false),
    [busy,setBusy]=useState(false),
    [error,setError]=useState(''),
    [selectedKeys,setSelectedKeys]=useState<Set<string>>(new Set()),
    [mode,setMode]=useState<'excel'|'list'>('excel'),
    [confirmState,setConfirmState]=useState<{
      isOpen: boolean;
      title: string;
      description: string;
      summary?: string;
      pickBranch?: boolean;
      danger?: boolean;
      confirmLabel: string;
      onConfirm: () => Promise<boolean>;
    } | null>(null);
  // สาขาที่เลือกในหน้าต่างยืนยัน ('' = ตามไฟล์) เก็บใน ref เพราะ onConfirm ถูกสร้างไว้ก่อนผู้ใช้เลือก
  const [importBranch,setImportBranch]=useState('');
  const importBranchRef=useRef('');
  const ref=useRef<HTMLInputElement>(null);
  const mutationBusy=useRef(false);
  const lifetime=useRef<AbortController|null>(null);
  const prevSearch=useRef(search);
  const [batchImport]=useState(()=>createBatchImporter(body=>api('',body,{signal:lifetime.current?.signal})));
  const editable=['staff','admin'].includes(data.me.role);
  const sourceIsCurrent=!!source&&source.id===id;
  const currentQuery=new URLSearchParams({view:'source',source:id,sheet,branch,kind,q:search,page:String(page)}).toString();
  const rowsAreCurrent=sourceIsCurrent&&loadedQuery===currentQuery;
  const canImport=editable&&rowsAreCurrent&&loadedRevision===revision&&!dirty&&!loading&&!busy&&!error;

  useEffect(()=>{
    const controller=new AbortController();
    lifetime.current=controller;
    return()=>controller.abort();
  },[]);

  useEffect(()=>{
    // ไฟล์ที่เลือกถูกลบไปแล้ว หรือยังไม่ได้เลือก → เลือกไฟล์แรกในรายการหลัก
    if(!id || !data.imports.some(f=>f.id===id)) setId(firstActive());
  },[data.imports,id]);

  useEffect(()=>{
    setPage(0);
    setSelectedKeys(new Set());
  },[id,sheet,branch,kind,search]);

  // A single effect owns source loading. Same-query refreshes keep the table
  // visible but disable writes until this revision has finished loading.
  useEffect(()=>{
    if(!id){setSource(null);setLoading(false);return;}
    const controller=new AbortController();
    const isSearchChange = prevSearch.current !== search;
    prevSearch.current = search;
    const delay = isSearchChange ? 180 : 0;
    setSource(previous=>previous?.id===id?previous:null);
    setError('');setLoading(true);
    const timer=setTimeout(async()=>{
      try{
        const response=sourceResponse(await api('?'+currentQuery,undefined,{signal:controller.signal}));
        if(controller.signal.aborted)return;
        const lastPage=Math.max(0,Math.ceil(response.total/40)-1);
        if(page>lastPage){setPage(lastPage);return;}
        setSource(response);setLoadedQuery(currentQuery);setLoadedRevision(revision);setDirty(false);
        const unavailable=new Set(response.rows.filter(row=>row.done||row.kind!=='asset'||!!row.issue).map(row=>row.key));
        setSelectedKeys(previous=>new Set([...previous].filter(key=>!unavailable.has(key))));
      }catch(error:unknown){
        if(!controller.signal.aborted&&!aborted(error))setError(errorMessage(error,'โหลดต้นฉบับไม่สำเร็จ'));
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    },delay);
    return()=>{controller.abort();clearTimeout(timer);};
  },[id,currentQuery,page,revision,search]);

  const currentUnimportedRows = rowsAreCurrent && source ? source.rows.filter(row => row.kind === 'asset' && !row.done && !row.issue) : [];
  const isAllPageSelected = currentUnimportedRows.length > 0 && currentUnimportedRows.every(row => selectedKeys.has(row.key));

  const toggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedKeys(prev => {
      const next=new Set(prev);
      currentUnimportedRows.forEach(row=>{if(isAllPageSelected)next.delete(row.key);else next.add(row.key);});
      return next;
    });
  };

  async function runImport(input:BatchImportInput, message:(count:number)=>string):Promise<boolean>{
    if(mutationBusy.current)return false;
    mutationBusy.current=true;setBusy(true);
    const signal=lifetime.current?.signal;
    try{
      const response=await batchImport(input);
      if(signal?.aborted)return false;
      setDirty(true);setSelectedKeys(new Set());
      toast.success(message(response.count)+(response.linked?` · ผูกเข้าทุน ${response.linked} รายการ`:''));
      // แถวที่ข้าม (เช่น รหัสซ้ำ) แจ้งให้รู้ว่าแถวไหนและเพราะอะไร
      if(response.skipped?.length)toast.warning(`ข้าม ${response.skipped.length} รายการ`,{description:response.skipped.slice(0,5).map(x=>`${x.sheet} แถว ${x.row}: ${x.reason}`).join(' · ')+(response.skipped.length>5?` · และอีก ${response.skipped.length-5} รายการ`:''),duration:12000});
      await reload();
      return true;
    }catch(error:unknown){
      if(!signal?.aborted&&!aborted(error))toast.error(errorMessage(error,'นำเข้าไม่สำเร็จ กรุณาลองอีกครั้ง'));
      return false;
    }finally{
      mutationBusy.current=false;
      if(!signal?.aborted)setBusy(false);
    }
  }

  function handleImportSelected() {
    if (!canImport || !selectedKeys.size) return;
    const keys=[...selectedKeys],count=keys.length,sourceId=id;
    setConfirmState({
      isOpen: true,
      title: 'ยืนยันการนำเข้าข้อมูลครุภัณฑ์',
      description: `ระบบกำลังจะนำเข้ารายการที่คุณเลือกจำนวน ${count} รายการ เข้าสู่ทะเบียนกลางของคณะ`,
      summary: `รายการที่เลือกจำนวน ${count} รายการจะถูกเพิ่มลงทะเบียนกลางและสร้างประวัติการนำเข้าทันที`,
      confirmLabel: `ยืนยันนำเข้า ${count} รายการ`,
      onConfirm:()=>runImport({sourceId,keys},count=>`นำเข้ารายการที่เลือกสำเร็จแล้ว ${count} รายการ`)
    });
  }

  // นำเข้าจากมุมมองแบบ Excel (รายการที่ติ๊กหรือลากครอบ)
  function handleImportKeys(keys: string[], count: number, linking: number) {
    if (!keys.length || busy) return;
    const sourceId=id;
    setImportBranch('');importBranchRef.current='';
    setConfirmState({
      isOpen: true,
      title: 'ยืนยันการนำเข้าข้อมูลครุภัณฑ์',
      description: `ระบบกำลังจะนำเข้ารายการที่คุณเลือกจำนวน ${count} รายการ เข้าสู่ทะเบียนกลางของคณะ`,
      summary: `รายการที่เลือกจำนวน ${count} รายการจะถูกเพิ่มลงทะเบียนกลางและสร้างประวัติการนำเข้าทันที`+(linking?` · ${linking} รายการจะผูกเข้ากับหัวทุนที่ติ๊กไว้`:''),
      pickBranch: true,
      confirmLabel: `ยืนยันนำเข้า ${count} รายการ`,
      onConfirm:()=>runImport({sourceId,keys,includeIssues:true,...(importBranchRef.current?{branch:importBranchRef.current}:{})},count=>`นำเข้ารายการที่เลือกสำเร็จแล้ว ${count} รายการ`)
    });
  }

  // ลบไฟล์ที่ยังไม่ได้นำเข้า / เก็บไฟล์ที่นำเข้าแล้วเข้าคลัง (ครุภัณฑ์ในทะเบียนไม่ถูกแตะ)
  async function fileAction(body:Record<string,unknown>, done:string):Promise<boolean>{
    if(mutationBusy.current)return false;
    mutationBusy.current=true;setBusy(true);
    try{
      await api('',{...body,token:crypto.randomUUID()},{signal:lifetime.current?.signal});
      toast.success(done);
      await reload();
      return true;
    }catch(error:unknown){
      if(!aborted(error))toast.error(errorMessage(error,'ทำรายการไม่สำเร็จ'));
      return false;
    }finally{mutationBusy.current=false;setBusy(false);}
  }
  function handleDeleteFile(file:ImportFileRecord){
    setConfirmState({
      isOpen:true, danger:true,
      title:'ลบไฟล์ต้นฉบับนี้?',
      description:file.name,
      summary:'ไฟล์นี้ยังไม่ได้นำเข้าแถวไหน ลบแล้วกู้คืนไม่ได้ ทะเบียนครุภัณฑ์ไม่ได้รับผลกระทบ',
      confirmLabel:'ลบไฟล์',
      onConfirm:()=>fileAction({action:'sourceDelete',sourceId:file.id},'ลบไฟล์แล้ว'),
    });
  }
  function handleArchiveFile(file:ImportFileRecord, archived:boolean){
    if(!archived){void fileAction({action:'sourceArchive',sourceId:file.id,archived:false},'นำไฟล์กลับมาที่รายการหลักแล้ว');return;}
    setConfirmState({
      isOpen:true,
      title:'เก็บไฟล์เข้าคลัง?',
      description:file.name,
      summary:`นำเข้าไปแล้ว ${file.importedCount.toLocaleString('th-TH')} แถว จึงลบไม่ได้ เพื่อให้ตรวจย้อนกลับไปแถวต้นฉบับได้ ไฟล์จะหายจากรายการหลัก แต่ดูหรือนำกลับมาได้จาก "คลังไฟล์"`,
      confirmLabel:'เก็บเข้าคลัง',
      onConfirm:async()=>{const ok=await fileAction({action:'sourceArchive',sourceId:file.id,archived:true},'เก็บไฟล์เข้าคลังแล้ว');if(ok&&file.id===id)setId('');return ok;},
    });
  }

  // เปลี่ยนประเภทแถวต้นฉบับที่เลือก (หัวทุน / บรรทัดต่อ / ครุภัณฑ์ / ข้าม / กลับเป็นค่าที่ระบบเดา)
  async function handleOverride(keys:string[], as:RowOverride|'auto'):Promise<boolean>{
    if(mutationBusy.current||!keys.length)return false;
    mutationBusy.current=true;setBusy(true);
    try{
      await api('',{action:'rowOverride',sourceId:id,keys,as,token:crypto.randomUUID()},{signal:lifetime.current?.signal});
      toast.success(as==='auto'?`คืนค่าที่ระบบเดาให้ ${keys.length} แถว`:`เปลี่ยน ${keys.length} แถวเป็น "${rowOverrideLabels[as]}" แล้ว`);
      await reload();
      return true;
    }catch(error:unknown){
      if(!aborted(error))toast.error(errorMessage(error,'เปลี่ยนประเภทแถวไม่สำเร็จ'));
      return false;
    }finally{mutationBusy.current=false;setBusy(false);}
  }

  function handleImportAllReady() {
    if(!canImport)return;
    if (!source?.stats.ready) {toast.info('ไม่มีรายการที่พร้อมนำเข้า');return;}
    const readyCount=source.stats.ready,sourceId=id;
    setConfirmState({
      isOpen: true,
      title: 'ยืนยันการนำเข้าข้อมูลทุกรายการที่สมบูรณ์',
      description: `ระบบจะนำเข้ารายการที่ผ่านการตรวจสอบและข้อมูลครบถ้วนจำนวน ${readyCount} รายการ เข้าสู่ทะเบียนกลางโดยอัตโนมัติ`,
      summary: `ข้อมูลที่สมบูรณ์ทั้งหมด ${readyCount} รายการ จะถูกบันทึกเป็นครุภัณฑ์ที่ถือครองในระบบทะเบียนกลาง`,
      confirmLabel: `ยืนยันนำเข้าทั้งหมด ${readyCount} รายการ`,
      onConfirm:()=>runImport({sourceId,allReady:true},count=>`นำเข้ารายการที่พร้อมสำเร็จแล้วทั้งหมด ${count} รายการ`)
    });
  }

  async function handleQuickImport(row: Candidate) {
    if(!canImport || row.issue)return;
    await runImport({sourceId:id,keys:[row.key]},()=>`นำเข้า ${row.asset.name || row.asset.code} สำเร็จแล้ว!`);
  }

  async function upload(file:File){
    if(mutationBusy.current)return;
    mutationBusy.current=true;setBusy(true);
    const signal=lifetime.current?.signal;
    try{
      if(file.size>4*1024*1024)throw Error('รองรับไฟล์ไม่เกิน 4 MB');
      const form=new FormData();form.set('file',file);
      const response=await api('',form,{signal});
      if(typeof response.id!=='string')throw Error('ข้อมูลไฟล์จากเซิร์ฟเวอร์ไม่ครบ กรุณาลองใหม่');
      await reload();
      if(signal?.aborted)return;
      setId(response.id);setSheet('all');setBranch('all');setKind('pending');setSearch('');setPage(0);
      toast.success(response.duplicate?'เปิดไฟล์เดิมที่มีอยู่แล้ว':'เก็บไฟล์ต้นฉบับแล้ว พร้อมตรวจสอบ');
    }catch(error:unknown){
      if(!signal?.aborted&&!aborted(error))toast.error(errorMessage(error,'อัปโหลดไม่สำเร็จ'));
    }finally{
      mutationBusy.current=false;
      if(!signal?.aborted){setBusy(false);if(ref.current)ref.current.value='';}
    }
  }

  const sheetOptions: [string, string][] = source
    ? [['all', 'ทุกชีต (' + source.sheets.length + ' ชีต)'], ...source.sheets.map((s: string) => [s, sheetLabels[s] || s] as [string, string])]
    : [['all', 'ทุกชีต']];

  return (
    <>
      <input className="hidden" ref={ref} type="file" accept=".xlsx" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0]);}}/>
      {error&&<div className="error">{error} <Button variant="outline" size="sm" onClick={()=>void reload()}>ลองโหลดใหม่</Button></div>}
      {(loading||dirty)&&rowsAreCurrent&&<p role="status" className="caption">กำลังอัปเดตรายการ…{dirty&&!loading&&<Button variant="outline" size="sm" onClick={()=>void reload()}>โหลดรายการล่าสุด</Button>}</p>}
      <div className="panel">
        <div className="panel-head">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-blue-600"/>
            <div>
              <h2>ข้อมูลต้นฉบับ</h2>
              <p className="caption">ไฟล์เดิมเก็บครบ แยกการตรวจทานออกจากทะเบียน</p>
            </div>
          </div>
          <div className="actions flex items-center gap-2">
            {editable && sourceIsCurrent && source.stats?.ready > 0 && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all flex items-center gap-1.5"
                disabled={!canImport}
                onClick={handleImportAllReady}
                title="นำเข้าเฉพาะรายการที่ข้อมูลสมบูรณ์ครบ 100% ทั้งหมดในคลิกเดียว"
              >
                <Sparkles size={16}/> นำเข้าทุกรายการที่พร้อม ({source.stats.ready} รายการ)
              </Button>
            )}
            {editable&&<Button disabled={busy} variant="outline" onClick={()=>ref.current?.click()}><Upload size={16}/>{busy?'กำลังอ่านไฟล์…':'อัปโหลด Excel'}</Button>}
          </div>
        </div>

        <div className="toolbar">
          <SourceFileList files={data.imports} selectedId={id} editable={editable} busy={busy} onSelect={setId} onDelete={handleDeleteFile} onArchive={handleArchiveFile}/>
        </div>

        {sourceIsCurrent&&<>
          <div className="panel-body">
            <div className="metric-grid mb-0">
              <Metric label="แถวต้นทางทั้งหมด" value={source.stats.rows.toLocaleString('th-TH')} note={source.sheets.length+' ชีต'} icon={FileSpreadsheet}/>
              <Metric label="แถวที่อาจเป็นครุภัณฑ์" value={source.stats.assets.toLocaleString('th-TH')} note="ยังไม่ใช่จำนวนรายการที่รับรอง" icon={Package}/>
              <Metric label="ต้องตรวจทานเพิ่มเติม" value={source.stats.review.toLocaleString('th-TH')} note="รหัสช่วง ชุด ราคา หรือชีตประวัติ" icon={TriangleAlert}/>
              <Metric label="นำเข้าแล้ว" value={source.stats.imported.toLocaleString('th-TH')} note="เชื่อมโยงกลับแถวต้นฉบับได้" icon={Check}/>
            </div>
            <div className="notice">
              คอลัมน์ G เดิมเสนอไว้ทั้ง “หมายเหตุ” และ “สถานที่” เพื่อให้ตรวจทาน • ข้อความชุดและโครงการอยู่ใน “หมวด” • หัวกระดาษและยอดยกเก็บในต้นฉบับโดยไม่รวมยอดทะเบียน
            </div>
            <div className="actions">
              <Button variant="outline" size="sm" asChild>
                <a href={'/api/source?source='+encodeURIComponent(id)} download><Download size={15}/>ดาวน์โหลดไฟล์เดิม</a>
              </Button>
              <span className="caption overflow-wrap">SHA-256: {source.hash.slice(0,20)}…</span>
            </div>
          </div>

          {/* สลับมุมมอง: แบบ Excel (เลือกด้วยการติ๊ก/ลากครอบ) หรือแบบรายการเดิม (มีตัวกรองปัญหา) */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-600">มุมมอง:</span>
            <Button size="sm" variant={mode==='excel'?'default':'outline'} onClick={()=>setMode('excel')}>แบบ Excel</Button>
            <Button size="sm" variant={mode==='list'?'default':'outline'} onClick={()=>setMode('list')}>แบบรายการ (ตัวกรองปัญหา)</Button>
          </div>
          {mode==='excel'?(
            <SourceSheetGrid sourceId={id} sheets={source.sheets} revision={revision} canImport={editable&&!busy}
              onImport={handleImportKeys}
              onReview={row=>open('import',{row,asset:row.asset,sourceId:id})}
              onOverride={handleOverride}/>
          ):(<>
          <div className="toolbar flex flex-wrap gap-2 items-center">
            <div className="searchbox flex-1 min-w-[200px]">
              <Search/>
              <Input aria-label="ค้นหาข้อมูลต้นฉบับ" placeholder="ค้นหาข้อความ รหัส หรือโครงการ…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <Pick label="ชีต" value={sheet} onChange={setSheet} options={sheetOptions}/>
            <Pick label="สาขาวิชา" value={branch} onChange={setBranch} options={branchOptions}/>
            <Pick label="สถานะ/ปัญหา" value={kind} onChange={setKind} options={kindOptions}/>
          </div>

          {/* Quick Issue Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 px-6 py-2.5 bg-slate-50 border-t border-b border-slate-200 text-xs">
            <span className="font-semibold text-slate-600 mr-1 flex items-center gap-1"><Filter size={13}/> คัดแยกด่วน:</span>
            <button type="button" onClick={()=>setKind('pending')} className={`badge cursor-pointer transition-all ${kind==='pending'?'ring-2 ring-blue-500 font-bold bg-blue-50 text-blue-700':''}`}>
              รอนำเข้า ({source.stats.assets - source.stats.imported})
            </button>
            <button type="button" onClick={()=>setKind('ready')} className={`badge normal cursor-pointer transition-all ${kind==='ready'?'ring-2 ring-emerald-500 font-bold bg-emerald-50 text-emerald-700':''}`}>
              พร้อมเข้า ({source.stats.ready ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-range')} className={`badge repair cursor-pointer transition-all ${kind==='issue-range'?'ring-2 ring-amber-500 font-bold bg-amber-50 text-amber-700':''}`}>
              รหัสช่วง ({source.stats.rangeIssues ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-name')} className={`badge repair cursor-pointer transition-all ${kind==='issue-name'?'ring-2 ring-yellow-500 font-bold bg-yellow-50 text-yellow-800':''}`}>
              ชื่อว่าง ({source.stats.nameIssues ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-price')} className={`badge split cursor-pointer transition-all ${kind==='issue-price'?'ring-2 ring-indigo-500 font-bold bg-indigo-50 text-indigo-700':''}`}>
              ราคา 0/ชุด ({source.stats.priceIssues ?? 0})
            </button>
            <button type="button" onClick={()=>setKind('issue-duplicate')} className={`badge damaged cursor-pointer transition-all ${kind==='issue-duplicate'?'ring-2 ring-rose-500 font-bold bg-rose-50 text-rose-700':''}`}>
              รหัสซ้ำ/ชำรุด ({source.stats.dupIssues ?? 0})
            </button>
          </div>

          <div className="relative">
            {(!rowsAreCurrent || loading) && (
              <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-[0.5px] z-10 flex items-start justify-center pt-8 pointer-events-none transition-opacity">
                <span className="text-xs bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1 rounded-full shadow-md font-medium">
                  กำลังโหลด…
                </span>
              </div>
            )}
            <Table className={`source-table ${!rowsAreCurrent || loading ? 'opacity-70' : ''}`} containerClassName="table-scroll-container">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] text-center">
                      <Checkbox
                        checked={isAllPageSelected}
                        disabled={!canImport || !currentUnimportedRows.length}
                        onCheckedChange={toggleSelectAll}
                        title="เลือก/ยกเลิก ทั้งหมดในหน้านี้"
                        aria-label="เลือกหรือยกเลิกทั้งหมดในหน้านี้"
                      />
                    </TableHead>
                    <TableHead className="w-[140px]">ชีต / สาขา / แถว</TableHead>
                    <TableHead>ข้อมูลจาก Excel</TableHead>
                    <TableHead className="text-center w-[85px]">จำนวน</TableHead>
                    <TableHead className="text-right w-[135px]">ยอดเดิม (บาท)</TableHead>
                    <TableHead className="w-[190px]">การตรวจทาน</TableHead>
                    <TableHead className="w-[130px] text-right"/>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {source.rows.map(r=>(
                    <TableRow key={r.key} className={selectedKeys.has(r.key)?'bg-emerald-50/50 dark:bg-emerald-950/20':''}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedKeys.has(r.key)}
                          disabled={!canImport || r.done || r.kind !== 'asset' || !!r.issue}
                          onCheckedChange={()=>toggleSelect(r.key)}
                          aria-label={`เลือกแถว ${r.key}`}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-slate-800">{r.sheet}</div>
                        {r.kind==='asset' && r.asset.branch && (
                          <div className="text-[11px] text-blue-700 font-medium truncate max-w-[130px]" title={r.asset.branch}>
                            {r.asset.branch}
                          </div>
                        )}
                        <p className="caption">แถว {r.row}</p>
                        {r.asset.location && (
                          <p className="text-[11px] text-slate-500 truncate max-w-[130px] flex items-center gap-1" title={r.asset.location}>
                            <MapPin size={11} className="shrink-0 text-slate-400" />
                            <span className="truncate">{r.asset.location}</span>
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="source-name">
                        <b>{r.asset.name||r.values.filter(Boolean).map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' • ')}</b>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {r.kind==='asset'&&r.asset.code && <span className="source-note mono">{r.asset.code}</span>}
                          {r.kind==='asset'&&r.asset.category && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] bg-blue-50 text-blue-700 border border-blue-200/60 font-medium">
                              หมวด{r.asset.category}
                            </span>
                          )}
                          {r.set && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                              {r.set.role ? setRoles[r.set.role] : 'หัวข้อชุด'}: {r.set.name}
                            </span>
                          )}
                          {r.kind==='asset'&&r.groupName && r.groupName !== 'ทั่วไป' && r.groupName !== r.asset.category && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                              {r.groupName}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        {r.kind==='asset'?r.asset.quantity:'—'}
                      </TableCell>

                      <TableCell className="num">
                        {r.kind==='asset'?money(r.asset.totalSatang||0):'ดูต้นฉบับ'}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className={`badge ${r.done?'approved':r.kind==='asset'?(r.issueType==='ready'||!r.issue?'normal':r.issueType==='range'?'repair':r.issueType==='name'?'repair':r.issueType==='price'?'split':r.issueType==='duplicate'?'damaged':'pending'):''}`}>
                            {r.done ? 'นำเข้าแล้ว' : r.kind === 'asset' ? (
                              r.issueType === 'ready' || !r.issue ? 'พร้อมนำเข้า' :
                              r.issueType === 'range' ? 'รหัสช่วง' :
                              r.issueType === 'name' ? 'ชื่อว่าง' :
                              r.issueType === 'price' ? 'ราคา 0 / ชุด' :
                              r.issueType === 'duplicate' ? 'รหัสซ้ำ / ชำรุด' :
                              r.issueType === 'branch' ? 'หลายสาขา' : 'ต้องตรวจทาน'
                            ) : ({header:'หัวกระดาษ',subtotal:'ยอดยก / ยอดรวม',group:'หัวข้อชุด / โครงการ',note:'ข้อความประกอบ'} as Record<string,string>)[r.kind]}
                          </span>
                        </div>
                        <p className="source-note">{r.issue}</p>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.kind==='asset'&&!r.done&&editable ? (
                            <>
                              {(!r.issue || r.issueType === 'ready') && (
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2 shadow-xs"
                                  disabled={!canImport}
                                  onClick={()=>handleQuickImport(r)}
                                  title="นำเข้ารายการนี้ทันทีไม่ต้องเปิดฟอร์ม"
                                >
                                  <Zap size={12}/> เข้าทันที
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                disabled={!canImport}
                                onClick={()=>open('import',{row:r,asset:r.asset,sourceId:id})}
                              >
                                {(!r.issue || r.issueType === 'ready') ? 'ตรวจละเอียด' : 'ตรวจสอบ'}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-xs h-7 text-slate-500" onClick={()=>open('source',{row:r})}>
                              ดูต้นฉบับ
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!source.rows.length&&<Empty title="ไม่มีแถวในตัวกรองนี้"/>}

              {/* Floating Batch Action Bar */}
              {selectedKeys.size > 0 && (
                <div className="sticky bottom-4 z-20 mx-4 my-3 p-3 bg-slate-900/95 backdrop-blur text-white rounded-xl shadow-2xl flex items-center justify-between gap-4 border border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-2 font-medium text-sm pl-2">
                    <CheckSquare className="text-emerald-400" size={18}/>
                    <span>เลือกอยู่ <b className="text-emerald-400 text-base">{selectedKeys.size}</b> รายการ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-300 hover:text-white hover:bg-slate-800 text-xs"
                      onClick={()=>setSelectedKeys(new Set())}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md flex items-center gap-1"
                      disabled={!canImport}
                      onClick={handleImportSelected}
                    >
                      <Zap size={14}/> นำเข้า {selectedKeys.size} รายการพร้อมกัน
                    </Button>
                  </div>
                </div>
              )}

              <Pager page={page} total={source.total} onChange={setPage}/>
          </div>
          </>)}
        </>}
        {!sourceIsCurrent&&(id?<div className="p-6">{error?<p role="alert">{error}</p>:<Skeleton className="h-52"/>}</div>:<Empty title="ยังไม่มีไฟล์ต้นฉบับ"><p>อัปโหลดไฟล์ Excel เพื่อเริ่มตรวจทานก่อนนำเข้าทะเบียน</p></Empty>)}
      </div>

      <AlertDialog open={!!confirmState?.isOpen} onOpenChange={open => { if (!open&&!busy) setConfirmState(null); }}>
        <AlertDialogContent className="bg-white max-w-md p-6 rounded-xl border border-slate-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900">
              {confirmState?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 mt-2">
              {confirmState?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmState?.summary && (
            <div className="bg-blue-50 border border-blue-200/80 rounded-lg p-3 text-xs text-blue-900 my-2">
              {confirmState.summary}
            </div>
          )}
          {confirmState?.pickBranch && (
            <label className="block text-sm text-slate-700 my-2">
              <span className="font-medium">นำเข้าไปที่สาขา</span>
              <select value={importBranch} disabled={busy} onChange={e=>{setImportBranch(e.target.value);importBranchRef.current=e.target.value;}}
                className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
                <option value="">ตามไฟล์ (สาขาที่ระบบอ่านได้ของแต่ละแถว)</option>
                <optgroup label="สาขาวิชา">{academicBranches.map(b=><option key={b} value={b}>{b}</option>)}</optgroup>
                <optgroup label="หน่วยงาน">{officeBranches.map(b=><option key={b} value={b}>{b}</option>)}</optgroup>
              </select>
              {importBranch&&<span className="mt-1 block text-xs text-amber-700">ทุกแถวที่เลือกจะเข้าสาขานี้ ไม่ใช้สาขาในไฟล์</span>}
            </label>
          )}
          <AlertDialogFooter className="mt-4 flex gap-2 justify-end">
            <AlertDialogCancel disabled={busy} className="rounded-lg border-slate-200">
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={`${confirmState?.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-medium rounded-lg px-4`}
              onClick={async e => {
                e.preventDefault();
                if (confirmState?.onConfirm) {
                  if(await confirmState.onConfirm())setConfirmState(null);
                }
              }}
            >
              {busy ? 'กำลังดำเนินการ…' : confirmState?.confirmLabel || 'ยืนยัน'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
