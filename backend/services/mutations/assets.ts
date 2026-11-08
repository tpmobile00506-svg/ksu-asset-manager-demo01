import { json, plain } from '../../db/client';
import {
  type Asset,
  type CandidateSet,
  type CandidateFund,
  conditions,
  expandRange,
  assetTypes,
  assetGroupOfType,
  codeKey,
  isStandardBranch,
  voidBlockReason,
  voidedCode,
  restoredCode,
  money,
} from '../../contracts/domain';
import {
  ApiError,
  clean,
  allow,
  now,
  id,
  asset,
  audit,
  dimensions,
  financialData,
  insertAsset,
  validated,
} from '../asset-service';
import { trace } from '../../debug/trace';
import { type MutationContext } from './types';
import {
  linkToSet,
  hintFund,
  assertCodesFree,
  split,
  loadEditableAsset,
  copyPhoto,
  piecesFrom,
  insertPieces,
  piecesSummary,
} from './helpers';

// คำสั่งของทะเบียนครุภัณฑ์: เพิ่ม แก้ไข แก้หลายรายการ แบ่งล็อต ซ่อมเสร็จ ยกเลิก และกู้คืน

// เพิ่มครุภัณฑ์ทีละรายการ (create) หรือนำเข้าแถวเดียวจากไฟล์ Excel ที่ตรวจแล้ว (import)
// หมายเลขแบบช่วง 2 ชิ้นจะแตกเป็นรายการลูก 2 รายการ แม่เก็บไว้เป็นประวัติ (lifecycle = split)
export async function createAsset({ tx, m, action, b, sourceRows }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const a = validated(b.asset),
    reason = clean(b.reason ?? '');
  // เหมือนการแก้ไข: เข้าสถานะ "กำลังซ่อม" ได้ทางคำขอซ่อมที่ผ่านการอนุมัติเท่านั้น
  if (a.condition === 'repair') throw new ApiError('สถานะกำลังซ่อมต้องผ่านคำขอซ่อม ไม่สามารถกำหนดตอนเพิ่มครุภัณฑ์');
  // สาขา/หน่วยงานต้องเลือกจากรายการมาตรฐาน (ผู้ใช้ตัดสินใจ 15 ต.ค. 2569) กันพิมพ์ผิดแบบ "อว" "โลจิส"
  if (!isStandardBranch(a.branch!)) throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
  let sourceId: string | null = null,
    sourceRow: string | null = null,
    raw: unknown = null,
    sourceSet: CandidateSet | undefined,
    sourceFund: CandidateFund | undefined;
  if (action === 'import') {
    sourceId = clean(b.sourceId);
    sourceRow = clean(b.sourceRow);
    const row = sourceRows?.find(x => x.key === sourceRow);
    if (!row || row.kind !== 'asset') throw new ApiError('เลือกแถวรายการครุภัณฑ์');
    if (!b.reviewed) throw new ApiError('กรุณาตรวจสอบข้อมูลก่อนนำเข้า');
    raw = row;
    sourceSet = row.set;
    sourceFund = row.fund;
  }
  if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!) && !reason)
    throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาระบุเหตุผลที่ใช้ยอดนี้');
  // ติด QR แยกรายชิ้น: หน้าเว็บส่งหมายเลขของทุกชิ้นมา (pieces) → รายการแม่เก็บเป็นประวัติ ลูกชิ้นละ 1 รายการ
  // ไม่ส่งมา = QR เดียวทั้งกลุ่ม (เหมือนเดิม) · หมายเลขหลักของแม่จึงเป็นช่วงแบบในไฟล์ต้นฉบับได้
  const pieces = b.pieces === undefined || b.pieces === null ? null : piecesFrom(b.pieces, a.quantity!);
  // ชุดห้ามแยก (แถวที่อยู่ในชุดของไฟล์ต้นฉบับ) ต้องเป็นรายการเดียวตามเดิม
  if (pieces && sourceSet) throw new ApiError('ครุภัณฑ์ในชุดห้ามแยก จึงแยกรายชิ้นไม่ได้');
  const range = pieces ? null : expandRange(a.code!, a.quantity!);
  if (!pieces && a.code!.includes('ถึง') && !range)
    throw new ApiError('กรุณายืนยันหมายเลขครุภัณฑ์ที่ชัดเจนก่อนนำเข้า เก็บรหัสช่วงเดิมในหมายเหตุ');
  await assertCodesFree(tx, [a.code!, ...(range ?? []), ...(pieces ?? []).map(p => p.code)]);
  trace.ok(`ตรวจข้อมูลครบ และหมายเลข ${a.code} ไม่ซ้ำกับทะเบียน`);
  trace.step(`ราคารวม ${money(a.totalSatang!)} บาท เก็บเป็น ${a.totalSatang} สตางค์ (จำนวนเต็ม กันทศนิยมคลาดเคลื่อน)`);
  const setLink = await linkToSet(tx, sourceId, sourceSet);
  const fundLink = await hintFund(tx, sourceId, sourceFund);
  const base = {
    ...a,
    id: id(),
    lifecycle: range || pieces ? 'split' : 'active',
    version: 1,
    parentId: null,
    sourceId,
    sourceRow,
    createdAt: now(),
    ...setLink,
    ...fundLink,
  } as Asset;
  await dimensions(tx, base);
  await insertAsset(tx, base);
  if (sourceId && sourceRow)
    await tx.sourceRow.create({
      data: {
        id: id(),
        sourceId,
        sourceRow,
        raw: json(raw),
        decision: 'imported',
        reason,
        actor: m.id,
        createdAt: now(),
      },
    });
  if (range) {
    const amounts = split(base.quantity, base.totalSatang, 1),
      salvage = split(base.quantity, base.salvageSatang, 1);
    for (const [i, code] of range.entries())
      await insertAsset(tx, {
        ...base,
        id: id(),
        code,
        quantity: 1,
        totalSatang: amounts[i],
        salvageSatang: salvage[i],
        lifecycle: 'active',
        parentId: base.id,
      });
  }
  if (pieces) {
    const children = await insertPieces(tx, base, pieces, base.createdAt);
    trace.ok(`แยกรายชิ้น ${children.length} รายการ ${children[0].code} … ${children[children.length - 1].code}`);
    await audit(
      tx,
      m,
      sourceId ? 'นำเข้าครุภัณฑ์ (แยกรายชิ้น)' : 'เพิ่มครุภัณฑ์ (แยกรายชิ้น)',
      base.id,
      null,
      { ...base, pieces: piecesSummary(children) },
      reason,
    );
    return { ok: true, id: base.id, pieceIds: children.map(c => c.id) };
  }
  await audit(tx, m, sourceId ? 'นำเข้าครุภัณฑ์' : 'เพิ่มครุภัณฑ์', base.id, null, base, reason);
  return { ok: true, id: base.id };
}

