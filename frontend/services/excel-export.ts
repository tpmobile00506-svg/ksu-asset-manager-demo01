import {Asset, standardCategories, stocktakeDifference} from '@/shared/domain';

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

export async function createAssetWorkbook(assets: Asset[]) {
  assets = assets.filter(a => a.lifecycle !== 'split');
  const ExcelModule = await import('exceljs');
  const Excel = (ExcelModule as any).default || ExcelModule;
  const w = new Excel.Workbook();
  w.creator = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์';

  const s = w.addWorksheet('รายละเอียดครุภัณฑ์คงเหลือ', {
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
      orientation: 'portrait',
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

  s.columns = [
    { width: 6.80 },   // 1: ลำดับ
    { width: 28.00 },  // 2: หมายเลขครุภัณฑ์ (เดิม 35.00)
    { width: 45.00 },  // 3: รายการ
    { width: 6.50 },   // 4: จำนวน
    { width: 12.50 },  // 5: ราคาต่อหน่วย
    { width: 14.50 },  // 6: จำนวนเงิน
    { width: 36.00 },  // 7: หมายเหตุ (รวมสถานที่) (เดิม 26.00)
    { width: 23.50 },  // 8: สาขา (เดิม 17.50)
    { width: 11.00 },  // 9: หมวด (กลุ่มต่างๆ) (เดิม 17.00)
    { width: 17.00 }   // 10: สำนักงาน
  ];


  const todayThai = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  const ITEMS_PER_PAGE = 48;
  const totalPages = Math.max(1, Math.ceil(assets.length / ITEMS_PER_PAGE));

  let currentItemIndex = 0;
  let lastCarriedForwardRow: number | null = null;

  for (let page = 1; page <= totalPages; page++) {
    const pageAssets = assets.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    const isFirstPage = page === 1;
    const isLastPage = page === totalPages;

    // แถว 1: มหาวิทยาลัยกาฬสินธุ์ (ผสาน A:I กึ่งกลาง)
    const r1 = s.addRow(['มหาวิทยาลัยกาฬสินธุ์']);
    const r1Idx = r1.number;
    s.mergeCells(`A${r1Idx}:I${r1Idx}`);
    r1.height = 24.95;
    r1.getCell(1).font = { name: 'TH SarabunPSK', size: 14, bold: true };
    r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // แถว 2: รายละเอียดครุภัณฑ์คงเหลือ (ผสาน A:I กึ่งกลางตรงแนวกันเป๊ะ) และ เลขหน้า (คอลัมน์ J กึ่งกลางช่อง ใส่แค่ตัวเลข 1, 2, 3)
    const r2 = s.addRow([
      'รายละเอียดครุภัณฑ์คงเหลือ', '', '', '', '', '', '', '', '',
      page
    ]);
    const r2Idx = r2.number;
    s.mergeCells(`A${r2Idx}:I${r2Idx}`);
    r2.height = 24.95;
    r2.getCell(1).font = { name: 'TH SarabunPSK', size: 14, bold: true };
    r2.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    r2.getCell(10).font = { name: 'TH SarabunPSK', size: 14, bold: true };
    r2.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };

    // แถว 3: ณ วันที่ (ผสาน A:I กึ่งกลางตรงแนวกับแถว 1 และ 2 พร้อมเส้นขีดล่างเต็ม 10 คอลัมน์)
    const r3 = s.addRow([`ณ  วันที่  ${todayThai}`]);
    const r3Idx = r3.number;
    s.mergeCells(`A${r3Idx}:I${r3Idx}`);
    r3.height = 24.95;
    r3.getCell(1).font = { name: 'TH SarabunPSK', size: 14, bold: true };
    r3.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = 1; c <= 10; c++) {
      r3.getCell(c).border = { bottom: { style: 'thin' } };
    }

    // แถว 4: หัวตาราง 10 คอลัมน์
    const r4 = s.addRow(reportHeaders);
    r4.height = 31.5;
    for (let col = 1; col <= 10; col++) {
      const c = r4.getCell(col);
      c.font = { name: 'TH SarabunPSK', size: 12, bold: true };
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
      const r5 = s.addRow(['คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม']);
      const r5Idx = r5.number;
      s.mergeCells(`A${r5Idx}:C${r5Idx}`);
      r5.height = 23.1;
      for (let col = 1; col <= 10; col++) {
        const c = r5.getCell(col);
        c.font = { name: 'TH SarabunPSK', size: 12, bold: true, color: { argb: 'FF0000FF' } };
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
        'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม',
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
        c.font = { name: 'TH SarabunPSK', size: 12, bold: true };
        c.border = {
          top: { style: 'thin' },
          bottom: { style: 'hair' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      rBrought.getCell(1).font = { name: 'TH SarabunPSK', size: 12, bold: true, color: { argb: 'FF0000FF' } };
      rBrought.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      rBrought.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      rBrought.getCell(6).alignment = { vertical: 'middle', horizontal: 'right', shrinkToFit: true };
      rBrought.getCell(6).numFmt = '#,##0.00';
    }

    // แถวข้อมูลในหน้านี้ (ตัวหนังสือ 12pt เท่ากันทุกช่อง + shrinkToFit เพื่อป้องกัน ####### เด็ดขาด)
    pageAssets.forEach((a) => {
      currentItemIndex++;
      const notesCombined = a.notes && a.location && a.notes !== a.location
        ? `${a.notes} • ${a.location}`
        : (a.notes || a.location || '—');

      const cleanGroup = (a.groupName || '').replace(/^\d+\s*\|\s*/, '').trim() || '—';

      let col9 = cleanGroup;
      let col10 = a.category || 'ทั่วไป';
      if (standardCategories.includes(a.category as any)) {
        col9 = a.category;
        col10 = cleanGroup !== '—' && cleanGroup !== 'ทั่วไป' ? cleanGroup : 'ครุภัณฑ์' + (a.category === 'สำนักงานส่วนกลาง' ? 'สำนักงาน' : a.category);
      }

      const rowValues = [
        currentItemIndex,
        a.code,
        a.name,
        a.quantity,
        a.unitSatang / 100,
        null,
        notesCombined,
        a.branch,
        col9,
        col10
      ];

      const dr = s.addRow(rowValues);
      const drIdx = dr.number;
      if (!pageStartDataRow) pageStartDataRow = drIdx;
      pageEndDataRow = drIdx;

      dr.getCell(6).value = a.totalSatang / 100;
      dr.height = 23.1;

      for (let col = 1; col <= 10; col++) {
        const c = dr.getCell(col);
        const isNum = [5, 6].includes(col);
        const isCenter = [1, 4].includes(col);
        c.font = {
          name: 'TH SarabunPSK',
          size: 12,
          bold: false
        };
        c.alignment = {
          vertical: 'middle',
          horizontal: isCenter ? 'center' : isNum ? 'right' : 'left',
          wrapText: false,
          shrinkToFit: isNum
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
        c.font = { name: 'TH SarabunPSK', size: 12, bold: true };
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
        c.font = { name: 'TH SarabunPSK', size: 12, bold: true };
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

  return w;
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

export function printAssets(assets: Asset[]) {
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
  sub.textContent = 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม · ณ วันที่ ' + new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  div.appendChild(sub);

  const t = document.createElement('table');
  t.className = 'print-table';
  const head = t.createTHead().insertRow();
  reportHeaders.forEach(x => {
    const c = document.createElement('th');
    c.textContent = x;
    head.appendChild(c);
  });
  const body = t.createTBody();
  assets.forEach((a, i) => {
    const r = body.insertRow();
    const notesCombined = a.notes && a.location && a.notes !== a.location ? `${a.notes} • ${a.location}` : (a.notes || a.location || '—');
    const vals = [i + 1, a.code, a.name, a.quantity, (a.unitSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }), (a.totalSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }), notesCombined, a.branch, a.groupName || '—', a.category];
    vals.forEach(v => {
      r.insertCell().textContent = String(v ?? '');
    });
  });
  div.appendChild(t);
  document.body.appendChild(div);
  window.print();
  div.remove();
}

