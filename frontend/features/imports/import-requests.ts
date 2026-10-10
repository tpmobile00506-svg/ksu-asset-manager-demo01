import type { BatchImportInput, BatchImportRequest, BatchImportResponse, SourceViewResponse } from '../../../backend/contracts/imports';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const sourceAsset = (value: unknown) => record(value) &&
  ['code', 'name', 'branch', 'location'].every(key => value[key] === undefined || typeof value[key] === 'string') &&
  // Annotation rows can carry fractional numbers in the quantity column.
  ['quantity', 'totalSatang'].every(key => value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key])));
export function sourceResponse(value: unknown): SourceViewResponse {
  if (!record(value) || !['id', 'name', 'hash'].every(key => typeof value[key] === 'string') ||
    !Array.isArray(value.sheets) || !value.sheets.every(sheet => typeof sheet === 'string') ||
    !count(value.total) || !record(value.stats) ||
    !['rows', 'assets', 'review', 'ready', 'rangeIssues', 'nameIssues', 'priceIssues', 'dupIssues', 'annotations', 'imported'].every(key => count((value.stats as Record<string, unknown>)[key])) ||
    !Array.isArray(value.rows) || !value.rows.every(row => record(row) &&
      ['key', 'sheet', 'kind', 'issue', 'groupName'].every(key => typeof row[key] === 'string') &&
      count(row.row) && typeof row.done === 'boolean' && Array.isArray(row.values) && sourceAsset(row.asset))) {
    throw new Error('ข้อมูลต้นฉบับจากเซิร์ฟเวอร์ไม่ครบ กรุณาโหลดใหม่');
  }
  return value as SourceViewResponse;
}

// Keep the exact token/payload after an ambiguous network failure. Concurrent clicks
// for the same operation share one request; a confirmed success starts a new operation.
export function createBatchImporter(send: (body: BatchImportRequest) => Promise<unknown>, token = () => crypto.randomUUID()) {
  const requests = new Map<string, { body: BatchImportRequest; pending?: Promise<BatchImportResponse> }>();
  return async (input: BatchImportInput): Promise<BatchImportResponse> => {
    const payload: BatchImportInput = input.allReady
      ? { sourceId: input.sourceId, allReady: true }
      : { sourceId: input.sourceId, keys: [...new Set(input.keys)].sort() };
    const key = JSON.stringify(payload);
    let operation = requests.get(key);
    if (!operation) {
      operation = { body: { action: 'batchImport', ...payload, token: token() } };
      requests.set(key, operation);
    }
    if (operation.pending) return operation.pending;
    const current = operation;
    current.pending = (async () => {
      const response = await send(current.body);
      if (!record(response) || response.ok !== true || !count(response.count)) throw new Error('ยังยืนยันผลนำเข้าไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง');
      requests.delete(key);
      return response as BatchImportResponse;
    })();
    try { return await current.pending; }
    finally { current.pending = undefined; }
  };
}
