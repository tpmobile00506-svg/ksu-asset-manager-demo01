import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// Run through run-integration.mjs; never load .env or use a real asset database.
assert.ok(process.env.ASSET_TEST_URL && process.env.DATABASE_URL, 'Use the isolated integration runner');
const base = new URL(process.env.ASSET_TEST_URL);
const database = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Image tests require a loopback test server');
assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname));
assert.match(database.pathname, /^\/asset_test_\d+_[a-f0-9]{8}$/, 'Image tests require a disposable database created by the runner');
assert.ok(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD, 'Missing isolated test credentials');

const suffix = randomUUID();
const password = 'Image-test-' + randomUUID();
const identities = { admin: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } };
const cookies = {};
const roles = ['admin', 'staff', 'head', 'deputy', 'dean'];
const binaryEncodings = new Set();
const imagePath = '/api/asset-image';

function assertMetadataOnly(value) {
  if (typeof value === 'string') {
    assert.ok(!value.includes('data:image/'), 'Image data URI leaked into JSON');
    for (const encoded of binaryEncodings) assert.ok(!value.includes(encoded), 'Image bytes leaked as base64');
    if (/^\s*[\[{]/.test(value)) {
      let nested;
      try { nested = JSON.parse(value); } catch { /* A normal string can begin with a bracket. */ }
      if (nested) assertMetadataOnly(nested);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  assert.notEqual(value.type, 'Buffer', 'Image Buffer leaked into JSON');
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!['body', 'base64', 'buffer', 'imageData', 'binary'].includes(key), `Unexpected image payload field: ${key}`);
    assertMetadataOnly(item);
  }
}

async function jsonResult(response) {
  let data;
  try { data = await response.json(); }
  catch { assert.fail(`Expected JSON, received HTTP ${response.status}`); }
  assertMetadataOnly(data);
  return { status: response.status, data, response };
}

function good(result) {
  assert.equal(result.status, 200, `Expected success; received HTTP ${result.status}: ${result.data.error || 'unexpected response'}`);
  return result.data;
}

async function data(role, body, query = '') {
  return jsonResult(await fetch(new URL('/api/data' + query, base), {
    method: body ? 'POST' : 'GET',
    headers: { Cookie: cookies[role], ...(body ? { Origin: base.origin, 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ token: randomUUID(), ...body }) : undefined,
  }));
}

async function login(role) {
  const result = await jsonResult(await fetch(new URL('/api/auth/login', base), {
    method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(identities[role]),
  }));
  good(result);
  const cookie = result.response.headers.get('set-cookie');
  assert.match(cookie || '', /^ksu_session=[a-f0-9]{64};/);
  cookies[role] = cookie.split(';', 1)[0];
}

async function upload(role, assetId, expectedVersion, bytes, options = {}) {
  const form = new FormData();
  form.set('assetId', assetId);
  form.set('expectedVersion', expectedVersion);
  form.set('file', new File([bytes], options.name || 'test.png', { type: options.type || 'image/png' }));
  return jsonResult(await fetch(new URL(imagePath, base), {
    method: 'POST',
    headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), Origin: options.origin || base.origin },
    body: form,
  }));
}

async function remove(role, assetId, expectedVersion, origin = base.origin) {
  return jsonResult(await fetch(new URL(imagePath, base), {
    method: 'DELETE',
    headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, expectedVersion }),
  }));
}

async function getImage(role, assetId) {
  return fetch(new URL(imagePath + '?asset=' + encodeURIComponent(assetId), base), {
    headers: cookies[role] ? { Cookie: cookies[role] } : {},
  });
}

