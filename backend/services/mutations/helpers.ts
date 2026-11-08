import { createHash } from 'node:crypto';
import { type Transaction } from '../../db/client';
import { type Member } from '../../auth/sessions';
import { type Prisma } from '../../db/client';
import {
  type Asset,
  type CandidateSet,
  type CandidateFund,
  splitAmounts,
  splitEvenly,
  codeKey,
  branchAbbr,
  MAX_PIECES,
} from '../../contracts/domain';
import { ApiError, clean, allow, now, id, asset, audit, insertAsset, financialData } from '../asset-service';
import { assetImageKey } from '../../storage/asset-image-metadata';
import { trace } from '../../debug/trace';
import { type MutationContext } from './types';
import { replaceInOpenRounds } from './stocktake-sync';

// ตัวช่วยที่หลายคำสั่งใช้ร่วมกัน: ผูกชุด/ทุน ตรวจรหัสซ้ำ แบ่งยอดเงิน และขั้นตรวจก่อนแก้ครุภัณฑ์

// รหัสชุดคงที่ต่อไฟล์ต้นฉบับ แถวในชุดเดียวกันที่นำเข้าคนละครั้งจึงเข้าชุดเดิม
export function setIdFor(sourceId: string, setKey: string) {
  return (
    'set-' +
    createHash('sha256')
      .update(sourceId + '\n' + setKey)
      .digest('hex')
      .slice(0, 24)
  );
}
export async function linkToSet(tx: Transaction, sourceId: string | null, set: CandidateSet | undefined) {
  if (!sourceId || !set) return {};
  const setId = setIdFor(sourceId, set.key);
  await tx.assetSet.upsert({
    where: { id: setId },
    create: { id: setId, name: set.name, kind: set.kind, createdAt: now() },
    update: {},
  });
  return { setId, setRole: set.role ?? 'member' };
}
// หัวทุนจากไฟล์ต้นฉบับ: สร้างรายชื่อทุนไว้ และจดเป็น "รายการแนะนำ" (fundHintId) ยังไม่นับว่ามาจากทุนจนเจ้าหน้าที่ยืนยัน
// หัวเดียวกันที่พิมพ์ซ้ำทุกหน้า/ทุกแผ่น (ชื่อเหมือนกัน ไม่สนช่องว่างซ้อน) = ทุนเดียวกัน
export const fundName = (name: string) => name.trim().replace(/\s+/g, ' ');
export async function fundIdsByName(tx: Transaction) {
  const funds = await tx.assetSet.findMany({ where: { kind: 'fund' }, select: { id: true, name: true } });
  return new Map(funds.map(f => [fundName(f.name), f.id]));
}
export async function hintFund(tx: Transaction, sourceId: string | null, fund: CandidateFund | undefined) {
  if (!sourceId || !fund) return {};
  const name = fundName(fund.name);
  const existing = (await fundIdsByName(tx)).get(name);
  if (existing) return { fundHintId: existing };
  const fundHintId = setIdFor(sourceId, 'fund:' + name);
  await tx.assetSet.upsert({
    where: { id: fundHintId },
    create: { id: fundHintId, name, kind: 'fund', createdAt: now() },
    update: {},
  });
  return { fundHintId };
}
// หมายเลขครุภัณฑ์ห้ามซ้ำ (เทียบด้วย codeKey) และบอกให้ชัดว่าซ้ำกับรายการไหน แทนข้อความกลางๆ จากฐานข้อมูล
// registered: รายการรหัสในทะเบียนที่อ่านไว้แล้วใน transaction เดียวกัน (นำเข้าแบบกลุ่ม) ไม่ต้องอ่านทั้งตารางซ้ำ
export async function assertCodesFree(
  tx: Transaction,
  codes: string[],
  exceptId?: string,
  registered?: Map<string, string>,
) {
  const wanted = new Map(codes.map(c => [codeKey(c), c]));
  if (wanted.size !== codes.length) throw new ApiError('หมายเลขครุภัณฑ์ในรายการที่เพิ่มซ้ำกันเอง กรุณาตรวจสอบ', 409);
  if (registered) {
    const dup = [...wanted].find(([key]) => registered.has(key));
    if (dup)
      throw new ApiError(`หมายเลขครุภัณฑ์ ${dup[1]} ซ้ำกับรายการที่มีในทะเบียนแล้ว: ${registered.get(dup[0])}`, 409);
    return;
  }
  const existing = await tx.asset.findMany({
    select: { id: true, code: true, name: true, branch: true, lifecycle: true },
  });
  const hit = existing.find(a => a.id !== exceptId && wanted.has(codeKey(a.code)));
  if (hit) {
    const state =
      hit.lifecycle === 'disposed' ? ' ซึ่งจำหน่ายแล้ว' : hit.lifecycle === 'split' ? ' (ประวัติการแยกรายการ)' : '';
    throw new ApiError(
      `หมายเลขครุภัณฑ์ ${wanted.get(codeKey(hit.code))} ซ้ำกับรายการที่มีในทะเบียนแล้ว: ${hit.code} · ${hit.name} · ${branchAbbr(hit.branch)}${state}`,
      409,
    );
  }
}
// ครุภัณฑ์ในชุดเดียวกันที่ยังใช้งาน (ห้ามแยก: โอนย้าย/จำหน่ายต้องทำทั้งชุด)
export async function setMembers(tx: Transaction, setId: string) {
  return tx.asset.findMany({ where: { setId, lifecycle: 'active' } });
}
export function split(quantity: number, total: number, take: number) {
  try {
    return splitAmounts(quantity, total, take);
  } catch {
    throw new ApiError('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึงจำนวนเดิมลบ 1');
  }
}
// แบ่งล็อตจริงเมื่อคำขอที่ระบุจำนวนบางส่วนผ่านการอนุมัติขั้นสุดท้าย (กฎ: ไม่แบ่งตอนยื่นคำขอ จึงไม่มีอะไรต้องย้อนคืนเมื่อถูกปฏิเสธ)
// คืนล็อตที่ถูกส่งคำขอ (ล็อตแรก) ส่วนที่เหลือเป็นอีกล็อตหนึ่งยังใช้งานตามปกติ
export async function splitLotForRequest(
  tx: Transaction,
  m: Member,
  a: Asset,
  take: number,
  reason: string,
): Promise<Asset> {
  const amounts = split(a.quantity, a.totalSatang, take);
  const salvage = split(a.quantity, a.salvageSatang, take);
  const target: Asset = {
    ...a,
    id: id(),
    parentId: a.id,
    code: a.code + ' / 1-' + a.version,
    quantity: take,
    totalSatang: amounts[0],
    salvageSatang: salvage[0],
    version: 1,
    createdAt: now(),
  };
  const remainder: Asset = {
    ...a,
    id: id(),
    parentId: a.id,
    code: a.code + ' / 2-' + a.version,
    quantity: a.quantity - take,
    totalSatang: amounts[1],
    salvageSatang: salvage[1],
    version: 1,
    createdAt: now(),
  };
  await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'split', version: { increment: 1 } } });
  await insertAsset(tx, target);
  await insertAsset(tx, remainder);
  await replaceInOpenRounds(tx, a.id, [target, remainder]);
  await copyPhoto(tx, a.id, [target.id, remainder.id]);
  await audit(tx, m, 'แยกรายการเมื่ออนุมัติคำขอ', a.id, a, [target, remainder], reason);
  return target;
}

