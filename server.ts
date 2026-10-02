import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BM25Retriever, chunkDocument, getSeedKnowledgeDocuments } from './src/rag_engine';
import { KnowledgeDocument, DocumentChunk, IndexingStatus } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Structured logging helper
function logEvent(action: string, details: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [INFO] [IncidentCommander] ${action}: ${details}`);
}

// ---------------- DATABASE MODELS & IN-MEMORY STORE ----------------
interface Service {
  id: number;
  name: string;
  environment: string;
  owner: string;
  status: string; // HEALTHY, DEGRADED, OUTAGE
}

// 7 Incident States: detected, investigating, awaiting_approval, remediating, validating, resolved, failed
interface Incident {
  id: number;
  title: string;
  severity: string; // CRITICAL, HIGH, MEDIUM, LOW
  status: string;
  service_id: number;
  created_at: string;
  resolved_at: string | null;
}

interface IncidentTimeline {
  id: number;
  incident_id: number;
  from_state: string | null;
  to_state: string;
  actor: string;
  message: string;
  timestamp: string;
}

interface LogEvent {
  id: number;
  service_id: number;
  timestamp: string;
  level: string; // INFO, WARN, ERROR, FATAL
  message: string;
}

interface Deployment {
  id: number;
  service_id: number;
  version: string;
  changes: string;
  timestamp: string;
}

interface Metric {
  id: number;
  service_id: number;
  timestamp: string;
  metric_name: string;
  value: number;
}

interface Evidence {
  id: number;
  incident_id: number;
  source_type: string;
  source_id: number | null;
  relevance: number;
}

interface Recommendation {
  id: number;
  incident_id: number;
  action: string;
  risk: string;
  confidence: number;
}

interface Action {
  id: number;
  incident_id: number;
  approved_by: string | null;
  status: string; // PENDING, APPROVED, REJECTED, SIMULATED
  result: string | null;
}

interface Postmortem {
  id: number;
  incident_id: number;
  summary: string;
  root_cause: string;
  prevention: string;
}

interface DatabaseStore {
  services: Service[];
  incidents: Incident[];
  timelines: IncidentTimeline[];
  log_events: LogEvent[];
  deployments: Deployment[];
  metrics: Metric[];
  knowledge_documents: KnowledgeDocument[];
  evidences: Evidence[];
  recommendations: Recommendation[];
  actions: Action[];
  postmortems: Postmortem[];
}

function getInitialDatabase(): DatabaseStore {
  const now = new Date();
  const subMinutes = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();
  const subHours = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  // 1. Synthetic E-Commerce Checkout Services
  const services: Service[] = [
    {
      id: 1,
      name: "API Gateway",
      environment: "production-synthetic",
      owner: "Edge Networking Team",
      status: "DEGRADED"
    },
    {
      id: 2,
      name: "Checkout Service",
      environment: "production-synthetic",
      owner: "Checkout Chapter",
      status: "OUTAGE"
    },
    {
      id: 3,
      name: "Order Service",
      environment: "production-synthetic",
      owner: "Orders Platform Team",
      status: "DEGRADED"
    },
    {
      id: 4,
      name: "Database Service",
      environment: "production-synthetic",
      owner: "Data SRE Infrastructure",
      status: "DEGRADED"
    }
  ];

  // 2. Initial Incident in 'detected' state
  const incidents: Incident[] = [
    {
      id: 1,
      title: "[SYNTHETIC] Database Connection Pool Exhaustion on Checkout Service",
      severity: "CRITICAL",
      status: "detected",
      service_id: 2,
      created_at: subMinutes(14),
      resolved_at: null
    }
  ];

  // Timelines
  const timelines: IncidentTimeline[] = [
    {
      id: 1,
      incident_id: 1,
      from_state: null,
      to_state: "detected",
      actor: "DetectionEngine",
      message: "Threshold breach detected: p95 latency > 3400ms (threshold >= 2000ms) and DB pool saturation at 100%.",
      timestamp: subMinutes(14)
    }
  ];

  // 3. Application Logs
  const log_events: LogEvent[] = [
    {
      id: 101,
      service_id: 2,
      timestamp: subMinutes(16),
      level: "INFO",
      message: "Deployment v2.4.1-rc1 applied. Setting DB_POOL_SIZE=10. Reinitializing HikariCP DataSource."
    },
    {
      id: 102,
      service_id: 1,
      timestamp: subMinutes(14),
      level: "INFO",
      message: "Traffic surge detected on POST /v1/checkout/pay: ingress throughput climbed from 250 RPS to 850 RPS"
    },
    {
      id: 103,
      service_id: 2,
      timestamp: subMinutes(13),
      level: "WARN",
      message: "HikariPool-1 - Connection pool acquisition wait time exceeded 1500ms; active connections: 10/10 (100% capacity)"
    },
    {
      id: 104,
      service_id: 2,
      timestamp: subMinutes(12),
      level: "ERROR",
      message: "PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections (max_connections=10)"
    },
    {
      id: 105,
      service_id: 2,
      timestamp: subMinutes(10),
      level: "ERROR",
      message: "HikariPool-1 - Connection is not available, request timed out after 3000ms"
    },
    {
      id: 106,
      service_id: 1,
      timestamp: subMinutes(8),
      level: "ERROR",
      message: "HTTP 504 Gateway Timeout: upstream Checkout Service failed to complete within 3000ms deadline (error rate 18.5%)"
    }
  ];

  // 4. Deployments
  const deployments: Deployment[] = [
    {
      id: 1,
      service_id: 2,
      version: "v2.4.0",
      changes: "commit 3b1e94a: feat: stable checkout baseline (DB_POOL_SIZE=50)",
      timestamp: subHours(2)
    },
    {
      id: 2,
      service_id: 2,
      version: "v2.4.1-rc1",
      changes: "commit 8f31c2a: perf(db): tune DB_POOL_SIZE from 50 to 10 to reduce idle memory",
      timestamp: subMinutes(16)
    }
  ];

  // 5. Deterministic Metrics
  const metrics: Metric[] = [];
  let mId = 1;
  for (let i = 15; i >= 0; i--) {
    const ts = subMinutes(i * 2);
    const isIncident = (i <= 7);
    const isTrans = (i === 8);

    const lat = isIncident ? 3450.0 + (i % 4) * 85 : (isTrans ? 950.0 : 45.0 + (i % 3) * 1.5);
    const err = isIncident ? 18.5 + (i % 3) * 1.2 : (isTrans ? 4.2 : 0.02);
    const pool = isIncident ? 100.0 : (isTrans ? 90.0 : 36.0);
    const vol = isIncident ? 850.0 + (i % 5) * 12 : (isTrans ? 620.0 : 250.0 + (i % 4) * 5);

    metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "latency_p95", value: lat + 20 });
    metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "error_rate", value: err });
    metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "request_volume", value: vol });

    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "latency_p95", value: lat });
    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "error_rate", value: err });
    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "pool_utilization", value: pool });
    metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "request_volume", value: vol });

    metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "pool_utilization", value: pool });
    metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "latency_p95", value: isIncident ? 1800.0 : 12.0 });
  }

// 5. Knowledge Documents Seed
  const knowledge_documents = getSeedKnowledgeDocuments();

  // 7. Evidence
  const evidences: Evidence[] = [
    { id: 1, incident_id: 1, source_type: "DEPLOYMENT", source_id: 2, relevance: 0.98 },
    { id: 2, incident_id: 1, source_type: "LOG", source_id: 104, relevance: 0.96 },
    { id: 3, incident_id: 1, source_type: "METRIC", source_id: null, relevance: 0.94 },
    { id: 4, incident_id: 1, source_type: "ALERT", source_id: null, relevance: 0.99 }
  ];

  // 8. Recommendation
  const recommendations: Recommendation[] = [
    {
      id: 1,
      incident_id: 1,
      action: "Rollback deployment v2.4.1-rc1 to v2.4.0. Reconfigure Checkout Service DB_POOL_SIZE from 10 back to 50, and restart pod replicas to drain hung connection queues.",
      risk: "LOW",
      confidence: 0.97
    }
  ];

  // 9. Action
  const actions: Action[] = [
    {
      id: 1,
      incident_id: 1,
      approved_by: null,
      status: "PENDING",
      result: "Awaiting SRE operator authorization. Rollback to DB_POOL_SIZE=50 prepared."
    }
  ];

  // 10. Postmortem
  const postmortems: Postmortem[] = [
    {
      id: 1,
      incident_id: 1,
      summary: "Database connection pool starvation on Checkout Service caused cascaded HTTP 504 timeouts across checkout endpoints.",
      root_cause: "Deployment v2.4.1-rc1 changed DB_POOL_SIZE from 50 to 10 right before an organic traffic surge from 250 RPS to 850 RPS, saturating 100% of available database connections.",
      prevention: "1. Mandate automated canary load-testing before scaling down database connection pool sizes.\n2. Add Prometheus alert firing when pool saturation exceeds 80%."
    }
  ];

  return {
    services,
    incidents,
    timelines,
    log_events,
    deployments,
    metrics,
    knowledge_documents,
    evidences,
    recommendations,
    actions,
    postmortems
  };
}

let db = getInitialDatabase();

const ragRetriever = new BM25Retriever();

function refreshRAGIndex() {
  const allChunks: DocumentChunk[] = [];
  for (const doc of db.knowledge_documents) {
    const chunks = chunkDocument(doc);
    doc.chunks = chunks;
    doc.chunks_count = chunks.length;
    doc.word_count = doc.content.split(/\s+/).length;
    doc.indexed_at = new Date().toISOString();
    allChunks.push(...chunks);
  }
  ragRetriever.indexChunks(allChunks);
  logEvent('RAG_INDEX_UPDATED', `Indexed ${allChunks.length} chunks across ${db.knowledge_documents.length} operational documents.`);
}

refreshRAGIndex();

function addTimeline(incidentId: number, toState: string, fromState: string | null, actor: string, message: string) {
  const newTimeline: IncidentTimeline = {
    id: db.timelines.length + 1,
    incident_id: incidentId,
    from_state: fromState,
    to_state: toState,
    actor,
    message,
    timestamp: new Date().toISOString()
  };
  db.timelines.push(newTimeline);
  return newTimeline;
}

// ---------------- REST API & INCIDENT ENDPOINTS ----------------

// GET /health
app.get(['/health', '/api/health'], (req: Request, res: Response) => {
  const activeIncidents = db.incidents.filter(i => i.status !== 'resolved' && i.status !== 'failed').length;
  res.json({
    status: "UP",
    timestamp: new Date().toISOString(),
    database: "healthy (sqlite/in-memory)",
    active_incidents: activeIncidents,
    services_count: db.services.length,
    version: "1.0.0",
    synthetic_mode: true
  });
});

// GET /services
app.get(['/services', '/api/services'], (req: Request, res: Response) => {
  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
  const status = req.query.status as string;

  let result = [...db.services];
  if (status) {
    result = result.filter(s => s.status.toLowerCase() === status.toLowerCase());
  }
  res.json(result.slice(skip, skip + limit));
});

// GET /incidents (with pagination & filters)
app.get(['/incidents', '/api/incidents'], (req: Request, res: Response) => {
  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
  const status = req.query.status as string;
  const severity = req.query.severity as string;
  const service_id = req.query.service_id ? parseInt(req.query.service_id as string, 10) : null;

  let result = [...db.incidents];
  if (status && status.toUpperCase() !== 'ALL') {
    result = result.filter(i => i.status.toLowerCase() === status.toLowerCase());
  }
  if (severity && severity.toUpperCase() !== 'ALL') {
    result = result.filter(i => i.severity.toUpperCase() === severity.toUpperCase());
  }
  if (service_id !== null) {
    result = result.filter(i => i.service_id === service_id);
  }

  const enriched = result.slice(skip, skip + limit).map(inc => {
    const svc = db.services.find(s => s.id === inc.service_id);
    return {
      ...inc,
      service_name: svc ? svc.name : `service-${inc.service_id}`
    };
  });

  res.json(enriched);
});

// POST /incidents
app.post(['/incidents', '/api/incidents'], (req: Request, res: Response) => {
  const { title, severity = 'HIGH', status = 'detected', service_id } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(422).json({ detail: "Field 'title' is required and must not be empty." });
  }

  const sId = parseInt(service_id, 10);
  const service = db.services.find(s => s.id === sId);
  if (!service) {
    return res.status(404).json({ detail: `Service with id ${service_id} not found.` });
  }

  const newId = db.incidents.length > 0 ? Math.max(...db.incidents.map(i => i.id)) + 1 : 1;
  const initialStatus = status.toLowerCase();

  const newIncident: Incident = {
    id: newId,
    title: title.startsWith('[SYNTHETIC]') ? title : `[SYNTHETIC] ${title}`,
    severity: severity.toUpperCase(),
    status: initialStatus,
    service_id: sId,
    created_at: new Date().toISOString(),
    resolved_at: null
  };

  db.incidents.unshift(newIncident);
  addTimeline(newId, initialStatus, null, "Operator", `Incident manually created with severity ${severity}.`);

  if (['CRITICAL', 'HIGH'].includes(newIncident.severity)) {
    service.status = 'DEGRADED';
  }

  logEvent('INCIDENT_CREATED', `Created incident #${newId} on ${service.name}`);
  res.status(201).json({
    ...newIncident,
    service_name: service.name
  });
});

