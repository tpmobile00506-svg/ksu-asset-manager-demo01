import { headers11 } from './constants.ts';
import { satang } from './money.ts';
import type { Candidate, CandidateSet, RowOverride, Source } from './types.ts';
import {
  standardCategories,
  assetTypeOf,
  UNGROUPED,
  UNKNOWN_ASSET_TYPE,
  isAssetGroup,
  legacyGroupNames,
  assetGroupOfType,
} from './asset-types.ts';
import { normalizeBranch, branchCandidates, branchAbbr } from './branches.ts';
import { codeKey, expandRange } from './assets.ts';

// อ่านไฟล์ Excel ต้นฉบับของเจ้าหน้าที่ทีละแถว แล้วจัดว่าแถวไหนเป็นครุภัณฑ์ หัวกระดาษ ยอดรวม หรือหัวชุด/หัวทุน
// classify() คืนรายการ Candidate พร้อม "ปัญหาที่ต้องตรวจ" (issue) ของแต่ละแถว ให้หน้านำเข้าแสดง
function cell(v: unknown): unknown {
  if (v && typeof v === 'object' && 'cached' in v) return (v as { cached: unknown }).cached;
  return v;
}
function str(v: unknown) {
  return String(cell(v) ?? '').trim();
}
// ตัวเลขจากเซลล์ Excel: แปลงเลขไทย (๐–๙) และตัดเศษทศนิยมที่เกิดจากสูตร (เช่น 1260331.7999999998 → 1260331.80)
// ทศนิยมจริงเกิน 2 ตำแหน่ง (เช่น 6666.665) ไม่ปัด เพื่อให้เจ้าหน้าที่ตรวจเอง
function amount(v: unknown): unknown {
  const x = cell(v);
  if (typeof x === 'number' && Number.isFinite(x) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6)
    return (Math.round(x * 100) / 100).toFixed(2);
  if (typeof x === 'string') return x.replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0e50));
  return x;
}
// บอกปัญหาของช่องราคาให้ตรงเหตุ แทนข้อความรวมๆ
function satangSafe(v: unknown) {
  try {
    satang(amount(v));
    return true;
  } catch {
    return false;
  }
}
function priceProblem(v: unknown): string {
  const x = amount(v);
  if (v && typeof v === 'object' && 'formula' in (v as object) && (x === null || x === undefined))
    return 'ช่องราคาเป็นสูตรที่ไม่มีค่าผลลัพธ์ ต้องเปิดไฟล์ใน Excel แล้วบันทึกใหม่';
  if (x === null || x === undefined || String(x).trim() === '') return 'ยังไม่มีราคาต่อหน่วย/จำนวนเงิน';
  const n = Number(String(x).replace(/,/g, ''));
  if (isNaN(n)) return 'ช่องราคาไม่ใช่ตัวเลข: ' + String(x).slice(0, 30);
  if (n < 0) return 'ราคาติดลบ ต้องตรวจสอบต้นฉบับ';
  if (Math.round(n * 100) !== n * 100)
    return 'ราคามีทศนิยมเกิน 2 ตำแหน่ง (' + String(x) + ') ต้องปัดเป็นสตางค์ก่อนนำเข้า';
  return 'ข้อมูลราคาไม่ครบหรือไม่มีค่าผลลัพธ์สูตร';
}
type ImportColumns = { branch: number; group: number; category: number; location: number };
function tableHeader(values: unknown[]) {
  const labels = values.map(value => str(value).replace(/\s+/g, ''));
  // Recognize actual column labels, not those words occurring in an asset's notes.
  const header = headers11.slice(0, 7).every((label, index) => labels[index] === label);
  if (!header) return null;
  const branch = labels.indexOf('สาขา'),
    category = labels.indexOf('สำนักงาน');
  const group = labels.findIndex(label => ['หมวด(กลุ่มต่างๆ)', 'หมวด(กลุ่ม)', 'หมวด'].includes(label));
  const location = labels.indexOf('สถานที่');
  // Older source sheets have free-form project annotations after their seven core columns.
  const columns: ImportColumns | null =
    branch >= 7 && group >= 7 && category >= 7 ? { branch, group, category, location } : null;
  return { columns };
}

