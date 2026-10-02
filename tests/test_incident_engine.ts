/**
 * Automated Test Suite for Incident Engine & Workflow
 * Tests:
 * 1. Threshold breaches & severity assignment
 * 2. Deduplication of active incidents
 * 3. Lifecycle state transitions & chronological audit timeline
 * 4. Investigation orchestration workflow (deterministic)
 * 5. API failures & validation error handling
 */

const BASE_URL = 'http://127.0.0.1:3000';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('🧪 Starting Incident Engine & Investigation Test Suite...\n');

  // Reset to clean state first
  console.log('--- Test 1: Reset & Seed Initial Baseline ---');
  const resetRes = await request('/simulation/reset', { method: 'POST' });
  assert(resetRes.status === 200, 'POST /simulation/reset succeeds');

  // Trigger incident drill to induce threshold breaches
  const drillRes = await request('/simulation/start', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'incident' }),
  });
  assert(drillRes.status === 200, 'POST /simulation/start (incident) succeeds');
  assert(drillRes.data.state === 'INCIDENT', 'Simulation state is INCIDENT');
  assert(drillRes.data.db_pool_size === 10, 'DB_POOL_SIZE is 10');
  assert(drillRes.data.traffic_rps === 850, 'Traffic volume is 850 RPS');

  console.log('\n--- Test 2: Threshold Breach Detection & Severity Assignment ---');
  const detectRes = await request('/incidents/detect', { method: 'POST' });
  assert(detectRes.status === 200, 'POST /incidents/detect succeeds');
  assert(detectRes.data.breaches_detected >= 1, 'At least 1 threshold breach detected');
  assert(
    detectRes.data.details.some((b: any) => b.severity === 'CRITICAL'),
    'Assigned CRITICAL severity for pool/latency breach'
  );

  console.log('\n--- Test 3: Deduplication for Active Incidents ---');
  const detectRes2 = await request('/incidents/detect', { method: 'POST' });
  assert(detectRes2.status === 200, 'Second POST /incidents/detect succeeds');
  assert(detectRes2.data.incidents_created === 0, 'No duplicate incidents created');
  assert(detectRes2.data.deduplicated >= 1, 'Active incident was deduplicated');

  console.log('\n--- Test 4: Chronological Audit Timeline Logging ---');
  const incidentsRes = await request('/incidents');
  const activeInc = incidentsRes.data.find((i: any) => i.status !== 'resolved');
  assert(!!activeInc, 'Active incident exists in queue');

  const timelineRes = await request(`/incidents/${activeInc.id}/timeline`);
  assert(timelineRes.status === 200, 'GET /incidents/{id}/timeline succeeds');
  assert(Array.isArray(timelineRes.data), 'Timeline returns array of events');
  assert(timelineRes.data.length >= 1, 'Audit timeline contains initial detection record');
  assert(timelineRes.data[0].to_state === 'detected', 'Initial recorded state is detected');

  console.log('\n--- Test 5: Deterministic Investigation Orchestration ---');
  const invRes = await request(`/incidents/${activeInc.id}/investigate?actor=SRE_Test_Lead`, {
    method: 'POST',
  });
  assert(invRes.status === 200, 'POST /incidents/{id}/investigate succeeds');
  assert(invRes.data.status === 'completed', 'Investigation completed successfully');
  assert(invRes.data.progress_pct === 100, 'Investigation progress is 100%');
  assert(
    invRes.data.incident_state === 'awaiting_approval',
    'Incident transitioned to awaiting_approval'
  );
  assert(
    invRes.data.findings.culprit_deployment.includes('v2.4.1'),
    'Correlated faulty deployment v2.4.1-rc1'
  );

  // Verify Correlated Evidence
  const evRes = await request(`/incidents/${activeInc.id}/evidence`);
  assert(evRes.status === 200, 'GET /incidents/{id}/evidence succeeds');
  assert(evRes.data.length >= 2, 'Correlated at least 2 evidence records');

  // Verify Formulated Recommendation
  const recRes = await request(`/incidents/${activeInc.id}/recommendation`);
  assert(recRes.status === 200, 'GET /incidents/{id}/recommendation succeeds');
  assert(recRes.data.action.includes('DB_POOL_SIZE'), 'Recommendation includes DB_POOL_SIZE rollback');

  console.log('\n--- Test 6: Lifecycle State Transitions ---');
  // Transition to remediating
  const trans1 = await request(`/incidents/${activeInc.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      to_state: 'remediating',
      actor: 'SRE_Lead',
      message: 'Operator confirmed approval',
    }),
  });
  assert(trans1.status === 200, 'Transition to remediating succeeds');
  assert(trans1.data.status === 'remediating', 'Incident state is remediating');

  // Transition to validating
  const trans2 = await request(`/incidents/${activeInc.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      to_state: 'validating',
      actor: 'CanaryRunner',
      message: 'Probing telemetry recovery',
    }),
  });
  assert(trans2.status === 200, 'Transition to validating succeeds');
  assert(trans2.data.status === 'validating', 'Incident state is validating');

  // Transition to resolved
  const trans3 = await request(`/incidents/${activeInc.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      to_state: 'resolved',
      actor: 'AutomatedValidator',
      message: 'Telemetry stable for 5 minutes',
    }),
  });
  assert(trans3.status === 200, 'Transition to resolved succeeds');
  assert(trans3.data.status === 'resolved', 'Incident state is resolved');
  assert(trans3.data.resolved_at !== null, 'resolved_at timestamp populated');

  // Check full audit timeline
  const finalTimeline = await request(`/incidents/${activeInc.id}/timeline`);
  assert(
    finalTimeline.data.length >= 5,
    `Audit timeline captured all transitions (count: ${finalTimeline.data.length})`
  );

  console.log('\n--- Test 7: API Failures & Error Handling ---');
  // 1. Non-existent incident investigation -> 404
  const notFoundInv = await request('/incidents/99999/investigate', { method: 'POST' });
  assert(notFoundInv.status === 404, 'POST /incidents/99999/investigate returns 404 Not Found');

  // 2. Invalid state transition -> 400
  const invalidTrans = await request(`/incidents/${activeInc.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to_state: 'invalid_bogus_state' }),
  });
  assert(invalidTrans.status === 400, 'Transition with invalid state returns 400 Bad Request');

  // 3. Create incident with empty title -> 422
  const invalidCreate = await request('/incidents', {
    method: 'POST',
    body: JSON.stringify({ title: '', service_id: 1 }),
  });
  assert(invalidCreate.status === 422, 'POST /incidents with empty title returns 422');

  console.log('\n🎉 ALL 7 TEST SUITES PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