// แก้ไขหลายรายการพร้อมกัน (ผู้ใช้ขอ 17 ต.ค. 2569): ใช้แก้ข้อมูลที่กรอกผิด ไม่ใช่โอนย้ายของจริง
// แก้ได้เฉพาะ สาขา ประเภท สถานที่ สภาพ (ปกติ/ชำรุด) — ยอดเงินยังต้องแก้ผ่านแบ่งล็อต ทุกชิ้นสำเร็จหรือไม่มีชิ้นไหนเปลี่ยนเลย
export async function bulkEdit({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const ids: string[] = Array.isArray(b.ids)
    ? [...new Set<string>(b.ids.filter((x: unknown) => typeof x === 'string').map((x: string) => clean(x)))]
    : [];
  if (!ids.length || ids.length > 1000) throw new ApiError('เลือกครุภัณฑ์ 1–1,000 รายการ');
  const reason = clean(b.reason ?? '');
  if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแก้ไข');
  const ch = b.changes && typeof b.changes === 'object' ? b.changes : {};
  const changes: { branch?: string; category?: string; groupName?: string; location?: string; condition?: string } = {};
  if (ch.branch !== undefined) {
    if (typeof ch.branch !== 'string' || !isStandardBranch(ch.branch))
      throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
    changes.branch = ch.branch;
  }
  if (ch.category !== undefined) {
    if (typeof ch.category !== 'string' || !(assetTypes as readonly string[]).includes(ch.category))
      throw new ApiError('ประเภทครุภัณฑ์ไม่ถูกต้อง');
    changes.category = ch.category;
    changes.groupName = assetGroupOfType(ch.category);
  }
  if (ch.location !== undefined) {
    const location = typeof ch.location === 'string' ? clean(ch.location) : '';
    if (!location) throw new ApiError('กรุณาระบุสถานที่');
    changes.location = location;
  }
  if (ch.condition !== undefined) {
    if (ch.condition !== 'normal' && ch.condition !== 'damaged')
      throw new ApiError('สภาพแก้แบบกลุ่มได้เฉพาะ ปกติ หรือ ชำรุด');
    changes.condition = ch.condition;
  }
  if (!Object.keys(changes).length) throw new ApiError('เลือกช่องที่จะแก้อย่างน้อย 1 ช่อง');
  const rows = await tx.asset.findMany({ where: { id: { in: ids } } });
  if (rows.length !== ids.length) throw new ApiError('บางรายการไม่พบแล้ว กรุณาโหลดใหม่', 409);
  const versions = b.versions && typeof b.versions === 'object' ? (b.versions as Record<string, unknown>) : {};
  for (const r of rows) {
    if (r.lifecycle !== 'active') throw new ApiError('รายการ ' + r.code + ' ถูกแยกรายการหรือปิดบัญชีแล้ว');
    if (versions[r.id] !== r.version) throw new ApiError('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
    if (changes.condition && r.condition === 'repair')
      throw new ApiError('รายการ ' + r.code + ' อยู่ระหว่างซ่อม ต้องบันทึกซ่อมเสร็จก่อน');
  }
  const pending = await tx.assetRequest.findFirst({ where: { assetId: { in: ids }, status: 'pending' } });
  if (pending)
    throw new ApiError(
      'รายการ ' +
        (rows.find(r => r.id === pending.assetId)?.code ?? '') +
        ' มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน',
    );
  await dimensions(tx, { ...plain(rows[0]), ...changes } as Partial<Asset>);
  await tx.asset.updateMany({ where: { id: { in: ids } }, data: { ...changes, version: { increment: 1 } } });
  const keys = Object.keys(changes) as Array<keyof typeof changes>;
  for (const r of rows) {
    const before = Object.fromEntries(keys.map(k => [k, (r as Record<string, unknown>)[k]]));
    await audit(tx, m, 'แก้ไขครุภัณฑ์ (หลายรายการ)', r.id, before, changes, reason);
  }
  return { ok: true, count: rows.length };
}

// แก้ข้อมูลทั่วไป (ห้ามแก้จำนวน/มูลค่า และห้ามเข้า-ออกสถานะซ่อมจากฟอร์มนี้)
export async function editAsset(ctx: MutationContext) {
  const { tx, m, b } = ctx;
  const { a, reason } = await loadEditableAsset(ctx);
  const next = validated(b.asset);
  if (next.condition !== a.condition && (next.condition === 'repair' || a.condition === 'repair'))
    throw new ApiError('การเข้า/ออกสถานะซ่อมต้องใช้คำขอซ่อมหรือบันทึกซ่อมเสร็จ');
  if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแก้ไข');
  if (next.branch !== a.branch && !isStandardBranch(next.branch!))
    throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
  if (next.quantity !== a.quantity || next.totalSatang !== a.totalSatang || next.unitSatang !== a.unitSatang)
    throw new ApiError('จำนวนและมูลค่าที่ลงทะเบียนแล้วแก้ตรงนี้ไม่ได้ ใช้ แยกรายการ พร้อมเหตุผล');
  if (codeKey(next.code!) !== codeKey(a.code)) await assertCodesFree(tx, [next.code!], a.id);
  await dimensions(tx, next);
  await tx.asset.update({ where: { id: a.id }, data: { ...financialData(next), version: { increment: 1 } } });
  await audit(tx, m, 'แก้ไขครุภัณฑ์', a.id, a, next, reason);
  return { ok: true };
}

// แบ่งล็อต: รายการเดิมเป็นประวัติ (split) เกิดรายการลูก 2 รายการ ยอดเงินแบ่งแบบสตางค์ไม่หาย
export async function splitAsset(ctx: MutationContext) {
  const { tx, m, b } = ctx;
  const { a, reason } = await loadEditableAsset(ctx);
  if (a.setId) throw new ApiError('ครุภัณฑ์ในชุดห้ามแยก จึงแยกรายการไม่ได้');
  if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแยกรายการ');
  if (!reason) throw new ApiError('กรุณาระบุเหตุผลที่แยกรายการ');
  const take = Number(b.quantity),
    amounts = split(a.quantity, a.totalSatang, take),
    salvage = split(a.quantity, a.salvageSatang, take),
    condition = clean(b.condition);
  if (!Object.hasOwn(conditions, condition) || condition === 'repair') throw new ApiError('สถานะไม่ถูกต้อง');
  const children = [
    {
      ...a,
      id: id(),
      parentId: a.id,
      code: a.code + ' / 1-' + a.version,
      quantity: take,
      totalSatang: amounts[0],
      salvageSatang: salvage[0],
      condition,
      version: 1,
      createdAt: now(),
    },
    {
      ...a,
      id: id(),
      parentId: a.id,
      code: a.code + ' / 2-' + a.version,
      quantity: a.quantity - take,
      totalSatang: amounts[1],
      salvageSatang: salvage[1],
      version: 1,
      createdAt: now(),
    },
  ];
  await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'split', version: { increment: 1 } } });
  for (const child of children) await insertAsset(tx, child);
  await copyPhoto(
    tx,
    a.id,
    children.map(child => child.id),
  );
  await audit(tx, m, 'แยกรายการ', a.id, a, children, reason);
  return { ok: true };
}