// รายชิ้นที่หน้าเว็บส่งมาตอนติด QR แยกรายชิ้น: ต้องครบเท่าจำนวน หมายเลขห้ามว่าง ส่วน Serial ไม่บังคับ
// (หมายเลขซ้ำกันเองหรือซ้ำกับทะเบียน ตรวจต่อด้วย assertCodesFree)
export type Piece = { code: string; serial: string };
export function piecesFrom(input: unknown, quantity: number): Piece[] {
  if (!Array.isArray(input)) throw new ApiError('ข้อมูลรายชิ้นไม่ถูกต้อง');
  if (!Number.isSafeInteger(quantity) || quantity < 2) throw new ApiError('แยกรายชิ้นได้เมื่อมีตั้งแต่ 2 ชิ้นขึ้นไป');
  if (quantity > MAX_PIECES)
    throw new ApiError(`แยกรายชิ้นได้ครั้งละไม่เกิน ${MAX_PIECES.toLocaleString('th-TH')} ชิ้น`);
  if (input.length !== quantity) throw new ApiError(`กรุณาระบุหมายเลขให้ครบ ${quantity.toLocaleString('th-TH')} ชิ้น`);
  return input.map((p: { code?: unknown; serial?: unknown } | null, i) => {
    const code = clean(p?.code ?? '', 200),
      serial = clean(p?.serial ?? '', 200);
    if (!code) throw new ApiError(`กรุณาระบุหมายเลขของชิ้นที่ ${i + 1}`);
    return { code, serial };
  });
}
// สร้างรายการลูกชิ้นละ 1 รายการจากรายการแม่ (แม่เก็บเป็นประวัติ lifecycle = split แบบเดียวกับแยกรายการ)
// ยอดเงินและมูลค่าซากแบ่งด้วย splitEvenly รวมกลับเท่าแม่ทุกสตางค์ · ใช้ createMany คำสั่งเดียว ไม่ยิงทีละชิ้น
export async function insertPieces(tx: Transaction, parent: Asset, pieces: Piece[], at: string): Promise<Asset[]> {
  const totals = splitEvenly(parent.totalSatang, pieces.length),
    salvages = splitEvenly(parent.salvageSatang, pieces.length);
  const children: Asset[] = pieces.map((p, i) => ({
    ...parent,
    id: id(),
    parentId: parent.id,
    code: p.code,
    serial: p.serial,
    quantity: 1,
    unitSatang: totals[i],
    totalSatang: totals[i],
    salvageSatang: salvages[i],
    lifecycle: 'active',
    version: 1,
    createdAt: at,
  }));
  await tx.asset.createMany({ data: children.map(c => financialData(c) as Prisma.AssetCreateManyInput) });
  return children;
}
// สรุปรายชิ้นสำหรับบันทึกประวัติ (ไม่เก็บทุกหมายเลขลง audit ให้ยาวเกิน)
export const piecesSummary = (children: Asset[]) => ({
  count: children.length,
  first: children[0]?.code,
  last: children[children.length - 1]?.code,
});

