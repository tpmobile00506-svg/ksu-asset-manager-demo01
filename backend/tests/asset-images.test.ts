import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { ApiError } from '../services/errors';
import { ASSET_IMAGE_MAX_BYTES, normalizeAssetImage } from '../services/asset-images';

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#397b9d' } });
const hasStatus = (status: number) => (error: unknown) => error instanceof ApiError && error.status === status;

test('asset photos decode JPEG/PNG/WebP into WebP and limit the longest edge', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const input = await solid(2000, 1000)[format]().toBuffer();
    const result = await normalizeAssetImage(input);
    const output = await sharp(result.body).metadata();
    assert.equal(output.format, 'webp');
    assert.equal(result.width, 1600);
    assert.equal(result.height, 800);
    assert.equal(output.width, 1600);
    assert.equal(output.height, 800);
  }
});

test('asset photos orient JPEG pixels and remove metadata without enlarging small images', async () => {
  const input = await solid(80, 40).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.equal((await sharp(input).metadata()).orientation, 6);
  const result = await normalizeAssetImage(input);
  const output = await sharp(result.body).metadata();
  assert.equal(output.width, 40);
  assert.equal(output.height, 80);
  assert.equal(output.orientation, undefined);
  assert.equal(output.exif, undefined);
  assert.equal(output.icc, undefined);
});

test('asset photos reject empty, oversized, corrupt, and disguised SVG bytes', async () => {
  await assert.rejects(normalizeAssetImage(Buffer.alloc(0)), hasStatus(400));
  await assert.rejects(normalizeAssetImage(Buffer.alloc(ASSET_IMAGE_MAX_BYTES + 1)), hasStatus(413));
  await assert.rejects(normalizeAssetImage(Buffer.from('this is not a PNG')), hasStatus(400));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  await assert.rejects(normalizeAssetImage(svg), hasStatus(415));
  const jpeg = await solid(100, 100).jpeg().toBuffer();
  await assert.rejects(normalizeAssetImage(jpeg.subarray(0, Math.floor(jpeg.length / 2))), hasStatus(400));
});

test('asset photos reject decompressed images larger than 25 megapixels', async () => {
  const input = await solid(5001, 5000).png().toBuffer();
  assert.ok(input.length < ASSET_IMAGE_MAX_BYTES);
  await assert.rejects(normalizeAssetImage(input), hasStatus(400));
});

test('asset photos reject animated WebP', async () => {
  const pixels = Buffer.concat([Buffer.alloc(12 * 12 * 3, 0), Buffer.alloc(12 * 12 * 3, 255)]);
  const input = await sharp(pixels, { raw: { width: 12, height: 24, channels: 3, pageHeight: 12 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(input).metadata()).pages, 2);
  await assert.rejects(normalizeAssetImage(input), hasStatus(415));
});