// ---------------- DETECTION & DEDUPLICATION ENDPOINT ----------------
app.post(['/incidents/detect', '/api/incidents/detect'], (req: Request, res: Response) => {
  const created: Incident[] = [];
  let deduplicated = 0;
  const breaches = [];

  // Configurable rules
  const thresholds = {
    error_rate_crit: 5.0,
    error_rate_high: 1.0,
    latency_crit: 2000.0,
    latency_high: 500.0,
    pool_crit: 95.0
  };

  for (const svc of db.services) {
    const recentMetrics = db.metrics.filter(m => m.service_id === svc.id);
    const maxLat = Math.max(...recentMetrics.filter(m => m.metric_name === 'latency_p95').map(m => m.value), 0);
    const maxErr = Math.max(...recentMetrics.filter(m => m.metric_name === 'error_rate').map(m => m.value), 0);
    const maxPool = Math.max(...recentMetrics.filter(m => m.metric_name === 'pool_utilization').map(m => m.value), 0);

    let severity: string | null = null;
    let reason = "";

    if (maxErr >= thresholds.error_rate_crit || maxLat >= thresholds.latency_crit || maxPool >= thresholds.pool_crit) {
      severity = "CRITICAL";
      reason = `Breached critical thresholds: Latency ${maxLat}ms (limit 2000ms), Pool ${maxPool}% (limit 95%)`;
    } else if (maxErr >= thresholds.error_rate_high || maxLat >= thresholds.latency_high) {
      severity = "HIGH";
      reason = `Breached high thresholds: Latency ${maxLat}ms (limit 500ms)`;
    }

    if (severity) {
      breaches.push({ service_id: svc.id, service_name: svc.name, severity, reason });

      // Deduplication check: Avoid duplicate incident for same active event
      const existing = db.incidents.find(i => i.service_id === svc.id && i.status !== 'resolved' && i.status !== 'failed');
      if (existing) {
        deduplicated++;
        addTimeline(existing.id, existing.status, existing.status, "DetectionEngine", `Deduplication: Active incident already tracking this event. Breach reaffirmed: ${reason}`);
      } else {
        const newId = db.incidents.length > 0 ? Math.max(...db.incidents.map(i => i.id)) + 1 : 1;
        const inc: Incident = {
          id: newId,
          title: `[SYNTHETIC] ${severity} Threshold Breach on ${svc.name}`,
          severity,
          status: "detected",
          service_id: svc.id,
          created_at: new Date().toISOString(),
          resolved_at: null
        };
        db.incidents.unshift(inc);
        addTimeline(newId, "detected", null, "DetectionEngine", reason);
        created.push(inc);
        svc.status = severity === "CRITICAL" ? "OUTAGE" : "DEGRADED";
      }
    }
  }

  res.json({
    breaches_detected: breaches.length,
    incidents_created: created.length,
    deduplicated,
    created_incident_ids: created.map(i => i.id),
    details: breaches
  });
});