// แยกเป็นรายชิ้น (ผู้ใช้ขอ 8 พ.ย. 2569): รายการกลุ่ม N ชิ้นที่บันทึกไว้แล้ว → N รายการ QR คนละดวง
// กฎเดียวกับแยกรายการ: ห้ามแยกของในชุด ห้ามแยกระหว่างซ่อม ต้องมีเหตุผล รายการเดิมเก็บเป็นประวัติ ลูกได้รูปเดียวกับแม่
export async function splitEachAsset(ctx: MutationContext) {
  const { tx, m, b } = ctx;
  const { a, reason } = await loadEditableAsset(ctx);
  if (a.setId) throw new ApiError('ครุภัณฑ์ในชุดห้ามแยก จึงแยกรายชิ้นไม่ได้');
  if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแยกรายชิ้น');
  if (!reason) throw new ApiError('กรุณาระบุเหตุผลที่แยกรายชิ้น');
  const pieces = piecesFrom(b.pieces, a.quantity);
  // รวมหมายเลขเดิมของแม่ไว้ด้วย: ชิ้นใดใช้หมายเลขเดียวกับแม่ = ซ้ำกันเอง (แม่ยังอยู่ในประวัติ)
  await assertCodesFree(tx, [a.code, ...pieces.map(p => p.code)], a.id);
  await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'split', version: { increment: 1 } } });
  const children = await insertPieces(tx, a, pieces, now());
  await copyPhoto(
    tx,
    a.id,
    children.map(c => c.id),
  );
  await audit(tx, m, 'แยกเป็นรายชิ้น', a.id, a, piecesSummary(children), reason);
  return { ok: true, pieceIds: children.map(c => c.id) };
}

