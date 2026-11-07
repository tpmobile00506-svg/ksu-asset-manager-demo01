import { json, plain } from '../../db/client';
import {
  type Asset,
  requestTypes,
  normalizeBranch,
  approvalChainOf,
  isStandardBranch,
  thaiFiscalYear,
  nextRequestSeq,
  formatRequestNo,
  roles,
  ADMIN_APPROVES_ALL,
} from '../../contracts/domain';
import { ApiError, clean, allow, now, id, asset, audit } from '../asset-service';
import { trace } from '../../debug/trace';
import { validate, assetRequestSchema, approvalMutationSchema, cancelRequestSchema } from '../../validation';
import { type Input, type MutationContext } from './types';
import { setMembers, splitLotForRequest, loadEditableAsset } from './helpers';

// คำสั่งของคำขอ: ยื่นคำขอ อนุมัติ/ไม่อนุมัติ และผู้ยื่นยกเลิกคำขอของตัวเอง

// ยื่นคำขอโอนย้าย / ซ่อม / จำหน่าย: ยังไม่เปลี่ยนทะเบียน จนกว่าจะอนุมัติครบทุกขั้น
export async function createRequest(ctx: MutationContext) {
  const { tx, m, b } = ctx;
  const { a } = await loadEditableAsset(ctx);
  const validatedReq = validate(assetRequestSchema, b);
  const { kind, reason, splitQuantity } = validatedReq;
  const payload: Input =
    kind === 'transfer'
      ? {
          location: validatedReq.payload.location,
          branch: normalizeBranch(validatedReq.payload.branch),
          ...(validatedReq.payload.custodian ? { custodian: validatedReq.payload.custodian } : {}),
        }
      : {};
  // ปลายทางเหมือนเดิมทุกอย่าง = ไม่มีอะไรย้าย ไม่ต้องส่งให้ผู้อนุมัติ 3 ขั้น (เปลี่ยนแค่ผู้รับผิดชอบยังยื่นได้)
  if (
    kind === 'transfer' &&
    payload.location === a.location &&
    payload.branch === normalizeBranch(a.branch) &&
    (!payload.custodian || payload.custodian === a.custodian)
  ) {
    throw new ApiError('สถานที่ สาขา และผู้รับผิดชอบปลายทางเหมือนเดิม กรุณาแก้ปลายทางก่อนยื่นคำขอโอนย้าย');
  }
  if (kind === 'transfer' && !isStandardBranch(payload.branch))
    throw new ApiError('สาขาปลายทางไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
  // เก็บต้นทาง ณ วันยื่นไว้ในคำขอ: หลังอนุมัติทะเบียนเปลี่ยนเป็นปลายทางแล้ว เอกสารอนุมัติยังแสดง "จาก … → ไป …" ได้ถูก
  if (kind === 'transfer') payload.from = { location: a.location, branch: a.branch, custodian: a.custodian };
  if (kind === 'repair' && a.condition === 'repair')
    throw new ApiError('รายการนี้อยู่ระหว่างซ่อมแล้ว กรุณาบันทึกผลการซ่อมก่อนยื่นคำขอซ่อมใหม่');
  if (kind === 'repair') {
    payload.estimateSatang = validatedReq.payload?.estimateSatang ?? 0;
  }
  const config = await tx.setting.findUnique({ where: { key: 'workflow' } }),
    chain = json(approvalChainOf(config?.value).chain);

  const splitQty = splitQuantity ?? null;
  if (splitQty !== null) {
    if (!Number.isInteger(splitQty) || splitQty < 1 || splitQty >= a.quantity) {
      throw new ApiError('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึง ' + (a.quantity - 1));
    }
    if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแยกรายการ');
    // กฎ: ยังไม่แบ่งล็อตตอนยื่นคำขอ เก็บจำนวนไว้ในคำขอ แล้วแบ่งเมื่ออนุมัติขั้นสุดท้าย (ถูกปฏิเสธ = ทะเบียนไม่เปลี่ยน)
    payload.splitQuantity = splitQty;
  }

  // ชุดห้ามแยก: โอนย้าย/จำหน่ายมีผลทั้งชุด ส่วนส่งซ่อมทำทีละชิ้นได้ (ผู้ใช้ยืนยัน 13 ต.ค. 2569)
  if (a.setId) {
    const members = await setMembers(tx, a.setId);
    const pending = await tx.assetRequest.findMany({
      where: { status: 'pending', assetId: { in: members.map(x => x.id) } },
      select: { kind: true },
    });
    if (kind === 'transfer' || kind === 'disposal') {
      if (splitQty !== null) throw new ApiError('ครุภัณฑ์ในชุดต้องโอนย้ายหรือจำหน่ายทั้งชุด แบ่งจำนวนไม่ได้');
      if (pending.length) throw new ApiError('รายการในชุดนี้มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน');
      payload.setId = a.setId;
      payload.setCount = members.length;
    } else if (pending.some(p => p.kind === 'transfer' || p.kind === 'disposal')) {
      throw new ApiError('ชุดนี้มีคำขอโอนย้าย/จำหน่ายทั้งชุดรออนุมัติ กรุณาดำเนินการให้เสร็จก่อน');
    }
  }

  // เลขที่คำขอรันตามปีงบประมาณ: อ่านคำขอทั้งหมดใน transaction เดียวกัน (Serializable) ยื่นพร้อมกันจึงไม่ได้เลขซ้ำ
  const createdAt = now(),
    year = thaiFiscalYear(createdAt);
  const sameYear = (await tx.assetRequest.findMany({ select: { createdAt: true, payload: true } })).filter(
    r => thaiFiscalYear(r.createdAt) === year,
  );
  payload.seq = nextRequestSeq(sameYear);
  trace.ok(`ออกเลขคำขอ ${formatRequestNo(year, payload.seq)} แล้วส่งเข้าสายอนุมัติ`);
  const req = await tx.assetRequest.create({
    data: {
      id: id(),
      assetId: a.id,
      assetVersion: a.version + 1,
      kind,
      payload: json(payload),
      reason,
      chain,
      actor: m.id,
      createdAt,
    },
  });
  await tx.asset.update({ where: { id: a.id }, data: { version: { increment: 1 } } });
  await audit(tx, m, 'ยื่นคำขอ ' + requestTypes[kind as keyof typeof requestTypes], a.id, a, req, reason);
  return { ok: true, id: req.id, assetId: a.id };
}

// อนุมัติ / ไม่อนุมัติคำขอ ทีละขั้นตามสายอนุมัติ (ไม่อนุมัติ = คำขอสิ้นสุด ไม่ได้ส่งกลับไปแก้) · ขั้นสุดท้ายอนุมัติ = ระบบแก้ทะเบียนให้อัตโนมัติ
export async function decideRequest({ tx, m, action, b }: MutationContext) {
  const validatedApproval = validate(approvalMutationSchema, b);
  const { id: reqId, version: reqVersion, reason } = validatedApproval;
  const r = await tx.assetRequest.findUnique({ where: { id: reqId } });
  if (!r || r.status !== 'pending' || r.version !== reqVersion)
    throw new ApiError('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
  // สวิตช์สาธิต ADMIN_APPROVES_ALL (ปกติปิด): Admin ลงนามทุกขั้นที่เหลือได้
  const chain = JSON.parse(r.chain),
    adminAll = ADMIN_APPROVES_ALL && m.role === 'admin';
  if (!adminAll) allow(m, [chain[r.stage]]);
  if (r.actor === m.id && !adminAll) throw new ApiError('ไม่สามารถอนุมัติคำขอตนเอง');
  const a = await asset(tx, r.assetId);
  if (a.version !== r.assetVersion || a.lifecycle !== 'active')
    throw new ApiError('ข้อมูลครุภัณฑ์เปลี่ยนแล้ว คำขอเดิมใช้ไม่ได้', 409);

  if (!adminAll && chain[r.stage] === 'head') {
    const userBranch = m.branch ? normalizeBranch(m.branch) : null;
    const assetBranch = a.branch ? normalizeBranch(a.branch) : null;
    if (!userBranch || !assetBranch || userBranch !== assetBranch) {
      throw new ApiError('คุณไม่มีสิทธิ์ดำเนินการคำขอของสาขาอื่น หรือยังไม่ได้กำหนดสาขาสังกัด', 403);
    }
    trace.ok('สาขาของหัวหน้าตรงกับสาขาของครุภัณฑ์');
  }

  const note = clean(reason ?? '');
  if (action === 'reject' && !note) throw new ApiError('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
  // สวิตช์สาธิตของ Admin: ลงนามทุกขั้นที่เหลือในครั้งเดียว และระบุในหมายเหตุว่าข้ามขั้น ไม่ปนกับลายเซ็นจริงของผู้บริหาร
  const skipAll = adminAll && action === 'approve';
  const stages: number[] = skipAll ? chain.map((_: string, i: number) => i).slice(r.stage) : [r.stage];
  const last = stages[stages.length - 1],
    final = action === 'approve' && last === chain.length - 1;
  trace.ok(
    `${action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ'} ขั้นที่ ${r.stage + 1}/${chain.length} (${(roles as Record<string, string>)[chain[r.stage]] ?? chain[r.stage]})${skipAll ? ` · Admin: ลงนามทุกขั้นที่เหลือในครั้งเดียว` : ''}`,
  );
  if (final) trace.ok('อนุมัติครบทุกขั้น → อัปเดตทะเบียนครุภัณฑ์ให้อัตโนมัติ');
  const signedNote = skipAll ? ['อนุมัติข้ามขั้นโดย Admin', note].filter(Boolean).join(' · ') : note;
  for (const stage of stages)
    await tx.approval.create({
      data: { id: id(), requestId: r.id, stage, decision: action, actor: m.id, note: signedNote, createdAt: now() },
    });
  await tx.assetRequest.update({
    where: { id: r.id },
    data: {
      stage: action === 'approve' ? last + 1 : r.stage,
      status: action === 'reject' ? 'rejected' : final ? 'approved' : 'pending',
      version: { increment: 1 },
    },
  });
  await audit(
    tx,
    m,
    action === 'reject' ? 'ไม่อนุมัติคำขอ' : skipAll ? 'อนุมัติคำขอ (ข้ามขั้น · Admin)' : 'อนุมัติคำขอ',
    a.id,
    r,
    { stage: last + 1, final },
    note,
  );
  if (final) {
    const payload = JSON.parse(r.payload);
    let target: Asset = a;
    const takeQty = Number(payload.splitQuantity ?? 0);
    if (takeQty > 0) {
      if (!Number.isInteger(takeQty) || takeQty >= a.quantity)
        throw new ApiError('จำนวนที่ระบุในคำขอไม่ถูกต้องสำหรับครุภัณฑ์นี้', 409);
      target = await splitLotForRequest(tx, m, a, takeQty, r.reason);
      await tx.assetRequest.update({ where: { id: r.id }, data: { assetId: target.id } });
    }
    // คำขอโอนย้าย/จำหน่ายของครุภัณฑ์ในชุด มีผลกับทุกรายการในชุดที่ยังใช้งาน
    const wholeSet =
      payload.setId && (r.kind === 'transfer' || r.kind === 'disposal')
        ? (await setMembers(tx, String(payload.setId))).filter(x => x.id !== target.id).map(x => plain<Asset>(x))
        : [];
    const affected = [target, ...wholeSet];
    if (r.kind === 'transfer') {
      // แปลงชื่อสาขาปลายทางเป็นชื่อมาตรฐานก่อนเขียน (รวมคำขอเก่าที่เก็บชื่อแบบย่อไว้)
      const location = clean(payload.location),
        branch = normalizeBranch(clean(payload.branch));
      const custodian = payload.custodian ? clean(payload.custodian, 200) : '';
      await tx.location.createMany({ data: [{ name: location }], skipDuplicates: true });
      await tx.branch.createMany({ data: [{ name: branch }], skipDuplicates: true });
      // เปลี่ยนผู้รับผิดชอบเฉพาะเมื่อคำขอระบุไว้ ประวัติเดิม/ใหม่เก็บใน audit (before/after) ของรายการนี้
      for (const x of affected)
        await tx.asset.update({
          where: { id: x.id },
          data: { location, branch, ...(custodian ? { custodian } : {}), version: { increment: 1 } },
        });
    }
    if (r.kind === 'repair')
      await tx.asset.update({ where: { id: target.id }, data: { condition: 'repair', version: { increment: 1 } } });
    if (r.kind === 'disposal')
      for (const x of affected)
        await tx.asset.update({ where: { id: x.id }, data: { lifecycle: 'disposed', version: { increment: 1 } } });
    for (const x of wholeSet)
      await audit(
        tx,
        m,
        'ดำเนินการ ' + requestTypes[r.kind as keyof typeof requestTypes] + ' (ทั้งชุด)',
        x.id,
        x,
        { ...payload, kind: r.kind, requestId: r.id },
        r.reason,
      );
    await audit(
      tx,
      m,
      'ดำเนินการ ' + requestTypes[r.kind as keyof typeof requestTypes],
      target.id,
      target,
      { ...payload, kind: r.kind },
      r.reason,
    );
  }
  return { ok: true };
}

// ผู้ยื่นยกเลิกคำขอของตัวเอง ระหว่างรออนุมัติขั้นไหนก็ได้ (ผู้ใช้เลือก 7 พ.ย. 2569)
// ทะเบียนไม่เปลี่ยน เพราะคำขอยังไม่มีผลจนกว่าจะอนุมัติครบ · ลายเซ็นที่มีแล้วยังอยู่ในประวัติ
export async function cancelRequest({ tx, m, b }: MutationContext) {
  const { id: reqId, version, reason } = validate(cancelRequestSchema, b);
  const r = await tx.assetRequest.findUnique({ where: { id: reqId } });
  if (!r) throw new ApiError('ไม่พบคำขอนี้', 404);
  if (r.actor !== m.id) throw new ApiError('ยกเลิกได้เฉพาะคำขอที่คุณยื่นเอง', 403);
  if (r.status !== 'pending' || r.version !== version) throw new ApiError('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
  const note = clean(reason ?? '');
  await tx.assetRequest.update({ where: { id: r.id }, data: { status: 'cancelled', version: { increment: 1 } } });
  trace.ok(`ผู้ยื่นยกเลิกคำขอเองที่ขั้น ${r.stage + 1}`);
  await audit(tx, m, 'ยกเลิกคำขอ', r.assetId, r, { status: 'cancelled', stage: r.stage }, note);
  return { ok: true };
}