// ---------------- INVESTIGATION ORCHESTRATION ENDPOINTS ----------------
app.post(['/incidents/:id/investigate', '/api/incidents/:id/investigate'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const actor = (req.query.actor as string) || "Operator";
  const oldState = inc.status;

  // Step 1: Transition to 'investigating'
  inc.status = "investigating";
  addTimeline(id, "investigating", oldState, actor, `Investigation launched by ${actor}. Initializing telemetry window analysis.`);

  // Step 2: Correlate deployments and logs
  const culpritDeploy = db.deployments.find(d => d.version.includes('rc1') || d.changes.includes('from 50 to 10') || d.changes.includes('tune DB_POOL_SIZE'))
    || db.deployments.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const errorLogs = db.log_events.filter(l => l.service_id === inc.service_id && ['ERROR', 'FATAL', 'WARN'].includes(l.level));

  // Step 3: Populate evidence
  db.evidences = db.evidences.filter(e => e.incident_id !== id);
  if (culpritDeploy) {
    db.evidences.push({
      id: db.evidences.length + 1,
      incident_id: id,
      source_type: "DEPLOYMENT",
      source_id: culpritDeploy.id,
      relevance: 0.98
    });
  }
  if (errorLogs.length > 0) {
    db.evidences.push({
      id: db.evidences.length + 1,
      incident_id: id,
      source_type: "LOG",
      source_id: errorLogs[0].id,
      relevance: 0.96
    });
  } else if (db.log_events.length > 0) {
    db.evidences.push({
      id: db.evidences.length + 1,
      incident_id: id,
      source_type: "LOG",
      source_id: db.log_events[0].id,
      relevance: 0.92
    });
  }
  db.evidences.push({
    id: db.evidences.length + 1,
    incident_id: id,
    source_type: "METRIC",
    source_id: null,
    relevance: 0.94
  });
  db.evidences.push({
    id: db.evidences.length + 1,
    incident_id: id,
    source_type: "ALERT",
    source_id: null,
    relevance: 0.99
  });

  // Step 4: Formulate recommendation
  db.recommendations = db.recommendations.filter(r => r.incident_id !== id);
  const actionText = culpritDeploy
    ? `Rollback deployment ${culpritDeploy.version} to v2.4.0. Reconfigure Checkout Service DB_POOL_SIZE from 10 back to 50, and restart pod replicas to drain hung connection queues.`
    : `Scale database connection pool ceiling to 50 and execute rolling restart of Checkout Service pods.`;

  db.recommendations.push({
    id: db.recommendations.length + 1,
    incident_id: id,
    action: actionText,
    risk: "LOW",
    confidence: 0.97
  });

  // Step 5: Create action awaiting approval
  db.actions = db.actions.filter(a => a.incident_id !== id);
  db.actions.push({
    id: db.actions.length + 1,
    incident_id: id,
    approved_by: null,
    status: "PENDING",
    result: "Awaiting SRE operator authorization. Rollback to DB_POOL_SIZE=50 prepared."
  });

  // Step 6: Transition to 'awaiting_approval'
  inc.status = "awaiting_approval";
  addTimeline(id, "awaiting_approval", "investigating", actor, "Investigation completed. Root cause identified: DB_POOL_SIZE reduction under traffic surge. Action awaiting operator approval.");

  logEvent('INVESTIGATION_COMPLETED', `Completed investigation for incident #${id}. State: awaiting_approval.`);

  res.json({
    status: "completed",
    incident_state: inc.status,
    progress_pct: 100,
    current_step: "Awaiting human operator approval",
    steps_log: [
      "Phase 1: Transitioned to 'investigating'",
      "Phase 2: Collected telemetry metrics window (p95 latency spike 3450ms, pool 100%)",
      "Phase 3: Correlated faulty deployment v2.4.1-rc1 (DB_POOL_SIZE=10)",
      "Phase 4: Collected HikariCP connection timeout logs",
      "Phase 5: Generated 3 evidence items and remediation recommendation",
      "Phase 6: Transitioned to 'awaiting_approval'"
    ],
    findings: {
      incident_id: id,
      culprit_deployment: culpritDeploy ? culpritDeploy.version : "v2.4.1-rc1",
      culprit_changes: culpritDeploy ? culpritDeploy.changes : "DB_POOL_SIZE=10",
      recommendation: actionText
    }
  });
});

