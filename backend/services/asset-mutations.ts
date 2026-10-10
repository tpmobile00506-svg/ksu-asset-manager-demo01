import { createHash } from 'node:crypto';
import { prisma, json, type Transaction, Prisma } from '../db/client';
import { freshMember, publicUserFields, hashPassword, type Member } from '../auth/sessions';
import { type Asset, type Candidate, roles, conditions, requestTypes, expandRange, splitAmounts, classify, standardBranches, normalizeBranch } from '../contracts/domain';
import { ApiError, clean, allow, now, id, asset, audit, dimensions, financialData, insertAsset, validated, getSource } from './asset-service';
import { assetImageKey } from '../storage/asset-image-metadata';
import { validate, userMutationSchema, workflowMutationSchema, assetRequestSchema, approvalMutationSchema } from '../validation';

type Input = Record<string, any>;
function split(quantity: number, total: number, take: number) {
  try { return splitAmounts(quantity, total, take); }
  catch { throw new ApiError('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึงจำนวนเดิมลบ 1'); }
}
// แบ่งล็อตจริงเมื่อคำขอที่ระบุจำนวนบางส่วนผ่านการอนุมัติขั้นสุดท้าย (กฎ: ไม่แบ่งตอนยื่นคำขอ จึงไม่มีอะไรต้องย้อนคืนเมื่อถูกปฏิเสธ)
// คืนล็อตที่ถูกส่งคำขอ (ล็อตแรก) ส่วนที่เหลือเป็นอีกล็อตหนึ่งยังใช้งานตามปกติ
async function splitLotForRequest(tx: Transaction, m: Member, a: Asset, take: number, reason: string): Promise<Asset> {
  const amounts = split(a.quantity, a.totalSatang, take);
  const salvage = split(a.quantity, a.salvageSatang, take);
  const target: Asset = { ...a, id: id(), parentId: a.id, code: a.code + ' / 1-' + a.version, quantity: take, totalSatang: amounts[0], salvageSatang: salvage[0], version: 1, createdAt: now() };
  const remainder: Asset = { ...a, id: id(), parentId: a.id, code: a.code + ' / 2-' + a.version, quantity: a.quantity - take, totalSatang: amounts[1], salvageSatang: salvage[1], version: 1, createdAt: now() };
  await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'split', version: { increment: 1 } } });
  await insertAsset(tx, target);
  await insertAsset(tx, remainder);
  const parentPhoto = await tx.storedFile.findUnique({ where: { key: assetImageKey(a.id) } });
  if (parentPhoto) {
    for (const child of [target, remainder]) {
      await tx.storedFile.create({ data: { key: assetImageKey(child.id), body: parentPhoto.body } }).catch(() => {});
    }
  }
  await audit(tx, m, 'แบ่งล็อตเมื่ออนุมัติคำขอ', a.id, a, [target, remainder], reason);
  return target;
}
export async function mutate(member: Member, input: Input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError('รูปแบบคำขอไม่ถูกต้อง');
  const action = clean(input.action, 50), token = clean(input.token || id(), 100);
  const requestHash = createHash('sha256').update(json(input)).digest('hex');
  const passwordHash = action === 'user' && input.password ? await hashPassword(input.password) : undefined;
  const replay = (existing: { actor: string; requestHash: string; response: string }) => {
    if (existing.actor !== member.id || (existing.requestHash && existing.requestHash !== requestHash)) throw new ApiError('รหัสคำขอนี้ใช้กับข้อมูลอื่นแล้ว กรุณาเปิดฟอร์มใหม่', 409);
    return { ...JSON.parse(existing.response), ok: true, replayed: true };
  };
  let sourceRows: Candidate[] | undefined;
  if (action === 'import' || action === 'batchImport') {
    allow(await freshMember(prisma, member), ['staff', 'admin']);
    // Uploaded sources are immutable. Read and classify them before holding a
    // transaction connection; mutable import decisions are still checked below.
    sourceRows = classify(await getSource(clean(input.sourceId)));
  }
  // Version/pending checks and writes must share a serializable snapshot.
  const isolationLevel: Prisma.TransactionIsolationLevel = 'Serializable';
  try {
    return await prisma.$transaction(async tx => {
      const m = await freshMember(tx, member);
      const existing = await tx.operation.findUnique({ where: { id: token } });
      if (existing) return replay(existing);
      const result = await perform(tx, m, action, input, passwordHash, sourceRows);
      await tx.operation.create({ data: { id: token, valid: 1, actor: m.id, createdAt: now(), requestHash, response: json(result) } });
      return result;
    }, { isolationLevel, maxWait: 15000, timeout: 45000 });
  } catch (error) {
    // A concurrent identical request may have committed while this transaction rolled back.
    if (['P2002', 'P2034'].includes((error as { code?: string }).code || '')) {
      const existing = await prisma.operation.findUnique({ where: { id: token } });
      if (existing) return replay(existing);
    }
    throw error;
  }
}

