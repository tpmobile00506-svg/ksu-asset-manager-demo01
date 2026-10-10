import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./run-integration.mjs', import.meta.url));

function rejectedRun(args: string[], variables: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'asset-runner-guard-'));
  try {
    const env = { ...process.env, ASSET_TEST_DATABASE_URL: '', ASSET_TEST_PORT: '', ...variables };
    const result = spawnSync(process.execPath, [runner, ...args], { cwd: directory, env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readdirSync(directory), [], 'Rejected run must not write credentials or other files');
    return result.stderr;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('retained preview is rejected before reading database configuration or creating files', () => {
  const error = rejectedRun(['--keep'], {});
  assert.match(error, /--keep is no longer supported/);
  assert.match(error, /http:\/\/localhost:3000/);
  assert.doesNotMatch(error, /Set ASSET_TEST_DATABASE_URL/);
});

test('integration runner refuses the application port before connecting to PostgreSQL', () => {
  const error = rejectedRun([], { ASSET_TEST_DATABASE_URL: 'postgresql://guard@127.0.0.1:1/postgres', ASSET_TEST_PORT: '3000' });
  assert.match(error, /Port 3000 is reserved for the application/);
  assert.doesNotMatch(error, /ECONNREFUSED/);
});

test('direct destructive workflow invocation refuses localhost:3000 before login', () => {
  const workflow = fileURLToPath(new URL('./critical-workflows.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-strip-types', workflow], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, ASSET_TEST_URL: 'http://localhost:3000', TEST_ADMIN_EMAIL: 'admin@example.test', TEST_ADMIN_PASSWORD: 'guard-only-not-a-real-password' },
    encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /destructive workflow tests cannot target it/);
  assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED/);
});
