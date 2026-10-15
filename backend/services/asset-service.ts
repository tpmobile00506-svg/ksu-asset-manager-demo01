import { randomUUID, createHash } from 'node:crypto';
import { prisma, plain, json, type Transaction, type Prisma } from '../db/client';
import { publicUserFields, type Member } from '../auth/sessions';
import { ApiError } from './errors';
import { parseWorkbook } from '../imports/workbook';
import { readFileBytes, putFile } from '../storage/files';
import { withAssetImages } from '../storage/asset-image-metadata';
import { type Asset, type Source, classify, conditions, normalizeBranch, UNKNOWN_ASSET_TYPE, assetGroupOf, codeKey, markExistingCodes, branchAbbr } from '../contracts/domain';
import type { SourceViewResponse } from '../contracts/imports';
import type { StocktakeResponse, WorkspaceData } from '../contracts/models';

// The route's json() converts these checked bigint fields to safe JSON numbers.
type StoredAsset = Omit<Asset, 'unitSatang' | 'totalSatang' | 'salvageSatang'> & {
  unitSatang: bigint;
  totalSatang: bigint;
  salvageSatang: bigint;
};
type WorkspaceDatabaseData = Omit<WorkspaceData, 'assets'> & { assets: StoredAsset[] };

export { ApiError };
export const now = () => new Date().toISOString();
export const id = randomUUID;
export function clean(value: unknown, max = 5000): string {
  if (typeof value !== 'string' || value.length > max) throw new ApiError('ข้อความไม่ถูกต้องหรือยาวเกินกำหนด');
  return value.trim();
}
export function allow(member: Member, allowed: string[]) {
  if (!allowed.includes(member.role)) throw new ApiError('บัญชีนี้ไม่มีสิทธิ์ดำเนินการ', 403);
}
export function validated(input: Record<string, unknown>): Partial<Asset> {
  const a: Record<string, any> = {};
  for (const key of ['code', 'name', 'notes', 'location', 'branch', 'groupName', 'category', 'receivedDate', 'serial', 'brand', 'custodian']) a[key] = clean(input[key] ?? '');
  for (const key of ['quantity', 'unitSatang', 'totalSatang', 'lifeYears', 'salvageSatang']) {
    const n = Number(input[key] ?? 0);
    if (!Number.isSafeInteger(n) || n < 0 || n > 100000000000000) throw new ApiError('จำนวนและมูลค่าต้องเป็นตัวเลขที่ถูกต้อง');
    a[key] = n;
  }
  if (!a.code || !a.name) throw new ApiError('กรุณาระบุรหัสและชื่อครุภัณฑ์');
  if (!a.branch) a.branch = 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
  else a.branch = normalizeBranch(a.branch, '', '');
  if (!a.category) a.category = UNKNOWN_ASSET_TYPE;
  if (!a.location) a.location = 'ไม่ระบุสถานที่';
  if (!a.groupName) a.groupName = assetGroupOf(a.name);
  if (a.quantity < 1 || a.quantity > 1000000) throw new ApiError('จำนวนต้องเป็นจำนวนเต็ม 1–1,000,000');
  if (a.salvageSatang > a.totalSatang || a.lifeYears > 100) throw new ApiError('ตรวจสอบอายุใช้งานและมูลค่าซาก');
  if (a.receivedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(a.receivedDate) || !Number.isFinite(Date.parse(a.receivedDate)) || new Date(a.receivedDate).toISOString().slice(0, 10) !== a.receivedDate)) throw new ApiError('วันที่รับไม่ถูกต้อง');
  a.condition = clean(input.condition ?? 'normal');
  if (!Object.hasOwn(conditions, a.condition)) throw new ApiError('สถานะไม่ถูกต้อง');
  return a;
}
export async function dimensions(tx: Transaction, a: Partial<Asset>) {
  const loc = a.location || 'ไม่ระบุสถานที่';
  const branch = a.branch || 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
  const cat = a.category || UNKNOWN_ASSET_TYPE;
  const group = a.groupName || assetGroupOf(a.name || '');
  await tx.location.createMany({ data: [{ name: loc }], skipDuplicates: true });
  await tx.branch.createMany({ data: [{ name: branch }], skipDuplicates: true });
  await tx.category.createMany({ data: [{ name: cat }], skipDuplicates: true });
  await tx.assetGroup.createMany({ data: [{ name: group, description: group }], skipDuplicates: true });
}
export function financialData(a: Partial<Asset>) {
  return { ...a, unitSatang: BigInt(a.unitSatang ?? 0), totalSatang: BigInt(a.totalSatang ?? 0), salvageSatang: BigInt(a.salvageSatang ?? 0) };
}
export async function insertAsset(tx: Transaction, a: Asset) {
  return tx.asset.create({ data: financialData(a) as Prisma.AssetUncheckedCreateInput });
}
export function audit(tx: Transaction, m: Member, action: string, assetId: string | null, before: unknown, after: unknown, reason = '') {
  return tx.audit.create({ data: { id: id(), assetId, actor: m.id, actorName: m.name, action, before: json(before), after: json(after), reason, createdAt: now() } });
}
export async function asset(tx: Transaction, assetId: string): Promise<Asset> {
  const a = await tx.asset.findUnique({ where: { id: assetId } });
  if (!a) throw new ApiError('ไม่พบครุภัณฑ์', 404);
  return plain<Asset>(a);
}
// หมายเลขครุภัณฑ์ทั้งหมดในทะเบียน (รวมที่จำหน่ายแล้ว) สำหรับเตือนแถวนำเข้าที่ซ้ำ
export async function registeredCodes(db: Pick<Transaction, 'asset'>) {
  const list = await db.asset.findMany({ select: { code: true, name: true, branch: true, lifecycle: true } });
  return new Map(list.map(a => [codeKey(a.code), `${a.code} · ${a.name} · ${branchAbbr(a.branch)}${a.lifecycle === 'disposed' ? ' (จำหน่ายแล้ว)' : ''}`]));
}
export async function getSource(sourceId: string): Promise<Source> {
  const file = await prisma.importFile.findUnique({ where: { id: sourceId } });
  if (!file) throw new ApiError('ไม่พบไฟล์', 404);
  return JSON.parse((await readFileBytes(file.objectKey + '.json')).toString('utf8')) as Source;
}
export async function getData(m: Member, url: URL) {
  const view = url.searchParams.get('view') || 'state';
  if (view === 'source') {
    const s = await getSource(url.searchParams.get('source') || 'provided-2569');
    const decisions = await prisma.sourceRow.findMany({ where: { sourceId: s.id }, select: { sourceRow: true } });
    const done = new Set(decisions.map(x => x.sourceRow));
    let rows = markExistingCodes(classify(s), await registeredCodes(prisma), done);
    const assetRows = rows.filter(x => x.kind === 'asset');
    const stats = {
      rows: rows.length,
      assets: assetRows.length,
      review: assetRows.filter(x => !!x.issue && !done.has(x.key)).length,
      ready: assetRows.filter(x => !x.issue && !done.has(x.key)).length,
      rangeIssues: assetRows.filter(x => x.issueType === 'range' && !done.has(x.key)).length,
      nameIssues: assetRows.filter(x => x.issueType === 'name' && !done.has(x.key)).length,
      priceIssues: assetRows.filter(x => x.issueType === 'price' && !done.has(x.key)).length,
      dupIssues: assetRows.filter(x => x.issueType === 'duplicate' && !done.has(x.key)).length,
      annotations: rows.filter(x => x.kind !== 'asset').length,
      imported: done.size
    };
    const sheet = url.searchParams.get('sheet');
    const branch = url.searchParams.get('branch');
    const search = url.searchParams.get('q')?.trim().toLowerCase();
    const kind = url.searchParams.get('kind');
    if (sheet && sheet !== 'all') rows = rows.filter(x => x.sheet === sheet);
    if (branch && branch !== 'all') rows = rows.filter(x => x.asset?.branch === branch);
    if (search) rows = rows.filter(x => JSON.stringify(x.values).toLowerCase().includes(search));
    if (kind === 'pending') rows = rows.filter(x => x.kind === 'asset' && !done.has(x.key));
    else if (kind === 'ready') rows = rows.filter(x => x.kind === 'asset' && !x.issue && !done.has(x.key));
    else if (kind === 'issue-range') rows = rows.filter(x => x.kind === 'asset' && x.issueType === 'range' && !done.has(x.key));
    else if (kind === 'issue-name') rows = rows.filter(x => x.kind === 'asset' && x.issueType === 'name' && !done.has(x.key));
    else if (kind === 'issue-price') rows = rows.filter(x => x.kind === 'asset' && x.issueType === 'price' && !done.has(x.key));
    else if (kind === 'issue-duplicate') rows = rows.filter(x => x.kind === 'asset' && x.issueType === 'duplicate' && !done.has(x.key));
    else if (kind === 'review') rows = rows.filter(x => x.kind === 'asset' && !!x.issue && !done.has(x.key));
    else if (kind === 'annotations') rows = rows.filter(x => x.kind !== 'asset');
    const page = Math.max(0, Math.floor(Number(url.searchParams.get('page')) || 0)), size = 40;
    const activeSheets = s.sheets.filter(x => x.rows.length > 0).map(x => x.name);
    return { id: s.id, name: s.name, hash: s.hash, sheets: activeSheets, stats, total: rows.length, rows: rows.slice(page * size, (page + 1) * size).map(x => ({ ...x, done: done.has(x.key) })) } satisfies SourceViewResponse;
  }
  // ประวัติการทำงานทั้งระบบที่เก่ากว่าที่โหลดมาแล้ว (หน้า Audit โหลดเพิ่มทีละชุด)
  if (view === 'audit') {
    // ตัวชี้ตำแหน่ง = เวลา + id (บันทึกที่เขียนใน transaction เดียวกันมีเวลาเท่ากันหลายร้อยรายการ เทียบเวลาอย่างเดียวจะข้ามไปทั้งกลุ่ม)
    const before = url.searchParams.get('before') || '', beforeId = url.searchParams.get('beforeId') || '';
    // ตัวชี้ต้องเป็นเวลา ISO และ id ที่ระบบสร้าง (ค่าแปลกปลอมตอบ 400 แทนการนำไปเทียบเป็นข้อความ)
    if (before && (!Number.isFinite(Date.parse(before)) || new Date(before).toISOString() !== before)) throw new ApiError('ตำแหน่งประวัติไม่ถูกต้อง', 400);
    if (beforeId && !/^[A-Za-z0-9-]{1,100}$/.test(beforeId)) throw new ApiError('ตำแหน่งประวัติไม่ถูกต้อง', 400);
    const take = 200;
    const where = !before ? {} : beforeId
      ? { OR: [{ createdAt: { lt: before } }, { createdAt: before, id: { lt: beforeId } }] }
      : { createdAt: { lt: before } };
    const events = await prisma.audit.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1 });
    return { events: events.slice(0, take), more: events.length > take, total: await prisma.audit.count() };
  }
  if (view === 'history') return {
    events: await prisma.audit.findMany({ where: { assetId: url.searchParams.get('asset') || '' }, orderBy: { createdAt: 'desc' } }),
    children: await withAssetImages(await prisma.asset.findMany({ where: { parentId: url.searchParams.get('asset') || '' } })),
    repairs: await prisma.repairRecord.findMany({ where: { assetId: url.searchParams.get('asset') || '' }, orderBy: { createdAt: 'desc' } }),
  };
  if (view === 'stocktake') {
    const items = await prisma.stocktakeItem.findMany({ where: { roundId: url.searchParams.get('round') || '' } });
    return { items: items.map(item => {
      const snapshot = JSON.parse(item.snapshot) as Pick<Asset, 'code' | 'name'>;
      return { ...item, code: snapshot.code, name: snapshot.name };
    }).sort((a, b) => a.code.localeCompare(b.code, 'th')) } satisfies StocktakeResponse;
  }
  const [assets, requests, rounds, users, invites, events, imports, settings, approvals, names, sessions, funds] = await Promise.all([
    prisma.asset.findMany({ orderBy: { createdAt: 'desc' }, include: { setRef: { select: { name: true, kind: true } }, fundRef: { select: { name: true } } } }),
    prisma.assetRequest.findMany({ include: { asset: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.stocktake.findMany({ include: { items: { select: { result: true } } }, orderBy: { createdAt: 'desc' } }),
    m.role === 'admin' ? prisma.user.findMany({ select: publicUserFields }) : [],
    m.role === 'admin' ? prisma.invite.findMany() : [],
    prisma.audit.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }), prisma.importFile.findMany(),
    prisma.setting.findMany({ where: { key: { not: 'bootstrap' } } }),
    prisma.approval.findMany({ orderBy: { createdAt: 'asc' } }), prisma.user.findMany({ select: { id: true, name: true } }),
    m.role === 'admin' ? prisma.session.findMany({ where: { expiresAt: { gt: new Date() } }, select: { userId: true } }) : [],
    prisma.assetSet.findMany({ where: { kind: 'fund' }, select: { id: true, name: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] }),
  ]);
  const actorNames = new Map(names.map(u => [u.id, u.name]));
  const onlineUserIds = new Set(sessions.map(s => s.userId));
  onlineUserIds.add(m.id);
  const usersWithOnline = users.map(u => ({ ...u, isOnline: onlineUserIds.has(u.id) }));
  return {
    me: m, assets: await withAssetImages(assets.map(({ setRef, fundRef, ...a }) => ({ ...a, branch: normalizeBranch(a.branch || '', '', ''), setName: setRef?.name ?? null, setKind: setRef?.kind ?? null, fundName: fundRef?.name ?? null }))), requests: requests.map(({ asset, ...r }) => ({ ...r, ...asset })),
    rounds: rounds.map(({ items, ...r }) => ({ ...r, total: items.length, checked: items.filter(i => i.result !== 'pending').length })),
    users: usersWithOnline, invites, events, imports, funds,
    settings: Object.fromEntries(settings.map(s => [s.key, s.value])), approvals: approvals.map(a => ({ ...a, actorName: actorNames.get(a.actor) || '' })),
  } satisfies WorkspaceDatabaseData;
}
export async function upload(m: Member, form: FormData) {
  allow(m, ['staff', 'admin']);
  const file = form.get('file');
  if (!(file instanceof File) || file.size > 4 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xlsx')) throw new ApiError('รองรับไฟล์ .xlsx ไม่เกิน 4 MB');
  const bytes = new Uint8Array(await file.arrayBuffer()), hash = createHash('sha256').update(bytes).digest('hex');
  const old = await prisma.importFile.findUnique({ where: { hash } });
  if (old) return { ok: true, id: old.id, duplicate: true };
  let s: Source;
  try { s = await parseWorkbook(file); } catch { throw new ApiError('อ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบไฟล์ .xlsx'); }
  const count = s.sheets.reduce((n, sh) => n + sh.rows.length, 0);
  if (!count || count > 20000 || s.sheets.length > 100) throw new ApiError('โครงสร้างไฟล์ไม่ถูกต้อง หรือเกิน 20,000 แถว');
  s.id = id(); s.hash = hash; s.name = clean(file.name, 200);
  for (const sh of s.sheets) {
    clean(sh.name, 200);
    for (const row of sh.rows) if (!Number.isInteger(row.row) || row.row < 1 || row.values.length > 100 || JSON.stringify(row.values).length > 50000) throw new ApiError('โครงสร้างแถวไม่ถูกต้อง');
  }
  const key = 'imports/' + s.id;
  try {
    await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: m.id }, select: publicUserFields });
      if (!user?.active) throw new ApiError('บัญชีนี้ถูกระงับสิทธิ์', 403);
      allow(user as Member, ['staff', 'admin']);
      await putFile(key, bytes, tx); await putFile(key + '.json', JSON.stringify(s), tx);
      await tx.importFile.create({ data: { id: s.id, name: s.name, hash, objectKey: key, rowCount: count, createdAt: now(), actor: m.id } });
      await audit(tx, m, 'อัปโหลด Excel', null, null, { id: s.id, name: s.name, rows: count });
    }, { isolationLevel: 'Serializable', maxWait: 20000, timeout: 90000 });
  } catch (error) {
    // File bytes and metadata rolled back together; a concurrent upload may already exist.
    const duplicate = await prisma.importFile.findUnique({ where: { hash } });
    if (duplicate) return { ok: true, id: duplicate.id, duplicate: true };
    throw error;
  }
  return { ok: true, id: s.id };
}
