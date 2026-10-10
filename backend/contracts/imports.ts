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
export type BatchImportInput = { sourceId: string } & ({ keys: string[]; allReady?: never } | { allReady: true; keys?: never });
export type BatchImportRequest = BatchImportInput & { action: 'batchImport'; token: string };
export type BatchImportResponse = { ok: true; count: number; replayed?: boolean };
