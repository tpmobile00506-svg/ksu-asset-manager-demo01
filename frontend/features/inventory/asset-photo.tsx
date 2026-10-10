'use client';

import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {ImageIcon, LoaderCircle, Save, Trash2, Upload, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getSessionSignal, readApiResponse, sessionFetch} from '@/frontend/components/common';

type Props = {
  assetId: string;
  name: string;
  imageVersion?: string | null;
  editable: boolean;
  onChanged: () => Promise<void>;
};
type Draft = {file: File; url: string; ready: boolean; expectedVersion: string | null};
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function AssetPhoto(props: Props) {
  return <PhotoContent key={props.assetId} {...props}/>;
}

function PhotoContent({assetId, name, imageVersion, editable, onChanged}: Props) {
  const [version, setVersion] = useState(imageVersion ?? null);
  const [photo, setPhoto] = useState<{version: string; url: string} | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removeVersion, setRemoveVersion] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const mutation = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false; mutation.current?.abort();};
  }, []);

  useEffect(() => {setVersion(imageVersion ?? null);}, [imageVersion]);

  useEffect(() => {
    if (!draft) return;
    const url = draft.url;
    return () => URL.revokeObjectURL(url);
  }, [draft?.url]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([getSessionSignal(), controller.signal]);
    let cancelled = false;
    let objectUrl: string | undefined;
    setPhoto(null);
    setLoadError('');
    setLoading(!!version);
    if (version) {
      const params = new URLSearchParams({asset: assetId, v: version});
      (async () => {
        try {
          const response = await sessionFetch('/api/asset-image?' + params, {signal, cache: 'no-store'});
          if (!response.ok) await readApiResponse(response);
          const blob = await response.blob();
          signal.throwIfAborted();
          if (cancelled) return;
          if (!blob.type.startsWith('image/')) throw new Error('เซิร์ฟเวอร์ส่งรูปไม่ถูกต้อง');
          objectUrl = URL.createObjectURL(blob);
          setPhoto({version, url: objectUrl});
        } catch (cause) {
          if (!cancelled && !signal.aborted && (cause as Error).name !== 'AbortError') {
            setLoadError((cause as Error).message || 'โหลดรูปครุภัณฑ์ไม่สำเร็จ');
          }
        } finally {
          if (!cancelled && !signal.aborted) setLoading(false);
        }
      })();
    }
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, version, retry]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy || !editable) return;
    setError('');
    setNotice('');
    setConflict(false);
    setRemoveVersion(null);
    if (!(TYPES.includes(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name)))) {
      setError('เลือกรูป JPEG, PNG หรือ WebP เท่านั้น');
      return;
    }
    if (!file.size || file.size > MAX_BYTES) {
      setError('เลือกรูปขนาดไม่เกิน 4 MB และไฟล์ต้องไม่ว่าง');
      return;
    }
    setDraft({file, url: URL.createObjectURL(file), ready: false, expectedVersion: version});
  }

  async function changePhoto(remove: boolean) {
    if (!editable || mutation.current || (!remove && !draft?.ready) || (remove && !removeVersion)) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([getSessionSignal(), controller.signal]);
    mutation.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let init: RequestInit;
      if (remove) {
        init = {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({assetId, expectedVersion: removeVersion})};
      } else {
        const body = new FormData();
        body.set('assetId', assetId);
        body.set('expectedVersion', draft!.expectedVersion ?? '');
        body.set('file', draft!.file);
        init = {method: 'POST', body};
      }
      const result = await readApiResponse(await sessionFetch('/api/asset-image', {...init, signal}));
      signal.throwIfAborted();
      if (!mounted.current) return;
      if (result.ok !== true || (!remove && typeof result.imageVersion !== 'string')) {
        throw new Error('เซิร์ฟเวอร์ส่งผลบันทึกรูปไม่ครบ กรุณาเปิดรายละเอียดใหม่เพื่อตรวจสอบ');
      }
      setVersion(remove ? null : result.imageVersion);
      setDraft(null);
      setRemoveVersion(null);
      setConflict(false);
      setNotice(remove ? 'ลบรูปครุภัณฑ์แล้ว' : 'บันทึกรูปครุภัณฑ์แล้ว');
      try {await onChanged();}
      catch {
        if (mounted.current && !signal.aborted) setError('บันทึกรูปแล้ว แต่รีเฟรชทะเบียนไม่สำเร็จ กรุณาโหลดข้อมูลใหม่');
      }
    } catch (cause) {
      if (mounted.current && !signal.aborted && (cause as Error).name !== 'AbortError') {
        setError((cause as Error).message || 'บันทึกรูปไม่สำเร็จ');
        if ((cause as Error & {status?: number}).status === 409) {
          setDraft(null);
          setRemoveVersion(null);
          setConflict(true);
        }
      }
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (mounted.current && !signal.aborted) setBusy(false);
    }
  }

  async function refreshPhoto() {
    const signal = getSessionSignal();
    setBusy(true);
    try {
      await onChanged();
      signal.throwIfAborted();
      if (mounted.current) {setRetry(n => n + 1);setConflict(false);setError('');}
    } catch (cause) {
      if (mounted.current && !signal.aborted) setError((cause as Error).message || 'โหลดรูปปัจจุบันไม่สำเร็จ');
    } finally {
      if (mounted.current && !signal.aborted) setBusy(false);
    }
  }

  const displayedUrl = draft?.url ?? (!loadError && photo?.version === version ? photo?.url : null);
  const showLoading = !!version && !loadError && (loading || photo?.version !== version);
  return <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="รูปครุภัณฑ์">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><ImageIcon size={17}/>รูปครุภัณฑ์</h2>
      {draft && <span className="text-xs font-medium text-amber-700">ตัวอย่าง · ยังไม่ได้บันทึก</span>}
    </div>
    <div className="flex aspect-[4/3] max-h-72 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {displayedUrl ? <img key={displayedUrl} src={displayedUrl} alt={(draft ? 'ตัวอย่างรูปใหม่ของ ' : 'รูปครุภัณฑ์ ') + name}
        className="h-full w-full object-contain"
        onLoad={() => {if (draft) setDraft(current => current?.url === displayedUrl ? {...current, ready: true} : current);}}
        onError={() => {
          if (draft) {
            setDraft(current => current?.url === displayedUrl ? {...current, ready: false} : current);
            setError('เปิดรูปนี้ไม่ได้ กรุณาเลือกไฟล์ JPEG, PNG หรือ WebP ที่ใช้งานได้');
          } else setLoadError('แสดงรูปไม่สำเร็จ กรุณาลองโหลดรูปใหม่');
        }}/>
        : showLoading ? <div className="flex items-center gap-2 text-sm text-slate-500" role="status"><LoaderCircle className="animate-spin" size={20}/>กำลังโหลดรูป…</div>
        : <div className="p-5 text-center text-slate-500"><ImageIcon className="mx-auto mb-3 text-slate-300" size={42}/><p className="text-sm">{loadError ? 'โหลดรูปครุภัณฑ์ไม่สำเร็จ' : 'ยังไม่มีรูปครุภัณฑ์'}</p><p className="mt-1 text-xs">{editable ? 'เพิ่มรูปถ่ายเพื่อให้ระบุอุปกรณ์ได้ง่าย' : 'สามารถเพิ่มหรือเปลี่ยนรูปถ่ายได้ที่ปุ่ม "แก้ไขข้อมูล"'}</p></div>}
    </div>
    {loadError && !draft && <div className="mt-3 text-sm text-red-700" role="alert">{loadError}<Button type="button" variant="link" size="sm" onClick={() => setRetry(n => n + 1)}>โหลดรูปใหม่</Button></div>}
    {editable && <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" aria-label="เลือกไฟล์รูปครุภัณฑ์" onChange={chooseFile}/>
      <p className="mt-3 text-xs text-slate-500">JPEG, PNG หรือ WebP · ไม่เกิน 4 MB · 1 รูปต่อรายการ</p>
      {draft && <p className="mt-2 truncate text-xs text-slate-600" title={draft.file.name}>{draft.file.name}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}><Upload size={15}/>{version || draft ? 'เลือกรูปใหม่' : 'เพิ่มรูปครุภัณฑ์'}</Button>
        {draft ? <>
          <Button type="button" size="sm" disabled={busy || !draft.ready} onClick={() => changePhoto(false)}>{busy ? <LoaderCircle size={15} className="animate-spin"/> : <Save size={15}/>}บันทึกรูป</Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => {setDraft(null);setError('');}}><X size={15}/>ยกเลิก</Button>
        </> : version && !removeVersion && <Button type="button" variant="ghost" size="sm" className="text-red-700 hover:text-red-800" disabled={busy} onClick={() => {setRemoveVersion(version);setNotice('');}}><Trash2 size={15}/>ลบรูป</Button>}
      </div>
      {removeVersion && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="text-sm text-red-800">ลบรูปครุภัณฑ์นี้หรือไม่?</p>
        <div className="mt-2 flex gap-2"><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => changePhoto(true)}>ยืนยันลบรูป</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRemoveVersion(null)}>ยกเลิกการลบ</Button></div>
      </div>}
      {draft && draft.expectedVersion !== version && <p className="mt-3 text-sm text-amber-800" role="alert">รูปในทะเบียนเปลี่ยนแล้ว กรุณายกเลิกตัวอย่างเพื่อตรวจรูปปัจจุบันก่อนเลือกใหม่</p>}
    </>}
    {busy && <p className="mt-3 text-sm text-slate-600" role="status">กำลังบันทึกรูปครุภัณฑ์…</p>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    {conflict && <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={refreshPhoto}>โหลดรูปปัจจุบันเพื่อตรวจสอบ</Button>}
    {notice && <p className="mt-3 text-sm text-emerald-700" role="status">{notice}</p>}
  </section>;
}