app.get(['/incidents/:id/investigation', '/api/incidents/:id/investigation'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const rec = db.recommendations.find(r => r.incident_id === id);
  const evCount = db.evidences.filter(e => e.incident_id === id).length;
  const timelines = db.timelines.filter(t => t.incident_id === id);
  const isCompleted = ["awaiting_approval", "remediating", "validating", "resolved"].includes(inc.status);

  res.json({
    incident_id: id,
    status: isCompleted ? "completed" : (inc.status === "investigating" ? "running" : "idle"),
    incident_state: inc.status,
    progress_pct: isCompleted ? 100 : (inc.status === "investigating" ? 50 : 0),
    current_step: isCompleted ? "Awaiting human operator approval" : (
      inc.status === "investigating" ? "Analyzing telemetry and logs" : "Ready to investigate"
    ),
    steps_log: [
      `Current state: ${inc.status}`,
      `Correlated evidence count: ${evCount}`,
      `Recommendation available: ${rec ? 'Yes' : 'No'}`
    ],
    findings: {
      evidence_count: evCount,
      has_recommendation: !!rec,
      recommendation_action: rec ? rec.action : null
    },
    timeline: timelines
  });
});

// ---------------- TIMELINE & STATE TRANSITIONS ----------------
app.get(['/incidents/:id/timeline', '/api/incidents/:id/timeline'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }
  const timeline = db.timelines.filter(t => t.incident_id === id);
  res.json(timeline);
});