async function imageBytes(role, assetId) {
  const response = await getImage(role, assetId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.match(response.headers.get('cache-control') || '', /private/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'webp', 'Response must contain real WebP bytes');
  assert.equal(metadata.width, 18);
  assert.equal(metadata.height, 12);
  binaryEncodings.add(bytes.toString('base64'));
  return bytes;
}

function imageMetadata(result) {
  const value = good(result);
  assert.equal(value.ok, true);
  assert.equal(typeof value.imageVersion, 'string');
  assert.ok(Number.isFinite(Date.parse(value.imageVersion)));
  const url = new URL(value.imageUrl, base);
  assert.equal(url.origin, base.origin);
  assert.equal(url.pathname, imagePath);
  assert.equal(url.searchParams.get('asset'), assetId);
  return value;
}

const fixtures = await Promise.all(['red', 'blue', 'green', 'yellow'].map(background =>
  sharp({ create: { width: 18, height: 12, channels: 3, background } }).png().toBuffer()));
fixtures.forEach(bytes => binaryEncodings.add(bytes.toString('base64')));
await login('admin');
for (const role of roles.filter(role => role !== 'admin')) {
  identities[role] = { email: `image-${role}-${suffix}@example.test`, password };
  good(await data('admin', { action: 'user', email: identities[role].email, name: `Image test ${role}`, role, active: true, password }));
  await login(role);
}

const assetId = good(await data('admin', { action: 'create', asset: {
  code: 'IMAGE-' + suffix, name: 'ครุภัณฑ์ทดสอบรูปภาพ', quantity: 2, unitSatang: 12550, totalSatang: 25100,
  notes: '', location: 'ห้องทดสอบรูปภาพ', branch: 'ทดสอบ', category: 'ทดสอบ', groupName: 'ทดสอบรูปภาพ',
  condition: 'normal', receivedDate: '', lifeYears: 0, salvageSatang: 0,
} })).id;
const initialAsset = good(await data('admin')).assets.find(asset => asset.id === assetId);
assert.ok(initialAsset);

async function checkAsset(expected = null) {
  const state = good(await data('staff'));
  const current = state.assets.find(asset => asset.id === assetId);
  assert.ok(current);
  for (const key of ['version', 'quantity', 'unitSatang', 'totalSatang', 'salvageSatang', 'lifecycle']) {
    assert.equal(current[key], initialAsset[key], `Image operation changed Asset.${key}`);
  }
  assert.equal(current.imageVersion, expected?.imageVersion ?? null);
  assert.equal(current.imageUrl, expected?.imageUrl ?? null);
  return current;
}

await checkAsset();
assert.equal((await getImage('anonymous', assetId)).status, 401);
assert.equal((await upload('anonymous', assetId, '', fixtures[0])).status, 401);
assert.equal((await remove('anonymous', assetId, '')).status, 401);
assert.equal((await getImage('admin', assetId)).status, 404);
for (const role of ['head', 'deputy', 'dean']) {
  assert.equal((await upload(role, assetId, '', fixtures[0])).status, 403, `${role} cannot upload images`);
  assert.equal((await remove(role, assetId, '')).status, 403, `${role} cannot remove images`);
}
const foreignOrigin = 'https://localhost.evil.example';
assert.equal((await upload('staff', assetId, '', fixtures[0], { origin: foreignOrigin })).status, 403);
assert.equal((await remove('staff', assetId, '', foreignOrigin)).status, 403);
const missingId = randomUUID();
assert.equal((await getImage('admin', missingId)).status, 404);
assert.equal((await upload('staff', missingId, '', fixtures[0])).status, 404);
assert.equal((await remove('staff', missingId, '')).status, 404);

assert.equal((await upload('staff', assetId, '', Buffer.alloc(0))).status, 400);
assert.equal((await upload('staff', assetId, '', Buffer.from('not an image'))).status, 400);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="12"><rect width="18" height="12" fill="red"/></svg>');
assert.equal((await upload('staff', assetId, '', svg, { name: 'disguised.png', type: 'image/png' })).status, 415,
  'An SVG disguised with a PNG MIME and filename must be rejected');
assert.equal((await upload('staff', assetId, '', Buffer.alloc(4 * 1024 * 1024 + 1))).status, 413);
let chunks = 0;
const streamedOversize = await fetch(new URL(imagePath, base), {
  method: 'POST', duplex: 'half',
  headers: { Cookie: cookies.staff, Origin: base.origin, 'Content-Type': 'multipart/form-data; boundary=photo-test', Connection: 'close' },
  body: new ReadableStream({ pull(controller) {
    if (chunks++ < 9) controller.enqueue(new Uint8Array(512 * 1024));
    else controller.close();
  } }),
});
assert.equal(streamedOversize.status, 413, 'Actual request size is bounded without a Content-Length header');
await streamedOversize.arrayBuffer();
await checkAsset();
console.log('PASS images: anonymous/role/origin checks, missing assets, invalid/empty/SVG/oversized input');

const first = imageMetadata(await upload('staff', assetId, '', fixtures[0]));
await checkAsset(first);
const firstBytes = await imageBytes('admin', assetId);
for (const role of roles) assert.deepEqual(await imageBytes(role, assetId), firstBytes, `${role} can view the same image`);

// Decoded content controls acceptance; a valid PNG remains valid with an inaccurate MIME label.
const second = imageMetadata(await upload('admin', assetId, first.imageVersion, fixtures[1], { type: 'text/plain' }));
assert.ok(Date.parse(second.imageVersion) > Date.parse(first.imageVersion));
assert.notEqual(second.imageUrl, first.imageUrl);
assert.notDeepEqual(await imageBytes('staff', assetId), firstBytes);
await checkAsset(second);
assert.equal((await upload('staff', assetId, first.imageVersion, fixtures[2])).status, 409);
assert.equal((await remove('admin', assetId, first.imageVersion)).status, 409);
await checkAsset(second);

const competing = await Promise.all([
  upload('staff', assetId, second.imageVersion, fixtures[2]),
  upload('admin', assetId, second.imageVersion, fixtures[3]),
]);
assert.deepEqual(competing.map(result => result.status).sort(), [200, 409], 'Exactly one competing image replacement may commit');
const winner = imageMetadata(competing.find(result => result.status === 200));
assert.ok(Date.parse(winner.imageVersion) > Date.parse(second.imageVersion));
await imageBytes('dean', assetId);
await checkAsset(winner);
console.log('PASS images: five roles view WebP, staff/admin replacement, stale and concurrent version protection');

good(await remove('staff', assetId, winner.imageVersion));
assert.equal((await getImage('staff', assetId)).status, 404);
await checkAsset();
const restored = imageMetadata(await upload('admin', assetId, '', fixtures[0]));
await checkAsset(restored);
good(await remove('admin', assetId, restored.imageVersion));
assert.equal((await getImage('admin', assetId)).status, 404);
await checkAsset();

const history = good(await data('admin', null, '?view=history&asset=' + encodeURIComponent(assetId)));
const imageEvents = history.events.filter(event => ['เพิ่มรูปครุภัณฑ์', 'เปลี่ยนรูปครุภัณฑ์', 'ลบรูปครุภัณฑ์'].includes(event.action));
assert.equal(imageEvents.length, 6, 'Only six successful image mutations should be audited');
for (const action of ['เพิ่มรูปครุภัณฑ์', 'เปลี่ยนรูปครุภัณฑ์', 'ลบรูปครุภัณฑ์']) {
  assert.equal(imageEvents.filter(event => event.action === action).length, 2);
}
assertMetadataOnly(history);
console.log('PASS images: both editor roles remove images, registry/audit metadata only, asset version and financial values unchanged');
