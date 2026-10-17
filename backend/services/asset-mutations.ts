import { createHash } from 'node:crypto';
import { prisma, json, plain, type Transaction, Prisma } from '../db/client';
import { freshMember, publicUserFields, hashPassword, type Member } from '../auth/sessions';
import { type Asset, type Candidate, type CandidateSet, type CandidateFund, roles, conditions, requestTypes, expandRange, splitAmounts, classify, standardBranches, assetTypes, assetGroupOfType, normalizeBranch, branchAbbr, codeKey, markExistingCodes, approvalChainOf, isStandardBranch, isRowOverride } from '../contracts/domain';
import { ApiError, clean, allow, now, id, asset, audit, dimensions, financialData, insertAsset, validated, getSource, registeredCodes, loadOverrides, overridesKey } from './asset-service';
import { assetImageKey } from '../storage/asset-image-metadata';
import { validate, userMutationSchema, workflowMutationSchema, assetRequestSchema, approvalMutationSchema } from '../validation';

type Input = Record<string, any>;
// รหัสชุดคงที่ต่อไฟล์ต้นฉบับ แถวในชุดเดียวกันที่นำเข้าคนละครั้งจึงเข้าชุดเดิม
export function setIdFor(sourceId: string, setKey: string) {
  return 'set-' + createHash('sha256').update(sourceId + '\n' + setKey).digest('hex').slice(0, 24);
}
async function linkToSet(tx: Transaction, sourceId: string | null, set: CandidateSet | undefined) {
  if (!sourceId || !set) return {};
  const setId = setIdFor(sourceId, set.key);
  await tx.assetSet.upsert({ where: { id: setId }, create: { id: setId, name: set.name, kind: set.kind, createdAt: now() }, update: {} });
  return { setId, setRole: set.role ?? 'member' };
}
// หัวทุนจากไฟล์ต้นฉบับ: สร้างรายชื่อทุนไว้ และจดเป็น "รายการแนะนำ" (fundHintId) ยังไม่นับว่ามาจากทุนจนเจ้าหน้าที่ยืนยัน
// หัวเดียวกันที่พิมพ์ซ้ำทุกหน้า/ทุกแผ่น (ชื่อเหมือนกัน ไม่สนช่องว่างซ้อน) = ทุนเดียวกัน
const fundName = (name: string) => name.trim().replace(/\s+/g, ' ');
async function fundIdsByName(tx: Transaction) {
  const funds = await tx.assetSet.findMany({ where: { kind: 'fund' }, select: { id: true, name: true } });
  return new Map(funds.map(f => [fundName(f.name), f.id]));
}
async function hintFund(tx: Transaction, sourceId: string | null, fund: CandidateFund | undefined) {
  if (!sourceId || !fund) return {};
  const name = fundName(fund.name);
  const existing = (await fundIdsByName(tx)).get(name);
  if (existing) return { fundHintId: existing };
  const fundHintId = setIdFor(sourceId, 'fund:' + name);
  await tx.assetSet.upsert({ where: { id: fundHintId }, create: { id: fundHintId, name, kind: 'fund', createdAt: now() }, update: {} });
  return { fundHintId };
}
// หมายเลขครุภัณฑ์ห้ามซ้ำ (เทียบด้วย codeKey) และบอกให้ชัดว่าซ้ำกับรายการไหน แทนข้อความกลางๆ จากฐานข้อมูล
export { codeKey };
// registered: รายการรหัสในทะเบียนที่อ่านไว้แล้วใน transaction เดียวกัน (นำเข้าแบบกลุ่ม) ไม่ต้องอ่านทั้งตารางซ้ำ
async function assertCodesFree(tx: Transaction, codes: string[], exceptId?: string, registered?: Map<string, string>) {
  const wanted = new Map(codes.map(c => [codeKey(c), c]));
  if (wanted.size !== codes.length) throw new ApiError('หมายเลขครุภัณฑ์ในรายการที่เพิ่มซ้ำกันเอง กรุณาตรวจสอบ', 409);
  if (registered) {
    const dup = [...wanted].find(([key]) => registered.has(key));
    if (dup) throw new ApiError(`หมายเลขครุภัณฑ์ ${dup[1]} ซ้ำกับรายการที่มีในทะเบียนแล้ว: ${registered.get(dup[0])}`, 409);
    return;
  }
  const existing = await tx.asset.findMany({ select: { id: true, code: true, name: true, branch: true, lifecycle: true } });
  const hit = existing.find(a => a.id !== exceptId && wanted.has(codeKey(a.code)));
  if (hit) {
    const state = hit.lifecycle === 'disposed' ? ' ซึ่งจำหน่ายแล้ว' : hit.lifecycle === 'split' ? ' (ประวัติการแบ่งล็อต)' : '';
    throw new ApiError(`หมายเลขครุภัณฑ์ ${wanted.get(codeKey(hit.code))} ซ้ำกับรายการที่มีในทะเบียนแล้ว: ${hit.code} · ${hit.name} · ${branchAbbr(hit.branch)}${state}`, 409);
  }
}
// ครุภัณฑ์ในชุดเดียวกันที่ยังใช้งาน (ห้ามแยก: โอนย้าย/จำหน่ายต้องทำทั้งชุด)
async function setMembers(tx: Transaction, setId: string) {
  return tx.asset.findMany({ where: { setId, lifecycle: 'active' } });
}
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
    sourceRows = classify(await getSource(clean(input.sourceId)), await loadOverrides(clean(input.sourceId)));
  }
  // Version/pending checks and writes must share a serializable snapshot.
  const isolationLevel: Prisma.TransactionIsolationLevel = 'Serializable';
  // Serializable อาจยกเลิก transaction ที่ทำพร้อมกันแม้แก้คนละรายการ (P2034) เช่น 2 คนเพิ่มครุภัณฑ์พร้อมกัน
  // ซึ่งต่างก็อ่านรหัสทั้งทะเบียนเพื่อตรวจรหัสซ้ำ: ทุกอย่างถูกย้อนกลับแล้ว จึงลองใหม่ได้อย่างปลอดภัย
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const m = await freshMember(tx, member);
        const existing = await tx.operation.findUnique({ where: { id: token } });
        if (existing) return replay(existing);
        const result = await perform(tx, m, action, input, passwordHash, sourceRows && structuredClone(sourceRows));
        await tx.operation.create({ data: { id: token, valid: 1, actor: m.id, createdAt: now(), requestHash, response: json(result) } });
        return result;
      }, { isolationLevel, maxWait: 15000, timeout: 45000 });
    } catch (error) {
      const code = (error as { code?: string }).code || '';
      // A concurrent identical request may have committed while this transaction rolled back.
      if (['P2002', 'P2034'].includes(code)) {
        const existing = await prisma.operation.findUnique({ where: { id: token } });
        if (existing) return replay(existing);
      }
      if (code === 'P2034' && attempt < 3) continue;
      throw error;
    }
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
    // หัวหน้าสาขาที่ไม่มีสาขาอนุมัติคำขอใดไม่ได้เลย (ถูกปฏิเสธทุกครั้ง) จึงต้องระบุสาขาตั้งแต่สร้าง/แก้บัญชี
    if (role === 'head' && !userBranch) throw new ApiError('หัวหน้าสาขาต้องระบุสาขาที่รับผิดชอบ');
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
    // สาขา/หน่วยงานต้องเลือกจากรายการมาตรฐาน (ผู้ใช้ตัดสินใจ 15 ต.ค. 2569) กันพิมพ์ผิดแบบ "อว" "โลจิส"
    if (!isStandardBranch(a.branch!)) throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
    let sourceId: string | null = null, sourceRow: string | null = null, raw: unknown = null, sourceSet: CandidateSet | undefined, sourceFund: CandidateFund | undefined;
    if (action === 'import') {
      sourceId = clean(b.sourceId); sourceRow = clean(b.sourceRow);
      const row = sourceRows?.find(x => x.key === sourceRow);
      if (!row || row.kind !== 'asset') throw new ApiError('เลือกแถวรายการครุภัณฑ์');
      if (!b.reviewed) throw new ApiError('กรุณาตรวจสอบข้อมูลก่อนนำเข้า');
      raw = row; sourceSet = row.set; sourceFund = row.fund;
    }
    if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!) && !reason) throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาระบุเหตุผลที่ใช้ยอดนี้');
    const range = expandRange(a.code!, a.quantity!);
    if (a.code!.includes('ถึง') && !range) throw new ApiError('กรุณายืนยันหมายเลขครุภัณฑ์ที่ชัดเจนก่อนนำเข้า เก็บรหัสช่วงเดิมในหมายเหตุ');
    await assertCodesFree(tx, [a.code!, ...(range ?? [])]);
    const setLink = await linkToSet(tx, sourceId, sourceSet);
    const fundLink = await hintFund(tx, sourceId, sourceFund);
    const base = { ...a, id: id(), lifecycle: range ? 'split' : 'active', version: 1, parentId: null, sourceId, sourceRow, createdAt: now(), ...setLink, ...fundLink } as Asset;
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
    // อ่านรหัสในทะเบียนครั้งเดียว ใช้ทั้งข้ามแถวที่ซ้ำและตรวจรหัสซ้ำก่อนบันทึก
    const registered = await registeredCodes(tx);
    if (b.allReady) {
      // ข้ามแถวที่หมายเลขมีในทะเบียนแล้ว (หน้าตรวจทานขึ้นเตือนไว้) แทนที่จะให้ทั้งชุดล้มเพราะแถวเดียว
      markExistingCodes(allRows, registered, doneKeys);
      keys = allRows.filter(r => r.kind === 'asset' && !r.issue && !doneKeys.has(r.key)).map(r => r.key);
    }
    keys = keys.filter(k => !doneKeys.has(k));
    if (!keys.length) throw new ApiError('ไม่มีรายการที่พร้อมนำเข้า หรือถูกนำเข้าหมดแล้ว');

    keys = [...new Set(keys)];
    const reason = clean(b.reason ?? 'ตรวจทานและนำเข้าแบบกลุ่ม');
    const assetsToInsert: Prisma.AssetCreateManyInput[] = [];
    const sourceRowsToInsert: Prisma.SourceRowCreateManyInput[] = [];
    const codes = new Set<string>();
    const setsToInsert = new Map<string, CandidateSet>();
    let fundIds: Map<string, string> | undefined;
    const addAsset = (a: Asset) => {
      if (codes.has(a.code)) throw new ApiError('รหัสครุภัณฑ์ซ้ำในรายการที่เลือก กรุณาตรวจทานทีละรายการ', 409);
      codes.add(a.code);
      assetsToInsert.push(financialData(a) as Prisma.AssetCreateManyInput);
    };
    // เลือกจากมุมมองแบบ Excel (ผู้ใช้ขอ 16 ต.ค. 2569): แถว "ต้องตรวจ" นำเข้าตามไฟล์ได้ โดยติดหมายเหตุ "ต้องตรวจ: ..."
    // ให้ตามแก้ภายหลัง แถวที่บันทึกไม่ได้จริง (รหัสซ้ำ) ข้ามและแจ้งกลับ ไม่ทำให้ทั้งชุดล้ม
    const forced = b.includeIssues === true && !b.allReady;
    const skipped: Array<{ key: string; row: number; sheet: string; reason: string }> = [];
    const taken = new Set<string>();
    // ติ๊กหัวทุนมาด้วย = เจ้าหน้าที่ยืนยันว่ารายการที่อยู่ใต้หัวทุนนั้น (และเลือกมาด้วยกัน) มาจากทุนนี้จริง → ผูกเข้าทุนเลย (fundId)
    // ไม่ได้ติ๊กหัวทุน = ทุนเป็นแค่รายการแนะนำเหมือนเดิม (ผู้ใช้ขอ 16 ต.ค. 2569)
    const pickedFunds = new Set(forced ? keys.filter(k => { const r = rowMap.get(k); return r?.kind === 'group' && r.set?.kind === 'heading'; }) : []);
    if (forced) keys = keys.filter(k => rowMap.get(k)?.kind === 'asset');   // หัวทุน/หัวกระดาษที่ติ๊กมาไม่ใช่ครุภัณฑ์
    // เลือกสาขาตอนกดนำเข้า (ผู้ใช้ขอ 17 ต.ค. 2569): ทุกแถวที่เลือกเข้าสาขานี้แทนสาขาที่อ่านจากไฟล์
    const pickedBranch = forced && typeof b.branch === 'string' ? clean(b.branch) : '';
    if (pickedBranch && !isStandardBranch(pickedBranch)) throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
    if (!keys.length) throw new ApiError('เลือกแถวครุภัณฑ์อย่างน้อย 1 แถว');
    let linked = 0;
    for (const key of keys) {
      const row = rowMap.get(key);
      if (!row || row.kind !== 'asset') throw new ApiError('รายการที่เลือกไม่ใช่แถวครุภัณฑ์ กรุณาโหลดใหม่');
      if (row.issue && !forced) throw new ApiError('รายการที่เลือกมีข้อมูลต้องตรวจทาน กรุณาเปิดตรวจสอบและยืนยันทีละรายการ');
      const skip = (reason: string) => { skipped.push({ key, row: row.row, sheet: row.sheet, reason }); };
      // ไม่มีจำนวนในไฟล์: ใส่ 1 ไว้ก่อนแล้วติดหมายเหตุให้ตามแก้ (ผู้ใช้ขอ 16 ต.ค. 2569)
      const noQty = !!row.issue && !((row.asset.quantity ?? 0) >= 1);
      // เลือกสาขาให้แล้ว ปัญหา "ระบุไว้หลายสาขา" จึงหมดไป
      const issue = pickedBranch && row.issueType === 'branch' ? '' : row.issue;
      const input = issue ? {
        ...row.asset,
        code: row.asset.code || `ไม่มีรหัส-${row.sheet}-${row.row}`,
        name: row.asset.name || 'ไม่มีชื่อรายการ',
        ...(noQty ? { quantity: 1 } : {}),
        notes: [row.asset.notes, 'ต้องตรวจ: ' + issue, noQty ? 'ไม่ระบุจำนวนในไฟล์ (ใส่ 1 ไว้ก่อน)' : ''].filter(Boolean).join(' · ').slice(0, 5000),
        ...(pickedBranch ? { branch: pickedBranch } : {}),
      } : { ...row.asset, ...(pickedBranch ? { branch: pickedBranch } : {}) };
      let a: Partial<Asset>;
      try { a = validated(input); }
      catch (error) { if (forced && error instanceof ApiError) { skip(error.message); continue; } throw error; }
      if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!) && !row.issue) throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาตรวจทานทีละรายการ');
      const range = expandRange(a.code!, a.quantity!);
      if (a.code!.includes('ถึง') && !range && !row.issue) throw new ApiError('รหัสช่วงไม่ชัดเจน กรุณาตรวจทานทีละรายการ');
      if (forced) {
        const dup = [a.code!, ...(range ?? [])].map(codeKey).find(k => registered.has(k) || taken.has(k));
        if (dup) { skip(registered.has(dup) ? 'รหัสซ้ำกับรายการในทะเบียน: ' + registered.get(dup) : 'รหัสซ้ำกับแถวอื่นที่เลือก'); continue; }
        [a.code!, ...(range ?? [])].forEach(c => taken.add(codeKey(c)));
      }
      if (row.set) setsToInsert.set(setIdFor(sourceId, row.set.key), row.set);
      let fundHintId: string | undefined;
      if (row.fund) {
        const name = fundName(row.fund.name);
        if (!fundIds) fundIds = await fundIdsByName(tx);
        fundHintId = fundIds.get(name);
        if (!fundHintId) {
          fundHintId = setIdFor(sourceId, 'fund:' + name);
          fundIds.set(name, fundHintId);
          setsToInsert.set(fundHintId, { key: row.fund.key, name, kind: 'fund' as CandidateSet['kind'] });
        }
      }
      const base = { ...a, id: id(), lifecycle: range ? 'split' : 'active', version: 1,
        parentId: null, sourceId, sourceRow: key, createdAt: now(),
        ...(row.set ? { setId: setIdFor(sourceId, row.set.key), setRole: row.set.role ?? 'member' } : {}),
        ...(fundHintId ? { fundHintId } : {}),
        ...(fundHintId && row.fund && pickedFunds.has(row.fund.key) ? { fundId: fundHintId } : {}) } as Asset;
      if (base.fundId) linked++;
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
    if (!assetsToInsert.length) throw new ApiError('ไม่มีรายการที่นำเข้าได้: ' + skipped.slice(0, 3).map(x => `แถว ${x.row} ${x.reason}`).join(' · '), 409);
    await assertCodesFree(tx, [...codes], undefined, registered);
    await tx.location.createMany({ data: [...new Set(assetsToInsert.map(a => a.location))].map(name => ({ name })), skipDuplicates: true });
    await tx.branch.createMany({ data: [...new Set(assetsToInsert.map(a => a.branch))].map(name => ({ name })), skipDuplicates: true });
    await tx.category.createMany({ data: [...new Set(assetsToInsert.map(a => a.category))].map(name => ({ name })), skipDuplicates: true });
    await tx.assetGroup.createMany({ data: [...new Set(assetsToInsert.map(a => a.groupName))].map(name => ({ name, description: name })), skipDuplicates: true });
    if (setsToInsert.size) await tx.assetSet.createMany({ data: [...setsToInsert].map(([setId, set]) => ({ id: setId, name: set.name, kind: set.kind, createdAt: now() })), skipDuplicates: true });
    // A conflict must roll back the entire batch, including all source decisions.
    await tx.asset.createMany({ data: assetsToInsert });
    await tx.sourceRow.createMany({ data: sourceRowsToInsert });
    const importedCount = sourceRowsToInsert.length;

    const flagged = keys.filter(k => rowMap.get(k)?.issue && !skipped.some(x => x.key === k)).length;
    await audit(tx, m, 'นำเข้าครุภัณฑ์แบบกลุ่ม', null, null, { sourceId, count: importedCount, requested: keys.length, flagged, skipped, linkedToFund: linked },
      `นำเข้าพร้อมกัน ${importedCount} รายการ` + (linked ? ` ผูกกับหัวทุน ${linked}` : '') + (flagged ? ` (ต้องตรวจภายหลัง ${flagged})` : '') + (skipped.length ? ` ข้าม ${skipped.length}` : ''));
    return { ok: true, count: importedCount, importedCount, ...(linked ? { linked } : {}), ...(skipped.length ? { skipped } : {}) };
  }
  // เปลี่ยนประเภทแถวต้นฉบับ (หน้านำเข้าแบบ Excel): as = หัวทุน / บรรทัดต่อ / ครุภัณฑ์ / ข้าม หรือ 'auto' = กลับเป็นค่าที่ระบบเดา
  if (action === 'rowOverride') {
    allow(m, ['staff', 'admin']);
    const sourceId = clean(b.sourceId, 100);
    if (!/^[a-zA-Z0-9-]+$/.test(sourceId) || !(await tx.importFile.findUnique({ where: { id: sourceId } }))) throw new ApiError('ไม่พบไฟล์ต้นฉบับ', 404);
    const as = clean(b.as, 20);
    if (as !== 'auto' && !isRowOverride(as)) throw new ApiError('ประเภทแถวไม่ถูกต้อง');
    const keys: string[] = Array.isArray(b.keys) ? [...new Set(b.keys.filter((k: unknown) => typeof k === 'string').map((k: string) => clean(k, 200)))] as string[] : [];
    if (!keys.length || keys.length > 5000) throw new ApiError('เลือกแถวอย่างน้อย 1 แถว');
    const done = await tx.sourceRow.findFirst({ where: { sourceId, sourceRow: { in: keys } }, select: { sourceRow: true } });
    if (done) throw new ApiError('แถว ' + done.sourceRow + ' นำเข้าแล้ว เปลี่ยนประเภทไม่ได้ กรุณาแก้ที่หน้าทะเบียน', 409);
    const map = await loadOverrides(sourceId, tx);
    for (const key of keys) { if (as === 'auto') delete map[key]; else map[key] = as; }
    await tx.storedFile.upsert({ where: { key: overridesKey(sourceId) }, create: { key: overridesKey(sourceId), body: Buffer.from(JSON.stringify(map), 'utf8') }, update: { body: Buffer.from(JSON.stringify(map), 'utf8') } });
    await audit(tx, m, 'เปลี่ยนประเภทแถวต้นฉบับ', null, null, { sourceId, as, keys }, `${keys.length} แถว`);
    return { ok: true, count: keys.length };
  }
  // ทุน / โครงการ: เจ้าหน้าที่สร้างทุนและเลือกครุภัณฑ์ใส่เอง (ไม่นับรายการที่อยู่ต่อลงมาเองอัตโนมัติ)
  if (action === 'fundSave' || action === 'fundDelete' || action === 'fundAssign' || action === 'fundUnassign') {
    allow(m, ['staff', 'admin']);
    const fundOf = async (fundId: string) => {
      const f = await tx.assetSet.findUnique({ where: { id: fundId } });
      if (!f || f.kind !== 'fund') throw new ApiError('ไม่พบทุนนี้', 404);
      return f;
    };
    if (action === 'fundSave') {
      const name = fundName(clean(b.name ?? '', 500));
      if (!name) throw new ApiError('กรุณาระบุชื่อทุน / โครงการ');
      if (b.fundId) {
        const f = await fundOf(clean(b.fundId));
        await tx.assetSet.update({ where: { id: f.id }, data: { name } });
        await audit(tx, m, 'แก้ชื่อทุน', null, f, { ...f, name });
        return { ok: true, id: f.id };
      }
      // เทียบชื่อแบบไม่สนช่องว่างซ้อน (ชื่อหัวทุนจากไฟล์ต้นฉบับมีช่องว่างหลายช่อง)
      const same = (await fundIdsByName(tx)).get(name);
      if (same) return { ok: true, id: same, existing: true };
      const f = { id: 'fund-' + id(), name, kind: 'fund', createdAt: now() };
      await tx.assetSet.create({ data: f });
      await audit(tx, m, 'สร้างทุน', null, null, f);
      return { ok: true, id: f.id };
    }
    if (action === 'fundDelete') {
      const f = await fundOf(clean(b.fundId));
      const members = await tx.asset.findMany({ where: { fundId: f.id }, select: { id: true } });
      // ไม่เพิ่มเวอร์ชัน: ทุนไม่ได้แก้ผ่านฟอร์มแก้ไข และคำขอที่รออนุมัติผูกกับเวอร์ชันของครุภัณฑ์ (เพิ่มแล้วคำขอจะอนุมัติไม่ได้)
      await tx.asset.updateMany({ where: { fundId: f.id }, data: { fundId: null } });
      await tx.asset.updateMany({ where: { fundHintId: f.id }, data: { fundHintId: null } });
      await tx.assetSet.delete({ where: { id: f.id } });
      await audit(tx, m, 'ลบทุน', null, { ...f, assetIds: members.map(x => x.id) }, null);
      return { ok: true };
    }
    const ids: string[] = Array.isArray(b.assetIds) ? [...new Set(b.assetIds.filter((x: unknown) => typeof x === 'string').map((x: string) => clean(x, 100)))] as string[] : [];
    if (!ids.length || ids.length > 5000) throw new ApiError('เลือกครุภัณฑ์อย่างน้อย 1 รายการ');
    const rows = await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, fundId: true, lifecycle: true } });
    if (rows.length !== ids.length) throw new ApiError('ไม่พบครุภัณฑ์บางรายการ กรุณาโหลดใหม่', 409);
    // ใส่/เอาออกจากทุนเพิ่มเวอร์ชันของครุภัณฑ์ ถ้ามีคำขอรออนุมัติ คำขอนั้นจะอนุมัติไม่ได้อีก จึงต้องรอให้คำขอเสร็จก่อน
    const busy = await tx.assetRequest.findFirst({ where: { status: 'pending', assetId: { in: ids } }, select: { assetId: true } });
    if (busy) throw new ApiError('รายการ ' + rows.find(x => x.id === busy.assetId)!.code + ' มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อนเปลี่ยนทุน', 409);
    if (action === 'fundAssign') {
      const f = await fundOf(clean(b.fundId));
      const inactive = rows.find(x => x.lifecycle !== 'active');
      if (inactive) throw new ApiError('รายการ ' + inactive.code + ' ถูกแบ่งยอดหรือจำหน่ายแล้ว');
      const other = rows.find(x => x.fundId && x.fundId !== f.id);
      if (other) throw new ApiError('รายการ ' + other.code + ' อยู่ในทุนอื่นแล้ว ต้องเอาออกจากทุนเดิมก่อน', 409);
      const add = rows.filter(x => x.fundId !== f.id).map(x => x.id);
      if (add.length) await tx.asset.updateMany({ where: { id: { in: add } }, data: { fundId: f.id, version: { increment: 1 } } });
      await audit(tx, m, 'ใส่ครุภัณฑ์เข้าทุน', null, null, { fundId: f.id, fundName: f.name, assetIds: add });
      return { ok: true, count: add.length };
    }
    const remove = rows.filter(x => x.fundId);
    if (remove.length) await tx.asset.updateMany({ where: { id: { in: remove.map(x => x.id) } }, data: { fundId: null, version: { increment: 1 } } });
    await audit(tx, m, 'เอาครุภัณฑ์ออกจากทุน', null, remove.map(x => ({ id: x.id, code: x.code, fundId: x.fundId })), null);
    return { ok: true, count: remove.length };
  }
  // แก้ไขหลายรายการพร้อมกัน (ผู้ใช้ขอ 17 ต.ค. 2569): ใช้แก้ข้อมูลที่กรอกผิด ไม่ใช่โอนย้ายของจริง
  // แก้ได้เฉพาะ สาขา ประเภท สถานที่ สภาพ (ปกติ/ชำรุด) — ยอดเงินยังต้องแก้ผ่านแบ่งล็อต ทุกชิ้นสำเร็จหรือไม่มีชิ้นไหนเปลี่ยนเลย
  if (action === 'bulkEdit') {
    allow(m, ['staff', 'admin']);
    const ids: string[] = Array.isArray(b.ids) ? [...new Set<string>(b.ids.filter((x: unknown) => typeof x === 'string').map((x: string) => clean(x)))] : [];
    if (!ids.length || ids.length > 1000) throw new ApiError('เลือกครุภัณฑ์ 1–1,000 รายการ');
    const reason = clean(b.reason ?? '');
    if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแก้ไข');
    const ch = b.changes && typeof b.changes === 'object' ? b.changes : {};
    const changes: { branch?: string; category?: string; groupName?: string; location?: string; condition?: string } = {};
    if (ch.branch !== undefined) {
      if (typeof ch.branch !== 'string' || !isStandardBranch(ch.branch)) throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
      changes.branch = ch.branch;
    }
    if (ch.category !== undefined) {
      if (typeof ch.category !== 'string' || !(assetTypes as readonly string[]).includes(ch.category)) throw new ApiError('ประเภทครุภัณฑ์ไม่ถูกต้อง');
      changes.category = ch.category;
      changes.groupName = assetGroupOfType(ch.category);
    }
    if (ch.location !== undefined) {
      const location = typeof ch.location === 'string' ? clean(ch.location) : '';
      if (!location) throw new ApiError('กรุณาระบุสถานที่');
      changes.location = location;
    }
    if (ch.condition !== undefined) {
      if (ch.condition !== 'normal' && ch.condition !== 'damaged') throw new ApiError('สภาพแก้แบบกลุ่มได้เฉพาะ ปกติ หรือ ชำรุด');
      changes.condition = ch.condition;
    }
    if (!Object.keys(changes).length) throw new ApiError('เลือกช่องที่จะแก้อย่างน้อย 1 ช่อง');
    const rows = await tx.asset.findMany({ where: { id: { in: ids } } });
    if (rows.length !== ids.length) throw new ApiError('บางรายการไม่พบแล้ว กรุณาโหลดใหม่', 409);
    const versions = b.versions && typeof b.versions === 'object' ? b.versions as Record<string, unknown> : {};
    for (const r of rows) {
      if (r.lifecycle !== 'active') throw new ApiError('รายการ ' + r.code + ' ถูกแบ่งยอดหรือปิดบัญชีแล้ว');
      if (versions[r.id] !== r.version) throw new ApiError('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
      if (changes.condition && r.condition === 'repair') throw new ApiError('รายการ ' + r.code + ' อยู่ระหว่างซ่อม ต้องบันทึกซ่อมเสร็จก่อน');
    }
    const pending = await tx.assetRequest.findFirst({ where: { assetId: { in: ids }, status: 'pending' } });
    if (pending) throw new ApiError('รายการ ' + (rows.find(r => r.id === pending.assetId)?.code ?? '') + ' มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน');
    await dimensions(tx, { ...plain(rows[0]), ...changes } as Partial<Asset>);
    await tx.asset.updateMany({ where: { id: { in: ids } }, data: { ...changes, version: { increment: 1 } } });
    const keys = Object.keys(changes) as Array<keyof typeof changes>;
    for (const r of rows) {
      const before = Object.fromEntries(keys.map(k => [k, (r as Record<string, unknown>)[k]]));
      await audit(tx, m, 'แก้ไขครุภัณฑ์ (หลายรายการ)', r.id, before, changes, reason);
    }
    return { ok: true, count: rows.length };
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
      if (next.branch !== a.branch && !isStandardBranch(next.branch!)) throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
      if (next.quantity !== a.quantity || next.totalSatang !== a.totalSatang || next.unitSatang !== a.unitSatang) throw new ApiError('จำนวนและมูลค่าที่ลงทะเบียนแล้วแก้ตรงนี้ไม่ได้ ใช้แบ่งล็อตพร้อมหลักฐาน');
      if (codeKey(next.code!) !== codeKey(a.code)) await assertCodesFree(tx, [next.code!], a.id);
      await dimensions(tx, next);
      await tx.asset.update({ where: { id: a.id }, data: { ...financialData(next), version: { increment: 1 } } });
      await audit(tx, m, 'แก้ไขครุภัณฑ์', a.id, a, next, reason);
    }
    if (action === 'split') {
      if (a.setId) throw new ApiError('ครุภัณฑ์ในชุดห้ามแยก จึงแบ่งล็อตไม่ได้');
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
      // ปลายทางเหมือนเดิมทุกอย่าง = ไม่มีอะไรย้าย ไม่ต้องส่งให้ผู้อนุมัติ 3 ขั้น (เปลี่ยนแค่ผู้รับผิดชอบยังยื่นได้)
      if (kind === 'transfer' && payload.location === a.location && payload.branch === normalizeBranch(a.branch, '', '')
        && (!payload.custodian || payload.custodian === a.custodian)) {
        throw new ApiError('สถานที่ สาขา และผู้รับผิดชอบปลายทางเหมือนเดิม กรุณาแก้ปลายทางก่อนยื่นคำขอโอนย้าย');
      }
      if (kind === 'transfer' && !isStandardBranch(payload.branch)) throw new ApiError('สาขาปลายทางไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
      if (kind === 'repair' && a.condition === 'repair') throw new ApiError('รายการนี้อยู่ระหว่างซ่อมแล้ว กรุณาบันทึกผลการซ่อมก่อนยื่นคำขอซ่อมใหม่');
      if (kind === 'repair') {
        payload.estimateSatang = validatedReq.payload?.estimateSatang ?? 0;
      }
      const config = await tx.setting.findUnique({ where: { key: 'workflow' } }), chain = json(approvalChainOf(config?.value).chain);

      const splitQty = splitQuantity ?? null;
      if (splitQty !== null) {
        if (!Number.isInteger(splitQty) || splitQty < 1 || splitQty >= a.quantity) {
          throw new ApiError('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึง ' + (a.quantity - 1));
        }
        if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแบ่งล็อต');
        // กฎ: ยังไม่แบ่งล็อตตอนยื่นคำขอ เก็บจำนวนไว้ในคำขอ แล้วแบ่งเมื่ออนุมัติขั้นสุดท้าย (ถูกปฏิเสธ = ทะเบียนไม่เปลี่ยน)
        payload.splitQuantity = splitQty;
      }

      // ชุดห้ามแยก: โอนย้าย/จำหน่ายมีผลทั้งชุด ส่วนส่งซ่อมทำทีละชิ้นได้ (ผู้ใช้ยืนยัน 13 ต.ค. 2569)
      if (a.setId) {
        const members = await setMembers(tx, a.setId);
        const pending = await tx.assetRequest.findMany({ where: { status: 'pending', assetId: { in: members.map(x => x.id) } }, select: { kind: true } });
        if (kind === 'transfer' || kind === 'disposal') {
          if (splitQty !== null) throw new ApiError('ครุภัณฑ์ในชุดต้องโอนย้ายหรือจำหน่ายทั้งชุด แบ่งจำนวนไม่ได้');
          if (pending.length) throw new ApiError('รายการในชุดนี้มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน');
          payload.setId = a.setId;
          payload.setCount = members.length;
        } else if (pending.some(p => p.kind === 'transfer' || p.kind === 'disposal')) {
          throw new ApiError('ชุดนี้มีคำขอโอนย้าย/จำหน่ายทั้งชุดรออนุมัติ กรุณาดำเนินการให้เสร็จก่อน');
        }
      }

      const req = await tx.assetRequest.create({ data: { id: id(), assetId: a.id, assetVersion: a.version + 1, kind, payload: json(payload), reason, chain, actor: m.id, createdAt: now() } });
      await tx.asset.update({ where: { id: a.id }, data: { version: { increment: 1 } } });
      await audit(tx, m, 'ส่งคำขอ ' + requestTypes[kind as keyof typeof requestTypes], a.id, a, req, reason);
      return { ok: true, id: req.id, assetId: a.id };
    }
    if (action === 'repairComplete') {
      if (a.condition !== 'repair') throw new ApiError('รายการนี้ไม่ได้อยู่ระหว่างซ่อม จึงบันทึกซ่อมเสร็จไม่ได้');
      if (!reason) throw new ApiError('กรุณาระบุรายละเอียดการซ่อม');
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
      // คำขอโอนย้าย/จำหน่ายของครุภัณฑ์ในชุด มีผลกับทุกรายการในชุดที่ยังใช้งาน
      const wholeSet = payload.setId && (r.kind === 'transfer' || r.kind === 'disposal')
        ? (await setMembers(tx, String(payload.setId))).filter(x => x.id !== target.id).map(x => plain<Asset>(x)) : [];
      const affected = [target, ...wholeSet];
      if (r.kind === 'transfer') {
        // แปลงชื่อสาขาปลายทางเป็นชื่อมาตรฐานก่อนเขียน (รวมคำขอเก่าที่เก็บชื่อแบบย่อไว้)
        const location = clean(payload.location), branch = normalizeBranch(clean(payload.branch), '', '');
        const custodian = payload.custodian ? clean(payload.custodian, 200) : '';
        await tx.location.createMany({ data: [{ name: location }], skipDuplicates: true });
        await tx.branch.createMany({ data: [{ name: branch }], skipDuplicates: true });
        // เปลี่ยนผู้รับผิดชอบเฉพาะเมื่อคำขอระบุไว้ ประวัติเดิม/ใหม่เก็บใน audit (before/after) ของรายการนี้
        for (const x of affected) await tx.asset.update({ where: { id: x.id }, data: { location, branch, ...(custodian ? { custodian } : {}), version: { increment: 1 } } });
      }
      if (r.kind === 'repair') await tx.asset.update({ where: { id: target.id }, data: { condition: 'repair', version: { increment: 1 } } });
      if (r.kind === 'disposal') for (const x of affected) await tx.asset.update({ where: { id: x.id }, data: { lifecycle: 'disposed', version: { increment: 1 } } });
      for (const x of wholeSet) await audit(tx, m, 'ดำเนินการ ' + requestTypes[r.kind as keyof typeof requestTypes] + ' (ทั้งชุด)', x.id, x, { ...payload, kind: r.kind, requestId: r.id }, r.reason);
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