// แถวในไฟล์ที่หมายเลขมีในทะเบียนอยู่แล้ว (จากไฟล์อื่นหรือเพิ่มเอง) ต้องไม่ขึ้นว่า "พร้อมนำเข้า"
// existing: codeKey → คำอธิบายรายการเดิม · ข้ามแถวที่นำเข้าจากไฟล์นี้ไปแล้ว (done)
export function markExistingCodes(rows: Candidate[], existing: Map<string, string>, done: Set<string>): Candidate[] {
  for (const row of rows) {
    if (row.kind !== 'asset' || done.has(row.key)) continue;
    // รหัสช่วง ("…-1(1) ถึง -2(1)") นำเข้าเป็นรหัสย่อยแต่ละตัวด้วย จึงต้องเทียบรหัสย่อยกับทะเบียนด้วย
    const code = String(row.asset.code || '');
    const hit = [code, ...(expandRange(code, Number(row.asset.quantity)) ?? [])]
      .map(c => existing.get(codeKey(c)))
      .find(Boolean);
    if (!hit) continue;
    const note = 'มีหมายเลขนี้ในทะเบียนแล้ว: ' + hit;
    row.issue = row.issue ? note + ' · ' + row.issue : note;
    row.issueType = 'duplicate';
  }
  return rows;
}

