// Verification script for lot splitting within request action
const baseUrl = 'http://localhost:3000';

async function main() {
  console.log('1. Logging in as staff...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'staff@ksu.ac.th', password: 'StaffPassword2026!' })
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const cookie = loginRes.headers.get('set-cookie');
  console.log('   Logged in successfully. Session cookie acquired.');

  console.log('2. Fetching current workspace assets...');
  const dataRes = await fetch(`${baseUrl}/api/data`, {
    headers: { cookie: cookie || '' }
  });
  if (!dataRes.ok) {
    throw new Error(`Failed to fetch workspace: ${dataRes.status}`);
  }
  const data = await dataRes.json();
  const parentAsset = data.assets.find(a => a.lifecycle === 'active' && a.quantity === 200);

  if (!parentAsset) {
    console.log('   No 200-unit active asset found. Existing active assets:');
    for (const a of data.assets.filter(a => a.lifecycle === 'active')) {
      console.log(`   - ${a.code}: ${a.name} (qty: ${a.quantity})`);
    }
    throw new Error('Target 200-unit asset not found for test');
  }

  console.log(`   Found target asset: ${parentAsset.code} - ${parentAsset.name} (qty: ${parentAsset.quantity}, total: ${parentAsset.totalSatang / 100} THB, version: ${parentAsset.version})`);

  console.log('3. Submitting request with partial lot split (50 units for repair)...');
  const reqRes = await fetch(`${baseUrl}/api/data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookie || ''
    },
    body: JSON.stringify({
      action: 'request',
      id: parentAsset.id,
      version: parentAsset.version,
      kind: 'repair',
      splitQuantity: 50,
      reason: 'เบาะขาด 50 ตัว ต้องการส่งซ่อมบำรุงเร่งด่วน'
    })
  });

  const reqResult = await reqRes.json();
  if (!reqRes.ok || !reqResult.ok) {
    throw new Error(`Request submission failed: ${JSON.stringify(reqResult)}`);
  }
  console.log('   Request submitted successfully:', reqResult);

  console.log('4. Verifying database state (rule: NO split at request time, split happens at final approval)...');
  const afterRes = await fetch(`${baseUrl}/api/data`, {
    headers: { cookie: cookie || '' }
  });
  const afterData = await afterRes.json();

  const oldParent = afterData.assets.find(a => a.id === parentAsset.id);
  console.log(`   Parent asset status: lifecycle=${oldParent.lifecycle}, quantity=${oldParent.quantity}, version=${oldParent.version}`);
  if (oldParent.lifecycle !== 'active' || oldParent.quantity !== parentAsset.quantity) {
    throw new Error(`Expected parent to stay active with ${parentAsset.quantity} units, got lifecycle='${oldParent.lifecycle}' quantity=${oldParent.quantity}`);
  }
  if (afterData.assets.some(a => a.parentId === parentAsset.id)) {
    throw new Error('No child lots should exist before final approval');
  }

  const pendingReq = afterData.requests.find(r => r.id === reqResult.id);
  if (!pendingReq) {
    throw new Error('Pending request not found');
  }
  const reqPayload = JSON.parse(pendingReq.payload || '{}');
  if (pendingReq.assetId !== parentAsset.id || reqPayload.splitQuantity !== 50) {
    throw new Error(`Request should reference the original asset with splitQuantity=50, got assetId=${pendingReq.assetId} payload=${pendingReq.payload}`);
  }
  console.log(`   Pending request: id=${pendingReq.id}, kind=${pendingReq.kind}, status=${pendingReq.status}, splitQuantity=${reqPayload.splitQuantity}`);

  const auditEvents = afterData.events.slice(0, 3);
  console.log('   Recent Audit events:');
  for (const ev of auditEvents) {
    console.log(`   - [${ev.action}] by ${ev.actorName}: ${ev.reason}`);
  }

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED PERFECTLY!');
}

main().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