// แบ่งล็อตแล้วรายการลูกใช้รูปเดียวกับแม่ (คัดลอกไฟล์รูปใน stored_files)
// skipDuplicates = ถ้ามีรูปของลูกอยู่แล้วให้ข้ามในระดับ SQL (ON CONFLICT DO NOTHING)
// เดิมใช้ .catch(() => {}) กลืน error ไว้ ซึ่งใช้ไม่ได้ใน Postgres: คำสั่งที่ล้มทำให้ transaction ทั้งก้อนใช้ต่อไม่ได้แล้ว
export async function copyPhoto(tx: Transaction, parentId: string, childIds: string[]) {
  const photo = await tx.storedFile.findUnique({ where: { key: assetImageKey(parentId) } });
  if (!photo) return;
  await tx.storedFile.createMany({
    data: childIds.map(id => ({ key: assetImageKey(id), body: photo.body })),
    skipDuplicates: true,
  });
}

// ขั้นตรวจร่วมของคำสั่งที่แก้ครุภัณฑ์ 1 รายการ (แก้ไข แบ่งล็อต ยื่นคำขอ ซ่อมเสร็จ ยกเลิก):
// ต้องเป็นเจ้าหน้าที่/Admin · รายการยังใช้งาน · version ตรงกับตอนเปิดฟอร์ม · ไม่มีคำขอค้าง
export async function loadEditableAsset({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const a = await asset(tx, clean(b.id));
  if (a.lifecycle !== 'active') throw new ApiError('รายการนี้ถูกแยกรายการหรือปิดบัญชีแล้ว');
  if (a.version !== b.version) throw new ApiError('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
  trace.ok(`version ตรงกัน (${a.version}) — ไม่มีใครแก้รายการ ${a.code} ทับระหว่างที่เปิดฟอร์ม`);
  if (await tx.assetRequest.findFirst({ where: { assetId: a.id, status: 'pending' } }))
    throw new ApiError('รายการนี้มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน');
  const reason = clean(b.reason ?? '');
  return { a, reason };
}