export function classify(source: Source, overrides: Record<string, RowOverride> = {}): Candidate[] {
  const out: Candidate[] = [];
  const codeCounts = new Map<string, number>();
  const codeHistorical = new Set<string>();
  // ประเภทของแต่ละแผ่น: จากแถว "คณะวิศวกรรมศาสตร์ฯ ครุภัณฑ์…" ก่อน ไม่มีจึงใช้ชื่อแผ่น
  const sheetTypes = new Map<string, string>(),
    codeTypes = new Map<string, string>();
  for (const sh of source.sheets) {
    const isHist = /ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sh.name);
    const headingRow = sh.rows.find(r => /^คณะวิศวกรรม/.test(r.values.slice(0, 3).map(str).find(Boolean) || ''));
    const headingType = headingRow ? assetTypeOf(headingRow.values.slice(0, 3).map(str).find(Boolean) || '') : '';
    // แผ่น "ไม่มีตัวตน" ในต้นฉบับใช้หัว "ครุภัณฑ์สำรวจ" ที่ไม่ตรงกับรายการ จึงไม่เชื่อหัวของแผ่นนี้
    sheetTypes.set(sh.name, /ไม่มีตัวตน/.test(sh.name) ? '' : headingType || assetTypeOf(sh.name));
    for (const r of sh.rows) {
      const c = codeKey(str(r.values[1]));
      if (c) {
        codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
        if (isHist) codeHistorical.add(c);
        else if (sheetTypes.get(sh.name) && !codeTypes.has(c)) codeTypes.set(c, sheetTypes.get(sh.name)!);
      }
    }
  }
  for (const sheet of source.sheets) {
    let group = '';
    const historical = /ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sheet.name);
    let columns: ImportColumns | null = null;
    for (const r of sheet.rows) {
      const v = r.values;
      const text = v.map(str).filter(Boolean).join(' | ');
      const name = str(v[2]);
      const code = str(v[1]);
      let kind = 'note',
        issue = '',
        issueType = 'other';
      const header = tableHeader(v);
      const subtotalLabel = (value: unknown) =>
        /^(?:ยอดยกไป|ยอดยกมา|รวมทั้งสิ้น|รวมเป็นเงิน|รวม)(?:\s|$)/.test(str(value));
      const heading = v.slice(0, 3).map(str).find(Boolean) || '';
      if (header) {
        kind = 'header';
        columns = header.columns;
      }
      // Report annotations occupy the leading cells. A normal asset's name/notes may
      // legitimately contain words such as เจ้าหน้าที่ or รวมเป็นเงิน.
      else if ((!name || !code || subtotalLabel(code)) && v.slice(0, 5).some(subtotalLabel)) kind = 'subtotal';
      else if (
        (!name || !code) &&
        /^(?:หน้าที่\s*\d|รายละเอียดครุภัณฑ์(?:คงเหลือ|ชำรุด)|มหาวิทยาลัย|ณ\s*วันที่|ประจำปีงบประมาณ|คณะวิศวกรรม)/.test(
          heading,
        )
      )
        kind = 'header';
      else if (name && code && Number(amount(v[3])) > 0) {
        kind = 'asset';
      } else if (name && code && str(v[3]) !== '' && Number(amount(v[3])) <= 0) {
        kind = 'asset';
        issue = 'จำนวนต้องมากกว่า 0 ต้องตรวจสอบต้นฉบับ';
        issueType = 'price';
      } else if (name && code) {
        kind = 'asset';
        issue = 'จำนวนหรือราคาของรายการย่อยยังไม่ครบ ต้องระบุวิธีลงมูลค่าชุด';
        issueType = 'price';
      } else if (!name && /\d{2,}[-/]/.test(code)) {
        kind = 'asset';
        issue = 'ชื่อหรือข้อมูลรายการที่รวมเซลล์ยังไม่ครบ ต้องตรวจสอบต้นฉบับ';
        issueType = 'name';
      }
      // มีหมายเลขแต่ไม่มีชื่อ: ข้อความที่มีตัวเลขและไม่มีสระ/วรรณยุกต์ไทยคือรหัส ไม่ใช่ชื่อชุด (ชื่อชุดจริงมีสระเสมอ)
      else if (!name && /\d/.test(code) && !/[ัิ-ฺเ-๎]/.test(code) && Number(amount(v[3])) > 0) {
        kind = 'asset';
        issue = 'มีหมายเลขครุภัณฑ์แต่ไม่มีชื่อรายการ ต้องเติมชื่อก่อนนำเข้า';
        issueType = 'name';
      } else if (!name && code) {
        kind = 'group';
        group = text;
      } else if (/ชุด|โครงการ|สัญญา|งบประมาณ|ประกอบด้วย|ทดแทน/.test(text)) {
        kind = 'group';
        group = text;
      }
      // บรรทัดราคาของชุดที่ไม่มีรหัส (มีชื่อ จำนวน และราคา) เช่น "โต๊ะประชุมมีบังตา | 2 | 5,900 | 11,800" แล้วตามด้วยรายชิ้นที่ไม่มีราคา
      // ต้องไม่ถูกทิ้งเป็นหมายเหตุ ไม่งั้นยอดเงินหายและรายชิ้นไปเข้าชุดก่อนหน้า → ส่งต่อให้ detectSets ทำเป็นหัวชุด
      else if (!code && name && Number(amount(v[3])) > 0 && Number(String(amount(v[4]) ?? '').replace(/,/g, '')) > 0) {
        kind = 'group';
      }
      const override = overrides[sheet.name + ':' + r.row];
      if (override === 'skip' || override === 'continue') {
        kind = 'note';
        issue = '';
      } else if (override === 'fund') {
        kind = 'group';
        group = text;
      } else if (override === 'asset' && kind !== 'asset') {
        kind = 'asset';
        issue = 'เจ้าหน้าที่เปลี่ยนเป็นครุภัณฑ์ ต้องตรวจรหัส ชื่อ จำนวน และราคา';
        issueType = 'name';
      }
      let qty = Number(amount(v[3])),
        unit = 0,
        total = 0;
      let explicitCat = '';
      let memo = '';
      let rawGroup = '';
      if (columns) {
        const vGroup = str(v[columns.group]);
        rawGroup = vGroup;
        const vOffice = columns.category >= 0 ? str(v[columns.category]) : '';
        if ((standardCategories as readonly string[]).includes(vGroup)) {
          // ไฟล์ที่ Export จากเว็บรุ่นก่อน: หมวดหมู่ตามสาขาอยู่ในคอลัมน์หมวด
          explicitCat = vGroup;
        } else {
          // คอลัมน์ "หมวด" รับเฉพาะหมวดที่รู้จัก และ "สำนักงาน" รับเฉพาะประเภทครุภัณฑ์
          // ข้อความอื่นเป็นบันทึกช่วยจำของเจ้าหน้าที่ → ย้ายไปหมายเหตุ
          // "รอจัดหมวด" / "รอระบุประเภท" เป็นแค่ป้ายบอกว่ายังไม่ได้จัด ไม่ใช่ข้อมูล
          explicitCat = assetTypeOf(vOffice);
          const placeholder = (x: string) =>
            !x || /^(?:ทั่วไป|—|-)$/.test(x) || x === UNGROUPED || x === UNKNOWN_ASSET_TYPE;
          // บันทึกช่วยจำที่อยู่ถัดจากคอลัมน์สำนักงาน (เช่นไฟล์ที่จัดข้อมูลแล้วย้ายบันทึกไปช่อง K เป็นต้นไป) ต้องไม่หาย
          const last = Math.max(columns.group, columns.category, columns.branch);
          const extra = v.slice(last + 1).map(str);
          const memos = [
            isAssetGroup(vGroup) || legacyGroupNames.has(vGroup) ? '' : vGroup,
            explicitCat ? '' : vOffice,
            ...extra,
          ].filter(x => !placeholder(x));
          memo = memos.join(' · ');
        }
      }
      // ข้อความชุด/โครงการเก็บแยกในชุด (detectSets) และใน groupName ของแถว (หมวดคิดจากประเภทด้านล่าง)
      const groupName = columns ? rawGroup : [group, ...v.slice(8).map(str)].filter(Boolean).join(' • ');
      const rawBranch = columns ? str(v[columns.branch]) : str(v[7]) || str(v[8]);
      const branch = normalizeBranch(rawBranch, str(v[6]));
      // ชีตชำรุด/ประวัติไม่บอกประเภท จึงใช้ประเภทของรหัสเดียวกันในแผ่นหลัก
      const category =
        explicitCat ||
        (historical ? codeTypes.get(codeKey(code)) || sheetTypes.get(sheet.name) : sheetTypes.get(sheet.name)) ||
        UNKNOWN_ASSET_TYPE;
      const assetGroup = assetGroupOfType(category);
      const notes = [str(v[6]), memo].filter(Boolean).join(' · ');
      if (kind === 'asset') {
        try {
          unit = satang(amount(v[4]));
          total = satang(amount(v[5]));
        } catch {
          issue ||= priceProblem(satangSafe(v[4]) ? v[5] : v[4]);
          issueType = 'price';
        }
        if (!Number.isSafeInteger(qty) || qty <= 0) {
          qty = 0;
          issue ||= 'ตรวจสอบจำนวนรายการ';
        }
        if (qty && unit * qty !== total) {
          issue ||= 'จำนวน × ราคาต่อหน่วยไม่ตรงยอดเดิม';
          if (issueType === 'other') issueType = 'price';
        }
        if (codeHistorical.has(codeKey(code)) && !historical) {
          issue ||= 'รหัสนี้มีอยู่ในชีตชำรุด/ประวัติ อาจแทงจำหน่ายแล้ว';
          issueType = 'duplicate';
        } else if ((codeCounts.get(codeKey(code)) || 0) > 1) {
          issue ||= 'รหัสครุภัณฑ์ซ้ำซ้อนในไฟล์';
          issueType = 'duplicate';
        } else if (historical) {
          issue ||= 'ชีตประวัติ / ชำรุด ต้องตรวจสอบรายการซ้ำกับทะเบียนหลัก';
          issueType = 'duplicate';
        }
        if (/ถึง/.test(code) || /\(\d+-\d+\)/.test(code)) {
          issue ||= 'ช่วงรหัสไม่ชัดเจน ต้องตรวจสอบหมายเลขรายชิ้น';
          issueType = 'range';
        }
        if (group && (!unit || !total || unit * qty !== total)) {
          issue ||= 'รายการอยู่ในชุด / โครงการ ต้องยืนยันการจัดกลุ่มและการลงมูลค่า';
          if (issueType === 'other') issueType = 'price';
        }
        if (!unit && !total && !issue) {
          issue = 'ยังไม่มีราคาต่อหน่วย/จำนวนเงิน';
          issueType = 'price';
        }
        // ข้อความยาวเกินที่ระบบรับได้: ถ้าปล่อยเป็น "พร้อมนำเข้า" การนำเข้าทั้งชุดจะล้มเพราะแถวเดียว
        if ([code, name, str(v[6])].some(t => t.length > 5000)) {
          issue ||= 'ข้อความในแถวยาวเกิน 5,000 ตัวอักษร ต้องย่อก่อนนำเข้า';
          issueType = 'name';
        }
        const branches = branchCandidates(rawBranch);
        if (branches.length > 1) {
          const note = `ระบุไว้หลายสาขา (${branches.map(branchAbbr).join(' / ')}) ต้องเลือกสาขาก่อนนำเข้า`;
          if (issue) issue += ' · ' + note;
          else {
            issue = note;
            issueType = 'branch';
          }
        }
        if (!issue) issueType = 'ready';
      }
      out.push({
        key: sheet.name + ':' + r.row,
        sheet: sheet.name,
        row: r.row,
        kind,
        issue,
        issueType,
        groupName,
        values: v,
        ...(override ? { override } : {}),
        asset: {
          code,
          name: name || (override === 'asset' ? v.map(str).filter(Boolean).join(' ') : ''),
          quantity: qty || 0,
          unitSatang: unit,
          totalSatang: total,
          notes,
          location: columns && columns.location >= 0 ? str(v[columns.location]) : str(v[6]),
          branch,
          groupName: assetGroup,
          category,
          condition: 'normal',
        },
      });
    }
  }
  return detectSets(out);
}

