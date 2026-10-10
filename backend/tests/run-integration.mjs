import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

// This runner is temporary automation, never a second application for users.
assert.ok(!process.argv.includes('--keep'), '--keep is no longer supported. Use http://localhost:3000 for the application; integration tests always clean up their temporary server and database.');
assert.equal(process.argv.length, 2, 'Integration tests do not accept command-line options');
// Never load .env: only an explicitly selected loopback PostgreSQL server is accepted.
assert.ok(process.env.ASSET_TEST_DATABASE_URL, 'Set ASSET_TEST_DATABASE_URL to a dedicated loopback PostgreSQL test server');
const server = new URL(process.env.ASSET_TEST_DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(server.hostname), 'Tests require a loopback PostgreSQL server');
assert.ok(['postgres:', 'postgresql:'].includes(server.protocol));
const requestedPort = Number(process.env.ASSET_TEST_PORT || 0);
assert.ok(Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535, 'ASSET_TEST_PORT must be a valid port');
assert.notEqual(requestedPort, 3000, 'Port 3000 is reserved for the application. Integration tests require a temporary port.');
const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(requestedPort, '127.0.0.1', resolve); });
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const database = 'asset_test_' + Date.now() + '_' + randomUUID().slice(0, 8);
server.pathname = '/postgres';
const admin = new pg.Client({ connectionString: server.href, connectionTimeoutMillis: 10000 });
server.pathname = '/' + database;
const password = 'Test-' + randomUUID();
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATABASE_URL: server.href, FRONTEND_ORIGIN: origin, SESSION_COOKIE_SECURE: 'false',
  ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: password, ADMIN_NAME: 'ผู้ดูแลทดสอบ',
  ASSET_TEST_URL: origin, TEST_ADMIN_EMAIL: 'admin@example.test', TEST_ADMIN_PASSWORD: password };
let app;
let command;
let created = false;
let interrupted;
function checkInterrupted() {
  if (interrupted) throw interrupted;
}
function interrupt(signal) {
  interrupted ??= new Error('Integration tests interrupted by ' + signal);
  command?.kill();
  app?.kill();
}
const onSigint = () => interrupt('SIGINT');
const onSigterm = () => interrupt('SIGTERM');
process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);

async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(force); clearTimeout(deadline); resolve(); };
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    const deadline = setTimeout(() => reject(new Error('Temporary test process did not stop')), 10000);
    child.once('exit', finish);
    child.once('error', finish);
    child.kill();
  });
}

async function run(args) {
  checkInterrupted();
  const child = command = spawn(process.execPath, args, { env, windowsHide: true, stdio: 'inherit' });
  let timeout;
  try {
    const status = await new Promise((resolve, reject) => {
      timeout = setTimeout(() => { child.kill(); reject(new Error('Timed out: ' + args.join(' '))); }, 180000);
      child.once('error', reject);
      child.once('exit', resolve);
    });
    checkInterrupted();
    assert.equal(status, 0, 'Failed: ' + args.join(' '));
  } finally {
    clearTimeout(timeout);
    await stopChild(child);
    command = undefined;
  }
}

try {
  await admin.connect();
  checkInterrupted();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  checkInterrupted();
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run(['--import', 'tsx', 'backend/prisma/seed.ts']);
  await run(['--import', 'tsx', 'backend/scripts/seed-source.ts']);
  checkInterrupted();
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'frontend', '--hostname', '127.0.0.1', '--port', String(port)],
    { env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
  let appError;
  app.once('error', error => { appError = error; });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    checkInterrupted();
    if (appError) throw appError;
    if (app.exitCode !== null || app.signalCode !== null) throw new Error('Test server stopped before readiness');
    try { ready = (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Starting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Test server failed readiness; see the server output above');
  await run(['--experimental-strip-types', 'backend/tests/critical-workflows.mjs']);
  await run(['backend/tests/asset-images.integration.mjs']);
} finally {
  try {
    await stopChild(app);
  } finally {
    try {
      if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      try {
        await admin.end();
      } finally {
        process.off('SIGINT', onSigint);
        process.off('SIGTERM', onSigterm);
      }
    }
  }
}
