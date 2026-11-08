import { codeKey, pieceCodes, MAX_PIECES, type PieceFormat } from '@/shared/domain';

// ส่วนคำนวณของตารางหมายเลขรายชิ้น (ติด QR แยกรายชิ้น ผู้ใช้ขอ 8 พ.ย. 2569) แยกจากหน้าจอให้เทสต์เรียกได้ตรงๆ
// สถานะ: รูปแบบเลขลำดับ + เริ่มที่ชิ้นไหน + ช่องที่เจ้าหน้าที่แก้เอง (edited) + Serial รายชิ้น

export type PiecesState = {
  format: PieceFormat;
  start: number;
  edited: Record<number, string>;
  serials: Record<number, string>;
  showAll: boolean;
};
export const initialPieces = (): PiecesState => ({
  format: 'padded',
  start: 1,
  edited: {},
  serials: {},
  showAll: false,
});

// หมายเลขและ Serial ที่จะส่งไปบันทึก (หมายเลขที่ไล่ให้ + ช่องที่แก้เอง)
export function resolvePieces(state: PiecesState, base: string, quantity: number) {
  return pieceCodes(base, state.start, quantity, state.format).map((code, i) => ({
    code: (state.edited[i] ?? code).trim(),
    serial: (state.serials[i] ?? '').trim(),
  }));
}

// ตรวจก่อนส่ง: บอกปัญหาแรกที่เจอเป็นข้อความ หรือ '' ถ้าพร้อมบันทึก (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้น รวมซ้ำกับทะเบียน)
// parentCode = หมายเลขของรายการแม่ที่จะเก็บในประวัติ ชิ้นใดใช้เลขเดียวกันไม่ได้
export function piecesProblem(pieces: { code: string }[], parentCode: string, parentLabel = 'หมายเลขหลัก') {
  if (pieces.length > MAX_PIECES) return `แยกรายชิ้นได้ครั้งละไม่เกิน ${MAX_PIECES.toLocaleString('th-TH')} ชิ้น`;
  const empty = pieces.findIndex(p => !p.code);
  if (empty >= 0) return `กรุณาระบุหมายเลขของชิ้นที่ ${empty + 1}`;
  const seen = new Map<string, number>([[codeKey(parentCode), 0]]);
  for (const [i, p] of pieces.entries()) {
    const key = codeKey(p.code);
    if (seen.has(key))
      return seen.get(key) === 0
        ? `หมายเลขชิ้นที่ ${i + 1} ซ้ำกับ${parentLabel}`
        : `หมายเลขชิ้นที่ ${i + 1} ซ้ำกับชิ้นที่ ${seen.get(key)}`;
    seen.set(key, i + 1);
  }
  return '';
}
