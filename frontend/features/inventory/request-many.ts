import { normalizeBranch, type Asset } from '@/shared/domain';

// ยื่นคำขอหลายรายการพร้อมกัน (ผู้ใช้เลือกแบบ ก. 8 พ.ย. 2569): คัดว่ารายการที่ติ๊กมา ใบไหนยื่นได้ ใบไหนต้องข้าม
// กฎเดียวกับฝั่งเซิร์ฟเวอร์ (createRequest) แต่บอกล่วงหน้า ผู้ใช้จะได้ไม่ต้องกดแล้วเจอข้อผิดพลาดทีละชิ้น

export type BatchKind = 'transfer' | 'repair' | 'disposal';
export type Destination = { location: string; branch: string; custodian: string };
export type BatchCheck = { ready: Asset[]; skipped: { asset: Asset; why: string }[] };

const codeOrder = new Intl.Collator('th', { numeric: true });

export function batchCheck(
  selected: Asset[],
  kind: BatchKind,
  pendingAssetIds: Set<string>,
  to?: Destination,
): BatchCheck {
  const ready: Asset[] = [],
    skipped: BatchCheck['skipped'] = [];
  // เลขที่คำขอออกตามลำดับนี้: เรียงตามหมายเลขครุภัณฑ์
  const list = [...selected].sort((a, b) => codeOrder.compare(a.code, b.code));
  const setLead = new Map<string, string>();
  const location = to?.location.trim() ?? '',
    branch = to?.branch ? normalizeBranch(to.branch) : '',
    custodian = to?.custodian.trim() ?? '';
  for (const a of list) {
    const why = (() => {
      if (pendingAssetIds.has(a.id)) return 'มีคำขอรออนุมัติอยู่แล้ว';
      if (kind === 'repair' && a.condition === 'repair') return 'อยู่ระหว่างซ่อมแล้ว';
      // ชุดห้ามแยก: โอนย้าย/จำหน่ายมีผลทั้งชุดในใบเดียว ชิ้นอื่นของชุดเดียวกันจึงไม่ต้องยื่นซ้ำ
      if (a.setId && kind !== 'repair') {
        const lead = setLead.get(a.setId);
        if (lead) return `อยู่ในชุดเดียวกับ ${lead} (ยื่นทั้งชุดในใบเดียวแล้ว)`;
      }
      if (
        kind === 'transfer' &&
        location &&
        branch &&
        location === a.location &&
        branch === normalizeBranch(a.branch) &&
        (!custodian || custodian === a.custodian)
      )
        return 'อยู่ที่ปลายทางนี้แล้ว';
      return '';
    })();
    if (why) skipped.push({ asset: a, why });
    else {
      ready.push(a);
      if (a.setId && kind !== 'repair') setLead.set(a.setId, a.code);
    }
  }
  return { ready, skipped };
}

// ค่าที่ทุกรายการเหมือนกัน (ไว้เติมช่องปลายทางให้ก่อน) · ต่างกัน = เว้นว่าง
export function sameValue(values: (string | null | undefined)[]): string {
  const first = values[0] ?? '';
  return values.every(v => (v ?? '') === first) ? first : '';
}