// บันทึกซ่อมเสร็จ: สภาพกลับเป็นปกติ และเก็บผลซ่อม/ค่าซ่อมจริงใน repair_records
export async function repairComplete(ctx: MutationContext) {
  const { tx, m, b } = ctx;
  const { a, reason } = await loadEditableAsset(ctx);
  if (a.condition !== 'repair') throw new ApiError('รายการนี้ไม่ได้อยู่ระหว่างซ่อม จึงบันทึกซ่อมเสร็จไม่ได้');
  if (!reason) throw new ApiError('กรุณาระบุรายละเอียดการซ่อม');
  const cost = Number(b.costSatang);
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > 100000000000000) throw new ApiError('ค่าซ่อมไม่ถูกต้อง');
  const repairedBy = clean(b.repairedBy ?? '', 200);
  if (!repairedBy) throw new ApiError('กรุณาระบุผู้ซ่อมหรือร้านที่ซ่อม');
  // ผูกกับคำขอซ่อมล่าสุดที่อนุมัติแล้ว (ถ้ามี) เพื่อย้อนดูต้นทางของการซ่อมได้
  const approved = await tx.assetRequest.findFirst({
    where: { assetId: a.id, kind: 'repair', status: 'approved' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  await tx.asset.update({ where: { id: a.id }, data: { condition: 'normal', version: { increment: 1 } } });
  await tx.repairRecord.create({
    data: {
      id: id(),
      assetId: a.id,
      requestId: approved?.id ?? null,
      repairedBy,
      costSatang: BigInt(cost),
      result: reason,
      actor: m.id,
      createdAt: now(),
    },
  });
  await audit(tx, m, 'ซ่อมเสร็จ', a.id, a, { condition: 'normal', costSatang: cost, repairedBy }, reason);
  return { ok: true };
}

// ยกเลิกรายการที่บันทึกผิด (หมวด "ข้อมูลผิดพลาด") ไม่ต้องผ่านสายอนุมัติ แต่ต้องมีเหตุผล
export async function voidAsset(ctx: MutationContext) {
  const { tx, m } = ctx;
  const { a, reason } = await loadEditableAsset(ctx);
  if (!reason) throw new ApiError('กรุณาระบุเหตุผลที่ยกเลิกรายการ');
  const requests = await tx.assetRequest.count({ where: { assetId: a.id } });
  const counted = await tx.stocktakeItem.count({ where: { assetId: a.id, result: { not: 'pending' } } });
  const blocked = voidBlockReason(a, { requests, counted });
  if (blocked) throw new ApiError(blocked);
  // ยังไม่ได้นับในรอบที่เปิดอยู่ → เอาออกจากรอบ (ไม่ต้องนับของที่ไม่มีจริง และไม่ค้างตอนปิดรอบ)
  await tx.stocktakeItem.deleteMany({ where: { assetId: a.id, result: 'pending' } });
  // มาจากไฟล์ Excel: เปิดแถวต้นฉบับให้นำเข้าใหม่ได้ ถ้าไม่มีรายการอื่นจากแถวเดียวกันค้างอยู่ (แถวช่วงรหัสสร้างได้หลายรายการ)
  let sourceRowReopened = false;
  if (a.sourceId && a.sourceRow) {
    const siblings = await tx.asset.count({
      where: { sourceId: a.sourceId, sourceRow: a.sourceRow, id: { not: a.id }, lifecycle: { not: 'voided' } },
    });
    if (!siblings)
      sourceRowReopened =
        (await tx.sourceRow.deleteMany({ where: { sourceId: a.sourceId, sourceRow: a.sourceRow } })).count > 0;
  }
  const code = voidedCode(a.code, a.id);
  await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'voided', code, version: { increment: 1 } } });
  await audit(tx, m, 'ยกเลิกรายการ (ข้อมูลผิดพลาด)', a.id, a, { lifecycle: 'voided', code, sourceRowReopened }, reason);
  return { ok: true };
}

