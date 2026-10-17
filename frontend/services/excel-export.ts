import {Asset, assetGroupOfType, UNGROUPED, assetTypes, branchAbbr, fiscalYearOf, normalizeBranch, stocktakeDifference, assetTypeOf, groupFor, UNKNOWN_ASSET_TYPE, bookValue} from '@/shared/domain';

export const reportHeaders = [
  'ลำดับ',
  'หมายเลขครุภัณฑ์',
  'รายการ',
  'จำนวน',
  'ราคาต่อหน่วย',
  'จำนวนเงิน',
  'หมายเหตุ',
  'สาขา',
  'หมวด (กลุ่มต่างๆ)',
  'สำนักงาน'
];

// แบบหน้ากระดาษตามไฟล์ "ตัวอย่าง_เปรียบเทียบรูปแบบที่2" (แนวนอนลดเหลือ 16 แถวเพื่อให้พิมพ์ได้พอดีหน้า)
export const pageLayouts = {
  portrait: { label: 'แนวตั้ง 48 แถวต่อหน้า', rows: 48, height: 23.1, orientation: 'portrait', wrap: false },
  // ทดสอบใน Excel บน A4: 66 แถวเต็มพอดี 67 ขึ้นไปล้นหน้า → 64 เหลือขอบล่างเล็กน้อย
  full: { label: 'แนวตั้งเต็มหน้า 64 แถวต่อหน้า', rows: 64, height: 23.1, orientation: 'portrait', wrap: false },
  wrap: { label: 'แนวตั้ง ข้อความยาวขึ้นบรรทัดใหม่ 30 แถวต่อหน้า', rows: 30, height: 36, orientation: 'portrait', wrap: true },
  landscape: { label: 'แนวนอน 16 แถวต่อหน้า', rows: 16, height: 26, orientation: 'landscape', wrap: false },
} as const;
export type PageLayout = keyof typeof pageLayouts;
export type AssetExportOptions = { fiscalYear?: number; layout?: PageLayout; branch?: string };
const FONT = 'TH Sarabun New';
const FACULTY = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม';

// แยกแผ่นตามประเภทครุภัณฑ์ (คอลัมน์ "สำนักงาน") เรียงตามไฟล์ต้นฉบับของเจ้าหน้าที่ ประเภทอื่นต่อท้าย
function byAssetType(assets: Asset[]): Array<[string, Asset[]]> {
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    // ประเภทที่บันทึกแบบสั้น (เช่น "คอมพิวเตอร์") รวมแผ่นเดียวกับชื่อเต็ม ("ครุภัณฑ์คอมพิวเตอร์")
    const key = assetTypeOf(a.category) || assetTypeOf('ครุภัณฑ์' + (a.category || '')) || a.category || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const rank = (type: string) => {
    const i = (assetTypes as readonly string[]).indexOf(type);
    return i < 0 ? assetTypes.length : i;
  };
  return [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'th'));
}

// ชื่อแผ่นงานสั้นแบบไฟล์ต้นฉบับของเจ้าหน้าที่ (สำนักงาน คอม โฆษณา ...) ประเภทที่ไม่รู้จักใช้ชื่อเต็ม
function sheetTitle(type: string, used: Set<string>) {
  const tab = assetGroupOfType(type);
  const base = (tab !== UNGROUPED ? tab : type || 'ไม่ระบุประเภท').replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  let title = base, n = 2;
  while (used.has(title)) title = `${base.slice(0, 26)} (${n++})`;
  used.add(title);
  return title;
}

export async function createAssetWorkbook(assets: Asset[], options: AssetExportOptions = {}) {
  assets = assets.filter(a => a.lifecycle !== 'split');
  const ExcelModule = await import('exceljs');
  const Excel = (ExcelModule as any).default || ExcelModule;
  const w = new Excel.Workbook();
  w.creator = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์';
  const fiscalYear = options.fiscalYear ?? fiscalYearOf(new Date());
  const groups = byAssetType(assets);
  const used = new Set<string>();
  // เลขหน้านับต่อกันทุกแผ่น เหมือนเล่มรายงานของเจ้าหน้าที่
  let pageOffset = 0;
  const layout = pageLayouts[options.layout ?? 'portrait'];
  // แถวสีน้ำเงินขึ้นชื่อคณะเสมอ แม้เลือกสาขาเดียว (ตามแบบฟอร์มของเจ้าหน้าที่)
  const owner = FACULTY;
  for (const [type, typeAssets] of groups.length ? groups : [['', [] as Asset[]] as [string, Asset[]]]) {
    pageOffset = fillAssetSheet(w, sheetTitle(type, used), typeAssets, type, fiscalYear, pageOffset, layout, owner);
  }
  return w;
}

