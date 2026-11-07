import { json, Prisma } from '../../db/client';
import {
  type Asset,
  type CandidateSet,
  expandRange,
  codeKey,
  markExistingCodes,
  isStandardBranch,
  isRowOverride,
} from '../../contracts/domain';
import {
  ApiError,
  clean,
  allow,
  now,
  id,
  audit,
  financialData,
  validated,
  registeredCodes,
  loadOverrides,
  overridesKey,
} from '../asset-service';
import { type MutationContext } from './types';
import { setIdFor, fundName, fundIdsByName, assertCodesFree, split } from './helpers';

// คำสั่งของหน้านำเข้า Excel: นำเข้าแบบกลุ่ม และเปลี่ยนประเภทแถวที่ระบบเดาผิด

// นำเข้าหลายแถวจากไฟล์ Excel พร้อมกัน: ทุกแถวสำเร็จพร้อมกันหรือไม่บันทึกเลย
export async function batchImport({ tx, m, b, sourceRows }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const sourceId = clean(b.sourceId);
  const allRows = sourceRows!;
  const rowMap = new Map(allRows.map(x => [x.key, x]));
  const existingDecisions = await tx.sourceRow.findMany({ where: { sourceId }, select: { sourceRow: true } });
  const doneKeys = new Set(existingDecisions.map(x => x.sourceRow));

  let keys: string[] = Array.isArray(b.keys)
    ? b.keys.filter((k: unknown) => typeof k === 'string').map((k: string) => clean(k))
    : [];
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
    if (codes.has(a.code)) throw new ApiError('หมายเลขครุภัณฑ์ซ้ำในรายการที่เลือก กรุณาตรวจทีละรายการ', 409);
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
  const pickedFunds = new Set(
    forced
      ? keys.filter(k => {
          const r = rowMap.get(k);
          return r?.kind === 'group' && r.set?.kind === 'heading';
        })
      : [],
  );
  if (forced) keys = keys.filter(k => rowMap.get(k)?.kind === 'asset'); // หัวทุน/หัวกระดาษที่ติ๊กมาไม่ใช่ครุภัณฑ์
  // เลือกสาขาตอนกดนำเข้า (ผู้ใช้ขอ 17 ต.ค. 2569): ทุกแถวที่เลือกเข้าสาขานี้แทนสาขาที่อ่านจากไฟล์
  const pickedBranch = forced && typeof b.branch === 'string' ? clean(b.branch) : '';
  if (pickedBranch && !isStandardBranch(pickedBranch))
    throw new ApiError('สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน');
  if (!keys.length) throw new ApiError('เลือกแถวครุภัณฑ์อย่างน้อย 1 แถว');
  let linked = 0;
  for (const key of keys) {
    const row = rowMap.get(key);
    if (!row || row.kind !== 'asset') throw new ApiError('รายการที่เลือกไม่ใช่แถวครุภัณฑ์ กรุณาโหลดใหม่');
    if (row.issue && !forced)
      throw new ApiError('รายการที่เลือกมีข้อมูลต้องตรวจทาน กรุณาเปิดตรวจสอบและยืนยันทีละรายการ');
    const skip = (reason: string) => {
      skipped.push({ key, row: row.row, sheet: row.sheet, reason });
    };
    // ไม่มีจำนวนในไฟล์: ใส่ 1 ไว้ก่อนแล้วติดหมายเหตุให้ตามแก้ (ผู้ใช้ขอ 16 ต.ค. 2569)
    const noQty = !!row.issue && !((row.asset.quantity ?? 0) >= 1);
    // เลือกสาขาให้แล้ว ปัญหา "ระบุไว้หลายสาขา" จึงหมดไป
    const issue = pickedBranch && row.issueType === 'branch' ? '' : row.issue;
    const input = issue
      ? {
          ...row.asset,
          code: row.asset.code || `ไม่มีรหัส-${row.sheet}-${row.row}`,
          name: row.asset.name || 'ไม่มีชื่อรายการ',
          ...(noQty ? { quantity: 1 } : {}),
          notes: [row.asset.notes, 'ต้องตรวจ: ' + issue, noQty ? 'ไม่ระบุจำนวนในไฟล์ (ใส่ 1 ไว้ก่อน)' : '']
            .filter(Boolean)
            .join(' · ')
            .slice(0, 5000),
          ...(pickedBranch ? { branch: pickedBranch } : {}),
        }
      : { ...row.asset, ...(pickedBranch ? { branch: pickedBranch } : {}) };
    let a: Partial<Asset>;
    try {
      a = validated(input);
    } catch (error) {
      if (forced && error instanceof ApiError) {
        skip(error.message);
        continue;
      }
      throw error;
    }
    if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!) && !row.issue)
      throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาตรวจทานทีละรายการ');
    const range = expandRange(a.code!, a.quantity!);
    if (a.code!.includes('ถึง') && !range && !row.issue) throw new ApiError('รหัสช่วงไม่ชัดเจน กรุณาตรวจทานทีละรายการ');
    if (forced) {
      const dup = [a.code!, ...(range ?? [])].map(codeKey).find(k => registered.has(k) || taken.has(k));
      if (dup) {
        skip(registered.has(dup) ? 'รหัสซ้ำกับรายการในทะเบียน: ' + registered.get(dup) : 'รหัสซ้ำกับแถวอื่นที่เลือก');
        continue;
      }
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
    const base = {
      ...a,
      id: id(),
      lifecycle: range ? 'split' : 'active',
      version: 1,
      parentId: null,
      sourceId,
      sourceRow: key,
      createdAt: now(),
      ...(row.set ? { setId: setIdFor(sourceId, row.set.key), setRole: row.set.role ?? 'member' } : {}),
      ...(fundHintId ? { fundHintId } : {}),
      ...(fundHintId && row.fund && pickedFunds.has(row.fund.key) ? { fundId: fundHintId } : {}),
    } as Asset;
    if (base.fundId) linked++;
    addAsset(base);
    if (range) {
      const amounts = split(base.quantity, base.totalSatang, 1);
      const salvage = split(base.quantity, base.salvageSatang, 1);
      range.forEach((code, i) =>
        addAsset({
          ...base,
          id: id(),
          code,
          quantity: 1,
          totalSatang: amounts[i],
          salvageSatang: salvage[i],
          lifecycle: 'active',
          parentId: base.id,
        }),
      );
    }
    sourceRowsToInsert.push({
      id: id(),
      sourceId,
      sourceRow: key,
      raw: json(row),
      decision: 'imported',
      reason,
      actor: m.id,
      createdAt: now(),
    });
  }
  if (!assetsToInsert.length)
    throw new ApiError(
      'ไม่มีรายการที่นำเข้าได้: ' +
        skipped
          .slice(0, 3)
          .map(x => `แถว ${x.row} ${x.reason}`)
          .join(' · '),
      409,
    );
  await assertCodesFree(tx, [...codes], undefined, registered);
  await tx.location.createMany({
    data: [...new Set(assetsToInsert.map(a => a.location))].map(name => ({ name })),
    skipDuplicates: true,
  });
  await tx.branch.createMany({
    data: [...new Set(assetsToInsert.map(a => a.branch))].map(name => ({ name })),
    skipDuplicates: true,
  });
  await tx.category.createMany({
    data: [...new Set(assetsToInsert.map(a => a.category))].map(name => ({ name })),
    skipDuplicates: true,
  });
  await tx.assetGroup.createMany({
    data: [...new Set(assetsToInsert.map(a => a.groupName))].map(name => ({ name, description: name })),
    skipDuplicates: true,
  });
  if (setsToInsert.size)
    await tx.assetSet.createMany({
      data: [...setsToInsert].map(([setId, set]) => ({
        id: setId,
        name: set.name,
        kind: set.kind,
        createdAt: now(),
      })),
      skipDuplicates: true,
    });
  // A conflict must roll back the entire batch, including all source decisions.
  await tx.asset.createMany({ data: assetsToInsert });
  await tx.sourceRow.createMany({ data: sourceRowsToInsert });
  const importedCount = sourceRowsToInsert.length;

  const flagged = keys.filter(k => rowMap.get(k)?.issue && !skipped.some(x => x.key === k)).length;
  await audit(
    tx,
    m,
    'นำเข้าครุภัณฑ์แบบกลุ่ม',
    null,
    null,
    { sourceId, count: importedCount, requested: keys.length, flagged, skipped, linkedToFund: linked },
    `นำเข้าพร้อมกัน ${importedCount} รายการ` +
      (linked ? ` ผูกกับหัวทุน ${linked}` : '') +
      (flagged ? ` (ต้องตรวจภายหลัง ${flagged})` : '') +
      (skipped.length ? ` ข้าม ${skipped.length}` : ''),
  );
  return {
    ok: true,
    count: importedCount,
    importedCount,
    ...(linked ? { linked } : {}),
    ...(skipped.length ? { skipped } : {}),
  };
}