// กู้คืนรายการที่ยกเลิก (หมวด "ข้อมูลผิดพลาด") กลับเข้าทะเบียนที่ถือครอง (ผู้ใช้ขอ 18 ต.ค. 2569)
export async function restoreAsset({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const a = await asset(tx, clean(b.id));
  if (a.lifecycle !== 'voided') throw new ApiError('รายการนี้ไม่ได้อยู่ในหมวดข้อมูลผิดพลาด จึงกู้คืนไม่ได้');
  if (a.version !== b.version) throw new ApiError('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
  const reason = clean(b.reason ?? '');
  if (!reason) throw new ApiError('กรุณาระบุเหตุผลที่กู้คืนรายการ');
  // รหัสเดิมอาจถูกใช้แล้ว (เช่น เพิ่มรายการที่ถูกต้องด้วยรหัสเดิมไปแล้ว) → แจ้งว่าซ้ำกับรายการไหน
  const code = restoredCode(a.code, a.id);
  await assertCodesFree(tx, [code], a.id);
  // ตอนยกเลิกอาจเปิดแถว Excel ต้นฉบับให้นำเข้าใหม่ไว้ → บันทึกกลับว่านำเข้าแล้ว กันนำเข้าซ้ำ
  let sourceRowRestored = false;
  if (
    a.sourceId &&
    a.sourceRow &&
    !(await tx.sourceRow.findFirst({ where: { sourceId: a.sourceId, sourceRow: a.sourceRow }, select: { id: true } }))
  ) {
    await tx.sourceRow.create({
      data: {
        id: id(),
        sourceId: a.sourceId,
        sourceRow: a.sourceRow,
        raw: json({ restoredAssetId: a.id }),
        decision: 'imported',
        reason,
        actor: m.id,
        createdAt: now(),
      },
    });
    sourceRowRestored = true;
  }
  await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'active', code, version: { increment: 1 } } });
  await audit(
    tx,
    m,
    'กู้คืนรายการ (จากข้อมูลผิดพลาด)',
    a.id,
    a,
    { lifecycle: 'active', code, sourceRowRestored },
    reason,
  );
  return { ok: true };
}