function fillAssetSheet(w: any, title: string, assets: Asset[], type: string, fiscalYear: number, pageOffset: number,
  layout: (typeof pageLayouts)[PageLayout], owner: string): number {
  const facultyLabel = (assetTypes as readonly string[]).includes(type) ? `${owner}   ${type}` : owner;
  const s = w.addWorksheet(title, {
    views: [
      {
        workbookViewId: 0,
        rightToLeft: false,
        state: 'normal',
        showGridLines: true,
        style: 'pageBreakPreview'
      }
    ],
    pageSetup: {
      orientation: layout.orientation,
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2
      }
    }
  });
  delete (s.pageSetup as any).scale;

  // ความกว้างวัดจากข้อมูลจริง 1,194 รายการที่ตัวอักษร TH Sarabun New 14 (ส่วนใหญ่ไม่ต้องย่อ)
  // ซ้าย A+B+C+D = ขวา F+…+J เพื่อให้กึ่งกลางช่อง E ตรงกลางหน้า (หัวรายงานแถว 2)
  s.columns = [
    { width: 6.80 },   // 1: ลำดับ
    { width: 28.00 },  // 2: หมายเลขครุภัณฑ์ (ยาวสุด 95% ≈ 26)
    { width: 61.40 },  // 3: รายการ (ยาวสุด 90% ≈ 56) = 103 − 42.3 + ช่องว่างขอบคอลัมน์
    { width: 7.50 },   // 4: จำนวน
    { width: 12.50 },  // 5: ราคาต่อหน่วย
    { width: 15.00 },  // 6: จำนวนเงิน (ยอดรวมหลักร้อยล้าน ≈ 14)
    { width: 28.00 },  // 7: หมายเหตุ (ยาวสุด 95% ≈ 28)
    { width: 8.00 },   // 8: สาขา (ชื่อย่อ)
    { width: 26.00 },  // 9: หมวด (กลุ่มต่างๆ) (ยาวสุด ≈ 28)
    { width: 26.00 }   // 10: สำนักงาน (ยาวสุด ≈ 26)
  ];


  const pages = paginate(reportLines(assets), layout.rows);
  const totalPages = pages.length;

  let currentItemIndex = 0;
  let lastCarriedForwardRow: number | null = null;

  for (let page = 1; page <= totalPages; page++) {
    const pageLines = pages[page - 1];
    const isFirstPage = page === 1;
    const isLastPage = page === totalPages;

    // แถว 1: มหาวิทยาลัยกาฬสินธุ์ (ผสาน A:J กึ่งกลางทั้งหน้า)
    const r1 = s.addRow(['มหาวิทยาลัยกาฬสินธุ์']);
    const r1Idx = r1.number;
    s.mergeCells(`A${r1Idx}:J${r1Idx}`);
    r1.height = 24.95;
    r1.getCell(1).font = { name: FONT, size: 14, bold: true };
    r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // แถว 2: รายละเอียดครุภัณฑ์คงเหลือ และ เลขหน้า (คอลัมน์ J ใส่แค่ตัวเลข 1, 2, 3)
    // ไม่ผสานเซลล์: ข้อความอยู่ช่อง E ซึ่งกึ่งกลางช่องตรงกับกึ่งกลางหน้า (A+B+C+D = F+…+J)
    // จัดกึ่งกลางแล้วล้นออกสองข้างเท่ากัน ตรงแนวกับแถว 1 และ 3
    const r2 = s.addRow([
      null, null, null, null, 'รายละเอียดครุภัณฑ์คงเหลือ', null, null, null, null,
      pageOffset + page
    ]);
    r2.height = 24.95;
    r2.getCell(5).font = { name: FONT, size: 14, bold: true };
    r2.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    r2.getCell(10).font = { name: FONT, size: 14, bold: true };
    r2.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };

    // แถว 3: ปีงบประมาณ (ผสาน A:J กึ่งกลางตรงแนวกับแถว 1 และ 2 พร้อมเส้นขีดล่างเต็ม 10 คอลัมน์)
    const r3 = s.addRow([`ประจำปีงบประมาณ ${fiscalYear}`]);
    const r3Idx = r3.number;
    s.mergeCells(`A${r3Idx}:J${r3Idx}`);
    r3.height = 24.95;
    r3.getCell(1).font = { name: FONT, size: 14, bold: true };
    r3.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = 1; c <= 10; c++) {
      r3.getCell(c).border = { bottom: { style: 'thin' } };
    }

    // แถว 4: หัวตาราง 10 คอลัมน์
    const r4 = s.addRow(reportHeaders);
    r4.height = 31.5;
    for (let col = 1; col <= 10; col++) {
      const c = r4.getCell(col);
      c.font = { name: FONT, size: 14, bold: true };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    let pageStartDataRow: number | null = null;
    let pageEndDataRow: number | null = null;
    let broughtForwardRowIdx: number | null = null;

    if (isFirstPage) {
      // แถว 5: หมวดคณะ (เฉพาะหน้าแรก ผสาน A:C)
      const r5 = s.addRow([facultyLabel]);
      const r5Idx = r5.number;
      s.mergeCells(`A${r5Idx}:C${r5Idx}`);
      r5.height = 23.1;
      for (let col = 1; col <= 10; col++) {
        const c = r5.getCell(col);
        c.font = { name: FONT, size: 14, bold: true, color: { argb: 'FF0000FF' } };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      r5.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    } else {
      // แถว ยอดยกมา (หน้าที่ 2 เป็นต้นไป)
      const rBrought: any = s.addRow([
        facultyLabel,
        '',
        '',
        '',
        'ยอดยกมา',
        { formula: `F${lastCarriedForwardRow}` },
        '',
        '',
        '',
        ''
      ]);
      broughtForwardRowIdx = rBrought.number;
      s.mergeCells(`A${broughtForwardRowIdx}:C${broughtForwardRowIdx}`);
      rBrought.height = 23.1;
      for (let col = 1; col <= 10; col++) {
        const c = rBrought.getCell(col);
        c.font = { name: FONT, size: 14, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      rBrought.getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: 'FF0000FF' } };
      rBrought.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      rBrought.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      rBrought.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      rBrought.getCell(6).numFmt = '#,##0.00';
    }

    // แถวข้อมูลในหน้านี้ (ตัวหนังสือ 12pt เท่ากันทุกช่อง + shrinkToFit เพื่อป้องกัน ####### เด็ดขาด)
    pageLines.forEach((line) => {
      if (line.kind === 'heading') {
        // หัวทุน: ไม่มีลำดับ ตัวหนาเหมือนไฟล์ของเจ้าหน้าที่ ชื่อล้นไปช่องรายการที่ว่าง
        // ช่องสาขาว่าง: ทุนเดียวมีครุภัณฑ์หลายสาขาได้
        const hr = s.addRow([null, line.text, null, null, null, null, null, null, null, null]);
        if (!pageStartDataRow) pageStartDataRow = hr.number;
        pageEndDataRow = hr.number;
        hr.height = layout.height;
        for (let col = 1; col <= 10; col++) {
          const c = hr.getCell(col);
          c.font = { name: FONT, size: 14, bold: true };
          c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
          c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'thin' }, right: { style: 'thin' } };
        }
        return;
      }
      const a = line.asset;
      if (line.numbered) currentItemIndex++;
      const notesCombined = a.notes && a.location && a.notes !== a.location
        ? `${a.notes} • ${a.location}`
        : (a.notes || a.location || '—');

      // หมวด = หมวดที่รู้จัก (หรือจัดจากชื่อรายการ) · สำนักงาน = ประเภทครุภัณฑ์
      const col9 = groupFor(a);
      // หมวดหมู่รุ่นเก่า เช่น "คอมพิวเตอร์" → "ครุภัณฑ์คอมพิวเตอร์"
      const col10 = assetTypeOf(a.category) || assetTypeOf('ครุภัณฑ์' + a.category) || a.category || UNKNOWN_ASSET_TYPE;

      // หัวชุดแบบไม่มีลำดับแสดงชื่อในช่องหมายเลขเหมือนต้นฉบับ ชิ้นส่วนเยื้องเข้าและขึ้น "รวมในชุด" (ไม่นับเงินซ้ำ)
      const unnumberedHeader = !line.numbered;
      const rowValues = [
        line.numbered ? currentItemIndex : null,
        unnumberedHeader ? a.name : a.code,
        unnumberedHeader ? null : (line.part ? '   ' : '') + a.name,
        a.quantity,
        line.part ? null : a.unitSatang / 100,
        null,
        notesCombined,
        branchAbbr(a.branch),
        col9,
        col10
      ];

      const dr = s.addRow(rowValues);
      const drIdx = dr.number;
      if (!pageStartDataRow) pageStartDataRow = drIdx;
      pageEndDataRow = drIdx;

      dr.getCell(6).value = line.part ? 'รวมในชุด' : a.totalSatang / 100;
      dr.height = layout.height;

      for (let col = 1; col <= 10; col++) {
        const c = dr.getCell(col);
        const isNum = [5, 6].includes(col);
        const isCenter = [1, 4, 8].includes(col);   // ลำดับ จำนวน สาขา(ชื่อย่อ)
        c.font = {
          name: FONT,
          size: 14,
          bold: false,
          italic: line.part && col === 6
        };
        c.alignment = {
          vertical: 'middle',
          horizontal: isCenter ? 'center' : isNum ? 'right' : 'left',
          wrapText: layout.wrap && !isNum && !unnumberedHeader,
          // หมวด/สำนักงานยาวกว่าช่อง → ย่อตัวอักษรให้พอดี ไม่ล้นออกนอกพื้นที่พิมพ์
          shrinkToFit: isNum || (!layout.wrap && col >= 9)
        };
        c.border = {
          top: { style: 'hair' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      dr.getCell(4).numFmt = '#,##0';
      dr.getCell(5).numFmt = '#,##0.00';
      dr.getCell(6).numFmt = '#,##0.00';
    });

    if (!isLastPage && pageStartDataRow && pageEndDataRow) {
      // แถว ยอดยกไป (ท้ายหน้านี้)
      const carriedFormula: string = isFirstPage
        ? `SUM(F${pageStartDataRow}:F${pageEndDataRow})`
        : `SUM(F${broughtForwardRowIdx}, F${pageStartDataRow}:F${pageEndDataRow})`;

      const rCarried: any = s.addRow(['', '', '', '', 'ยอดยกไป', { formula: carriedFormula }, '', '', '', '']);
      const rCarriedIdx: number = rCarried.number;
      lastCarriedForwardRow = rCarriedIdx;
      rCarried.height = 23.1;

      for (let col = 1; col <= 10; col++) {
        const c = rCarried.getCell(col);
        c.font = { name: FONT, size: 14, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      rCarried.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      rCarried.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      rCarried.getCell(6).numFmt = '#,##0.00';

      // บังคับขึ้นหน้าใหม่ทันทีใต้แถวยอดยกไป เพื่อไม่ให้หัวข้อหน้าถัดไปหลุดมารองก้นเด็ดขาด
      rCarried.addPageBreak();
    } else if (isLastPage && pageStartDataRow && pageEndDataRow) {
      // แถว รวมทั้งสิ้น (ท้ายหน้าสุดท้าย)
      const sumFormula = (totalPages === 1)
        ? `SUM(F${pageStartDataRow}:F${pageEndDataRow})`
        : `SUM(F${broughtForwardRowIdx}, F${pageStartDataRow}:F${pageEndDataRow})`;

      const totalRow = s.addRow([
        'รวม',
        '',
        '',
        '',
        '',
        { formula: sumFormula },
        '',
        '',
        '',
        ''
      ]);
      const totalRowIdx = totalRow.number;
      s.mergeCells(`B${totalRowIdx}:E${totalRowIdx}`);
      s.mergeCells(`G${totalRowIdx}:J${totalRowIdx}`);
      totalRow.height = 24.95;

      totalRow.getCell(2).value = { formula: `"("&BAHTTEXT(F${totalRowIdx})&")"` };

      for (let col = 1; col <= 10; col++) {
        const c = totalRow.getCell(col);
        c.font = { name: FONT, size: 14, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'double' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center', shrinkToFit: true };
      totalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      totalRow.getCell(6).numFmt = '#,##0.00';
    }
  }

  s.pageSetup.printArea = `A1:J${s.rowCount}`;
  return pageOffset + totalPages;
}

const ITEMS_PER_ASSET_PAGE = 48;

type ReportLine = { kind: 'heading'; text: string } | { kind: 'asset'; asset: Asset; numbered: boolean; part: boolean };

// เรียงแถวรายงาน: ครุภัณฑ์ในชุดเดียวกันอยู่ติดกัน เริ่มที่ตำแหน่งของรายการแรกในชุด หัวชุดก่อนชิ้นส่วน
function setLines(assets: Asset[]): ReportLine[] {
  const lines: ReportLine[] = [];
  const done = new Set<string>();
  for (const a of assets) {
    if (!a.setId) { lines.push({ kind: 'asset', asset: a, numbered: true, part: false }); continue; }
    if (done.has(a.setId)) continue;
    done.add(a.setId);
    const members = assets.filter(x => x.setId === a.setId)
      .sort((x, y) => (x.setRole === 'header' ? 0 : 1) - (y.setRole === 'header' ? 0 : 1));
    for (const x of members) lines.push({
      kind: 'asset', asset: x, part: x.setRole === 'part',
      numbered: !(x.setRole === 'header' && a.setKind === 'package'),
    });
  }
  return lines;
}
// หัวทุนขึ้นเหนือเฉพาะครุภัณฑ์ที่เจ้าหน้าที่ใส่เข้าทุนแล้ว (fundId) รายการในทุนเดียวกันอยู่ติดกัน ณ ตำแหน่งรายการแรกของทุน
// รายการที่ไม่มีทุนไม่มีหัวทุนอยู่ข้างบน (ไม่นับรายการที่อยู่ต่อลงมาเป็นของทุนเอง)
// ชุดห้ามแยกต้องอยู่ติดกันเสมอ: ถ้าชิ้นในชุดอยู่คนละทุน (หรือบางชิ้นไม่มีทุน) ทั้งชุดไปอยู่ที่ทุนของหัวชุด
// (ไม่มีหัวชุด = ทุนของรายการแรกในชุด)
function reportLines(assets: Asset[]): ReportLine[] {
  const own = (a: Asset) => a.fundId ? 'fund:' + a.fundId : 'item:' + (a.setId ?? a.id);
  const setHome = new Map<string, string>();
  for (const a of assets) if (a.setId && a.setRole === 'header' && !setHome.has(a.setId)) setHome.set(a.setId, own(a));
  for (const a of assets) if (a.setId && !setHome.has(a.setId)) setHome.set(a.setId, own(a));
  const blocks = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = a.setId ? setHome.get(a.setId)! : own(a);
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key)!.push(a);
  }
  const lines: ReportLine[] = [];
  for (const [key, members] of blocks) {
    if (key.startsWith('fund:')) lines.push({ kind: 'heading', text: members.find(a => a.fundId)?.fundName || '' });
    lines.push(...setLines(members));
  }
  return lines;
}

// แบ่งหน้าตามจำนวนแถวของแบบหน้า ไม่ปล่อยหัวชุดหรือหัวข้อชุดไว้แถวสุดท้ายของหน้า
function paginate(lines: ReportLine[], rowsPerPage = ITEMS_PER_ASSET_PAGE): ReportLine[][] {
  const isHead = (l: ReportLine) => l.kind === 'heading' || l.asset.setRole === 'header';
  const pages: ReportLine[][] = [];
  for (let i = 0; i < lines.length;) {
    let end = Math.min(i + rowsPerPage, lines.length);
    while (end < lines.length && end - 1 > i && isHead(lines[end - 1])) end--;
    pages.push(lines.slice(i, end));
    i = end;
  }
  return pages.length ? pages : [[]];
}

// จำนวนหน้าของรายงานครุภัณฑ์คงเหลือ (ใช้นับ "แนบท้ายหน้า" ของรายงานพัสดุชำรุด)
export function assetReportPageCount(assets: Asset[], layout: PageLayout = 'portrait'): number {
  const groups = byAssetType(assets.filter(a => a.lifecycle !== 'split'));
  return groups.length ? groups.reduce((n, [, list]) => n + paginate(reportLines(list), pageLayouts[layout].rows).length, 0) : 1;
}

// ชื่อหัวข้อของสาขาในรายงาน เช่น "สาขาวิชาวิศวกรรมคอมพิวเตอร์"
export function branchTitle(branch: string): string {
  const standard = normalizeBranch(branch || '', '', '');
  return damagedSections.find(([b]) => b === standard)?.[1] ?? standard;
}

// หัวข้อสาขาในรายงานพัสดุชำรุด เรียงตามเอกสารแนบท้ายของเจ้าหน้าที่
const damagedSections: Array<[string, string]> = [
  ['สำนักงานคณะฯ / คณบดี (สนง.ควอ.)', 'สำนักงานคณะวิศวกรรมศาสตร์ฯ'],
  ['วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)', 'สาขาวิชาวิศวกรรมเครื่องกลและเมคคาทรอนิกส์'],
  ['นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)', 'สาขาวิชานวัตกรรมการออกแบบและสถาปัตยกรรม'],
  ['วิศวกรรมอุตสาหการ (วอ)', 'สาขาวิชาวิศวกรรมอุตสาหการ'],
  ['วิศวกรรมเครื่องจักรกลเกษตร (คจก)', 'สาขาวิชาวิศวกรรมเครื่องจักรกลเกษตร'],
  ['วิศวกรรมคอมพิวเตอร์ (วค)', 'สาขาวิชาวิศวกรรมคอมพิวเตอร์'],
  ['วิศวกรรมไฟฟ้า (วฟ)', 'สาขาวิชาวิศวกรรมไฟฟ้า'],
  ['วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)', 'สาขาวิชาวิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง'],
];

export type DamagedExportOptions = { fiscalYear?: number; mainReportPages?: number; branch?: string; workbook?: any };

// รายงานแนบท้าย "รายละเอียดครุภัณฑ์ชำรุด เสื่อมสภาพ" 7 คอลัมน์ แบ่งหัวข้อตามสาขา (ตามเอกสารแนบท้ายของเจ้าหน้าที่)
export async function createDamagedWorkbook(assets: Asset[], options: DamagedExportOptions = {}) {
  const ExcelModule = await import('exceljs');
  const Excel = (ExcelModule as any).default || ExcelModule;
  // ส่ง workbook มาด้วย = ต่อท้ายเป็นแผ่นสุดท้ายของรายงานคงเหลือในไฟล์เดียวกัน
  const w = options.workbook ?? new Excel.Workbook();
  w.creator = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์';
  const fiscalYear = options.fiscalYear ?? fiscalYearOf(new Date());
  const mainPages = options.mainReportPages ?? 0;
  const owner = FACULTY;
  const LINES_PER_PAGE = 32;

  type Line = { section: string } | { seq: number; asset: Asset };
  const lines: Line[] = [];
  const known = new Set(damagedSections.map(([b]) => b));
  const sections: Array<[string, Asset[]]> = damagedSections.map(([b, title]) => [title, assets.filter(a => normalizeBranch(a.branch || '', '', '') === b)]);
  const others = new Map<string, Asset[]>();
  for (const a of assets) {
    const b = normalizeBranch(a.branch || '', '', '');
    if (known.has(b)) continue;
    const title = b || 'ไม่ระบุสาขา';
    if (!others.has(title)) others.set(title, []);
    others.get(title)!.push(a);
  }
  let seq = 0;
  for (const [title, list] of [...sections, ...others]) {
    if (!list.length) continue;
    lines.push({ section: title });
    for (const asset of list) lines.push({ seq: ++seq, asset });
  }
  // แบ่งหน้า ไม่ปล่อยหัวข้อสาขาไว้บรรทัดสุดท้ายของหน้า
  const pages: Line[][] = [];
  for (let i = 0; i < lines.length || !pages.length;) {
    let end = Math.min(i + LINES_PER_PAGE, lines.length);
    while (end < lines.length && end - 1 > i && 'section' in lines[end - 1]) end--;
    pages.push(lines.slice(i, end));
    i = end;
    if (!lines.length) break;
  }

  const s = w.addWorksheet('พัสดุชำรุด', {
    views: [{ workbookViewId: 0, state: 'normal', showGridLines: true, style: 'pageBreakPreview' }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } },
  });
  delete (s.pageSetup as any).scale;
  // G กว้างเท่า A+B หัวรายงาน (ผสาน C:F) จึงอยู่กึ่งกลางหน้า · ตัวอักษร 14 จึงขยายช่องรายการ
  s.columns = [6.8, 31, 50, 7.5, 13, 15, 37.8].map(width => ({ width }));
  const thin = { style: 'thin' }, hair = { style: 'hair' };
  const style = (row: any, opts: { bold?: boolean; top?: any; bottom?: any; blueTo?: number } = {}) => {
    for (let col = 1; col <= 7; col++) {
      const c = row.getCell(col);
      c.font = { name: FONT, size: 14, bold: !!opts.bold, ...(opts.blueTo && col <= opts.blueTo ? { color: { argb: 'FF0000FF' } } : {}) };
      c.border = { top: opts.top ?? hair, bottom: opts.bottom ?? hair, left: thin, right: thin };
      c.alignment = { vertical: 'middle', horizontal: col === 1 || col === 4 ? 'center' : col === 5 || col === 6 ? 'right' : 'left', shrinkToFit: col === 5 || col === 6 };
    }
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).numFmt = '#,##0.00';
  };

  let carried: number | null = null;
  pages.forEach((page, p) => {
    const last = p === pages.length - 1;
    const title = (text: string, right: string, underline: boolean) => {
      const row = s.addRow(['', '', text, '', '', '', right]);
      s.mergeCells(`C${row.number}:F${row.number}`);
      row.height = 24.95;
      for (let col = 1; col <= 7; col++) {
        const c = row.getCell(col);
        c.font = { name: FONT, size: 14, bold: true };
        c.alignment = { vertical: 'middle', horizontal: col === 7 ? 'right' : 'center' };
        if (underline) c.border = { bottom: thin };
      }
    };
    title('มหาวิทยาลัยกาฬสินธุ์', 'พัสดุชำรุด', false);
    title('รายละเอียดครุภัณฑ์ชำรุด เสื่อมสภาพ', `แนบท้ายหน้า ${mainPages + p + 1}`, false);
    title(`ประจำปีงบประมาณ ${fiscalYear}`, '', true);
    const head = s.addRow(['ลำดับ', 'หมายเลขครุภัณฑ์', 'รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'จำนวนเงิน', 'หมายเหตุ']);
    head.height = 31.5;
    for (let col = 1; col <= 7; col++) {
      const c = head.getCell(col);
      c.font = { name: FONT, size: 14, bold: true };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { top: thin, bottom: thin, left: thin, right: thin };
    }
    const top = carried === null
      ? s.addRow([owner])
      : s.addRow(['', '', 'ยอดยกมา', '', '', { formula: `F${carried}` }, '']);
    if (carried === null) s.mergeCells(`A${top.number}:C${top.number}`);
    top.height = 23.1;
    style(top, { bold: true, top: thin, blueTo: carried === null ? 3 : 0 });
    if (carried !== null) top.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    const first = top.number + 1;
    for (const line of page) {
      if ('section' in line) {
        const row = s.addRow(['', line.section]);
        row.height = 23.1;
        style(row, { bold: true });
        continue;
      }
      const a = line.asset;
      const notes = a.notes && a.location && a.notes !== a.location ? `${a.notes} • ${a.location}` : (a.notes || a.location || '');
      const part = a.setRole === 'part';
      const row = s.addRow([line.seq, a.code, a.name, a.quantity, part ? null : a.unitSatang / 100, part ? 'รวมในชุด' : a.totalSatang / 100, notes]);
      row.height = 23.1;
      style(row);
      if (part) row.getCell(6).font = { name: FONT, size: 14, italic: true };
    }
    const lastRow = s.rowCount;
    const sum = carried === null ? `SUM(F${first}:F${lastRow})` : `SUM(F${top.number}, F${first}:F${lastRow})`;
    if (last) {
      const total = s.addRow(['รวม', '', '', '', '', { formula: sum }, '']);
      s.mergeCells(`B${total.number}:E${total.number}`);
      total.getCell(2).value = { formula: `"("&BAHTTEXT(F${total.number})&")"` };
      total.height = 24.95;
      style(total, { bold: true, top: thin, bottom: { style: 'double' } });
      total.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      total.getCell(2).alignment = { vertical: 'middle', horizontal: 'center', shrinkToFit: true };
    } else {
      const forward = s.addRow(['', '', 'ยอดยกไป', '', '', { formula: sum }, '']);
      forward.height = 23.1;
      style(forward, { bold: true, top: thin, bottom: thin });
      forward.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
      forward.addPageBreak();
      carried = forward.number;
    }
  });
  s.pageSetup.printArea = `A1:G${s.rowCount}`;
  return w;
}

export type ReportKind = 'remaining' | 'damaged' | 'both';
export type ReportRequest = { kind: ReportKind; branch?: string; type?: string; fiscalYear: number; layout: PageLayout; excludeDamaged: boolean };

// เลือกครุภัณฑ์สำหรับหน้า "ส่งออกรายงาน": เฉพาะที่ยังใช้งาน กรองสาขา/ประเภท
// รายการสภาพ "ชำรุด" ไปอยู่รายงานแนบท้าย (ไม่ซ้ำในรายงานคงเหลือ เมื่อเลือก excludeDamaged)
export function reportSelection(all: Asset[], r: ReportRequest) {
  const base = all.filter(a => a.lifecycle === 'active'
    && (!r.branch || normalizeBranch(a.branch || '', '', '') === r.branch)
    && (!r.type || a.category === r.type));
  const damaged = base.filter(a => a.condition === 'damaged');
  const remaining = r.excludeDamaged ? base.filter(a => a.condition !== 'damaged') : base;
  const sum = (list: Asset[]) => list.reduce((n, a) => n + (a.setRole === 'part' ? 0 : a.totalSatang), 0);
  return {
    remaining, damaged,
    types: byAssetType(remaining).length,
    mainPages: remaining.length ? assetReportPageCount(remaining, r.layout) : 0,
    remainingSatang: sum(remaining), damagedSatang: sum(damaged),
  };
}

export function reportFileName(r: ReportRequest) {
  const who = r.branch ? branchAbbr(r.branch) : 'ทั้งคณะ';
  const what = r.kind === 'damaged' ? 'รายละเอียดครุภัณฑ์ชำรุด' : r.kind === 'both' ? 'รายงานครุภัณฑ์คงเหลือและชำรุด' : 'รายละเอียดครุภัณฑ์คงเหลือ';
  return `${what}-${who}${r.type ? '-' + r.type : ''}-ปีงบ${r.fiscalYear}.xlsx`.replace(/[/\\?%*:|"<>]/g, '-');
}

export async function createReportWorkbook(all: Asset[], r: ReportRequest) {
  const sel = reportSelection(all, r);
  const opts = { fiscalYear: r.fiscalYear, branch: r.branch };
  if (r.kind === 'damaged') return createDamagedWorkbook(sel.damaged, { ...opts, mainReportPages: sel.mainPages });
  const w = await createAssetWorkbook(sel.remaining, { ...opts, layout: r.layout });
  if (r.kind === 'both') await createDamagedWorkbook(sel.damaged, { ...opts, mainReportPages: sel.mainPages, workbook: w });
  return w;
}

export async function exportReport(all: Asset[], r: ReportRequest) {
  const w = await createReportWorkbook(all, r);
  const bytes = await w.xlsx.writeBuffer();
  save(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFileName(r));
}

export async function exportDamagedWorkbook(assets: Asset[], options: DamagedExportOptions = {}) {
  const w = await createDamagedWorkbook(assets, options);
  const bytes = await w.xlsx.writeBuffer();
  save(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'รายละเอียดครุภัณฑ์ชำรุด-เสื่อมสภาพ.xlsx');
}


export async function exportStocktakeWorkbook(
  round: { name: string; year: number; status: string; checked: number; total: number },
  items: Array<{
    code: string;
    name: string;
    snapshot: string;
    result: string;
    quantity: number | null;
    notes: string | null;
    checkedAt: string | null;
  }>
) {
  const ExcelModule = await import('exceljs');
  const Excel = (ExcelModule as any).default || ExcelModule;
  const w = new Excel.Workbook();
  w.creator = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์';

  const s = w.addWorksheet('ผลการตรวจนับครุภัณฑ์', {
    views: [{ workbookViewId: 0, showGridLines: true }]
  });

  s.columns = [
    { width: 8 },
    { width: 28 },
    { width: 45 },
    { width: 25 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 22 },
    { width: 20 },
    { width: 30 }
  ];

  const r1 = s.addRow(['มหาวิทยาลัยกาฬสินธุ์ · คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม']);
  s.mergeCells('A1:J1');
  r1.height = 24;
  r1.getCell(1).font = { name: 'TH SarabunPSK', size: 14, bold: true };
  r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const r2 = s.addRow([`รายงานผลการตรวจนับครุภัณฑ์: ${round.name} (ปีงบประมาณ ${round.year})`]);
  s.mergeCells('A2:J2');
  r2.height = 22;
  r2.getCell(1).font = { name: 'TH SarabunPSK', size: 13, bold: true };
  r2.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const todayThai = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const r3 = s.addRow([`สถานะรอบ: ${round.status === 'open' ? 'กำลังตรวจนับ' : 'ปิดรอบแล้ว'} · ตรวจแล้ว ${round.checked}/${round.total} รายการ · ข้อมูล ณ วันที่ ${todayThai}`]);
  s.mergeCells('A3:J3');
  r3.height = 20;
  r3.getCell(1).font = { name: 'TH SarabunPSK', size: 11, italic: true };
  r3.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const headerCols = [
    'ลำดับ',
    'รหัสครุภัณฑ์',
    'รายการครุภัณฑ์',
    'สถานที่จัดเก็บ',
    'จำนวนในระบบ',
    'ตรวจพบจริง',
    'ผลต่าง (ขาด/เกิน)',
    'ผลการตรวจนับ',
    'วันที่บันทึกตรวจ',
    'หมายเหตุ'
  ];
  const hRow = s.addRow(headerCols);
  hRow.height = 24;
  hRow.eachCell((c: any) => {
    c.font = { name: 'TH SarabunPSK', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const resultMap: Record<string, string> = {
    normal: 'ตรงตามทะเบียน (ปกติ)',
    damaged: 'ชำรุด / ส่งซ่อม',
    missing: 'ไม่พบครุภัณฑ์',
    mismatch: 'ข้อมูลไม่ตรง',
    pending: 'ยังไม่ได้ตรวจ'
  };

  // สรุปผลต่าง: นับเป็นรายการและเป็นชิ้น (รายการที่ยังไม่ได้ตรวจไม่นับเป็นขาด)
  const tally = { match: 0, short: 0, over: 0, unchecked: 0, shortPieces: 0, overPieces: 0 };

  items.forEach((item, idx) => {
    let snap: any = {};
    try { snap = JSON.parse(item.snapshot || '{}'); } catch {}
    const diff = stocktakeDifference(Number(snap.quantity ?? 1), item.quantity);
    tally[diff.kind]++;
    if (diff.kind === 'short') tally.shortPieces += diff.amount;
    if (diff.kind === 'over') tally.overPieces += diff.amount;
    const diffText = diff.kind === 'match' ? 'ตรง' : diff.kind === 'short' ? `ขาด ${diff.amount}` : diff.kind === 'over' ? `เกิน ${diff.amount}` : '—';

    const row = s.addRow([
      idx + 1,
      item.code,
      item.name,
      snap.location || '—',
      snap.quantity ?? 1,
      item.quantity ?? '—',
      diffText,
      resultMap[item.result] || item.result || 'ยังไม่ได้ตรวจ',
      item.checkedAt ? new Date(item.checkedAt).toLocaleString('th-TH') : '—',
      item.notes || ''
    ]);

    row.height = 20;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(10).alignment = { vertical: 'middle', horizontal: 'left' };

    row.eachCell((c: any) => {
      c.font = { name: 'TH SarabunPSK', size: 11 };
      c.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  s.addRow([]);
  const sum = s.addRow([`สรุปผลต่าง: ตรงตามทะเบียน ${tally.match} รายการ · ขาด ${tally.short} รายการ (รวม ${tally.shortPieces} ชิ้น) · เกิน ${tally.over} รายการ (รวม ${tally.overPieces} ชิ้น) · ยังไม่ได้ตรวจ ${tally.unchecked} รายการ`]);
  s.mergeCells(`A${sum.number}:J${sum.number}`);
  sum.height = 22;
  sum.getCell(1).font = { name: 'TH SarabunPSK', size: 12, bold: true };
  sum.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  const safeRoundName = round.name.replace(/[/\\?%*:|"<>]/g, '-');
  const bytes = await w.xlsx.writeBuffer();
  save(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `รายงานผลตรวจนับ-${safeRoundName}-${round.year}.xlsx`);
}

export async function exportWorkbook(assets: Asset[]) {
  const w = await createAssetWorkbook(assets);
  const bytes = await w.xlsx.writeBuffer();
  save(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'รายละเอียดครุภัณฑ์คงเหลือ-10-คอลัมน์.xlsx');
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// พิมพ์จากหน้ารายงาน: ส่ง asOf มาด้วย ใบพิมพ์จะใช้วันที่ของรายงาน (ไม่ใช่วันนี้) และมีคอลัมน์ค่าเสื่อมสะสม/มูลค่าสุทธิ
export function printAssets(assets: Asset[], options: { asOf?: Date; asOfLabel?: string } = {}) {
  const old = document.getElementById('asset-print');
  old?.remove();
  const div = document.createElement('div');
  div.id = 'asset-print';
  div.className = 'print-only';
  const h = document.createElement('h2');
  h.className = 'print-title';
  h.textContent = 'มหาวิทยาลัยกาฬสินธุ์ · รายละเอียดครุภัณฑ์คงเหลือ';
  div.appendChild(h);
  const sub = document.createElement('p');
  sub.style.margin = '0 0 12px 0';
  sub.style.fontFamily = "'TH SarabunPSK', 'TH Sarabun New', sans-serif";
  sub.style.fontSize = '15px';
  sub.style.color = '#475569';
  sub.textContent = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม · ณ วันที่ ' + (options.asOfLabel ?? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));
  div.appendChild(sub);

  const t = document.createElement('table');
  t.className = 'print-table';
  const head = t.createTHead().insertRow();
  const withDep = !!options.asOf;
  const money2 = (n: number) => (n / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  [...reportHeaders, ...(withDep ? ['ค่าเสื่อมสะสม', 'มูลค่าสุทธิ'] : [])].forEach(x => {
    const c = document.createElement('th');
    c.textContent = x;
    head.appendChild(c);
  });
  const body = t.createTBody();
  assets.forEach((a, i) => {
    const r = body.insertRow();
    const notesCombined = a.notes && a.location && a.notes !== a.location ? `${a.notes} • ${a.location}` : (a.notes || a.location || '—');
    const vals: unknown[] = [i + 1, a.code, a.name, a.quantity, (a.unitSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }), (a.totalSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }), notesCombined, a.branch, groupFor(a), a.category];
    if (withDep) {
      const bv = bookValue(a, options.asOf);
      vals.push(bv === null ? '—' : money2(a.totalSatang - bv), money2(bv ?? a.totalSatang));
    }
    vals.forEach(v => {
      r.insertCell().textContent = String(v ?? '');
    });
  });
  // แถวรวมท้ายตาราง (คำนวณเป็นสตางค์)
  const sum = (f: (a: Asset) => number) => assets.reduce((n, a) => n + f(a), 0);
  const total = body.insertRow();
  const cells: string[] = ['', 'รวม ' + assets.length.toLocaleString('th-TH') + ' รายการ', '', '', '', money2(sum(a => a.totalSatang)), '', '', '', ''];
  if (withDep) {
    const net = sum(a => bookValue(a, options.asOf) ?? a.totalSatang);
    cells.push(money2(sum(a => a.totalSatang) - net), money2(net));
  }
  cells.forEach(v => { const c = total.insertCell(); c.textContent = v; c.style.fontWeight = 'bold'; });
  div.appendChild(t);
  document.body.appendChild(div);
  window.print();
  div.remove();
}