app.post(['/incidents/:id/transition', '/api/incidents/:id/transition'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const { to_state, actor = "Operator", message = "Manual state transition" } = req.body;
  const valid = ["detected", "investigating", "awaiting_approval", "remediating", "validating", "resolved", "failed"];
  const cleanTo = to_state.toLowerCase();

  if (!valid.includes(cleanTo)) {
    return res.status(400).json({ detail: `Invalid state '${to_state}'. Must be one of: ${valid.join(', ')}` });
  }

  const old = inc.status;
  inc.status = cleanTo;
  if (cleanTo === "resolved") {
    inc.resolved_at = new Date().toISOString();
  }

  addTimeline(id, cleanTo, old, actor, message);
  logEvent('STATE_TRANSITION', `Incident #${id}: ${old} -> ${cleanTo} by ${actor}`);

  const svc = db.services.find(s => s.id === inc.service_id);
  res.json({
    ...inc,
    service_name: svc ? svc.name : `service-${inc.service_id}`
  });
});

// GET /incidents/{id}
app.get(['/incidents/:id', '/api/incidents/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }
  const svc = db.services.find(s => s.id === inc.service_id);
  res.json({
    ...inc,
    service_name: svc ? svc.name : `service-${inc.service_id}`
  });
});

// GET /incidents/{id}/evidence
app.get(['/incidents/:id/evidence', '/api/incidents/:id/evidence'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);

  const evList = db.evidences
    .filter(e => e.incident_id === id)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(skip, skip + limit)
    .map(ev => {
      let detail: string | null = null;
      if (ev.source_type === 'LOG' && ev.source_id) {
        const log = db.log_events.find(l => l.id === ev.source_id);
        if (log) detail = `[${log.level}] ${log.message}`;
      } else if (ev.source_type === 'DEPLOYMENT' && ev.source_id) {
        const dep = db.deployments.find(d => d.id === ev.source_id);
        if (dep) detail = `Deployment ${dep.version}: ${dep.changes}`;
      } else if (ev.source_type === 'ALERT') {
        const svc = db.services.find(s => s.id === inc.service_id);
        detail = `Prometheus Alert: ${svc ? svc.name : 'Service'} connection pool saturation > 95%`;
      } else if (ev.source_type === 'METRIC') {
        detail = `Metric anomaly: sustained p95 latency spike > 3400ms`;
      }
      return { ...ev, detail };
    });

  res.json(evList);
});

// GET /incidents/{id}/metrics
app.get(['/incidents/:id/metrics', '/api/incidents/:id/metrics'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500);
  const metric_name = req.query.metric_name as string;

  let metricList = db.metrics.filter(m => m.service_id === inc.service_id);
  if (metric_name) {
    metricList = metricList.filter(m => m.metric_name === metric_name);
  }

  metricList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(metricList.slice(skip, skip + limit));
});

// GET /incidents/{id}/recommendation
app.get(['/incidents/:id/recommendation', '/api/incidents/:id/recommendation'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const rec = db.recommendations
    .filter(r => r.incident_id === id)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!rec) {
    return res.status(404).json({ detail: `No recommendation found for incident ${req.params.id}.` });
  }
  res.json(rec);
});

// GET /incidents/{id}/postmortem
app.get(['/incidents/:id/postmortem', '/api/incidents/:id/postmortem'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  const pm = db.postmortems.find(p => p.incident_id === id);
  if (!pm) {
    return res.status(404).json({ detail: `No postmortem found for incident ${req.params.id}.` });
  }
  res.json(pm);
});

// ---------------- RAG & KNOWLEDGE BASE ENDPOINTS ----------------

// GET /knowledge/indexing-status
app.get(['/knowledge/indexing-status', '/api/knowledge/indexing-status'], (req: Request, res: Response) => {
  res.json(ragRetriever.getIndexingStatus());
});

