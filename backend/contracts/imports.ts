import type { Candidate } from './domain';

export type SourceStats = {
  rows: number; assets: number; review: number; ready: number;
  rangeIssues: number; nameIssues: number; priceIssues: number;
  dupIssues: number; annotations: number; imported: number;
};
export type SourceViewResponse = {
  id: string; name: string; hash: string; sheets: string[];
  stats: SourceStats; total: number; rows: Array<Candidate & { done: boolean }>;
};
// branch: สาขาที่เลือกตอนนำเข้า ใช้แทนสาขาในไฟล์ทุกแถว (ใช้คู่กับ includeIssues)
// includeIssues: เลือกจากมุมมองแบบ Excel นำเข้าแถวที่ "ต้องตรวจ" ได้ด้วย (ติดหมายเหตุให้ตามแก้ รหัสซ้ำข้าม)
export type BatchImportInput = { sourceId: string } & ({ keys: string[]; includeIssues?: boolean; branch?: string; allReady?: never } | { allReady: true; keys?: never; includeIssues?: never; branch?: never });
export type BatchImportRequest = BatchImportInput & { action: 'batchImport'; token: string };
export type BatchImportResponse = { ok: true; count: number; replayed?: boolean; linked?: number; skipped?: Array<{ key: string; row: number; sheet: string; reason: string }> };
