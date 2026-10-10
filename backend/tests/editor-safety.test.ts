import assert from 'node:assert/strict';
import {test} from 'node:test';
import {satang} from '../contracts/domain';
import {assetAmountInput, assetTotalInput, uploadCreatedAssetPhoto} from '../../frontend/features/inventory/editor';

test('editor derives exact totals from supported money input, including commas and zero', () => {
  for (const [price, quantity, expected] of [
    ['1,000.00', 2, '2000.00'],
    ['0.29', 3, '0.87'],
    ['0', 25, '0.00'],
    ['999999999999.99', 1, '999999999999.99'],
    ['1000000.00', 1000000, '1000000000000.00'],
  ] as const) {
    const total = assetTotalInput(price, quantity);
    assert.equal(total, expected);
    assert.equal(BigInt(satang(total)), BigInt(satang(price)) * BigInt(quantity));
  }
  assert.throws(() => assetTotalInput('1000000.01', 1000000), /เกินขอบเขต/);
  for (const invalid of ['', '12.345', '1e3', '-1']) assert.throws(() => assetTotalInput(invalid, 2));
  assert.throws(() => assetTotalInput('1', 1.5));
});

test('registered zero amounts remain valid when displayed and submitted unchanged', () => {
  for (const amount of [0, 1, 100, 99999999999999]) {
    assert.equal(satang(assetAmountInput(amount)), amount);
  }
  assert.equal(assetAmountInput(0), '0.00');
});

test('photo attached to a saved asset reports HTTP/network failures and never resubmits the asset', async () => {
  const originalFetch = globalThis.fetch;
  const requests: {url: string; init: RequestInit}[] = [];
  const file = new File(['synthetic'], 'test.png', {type: 'image/png'});
  const signal = new AbortController().signal;
  let response = Response.json({error: 'ไฟล์รูปภาพเสีย'}, {status: 400});
  try {
    globalThis.fetch = (async (url, init = {}) => {
      requests.push({url: String(url), init});
      return response;
    }) as typeof fetch;
    await assert.rejects(uploadCreatedAssetPhoto('saved-id', file, signal), {message: 'ไฟล์รูปภาพเสีย', status: 400});
    response = Response.json({error: 'รูปถูกเปลี่ยนแล้ว'}, {status: 409});
    await assert.rejects(uploadCreatedAssetPhoto('saved-id', file, signal), {message: 'รูปถูกเปลี่ยนแล้ว', status: 409});
    response = Response.json({ok: true});
    await assert.rejects(uploadCreatedAssetPhoto('saved-id', file, signal), /ผลบันทึกรูปไม่ครบ/);
    response = Response.json({ok: true, imageVersion: 'version-1'});
    assert.equal((await uploadCreatedAssetPhoto('saved-id', file, signal)).imageVersion, 'version-1');
    assert.ok(requests.every(({url, init}) => url === '/api/asset-image' && init.method === 'POST'));
    for (const {init} of requests) {
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('assetId'), 'saved-id');
      assert.equal(init.body.get('expectedVersion'), '');
    }
    globalThis.fetch = (async () => {throw new TypeError('network failed');}) as typeof fetch;
    await assert.rejects(uploadCreatedAssetPhoto('saved-id', file, signal), /network failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