// GET /knowledge (list documents with metadata & chunk counts)
app.get(['/knowledge', '/api/knowledge', '/api/knowledge-base'], (req: Request, res: Response) => {
  const skip = parseInt(req.query.skip as string || '0', 10);
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
  const typeFilter = req.query.type as string;

  let results = [...db.knowledge_documents];
  if (typeFilter && typeFilter.toUpperCase() !== 'ALL') {
    results = results.filter(d => d.type.toUpperCase() === typeFilter.toUpperCase());
  }

  const enriched = results.slice(skip, skip + limit).map(doc => ({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    source: doc.source,
    content: doc.content,
    chunks_count: doc.chunks ? doc.chunks.length : doc.chunks_count || 1,
    word_count: doc.word_count || doc.content.split(/\s+/).length,
    indexed_at: doc.indexed_at || new Date().toISOString()
  }));

  res.json(enriched);
});

// GET /knowledge/:id (document detail with chunks)
app.get(['/knowledge/:id', '/api/knowledge/:id', '/api/knowledge-base/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const doc = db.knowledge_documents.find(d => d.id === id);
  if (!doc) {
    return res.status(404).json({ detail: `Knowledge document with id ${req.params.id} not found.` });
  }

  if (!doc.chunks || doc.chunks.length === 0) {
    doc.chunks = chunkDocument(doc);
  }

  res.json({
    ...doc,
    chunks_count: doc.chunks.length,
    word_count: doc.word_count || doc.content.split(/\s+/).length
  });
});

// POST /knowledge/upload (upload and index operational documents)
app.post(['/knowledge/upload', '/api/knowledge/upload', '/api/knowledge-base/upload'], (req: Request, res: Response) => {
  const { title, type = 'RUNBOOK', content, source = 'manual://upload', filename } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(422).json({ detail: "Field 'title' is required." });
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(422).json({ detail: "Field 'content' is required and must not be empty." });
  }

  const newId = db.knowledge_documents.length > 0
    ? Math.max(...db.knowledge_documents.map(d => d.id)) + 1
    : 1;

  const validTypes = ['RUNBOOK', 'TROUBLESHOOTING', 'ARCHITECTURE', 'CHANGE_RECORD', 'POSTMORTEM', 'POLICY', 'PROCEDURE'];
  const docType = validTypes.includes(type.toUpperCase()) ? type.toUpperCase() : 'RUNBOOK';

  const newDoc: KnowledgeDocument = {
    id: newId,
    title: title.trim(),
    type: docType,
    source: source || (filename ? `file://${filename}` : `manual://doc-${newId}.md`),
    content: content.trim()
  };

  db.knowledge_documents.push(newDoc);
  refreshRAGIndex();

  logEvent('DOCUMENT_UPLOADED', `Uploaded and indexed operational document #${newId}: "${newDoc.title}" (${newDoc.chunks_count} chunks)`);

  res.status(201).json({
    document: newDoc,
    indexing_status: ragRetriever.getIndexingStatus()
  });
});

// DELETE /knowledge/:id
app.delete(['/knowledge/:id', '/api/knowledge/:id', '/api/knowledge-base/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const idx = db.knowledge_documents.findIndex(d => d.id === id);
  if (idx === -1) {
    return res.status(404).json({ detail: `Knowledge document with id ${req.params.id} not found.` });
  }

  const removed = db.knowledge_documents.splice(idx, 1)[0];
  refreshRAGIndex();
  logEvent('DOCUMENT_DELETED', `Deleted document #${id}: "${removed.title}"`);

  res.json({
    message: `Document #${id} deleted successfully.`,
    indexing_status: ragRetriever.getIndexingStatus()
  });
});

// POST /knowledge/search (BM25 keyword/passage retrieval)
app.post(['/knowledge/search', '/api/knowledge/search', '/api/knowledge-base/search'], (req: Request, res: Response) => {
  const { query, top_k = 5, type = 'ALL' } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.json({
      query: "",
      results_count: 0,
      algorithm: "BM25 (Ranked Lexical)",
      passages: [],
      safety_notice: "KNOWLEDGE PASSAGE ONLY — DOES NOT AUTHORIZE EXECUTABLE ACTIONS. Operational procedures must be approved by an authorized SRE."
    });
  }

  const k = Math.min(Math.max(parseInt(top_k as string, 10) || 5, 1), 20);
  const passages = ragRetriever.search(query.trim(), k, type);

  res.json({
    query: query.trim(),
    results_count: passages.length,
    algorithm: "BM25 (Ranked Lexical)",
    passages,
    safety_notice: "KNOWLEDGE PASSAGE ONLY — DOES NOT AUTHORIZE EXECUTABLE ACTIONS. Operational procedures must be approved by an authorized SRE."
  });
});

// GET /incidents/:id/rag-context (retrieve relevant operational documents for active incident)
app.get(['/incidents/:id/rag-context', '/api/incidents/:id/rag-context'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  // Construct targeted retrieval query from incident title and symptom
  const query = `${inc.title} connection pool HikariCP starvation timeout rollback`;
  const passages = ragRetriever.search(query, 4);

  res.json({
    incident_id: id,
    incident_title: inc.title,
    query_used: query,
    algorithm: "BM25 (Ranked Lexical)",
    passages,
    safety_notice: "KNOWLEDGE PASSAGE ONLY — DOES NOT AUTHORIZE EXECUTABLE ACTIONS. Operational procedures must be approved by an authorized SRE."
  });
});

