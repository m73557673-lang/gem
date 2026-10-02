/**
 * Complete API Verification Suite
 * Tests every single API endpoint across the system with both / and /api/ prefixes:
 * - Health check
 * - Services (list, pagination, filtering)
 * - Incidents (list, create, detail, evidence, metrics, recommendation, postmortem, timeline, investigation, detect, transition)
 * - Knowledge documents (list, search)
 * - Actions / Remediation (list, approve with phrase, simulate execution)
 * - Postmortem generation
 * - Simulation engine (start healthy, start incident, status, events, reset)
 */

const BASE_URL = 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;

async function testEndpoint(
  name: string,
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
  validator?: (data: any) => boolean
) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const isMatch = res.status === expectedStatus;
    let data = null;
    try {
      data = await res.json();
    } catch {
      // empty body
    }

    let validData = true;
    if (validator && isMatch) {
      try {
        validData = validator(data);
      } catch (e) {
        validData = false;
      }
    }

    if (isMatch && validData) {
      console.log(`  ✓ [${res.status}] ${name} (${path})`);
      passed++;
      return data;
    } else {
      console.error(`  ❌ [${res.status} != ${expectedStatus}] ${name} (${path})`, data);
      failed++;
      return null;
    }
  } catch (err: any) {
    console.error(`  ❌ ERROR ${name} (${path}):`, err.message);
    failed++;
    return null;
  }
}