async function perform(tx: Transaction, m: Member, action: string, b: Input, passwordHash?: string, sourceRows?: Candidate[]): Promise<Input> {
  if (action === 'user') {
    allow(m, ['admin']);
    const validatedUser = validate(userMutationSchema, b);
    const { email, role, name, branch } = validatedUser;
    const active = validatedUser.active ?? 1;
    const target = await tx.user.findUnique({ where: { email }, select: publicUserFields });
    if (target?.id === m.id && (role !== 'admin' || !active)) throw new ApiError('ไม่สามารถปิดสิทธิ์ Admin ของตนเอง');
    if (!target && !passwordHash) throw new ApiError('กรุณากำหนดรหัสผ่านสำหรับบัญชีใหม่อย่างน้อย 12 ตัวอักษร');
    const existingInvite = await tx.invite.findUnique({ where: { email } });
    const userBranch = branch !== undefined ? branch : (target?.branch ?? existingInvite?.branch ?? null);
    if (target) {
      await tx.user.update({ where: { id: target.id }, data: { role, name, branch: userBranch, active, ...(passwordHash ? { passwordHash } : {}) } });
      if (passwordHash || !active || role !== target.role) await tx.session.deleteMany({ where: { userId: target.id } });
    } else await tx.user.create({ data: { id: id(), email, name, role, branch: userBranch, active, passwordHash: passwordHash!, createdAt: now() } });
    await tx.invite.upsert({ where: { email }, create: { email, role, name, branch: userBranch, active }, update: { role, name, branch: userBranch, active } });
    await audit(tx, m, 'จัดการสิทธิ์ผู้ใช้', null, target, { email, role, name, branch: userBranch, active, passwordChanged: !!passwordHash });
    return { ok: true };
  }
  if (action === 'workflow') {
    allow(m, ['admin']);
    const validatedWorkflow = validate(workflowMutationSchema, b);
    const chain = validatedWorkflow.chain;
    await tx.setting.upsert({ where: { key: 'workflow' }, create: { key: 'workflow', value: json(chain) }, update: { value: json(chain) } });
    await audit(tx, m, 'กำหนดสายอนุมัติ', null, null, chain);
    return { ok: true };
  }
  if (action === 'create' || action === 'import') {
    allow(m, ['staff', 'admin']);
    const a = validated(b.asset), reason = clean(b.reason ?? '');
    // เหมือนการแก้ไข: เข้าสถานะ "กำลังซ่อม" ได้ทางคำขอซ่อมที่ผ่านการอนุมัติเท่านั้น
    if (a.condition === 'repair') throw new ApiError('สถานะกำลังซ่อมต้องผ่านคำขอซ่อม ไม่สามารถกำหนดตอนเพิ่มครุภัณฑ์');
    let sourceId: string | null = null, sourceRow: string | null = null, raw: unknown = null;
    if (action === 'import') {
      sourceId = clean(b.sourceId); sourceRow = clean(b.sourceRow);
      const row = sourceRows?.find(x => x.key === sourceRow);
      if (!row || row.kind !== 'asset') throw new ApiError('เลือกแถวรายการครุภัณฑ์');
      if (!b.reviewed) throw new ApiError('กรุณาตรวจสอบข้อมูลก่อนนำเข้า');
      if (row.groupName && !String(a.groupName).includes(row.groupName)) throw new ApiError('ต้องเก็บข้อความชุด / โครงการต้นฉบับไว้ในหมวด');
      raw = row;
    }
    if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!) && !reason) throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาระบุเหตุผลที่ใช้ยอดนี้');
    const range = expandRange(a.code!, a.quantity!);
    if (a.code!.includes('ถึง') && !range) throw new ApiError('กรุณายืนยันหมายเลขครุภัณฑ์ที่ชัดเจนก่อนนำเข้า เก็บรหัสช่วงเดิมในหมายเหตุ');
    const base = { ...a, id: id(), lifecycle: range ? 'split' : 'active', version: 1, parentId: null, sourceId, sourceRow, createdAt: now() } as Asset;
    await dimensions(tx, base); await insertAsset(tx, base);
    if (sourceId && sourceRow) await tx.sourceRow.create({ data: { id: id(), sourceId, sourceRow, raw: json(raw), decision: 'imported', reason, actor: m.id, createdAt: now() } });
    if (range) {
      const amounts = split(base.quantity, base.totalSatang, 1), salvage = split(base.quantity, base.salvageSatang, 1);
      for (const [i, code] of range.entries()) await insertAsset(tx, { ...base, id: id(), code, quantity: 1, totalSatang: amounts[i], salvageSatang: salvage[i], lifecycle: 'active', parentId: base.id });
    }
    await audit(tx, m, sourceId ? 'นำเข้าครุภัณฑ์' : 'เพิ่มครุภัณฑ์', base.id, null, base, reason);
    return { ok: true, id: base.id };
  }
  if (action === 'batchImport') {
    allow(m, ['staff', 'admin']);
    const sourceId = clean(b.sourceId);
    const allRows = sourceRows!;
    const rowMap = new Map(allRows.map(x => [x.key, x]));
    const existingDecisions = await tx.sourceRow.findMany({ where: { sourceId }, select: { sourceRow: true } });
    const doneKeys = new Set(existingDecisions.map(x => x.sourceRow));

    let keys: string[] = Array.isArray(b.keys) ? b.keys.filter((k: unknown) => typeof k === 'string').map((k: string) => clean(k)) : [];
    if (b.allReady) {
      keys = allRows.filter(r => r.kind === 'asset' && !r.issue && !doneKeys.has(r.key)).map(r => r.key);
    }
    keys = keys.filter(k => !doneKeys.has(k));
    if (!keys.length) throw new ApiError('ไม่มีรายการที่พร้อมนำเข้า หรือถูกนำเข้าหมดแล้ว');

    keys = [...new Set(keys)];
    const reason = clean(b.reason ?? 'ตรวจทานและนำเข้าแบบกลุ่ม');
    const assetsToInsert: Prisma.AssetCreateManyInput[] = [];
    const sourceRowsToInsert: Prisma.SourceRowCreateManyInput[] = [];
    const codes = new Set<string>();
    const addAsset = (a: Asset) => {
      if (codes.has(a.code)) throw new ApiError('รหัสครุภัณฑ์ซ้ำในรายการที่เลือก กรุณาตรวจทานทีละรายการ', 409);
      codes.add(a.code);
      assetsToInsert.push(financialData(a) as Prisma.AssetCreateManyInput);
    };
    for (const key of keys) {
      const row = rowMap.get(key);
      if (!row || row.kind !== 'asset' || row.issue) throw new ApiError('รายการที่เลือกมีข้อมูลต้องตรวจทาน กรุณาเปิดตรวจสอบและยืนยันทีละรายการ');
      const a = validated(row.asset);
      if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!)) throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาตรวจทานทีละรายการ');
      const range = expandRange(a.code!, a.quantity!);
      if (a.code!.includes('ถึง') && !range) throw new ApiError('รหัสช่วงไม่ชัดเจน กรุณาตรวจทานทีละรายการ');
      const base = { ...a, id: id(), lifecycle: range ? 'split' : 'active', version: 1,
        parentId: null, sourceId, sourceRow: key, createdAt: now() } as Asset;
      addAsset(base);
      if (range) {
        const amounts = split(base.quantity, base.totalSatang, 1);
        const salvage = split(base.quantity, base.salvageSatang, 1);
        range.forEach((code, i) => addAsset({ ...base, id: id(), code, quantity: 1,
          totalSatang: amounts[i], salvageSatang: salvage[i], lifecycle: 'active', parentId: base.id }));
      }
      sourceRowsToInsert.push({ id: id(), sourceId, sourceRow: key, raw: json(row),
        decision: 'imported', reason, actor: m.id, createdAt: now() });
    }
    const conflict = await tx.asset.findFirst({ where: { code: { in: [...codes] } }, select: { code: true } });
    if (conflict) throw new ApiError('มีรหัสครุภัณฑ์ในทะเบียนแล้ว: ' + conflict.code + ' กรุณาตรวจทานก่อนนำเข้า', 409);
    await tx.location.createMany({ data: [...new Set(assetsToInsert.map(a => a.location))].map(name => ({ name })), skipDuplicates: true });
    await tx.branch.createMany({ data: [...new Set(assetsToInsert.map(a => a.branch))].map(name => ({ name })), skipDuplicates: true });
    await tx.category.createMany({ data: [...new Set(assetsToInsert.map(a => a.category))].map(name => ({ name })), skipDuplicates: true });
    await tx.assetGroup.createMany({ data: [...new Set(assetsToInsert.map(a => a.groupName))].map(name => ({ name, description: name })), skipDuplicates: true });
    // A conflict must roll back the entire batch, including all source decisions.
    await tx.asset.createMany({ data: assetsToInsert });
    await tx.sourceRow.createMany({ data: sourceRowsToInsert });
    const importedCount = sourceRowsToInsert.length;

    await audit(tx, m, 'นำเข้าครุภัณฑ์แบบกลุ่ม', null, null, { sourceId, count: importedCount, requested: keys.length }, `นำเข้าพร้อมกัน ${importedCount} รายการ`);
    return { ok: true, count: importedCount, importedCount };
  }
  if (['edit', 'split', 'request', 'repairComplete'].includes(action)) {
    allow(m, ['staff', 'admin']);
    const a = await asset(tx, clean(b.id));
    if (a.lifecycle !== 'active') throw new ApiError('รายการนี้ถูกแบ่งยอดหรือปิดบัญชีแล้ว');
    if (a.version !== b.version) throw new ApiError('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
    if (await tx.assetRequest.findFirst({ where: { assetId: a.id, status: 'pending' } })) throw new ApiError('รายการนี้มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน');
    const reason = clean(b.reason ?? '');
    if (action === 'edit') {
      const next = validated(b.asset);
      if (next.condition !== a.condition && (next.condition === 'repair' || a.condition === 'repair')) throw new ApiError('การเข้า/ออกสถานะซ่อมต้องใช้คำขอซ่อมหรือบันทึกซ่อมเสร็จ');
      if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแก้ไข');
      if (next.quantity !== a.quantity || next.totalSatang !== a.totalSatang || next.unitSatang !== a.unitSatang) throw new ApiError('จำนวนและมูลค่าที่ลงทะเบียนแล้วแก้ตรงนี้ไม่ได้ ใช้แบ่งล็อตพร้อมหลักฐาน');
      await dimensions(tx, next);
      await tx.asset.update({ where: { id: a.id }, data: { ...financialData(next), version: { increment: 1 } } });
      await audit(tx, m, 'แก้ไขครุภัณฑ์', a.id, a, next, reason);
    }
    if (action === 'split') {
      if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแบ่งล็อต');
      if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแบ่งล็อต');
      const take = Number(b.quantity), amounts = split(a.quantity, a.totalSatang, take), salvage = split(a.quantity, a.salvageSatang, take), condition = clean(b.condition);
      if (!Object.hasOwn(conditions, condition) || condition === 'repair') throw new ApiError('สถานะไม่ถูกต้อง');
      const children = [
        { ...a, id: id(), parentId: a.id, code: a.code + ' / 1-' + a.version, quantity: take, totalSatang: amounts[0], salvageSatang: salvage[0], condition, version: 1, createdAt: now() },
        { ...a, id: id(), parentId: a.id, code: a.code + ' / 2-' + a.version, quantity: a.quantity - take, totalSatang: amounts[1], salvageSatang: salvage[1], version: 1, createdAt: now() },
      ];
      await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'split', version: { increment: 1 } } });
      for (const child of children) await insertAsset(tx, child);
      const parentPhoto = await tx.storedFile.findUnique({ where: { key: assetImageKey(a.id) } });
      if (parentPhoto) {
        for (const child of children) {
          await tx.storedFile.create({ data: { key: assetImageKey(child.id), body: parentPhoto.body } }).catch(() => {});
        }
      }
      await audit(tx, m, 'แบ่งล็อต', a.id, a, children, reason);
    }
    if (action === 'request') {
      const validatedReq = validate(assetRequestSchema, b);
      const { kind, reason, splitQuantity } = validatedReq;
      const payload: Input = kind === 'transfer'
        ? { location: validatedReq.payload.location, branch: normalizeBranch(validatedReq.payload.branch, '', ''), ...(validatedReq.payload.custodian ? { custodian: validatedReq.payload.custodian } : {}) }
        : {};
      if (kind === 'repair') {
        payload.estimateSatang = validatedReq.payload?.estimateSatang ?? 0;
      }
      const config = await tx.setting.findUnique({ where: { key: 'workflow' } }), chain = config?.value || '["head","deputy","dean"]';

      const splitQty = splitQuantity ?? null;
      if (splitQty !== null) {
        if (!Number.isInteger(splitQty) || splitQty < 1 || splitQty >= a.quantity) {
          throw new ApiError('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึง ' + (a.quantity - 1));
        }
        if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแบ่งล็อต');
        // กฎ: ยังไม่แบ่งล็อตตอนยื่นคำขอ เก็บจำนวนไว้ในคำขอ แล้วแบ่งเมื่ออนุมัติขั้นสุดท้าย (ถูกปฏิเสธ = ทะเบียนไม่เปลี่ยน)
        payload.splitQuantity = splitQty;
      }

      const req = await tx.assetRequest.create({ data: { id: id(), assetId: a.id, assetVersion: a.version + 1, kind, payload: json(payload), reason, chain, actor: m.id, createdAt: now() } });
      await tx.asset.update({ where: { id: a.id }, data: { version: { increment: 1 } } });
      await audit(tx, m, 'ส่งคำขอ ' + requestTypes[kind as keyof typeof requestTypes], a.id, a, req, reason);
      return { ok: true, id: req.id, assetId: a.id };
    }
    if (action === 'repairComplete') {
      if (a.condition !== 'repair' || !reason) throw new ApiError('เลือกรายการที่กำลังซ่อม และระบุผลการซ่อม');
      const cost = Number(b.costSatang);
      if (!Number.isSafeInteger(cost) || cost < 0 || cost > 100000000000000) throw new ApiError('ค่าซ่อมไม่ถูกต้อง');
      const repairedBy = clean(b.repairedBy ?? '', 200);
      if (!repairedBy) throw new ApiError('กรุณาระบุผู้ซ่อมหรือร้านที่ซ่อม');
      // ผูกกับคำขอซ่อมล่าสุดที่อนุมัติแล้ว (ถ้ามี) เพื่อย้อนดูต้นทางของการซ่อมได้
      const approved = await tx.assetRequest.findFirst({ where: { assetId: a.id, kind: 'repair', status: 'approved' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      await tx.asset.update({ where: { id: a.id }, data: { condition: 'normal', version: { increment: 1 } } });
      await tx.repairRecord.create({ data: { id: id(), assetId: a.id, requestId: approved?.id ?? null, repairedBy, costSatang: BigInt(cost), result: reason, actor: m.id, createdAt: now() } });
      await audit(tx, m, 'ซ่อมเสร็จ', a.id, a, { condition: 'normal', costSatang: cost, repairedBy }, reason);
    }
    return { ok: true };
  }
  if (action === 'approve' || action === 'reject') {
    const validatedApproval = validate(approvalMutationSchema, b);
    const { id: reqId, version: reqVersion, reason } = validatedApproval;
    const r = await tx.assetRequest.findUnique({ where: { id: reqId } });
    if (!r || r.status !== 'pending' || r.version !== reqVersion) throw new ApiError('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
    const chain = JSON.parse(r.chain); allow(m, [chain[r.stage]]);
    if (r.actor === m.id) throw new ApiError('ไม่สามารถอนุมัติคำขอตนเอง');
    const a = await asset(tx, r.assetId);
    if (a.version !== r.assetVersion || a.lifecycle !== 'active') throw new ApiError('ข้อมูลครุภัณฑ์เปลี่ยนแล้ว คำขอเดิมใช้ไม่ได้', 409);

    if (chain[r.stage] === 'head') {
      const userBranch = m.branch ? normalizeBranch(m.branch, '', '') : null;
      const assetBranch = a.branch ? normalizeBranch(a.branch, '', '') : null;
      if (!userBranch || !assetBranch || userBranch !== assetBranch) {
        throw new ApiError('คุณไม่มีสิทธิ์ดำเนินการคำขอของสาขาอื่น หรือยังไม่ได้กำหนดสาขาสังกัด', 403);
      }
    }

    const note = clean(reason ?? '');
    if (action === 'reject' && !note) throw new ApiError('กรุณาระบุเหตุผลส่งกลับ');
    const final = action === 'approve' && r.stage === chain.length - 1;
    await tx.approval.create({ data: { id: id(), requestId: r.id, stage: r.stage, decision: action, actor: m.id, note, createdAt: now() } });
    await tx.assetRequest.update({ where: { id: r.id }, data: { stage: r.stage + (action === 'approve' ? 1 : 0), status: action === 'reject' ? 'rejected' : final ? 'approved' : 'pending', version: { increment: 1 } } });
    await audit(tx, m, action === 'reject' ? 'ส่งคำขอกลับ' : 'อนุมัติคำขอ', a.id, r, { stage: r.stage + 1, final }, note);
    if (final) {
      const payload = JSON.parse(r.payload);
      let target: Asset = a;
      const takeQty = Number(payload.splitQuantity ?? 0);
      if (takeQty > 0) {
        if (!Number.isInteger(takeQty) || takeQty >= a.quantity) throw new ApiError('จำนวนที่ระบุในคำขอไม่ถูกต้องสำหรับครุภัณฑ์นี้', 409);
        target = await splitLotForRequest(tx, m, a, takeQty, r.reason);
        await tx.assetRequest.update({ where: { id: r.id }, data: { assetId: target.id } });
      }
      if (r.kind === 'transfer') {
        // แปลงชื่อสาขาปลายทางเป็นชื่อมาตรฐานก่อนเขียน (รวมคำขอเก่าที่เก็บชื่อแบบย่อไว้)
        const location = clean(payload.location), branch = normalizeBranch(clean(payload.branch), '', '');
        const custodian = payload.custodian ? clean(payload.custodian, 200) : '';
        await tx.location.createMany({ data: [{ name: location }], skipDuplicates: true });
        await tx.branch.createMany({ data: [{ name: branch }], skipDuplicates: true });
        // เปลี่ยนผู้รับผิดชอบเฉพาะเมื่อคำขอระบุไว้ ประวัติเดิม/ใหม่เก็บใน audit (before/after) ของรายการนี้
        await tx.asset.update({ where: { id: target.id }, data: { location, branch, ...(custodian ? { custodian } : {}), version: { increment: 1 } } });
      }
      if (r.kind === 'repair') await tx.asset.update({ where: { id: target.id }, data: { condition: 'repair', version: { increment: 1 } } });
      if (r.kind === 'disposal') await tx.asset.update({ where: { id: target.id }, data: { lifecycle: 'disposed', version: { increment: 1 } } });
      await audit(tx, m, 'ดำเนินการ ' + requestTypes[r.kind as keyof typeof requestTypes], target.id, target, { ...payload, kind: r.kind }, r.reason);
    }
    return { ok: true };
  }
  if (action === 'round') {
    allow(m, ['staff', 'admin']);
    const name = clean(b.name, 200), year = Number(b.year);
    if (!name || !Number.isInteger(year) || year < 2500 || year > 2800) throw new ApiError('ชื่อรอบหรือปีงบประมาณไม่ถูกต้อง');
    const assets = await tx.asset.findMany({ where: { lifecycle: 'active' } });
    if (!assets.length) throw new ApiError('ยังไม่มีทะเบียนครุภัณฑ์สำหรับตรวจนับ');
    const rid = id();
    await tx.stocktake.create({ data: { id: rid, name, year, createdAt: now() } });
    await tx.stocktakeItem.createMany({ data: assets.map(a => ({ id: rid + a.id, roundId: rid, assetId: a.id, snapshot: json({ code: a.code, name: a.name, quantity: a.quantity, location: a.location, branch: a.branch, totalSatang: a.totalSatang }) })) });
    await audit(tx, m, 'เปิดรอบตรวจนับ', null, null, { id: rid, name, year });
    return { ok: true, id: rid };
  }
  if (action === 'check') {
    allow(m, ['staff', 'admin']);
    let result = clean(b.result);
    if (result === 'matched') result = 'normal';
    if (result === 'excess') result = 'mismatch';
    if (!['normal', 'damaged', 'missing', 'mismatch'].includes(result)) throw new ApiError('ผลตรวจไม่ถูกต้อง');
    const item = await tx.stocktakeItem.findUnique({ where: { id: clean(b.id) }, include: { round: true } });
    if (!item || item.round.status !== 'open') throw new ApiError('รอบตรวจนับปิดแล้ว หรือไม่พบรายการ');
    if (b.expectedCheckedAt !== null && (typeof b.expectedCheckedAt !== 'string' || !b.expectedCheckedAt)) throw new ApiError('กรุณาโหลดรายการตรวจนับใหม่ก่อนบันทึก');
    if (item.checkedAt !== b.expectedCheckedAt) throw new ApiError('ผลตรวจนับเปลี่ยนแล้ว กรุณาโหลดรายการใหม่ก่อนบันทึก', 409);
    const quantity = Number(b.quantity), expected = JSON.parse(item.snapshot).quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) throw new ApiError('จำนวนที่พบต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 2,147,483,647');
    if (quantity > expected && result !== 'mismatch') throw new ApiError('พบจำนวนเกินทะเบียน กรุณาเลือกจำนวน / สถานที่ไม่ตรง');
    if (result === 'normal' && quantity !== expected) throw new ApiError('จำนวนไม่ตรงทะเบียน กรุณาเลือกข้อมูลไม่ตรง');
    if (result === 'missing' && quantity !== 0) throw new ApiError('ผลไม่พบต้องมีจำนวนที่พบเป็น 0');
    const checkedAt = new Date(Math.max(Date.now(), item.checkedAt ? Date.parse(item.checkedAt) + 1 : 0)).toISOString();
    await tx.stocktakeItem.update({ where: { id: item.id }, data: { result, quantity, notes: clean(b.reason ?? ''), actor: m.id, checkedAt } });
    await audit(tx, m, 'บันทึกตรวจนับ', item.assetId, item, { result, quantity }, clean(b.reason ?? ''));
    return { ok: true };
  }
  if (action === 'closeRound') {
    allow(m, ['staff', 'admin']);
    const rid = clean(b.id), round = await tx.stocktake.findUnique({ where: { id: rid } });
    if (!round || round.status !== 'open') throw new ApiError('รอบตรวจนับปิดแล้ว หรือไม่พบรอบ', 409);
    const remaining = await tx.stocktakeItem.count({ where: { roundId: rid, result: 'pending' } });
    if (remaining) throw new ApiError('ยังมีรายการไม่ได้ตรวจนับ ' + remaining + ' รายการ');
    await tx.stocktake.update({ where: { id: rid }, data: { status: 'closed', closedAt: now() } });
    await audit(tx, m, 'ปิดรอบตรวจนับ', null, null, { id: rid });
    return { ok: true };
  }
  throw new ApiError('ไม่พบการทำงานนี้', 404);
}