// เปลี่ยนประเภทแถวต้นฉบับ (หน้านำเข้าแบบ Excel): as = หัวทุน / บรรทัดต่อ / ครุภัณฑ์ / ข้าม หรือ 'auto' = กลับเป็นค่าที่ระบบเดา
export async function rowOverride({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const sourceId = clean(b.sourceId, 100);
  if (!/^[a-zA-Z0-9-]+$/.test(sourceId) || !(await tx.importFile.findUnique({ where: { id: sourceId } })))
    throw new ApiError('ไม่พบไฟล์ต้นฉบับ', 404);
  const as = clean(b.as, 20);
  if (as !== 'auto' && !isRowOverride(as)) throw new ApiError('ประเภทแถวไม่ถูกต้อง');
  const keys: string[] = Array.isArray(b.keys)
    ? ([...new Set(b.keys.filter((k: unknown) => typeof k === 'string').map((k: string) => clean(k, 200)))] as string[])
    : [];
  if (!keys.length || keys.length > 5000) throw new ApiError('เลือกแถวอย่างน้อย 1 แถว');
  const done = await tx.sourceRow.findFirst({
    where: { sourceId, sourceRow: { in: keys } },
    select: { sourceRow: true },
  });
  if (done) throw new ApiError('แถว ' + done.sourceRow + ' นำเข้าแล้ว เปลี่ยนประเภทไม่ได้ กรุณาแก้ที่หน้าทะเบียน', 409);
  const map = await loadOverrides(sourceId, tx);
  for (const key of keys) {
    if (as === 'auto') delete map[key];
    else map[key] = as;
  }
  await tx.storedFile.upsert({
    where: { key: overridesKey(sourceId) },
    create: { key: overridesKey(sourceId), body: Buffer.from(JSON.stringify(map), 'utf8') },
    update: { body: Buffer.from(JSON.stringify(map), 'utf8') },
  });
  await audit(tx, m, 'เปลี่ยนประเภทแถวต้นฉบับ', null, null, { sourceId, as, keys }, `${keys.length} แถว`);
  return { ok: true, count: keys.length };
}