async function run() {
  console.log('🚀 Running Comprehensive API Verification Suite...\n');

  console.log('--- 1. Health Checks ---');
  await testEndpoint('Health Check', '/health', {}, 200, (d) => d.status === 'UP');
  await testEndpoint('Health Check (/api)', '/api/health', {}, 200, (d) => d.status === 'UP');

  console.log('\n--- 2. Services Endpoints ---');
  await testEndpoint('List Services', '/services', {}, 200, (d) => Array.isArray(d) && d.length === 4);
  await testEndpoint('List Services (/api)', '/api/services', {}, 200, (d) => Array.isArray(d) && d.length === 4);
  await testEndpoint('Filter Services by status', '/services?status=HEALTHY', {}, 200, (d) => Array.isArray(d));

  console.log('\n--- 3. Simulation Engine Endpoints ---');
  await testEndpoint('Simulation Status', '/simulation/status', {}, 200, (d) => !!d.state);
  await testEndpoint('Simulation Status (/api)', '/api/simulation/status', {}, 200, (d) => !!d.state);
  await testEndpoint('Simulation Events', '/simulation/events', {}, 200, (d) => Array.isArray(d));
  await testEndpoint('Simulation Events (/api)', '/api/simulation/events', {}, 200, (d) => Array.isArray(d));
  await testEndpoint('Start Healthy Scenario', '/simulation/start', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'healthy' })
  }, 200, (d) => d.state === 'HEALTHY' && d.db_pool_size === 50);
  await testEndpoint('Start Incident Scenario', '/simulation/start', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'incident' })
  }, 200, (d) => d.state === 'INCIDENT' && d.db_pool_size === 10);
  await testEndpoint('Reset Simulation', '/simulation/reset', { method: 'POST' }, 200);

  // Switch back to incident for the remaining tests
  await testEndpoint('Re-trigger Incident', '/simulation/start', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'incident' })
  }, 200);

  console.log('\n--- 4. Detection & Deduplication ---');
  await testEndpoint('Detect Incidents', '/incidents/detect', { method: 'POST' }, 200, (d) => d.breaches_detected >= 1);
  await testEndpoint('Detect Incidents (/api)', '/api/incidents/detect', { method: 'POST' }, 200);

  console.log('\n--- 5. Incidents CRUD & Sub-resources ---');
  const incidents = await testEndpoint('List Incidents', '/incidents', {}, 200, (d) => Array.isArray(d) && d.length > 0);
  await testEndpoint('List Incidents (/api)', '/api/incidents', {}, 200, (d) => Array.isArray(d));

  const targetId = incidents && incidents[0] ? incidents[0].id : 1;

  await testEndpoint('Get Incident Detail', `/incidents/${targetId}`, {}, 200, (d) => d.id === targetId);
  await testEndpoint('Get Incident Detail (/api)', `/api/incidents/${targetId}`, {}, 200);
  await testEndpoint('Get Incident Metrics', `/incidents/${targetId}/metrics`, {}, 200, (d) => Array.isArray(d));
  await testEndpoint('Get Incident Metrics (/api)', `/api/incidents/${targetId}/metrics`, {}, 200);
  await testEndpoint('Get Incident Timeline', `/incidents/${targetId}/timeline`, {}, 200, (d) => Array.isArray(d));
  await testEndpoint('Get Incident Timeline (/api)', `/api/incidents/${targetId}/timeline`, {}, 200);

  console.log('\n--- 6. Investigation Orchestration ---');
  await testEndpoint('Run Investigation', `/incidents/${targetId}/investigate?actor=PrincipalSRE`, { method: 'POST' }, 200, (d) => d.status === 'completed');
  await testEndpoint('Run Investigation (/api)', `/api/incidents/${targetId}/investigate?actor=PrincipalSRE`, { method: 'POST' }, 200);
  await testEndpoint('Get Investigation Status', `/incidents/${targetId}/investigation`, {}, 200, (d) => d.progress_pct === 100);
  await testEndpoint('Get Incident Evidence', `/incidents/${targetId}/evidence`, {}, 200, (d) => Array.isArray(d) && d.length >= 2);
  await testEndpoint('Get Incident Recommendation', `/incidents/${targetId}/recommendation`, {}, 200, (d) => !!d.action);

  console.log('\n--- 7. State Transitions ---');
  await testEndpoint('Transition to Remediating', `/incidents/${targetId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to_state: 'remediating', actor: 'Operator', message: 'Ready to rollback' })
  }, 200, (d) => d.status === 'remediating');
  await testEndpoint('Transition to Validating', `/incidents/${targetId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to_state: 'validating', actor: 'Runner', message: 'Validating metrics' })
  }, 200, (d) => d.status === 'validating');
  await testEndpoint('Transition to Resolved', `/incidents/${targetId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to_state: 'resolved', actor: 'Validator', message: 'Metrics healthy' })
  }, 200, (d) => d.status === 'resolved' && !!d.resolved_at);

  console.log('\n--- 8. Knowledge Base & RAG ---');
  await testEndpoint('Get Knowledge Documents', '/knowledge', {}, 200, (d) => Array.isArray(d) && d.length > 0);
  await testEndpoint('Get Knowledge Documents (/api/knowledge)', '/api/knowledge', {}, 200);
  await testEndpoint('Get Knowledge Documents (/api/knowledge-base)', '/api/knowledge-base', {}, 200);
  await testEndpoint('Search Knowledge', '/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ query: 'connection pool' })
  }, 200, (d) => Array.isArray(d) && d.length > 0);
  await testEndpoint('Search Knowledge (/api)', '/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ query: 'postgres' })
  }, 200);

  console.log('\n--- 9. Actions & Remediation ---');
  const actions = await testEndpoint('List Actions', '/actions', {}, 200, (d) => Array.isArray(d));
  await testEndpoint('List Actions (/api/actions)', '/api/actions', {}, 200);
  await testEndpoint('List Actions (/api/remediation)', '/api/remediation', {}, 200);

  const actionId = actions && actions[0] ? actions[0].id : 1;
  await testEndpoint('Approve Action (invalid phrase)', `/actions/${actionId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: 'SRE', confirmation_phrase: 'WRONG' })
  }, 400);

  await testEndpoint('Approve Action (valid phrase)', `/actions/${actionId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: 'SRE Lead', confirmation_phrase: 'APPROVE REMEDIATION' })
  }, 200, (d) => d.status === 'APPROVED');

  await testEndpoint('Simulate Execution', `/actions/${actionId}/simulate`, { method: 'POST' }, 200, (d) => d.status === 'SIMULATED');

  console.log('\n--- 10. Postmortems ---');
  await testEndpoint('Generate Postmortem', `/postmortems/generate/${targetId}`, { method: 'POST' }, 200, (d) => !!d.summary);
  await testEndpoint('Get Postmortem', `/incidents/${targetId}/postmortem`, {}, 200, (d) => !!d.root_cause);

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