// ช่องราคาที่ว่างจริง (ไม่ใช่ 0) — ชิ้นส่วนของชุดในไฟล์ต้นฉบับเว้นช่องราคาไว้ ส่วนราคา 0 คือรายการที่ลงราคาเป็นศูนย์
function priceIsBlank(value: unknown): boolean {
  const v = amount(value);
  if (v === null || v === undefined) return true;
  const text = String(v).replace(/,/g, '').trim();
  return !text || isNaN(Number(text));
}

// จัดชุดครุภัณฑ์จากลำดับแถวในแต่ละแผ่น (ผู้ใช้ยืนยัน 13 ต.ค. 2569):
// - หัวชุดไม่มีลำดับแต่มีราคา (package) และรายการมีลำดับที่มีราคา (lot) ตามด้วยแถวมีลำดับที่เว้นช่องราคา = ชิ้นส่วน มูลค่ารวมในหัวชุด
//   ชุดจบเมื่อเจอรายการที่มีราคาของตัวเอง
// - หัวข้อชุดไม่มีราคา (heading) = รายการมีราคาที่ตามมาอยู่ในชุดเดียวกัน จนเจอหัวชุดหรือหัวข้อใหม่
// - หัวชุด package ไม่มีหมายเลข จึงใช้หมายเลขของชิ้นส่วน และต่อท้ายชิ้นส่วนที่ใช้เลขเดียวกันด้วย -ชิ้น1, -ชิ้น2 …
function detectSets(rows: Candidate[]): Candidate[] {
  const sheets = new Map<string, Candidate[]>();
  for (const row of rows) {
    if (!sheets.has(row.sheet)) sheets.set(row.sheet, []);
    sheets.get(row.sheet)!.push(row);
  }
  const reviewSet = (row: Candidate, note: string) => {
    row.issue = note;
    row.issueType = 'set';
  };
  for (const sheetRows of sheets.values()) {
    let heading: CandidateSet | null = null;
    let lastPriced: Candidate | null = null;
    let lastCounted: Candidate | null = null;
    const packages: Array<{ header: Candidate; parts: Candidate[] }> = [];
    let currentPackage: { header: Candidate; parts: Candidate[] } | null = null;
    for (const row of sheetRows) {
      if (row.override === 'continue') {
        // บรรทัดต่อ (เจ้าหน้าที่ระบุ): ข้อความต่อท้ายหัวทุน/หัวชุด/ชื่อรายการด้านบน
        const more = row.values.map(str).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (more && lastCounted?.kind === 'group' && heading) heading.name += ' ' + more;
        else if (more && lastCounted?.kind === 'asset') {
          if (lastCounted.set?.role === 'header') lastCounted.set.name += ' ' + more;
          lastCounted.asset = { ...lastCounted.asset, name: ((lastCounted.asset.name || '') + ' ' + more).trim() };
        }
        continue;
      }
      if (row.kind === 'header' || row.kind === 'subtotal' || row.kind === 'note') continue; // หัวกระดาษแต่ละหน้าไม่ตัดชุด
      const v = row.values,
        seq = Number(cell(v[0]));
      const hasSeq = Number.isInteger(seq) && seq > 0 && String(cell(v[0]) ?? '').trim() !== '';
      if (row.kind === 'group') {
        const text =
          row.override === 'fund'
            ? v.map(str).filter(Boolean).join(' ').replace(/\s+/g, ' ')
            : str(v[1]) || str(v[2]) || row.groupName;
        if (row.override !== 'fund' && !priceIsBlank(v[4]) && Number(amount(v[3])) > 0) {
          // หัวชุด package: มีราคา ไม่มีลำดับ → เป็นครุภัณฑ์ที่ถือมูลค่าของทั้งชุด
          const set: CandidateSet = { key: row.key, name: text, kind: 'package', role: 'header' };
          let unit = 0,
            total = 0;
          try {
            unit = satang(amount(v[4]));
            total = satang(amount(v[5]));
          } catch {
            /* ราคาผิดรูปแบบ: ให้เจ้าหน้าที่ตรวจ */
          }
          row.kind = 'asset';
          row.set = set;
          row.asset = {
            ...row.asset,
            code: '',
            name: text,
            quantity: Number(amount(v[3])),
            unitSatang: unit,
            totalSatang: total,
          };
          reviewSet(row, `หัวชุด "${text}" มูลค่ารวมของทั้งชุด ตรวจการจัดชุดก่อนนำเข้า`);
          currentPackage = { header: row, parts: [] };
          packages.push(currentPackage);
          if (heading) row.fund = { key: heading.key, name: heading.name };
          lastPriced = row;
          heading = null;
          lastCounted = row;
          continue;
        }
        if (lastCounted && lastCounted.kind === 'group' && lastCounted.set?.kind === 'heading' && heading) {
          heading.name += ' ' + text; // หัวข้อชุดที่เขียนต่อหลายบรรทัด
        } else {
          heading = { key: row.key, name: text, kind: 'heading' };
          lastPriced = null;
          currentPackage = null;
        }
        row.set = heading;
        lastCounted = row;
        continue;
      }
      if (row.kind !== 'asset') continue;
      lastCounted = row;
      if (heading) row.fund = { key: heading.key, name: heading.name };
      if (hasSeq && priceIsBlank(v[4]) && lastPriced && row.asset.name) {
        // ชิ้นส่วนของหัวชุดก่อนหน้า
        if (!lastPriced.set) {
          const setName = lastPriced.asset.name || lastPriced.asset.code || '';
          lastPriced.set = { key: lastPriced.key, name: setName, kind: 'lot', role: 'header' };
          const extra = lastPriced.issue && lastPriced.issueType !== 'ready' ? ' · ' + lastPriced.issue : '';
          reviewSet(lastPriced, `หัวชุด "${setName}" มีชิ้นส่วนรวมในชุด ตรวจการจัดชุดก่อนนำเข้า${extra}`);
          currentPackage = { header: lastPriced, parts: [] };
        }
        const headerSet = lastPriced.set!;
        row.set = { key: headerSet.key, name: headerSet.name, kind: headerSet.kind, role: 'part' };
        row.asset = { ...row.asset, quantity: row.asset.quantity || 1, unitSatang: 0, totalSatang: 0 };
        reviewSet(row, `ชิ้นส่วนของชุด "${headerSet.name}" มูลค่ารวมในหัวชุดแล้ว ตรวจการจัดชุดก่อนนำเข้า`);
        if (currentPackage && currentPackage.header === lastPriced) currentPackage.parts.push(row);
        continue;
      }
      // รายการที่มีราคาของตัวเอง: จบชุดแบบ package/lot ส่วนหัวข้อชุดยังต่อเนื่อง
      currentPackage = null;
      lastPriced = row;
    }
    // หมายเลขของหัวชุด package มาจากชิ้นส่วน (เลือกข้อ ก.)
    for (const { header, parts } of packages) {
      const code = parts.map(p => p.asset.code).find(Boolean) || '';
      header.asset.code = code;
      if (!code) reviewSet(header, `หัวชุด "${header.set!.name}" ไม่มีหมายเลขครุภัณฑ์ ต้องระบุก่อนนำเข้า`);
      let n = 0;
      for (const part of parts) if (code && part.asset.code === code) part.asset.code = `${code}-ชิ้น${++n}`;
    }
  }
  // หัวทุนที่ต่อหลายบรรทัด: ให้ทุกรายการใช้ชื่อเต็มเดียวกัน
  const headings = new Map(
    rows.filter(r => r.kind === 'group' && r.set?.kind === 'heading').map(r => [r.key, r.set!.name]),
  );
  for (const row of rows)
    if (row.fund && headings.has(row.fund.key)) row.fund = { ...row.fund, name: headings.get(row.fund.key)! };
  return rows;
}
