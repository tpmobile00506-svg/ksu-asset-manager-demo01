import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBatchImporter, sourceResponse } from '../../frontend/features/imports/import-requests';
import type { BatchImportRequest } from '../contracts/imports';
import { classify } from '../contracts/domain';

test('retry after a lost import response keeps the same operation and payload', async () => {
  const sent: BatchImportRequest[] = [];
  let tokens = 0;
  const submit = createBatchImporter(async body => {
    sent.push(structuredClone(body));
    if (sent.length === 1) throw new TypeError('Connection lost after server committed');
    return { ok: true, count: 2, replayed: true };
  }, () => `request-${++tokens}`);
  await assert.rejects(submit({ sourceId: 'fixture', keys: ['b', 'a'] }));
  assert.equal((await submit({ sourceId: 'fixture', keys: ['a', 'b'] })).replayed, true);
  assert.deepEqual(sent[0], sent[1]);
  await submit({ sourceId: 'fixture', keys: ['a', 'b'] });
  assert.notEqual(sent[2].token, sent[1].token, 'A confirmed completed operation must not replay a subsequent new operation');
});

test('overlapping import clicks send only one request, and other files get another token', async () => {
  const sent: BatchImportRequest[] = [];
  let release!: (value: unknown) => void;
  let tokens = 0;
  const submit = createBatchImporter(body => {
    sent.push(body);
    return new Promise(resolve => { release = resolve; });
  }, () => `request-${++tokens}`);
  const first = submit({ sourceId: 'one', allReady: true });
  const duplicate = submit({ sourceId: 'one', allReady: true });
  assert.equal(sent.length, 1);
  release({ ok: true, count: 4 });
  assert.deepEqual(await first, await duplicate);
  const other = submit({ sourceId: 'two', allReady: true });
  assert.notEqual(sent[0].token, sent[1].token);
  release({ ok: true, count: 1 });
  await other;
});

test('malformed import success does not discard the token needed to recover the result', async () => {
  const sent: BatchImportRequest[] = [];
  const submit = createBatchImporter(async body => {
    sent.push(body);
    return sent.length === 1 ? { ok: true } : { ok: true, count: 1, replayed: true };
  });
  await assert.rejects(submit({ sourceId: 'fixture', keys: ['a'] }));
  await submit({ sourceId: 'fixture', keys: ['a'] });
  assert.deepEqual(sent[0], sent[1]);
});

test('source response contract rejects incomplete stats and malformed rows before rendering', () => {
  const response = { id: 'fixture', name: 'fixture.xlsx', hash: 'hash', sheets: ['sheet'], total: 1,
    stats: { rows: 1, assets: 1, review: 0, ready: 1, rangeIssues: 0, nameIssues: 0, priceIssues: 0, dupIssues: 0, annotations: 0, imported: 0 },
    rows: [{ key: 'sheet:1', sheet: 'sheet', row: 1, kind: 'asset', issue: '', groupName: '', values: [], done: false, asset: { name: 'Asset', quantity: 1, totalSatang: 100 } }] };
  assert.equal(sourceResponse(response).rows[0].asset.name, 'Asset');
  assert.throws(() => sourceResponse({ ...response, stats: { ready: 1 } }));
  assert.throws(() => sourceResponse({ ...response, rows: [{ ...response.rows[0], asset: null }] }));
  assert.throws(() => sourceResponse({ ...response, rows: [{ ...response.rows[0], asset: { name: {} } }] }));
  const annotations = classify({ id: 'fixture', name: 'fixture', hash: '', sheets: [{ name: 'sheet', rows: [{ row: 2, values: ['ยอดยกไป', '', '', 123.45] }] }] });
  assert.equal(sourceResponse({ ...response, rows: annotations.map(row => ({ ...row, done: false })) }).rows[0].kind, 'subtotal');
});

test('source requests cancelled by a filter change cannot deliver stale JSON', async () => {
  const { api } = await import('../../frontend/components/common');
  const originalFetch = globalThis.fetch;
  let resolveFetch!: (value: Response) => void;
  try {
    globalThis.fetch = (() => new Promise<Response>(resolve => { resolveFetch = resolve; })) as typeof fetch;
    const filter = new AbortController();
    const request = api('?view=source', undefined, { signal: filter.signal });
    filter.abort();
    resolveFetch(Response.json({ rows: [], sheets: [], stats: {} }));
    await assert.rejects(request, { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});