// GET /actions
app.get(['/actions', '/api/actions', '/api/remediation'], (req: Request, res: Response) => {
  const incident_id = req.query.incident_id ? parseInt(req.query.incident_id as string, 10) : null;
  let items = db.actions;
  if (incident_id) {
    items = items.filter(a => a.incident_id === incident_id);
  }
  res.json(items);
});

// POST /actions/{id}/approve -> transitions incident to 'remediating'
app.post(['/actions/:id/approve', '/api/actions/:id/approve', '/api/remediation/:id/approve'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { approved_by = "On-Call SRE", confirmation_phrase } = req.body;
  const action = db.actions.find(a => a.id === id);

  if (!action) {
    return res.status(404).json({ detail: `Action with id ${req.params.id} not found.` });
  }

  if (!confirmation_phrase || confirmation_phrase.trim().toUpperCase() !== "APPROVE REMEDIATION") {
    return res.status(400).json({ detail: "Human approval requires exact confirmation phrase: 'APPROVE REMEDIATION'" });
  }

  action.status = "APPROVED";
  action.approved_by = approved_by;
  action.result = `Approved by ${approved_by}. Ready to rollback DB_POOL_SIZE to 50 in simulation sandbox.`;

  // Transition incident state: awaiting_approval -> remediating
  const inc = db.incidents.find(i => i.id === action.incident_id);
  if (inc) {
    const old = inc.status;
    inc.status = "remediating";
    addTimeline(inc.id, "remediating", old, approved_by, `Remediation approved by ${approved_by}. Sandbox execution queued.`);
  }

  logEvent('ACTION_APPROVED', `Action ${id} approved by ${approved_by}`);
  res.json(action);
});

// POST /actions/{id}/simulate -> transitions incident to 'validating' -> 'resolved'
app.post(['/actions/:id/simulate', '/api/actions/:id/simulate', '/api/remediation/:id/simulate-execution'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const action = db.actions.find(a => a.id === id);

  if (!action) {
    return res.status(404).json({ detail: `Action with id ${req.params.id} not found.` });
  }

  if (action.status !== "APPROVED") {
    return res.status(400).json({ detail: "Safety guardrail: Action cannot be executed without prior human SRE approval." });
  }

  const inc = db.incidents.find(i => i.id === action.incident_id);
  if (inc) {
    addTimeline(inc.id, "validating", inc.status, "RemediationRunner", "Applying config rollback (DB_POOL_SIZE=50). Validating latency and error rate recovery.");
  }

  action.status = "SIMULATED";
  action.result = "=== [SIMULATED EXECUTION COMPLETE] ===\n1. Rollback deployment v2.4.1-rc1 -> v2.4.0 verified.\n2. Reconfigured Checkout Service DB_POOL_SIZE=50.\n3. Rolling restart completed in 24 seconds.\n4. Telemetry check: Latency nominal (45ms), error rate 0.02%, pool saturation 36%.";

  if (inc) {
    inc.status = "resolved";
    inc.resolved_at = new Date().toISOString();
    addTimeline(inc.id, "resolved", "validating", "AutomatedValidator", "Telemetry nominal for 5 consecutive probe intervals. Incident marked as resolved.");

    for (const svc of db.services) {
      svc.status = "HEALTHY";
    }
  }

  logEvent('ACTION_SIMULATED', `Simulated execution for Action ${id}. Incident resolved.`);
  res.json(action);
});

// POST /postmortems/generate/{id}
app.post(['/postmortems/generate/:id', '/api/postmortems/generate/:id'], (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const inc = db.incidents.find(i => i.id === id);
  if (!inc) {
    return res.status(404).json({ detail: `Incident with id ${req.params.id} not found.` });
  }

  let pm = db.postmortems.find(p => p.incident_id === id);
  if (pm) return res.json(pm);

  const newPm: Postmortem = {
    id: db.postmortems.length + 1,
    incident_id: id,
    summary: `Autonomous SRE postmortem generated for incident #${id} affecting Checkout Service.`,
    root_cause: `Deployment v2.4.1-rc1 reduced DB_POOL_SIZE from 50 to 10 right before traffic surge, exhausting database connection pool.`,
    prevention: `1. Implement automated connection-pool canary test in CI.\n2. Enforce minimum connection pool threshold rules in Kubernetes Helm charts.`
  };

  db.postmortems.unshift(newPm);
  logEvent('POSTMORTEM_GENERATED', `Generated postmortem for incident #${id}`);
  res.json(newPm);
});

// ---------------- DETERMINISTIC SIMULATION ENGINE ENDPOINTS ----------------
function applyScenario(scenario: 'incident' | 'healthy') {
  const now = new Date();
  const subMinutes = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();
  const subHours = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  if (scenario === 'healthy') {
    for (const s of db.services) {
      s.status = 'HEALTHY';
    }

    for (const inc of db.incidents) {
      if (inc.status !== 'resolved') {
        const old = inc.status;
        inc.status = 'resolved';
        inc.resolved_at = now.toISOString();
        addTimeline(inc.id, 'resolved', old, 'SimulationEngine', 'Healthy baseline restored.');
      }
    }

    db.deployments = [
      {
        id: 1,
        service_id: 2,
        version: "v2.4.0",
        changes: "commit 3b1e94a: chore: standard health checks & nominal config (DB_POOL_SIZE=50)",
        timestamp: subHours(2)
      }
    ];

    db.metrics = [];
    let mId = 1;
    for (let i = 15; i >= 0; i--) {
      const ts = subMinutes(i * 2);
      db.metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "latency_p95", value: 45.0 + (i % 3) * 1.5 });
      db.metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "error_rate", value: 0.02 });
      db.metrics.push({ id: mId++, service_id: 1, timestamp: ts, metric_name: "request_volume", value: 250.0 + (i % 5) * 4 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "latency_p95", value: 38.0 + (i % 3) * 1.2 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "error_rate", value: 0.01 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "pool_utilization", value: 36.0 + (i % 4) * 2.0 });
      db.metrics.push({ id: mId++, service_id: 2, timestamp: ts, metric_name: "request_volume", value: 250.0 + (i % 5) * 4 });
      db.metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "pool_utilization", value: 36.0 + (i % 4) * 2.0 });
      db.metrics.push({ id: mId++, service_id: 4, timestamp: ts, metric_name: "latency_p95", value: 12.0 + (i % 2) * 0.8 });
    }

    logEvent('SIMULATION_SET', 'Simulation state set to HEALTHY baseline.');
  } else {
    db = getInitialDatabase();
    refreshRAGIndex();
    logEvent('SIMULATION_SET', 'Simulation state set to INCIDENT (DB Pool Exhaustion).');
  }
}

app.post(['/simulation/start', '/api/simulation/start'], (req: Request, res: Response) => {
  const scenario = (req.body.scenario || 'incident').toLowerCase();
  if (scenario !== 'incident' && scenario !== 'healthy') {
    return res.status(400).json({ detail: "Scenario must be either 'incident' or 'healthy'." });
  }

  applyScenario(scenario as 'incident' | 'healthy');

  const activeInc = db.incidents.find(i => i.status !== 'resolved' && i.status !== 'failed');
  res.json({
    simulation_mode: "SYNTHETIC_SIMULATOR",
    state: scenario.toUpperCase(),
    active_incident_id: activeInc ? activeInc.id : null,
    active_incident_title: activeInc ? activeInc.title : null,
    db_pool_size: scenario === 'incident' ? 10 : 50,
    db_pool_utilization_pct: scenario === 'incident' ? 100.0 : 36.0,
    traffic_rps: scenario === 'incident' ? 850 : 250,
    latency_p95_ms: scenario === 'incident' ? 3450.0 : 45.0,
    error_rate_pct: scenario === 'incident' ? 18.5 : 0.02,
    active_version: scenario === 'incident' ? "v2.4.1-rc1" : "v2.4.0",
    is_synthetic: true
  });
});

app.get(['/simulation/status', '/api/simulation/status'], (req: Request, res: Response) => {
  const activeInc = db.incidents.find(i => i.status !== 'resolved' && i.status !== 'failed');
  const isIncident = !!activeInc;

  res.json({
    simulation_mode: "SYNTHETIC_SIMULATOR",
    state: isIncident ? "INCIDENT" : "HEALTHY",
    active_incident_id: activeInc ? activeInc.id : null,
    active_incident_title: activeInc ? activeInc.title : null,
    db_pool_size: isIncident ? 10 : 50,
    db_pool_utilization_pct: isIncident ? 100.0 : 36.0,
    traffic_rps: isIncident ? 850 : 250,
    latency_p95_ms: isIncident ? 3450.0 : 45.0,
    error_rate_pct: isIncident ? 18.5 : 0.02,
    active_version: isIncident ? "v2.4.1-rc1" : "v2.4.0",
    services_count: db.services.length,
    is_synthetic: true
  });
});

app.get(['/simulation/events', '/api/simulation/events'], (req: Request, res: Response) => {
  const events = [];

  for (const d of db.deployments) {
    events.push({
      type: "DEPLOYMENT",
      timestamp: d.timestamp,
      title: `Deployment ${d.version}`,
      detail: d.changes,
      service_id: d.service_id,
      is_synthetic: true
    });
  }

  for (const l of db.log_events) {
    events.push({
      type: "LOG",
      timestamp: l.timestamp,
      title: `[${l.level}] in Service #${l.service_id}`,
      detail: l.message,
      service_id: l.service_id,
      is_synthetic: true
    });
  }

  for (const i of db.incidents) {
    events.push({
      type: "INCIDENT",
      timestamp: i.created_at,
      title: `Incident #${i.id} (${i.severity})`,
      detail: i.title,
      service_id: i.service_id,
      is_synthetic: true
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(events);
});

app.post(['/simulation/reset', '/api/simulation/reset', '/reset-synthetic-data', '/api/reset-synthetic-data'], (req: Request, res: Response) => {
  applyScenario('healthy');
  res.json({ message: "Simulation reset to healthy baseline (DB_POOL_SIZE=50)." });
});

// ---------------- VITE DEV SERVER MIDDLEWARE & LAUNCH ----------------
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    logEvent('BOOT_READY', `Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
