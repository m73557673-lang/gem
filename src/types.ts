// 10 Core Database Models matching SQLite / SQLAlchemy schemas

export interface Service {
  id: number;
  name: string;
  environment: string;
  owner: string;
  status: string; // HEALTHY, DEGRADED, OUTAGE
}

export interface Incident {
  id: number;
  title: string;
  severity: string; // CRITICAL, HIGH, MEDIUM, LOW
  // 7 States: detected, investigating, awaiting_approval, remediating, validating, resolved, failed
  status: 'detected' | 'investigating' | 'awaiting_approval' | 'remediating' | 'validating' | 'resolved' | 'failed' | string;
  service_id: number;
  created_at: string;
  resolved_at: string | null;
  service_name?: string;
}

export interface IncidentTimeline {
  id: number;
  incident_id: number;
  from_state: string | null;
  to_state: string;
  actor: string;
  message: string;
  timestamp: string;
}

export interface LogEvent {
  id: number;
  service_id: number;
  timestamp: string;
  level: string; // INFO, WARN, ERROR, FATAL
  message: string;
}

export interface Deployment {
  id: number;
  service_id: number;
  version: string;
  changes: string;
  timestamp: string;
}

export interface Metric {
  id: number;
  service_id: number;
  timestamp: string;
  metric_name: string; // latency_p95, error_rate, pool_utilization, request_volume
  value: number;
}

export interface DocumentChunk {
  id: string;
  document_id: number;
  document_title: string;
  source: string;
  type: string;
  section: string;
  content: string;
  score?: number;
  relevance_excerpt?: string;
  word_count?: number;
}

export interface KnowledgeDocument {
  id: number;
  title: string;
  type: string; // RUNBOOK, TROUBLESHOOTING, ARCHITECTURE, CHANGE_RECORD, POSTMORTEM, POLICY, PROCEDURE
  content: string;
  source: string;
  chunks_count?: number;
  word_count?: number;
  indexed_at?: string;
  chunks?: DocumentChunk[];
}

export interface IndexingStatus {
  total_documents: number;
  total_chunks: number;
  vocabulary_size: number;
  avg_chunk_length: number;
  algorithm: string;
  last_indexed: string;
  status: string;
}

export interface RAGSearchResult {
  query: string;
  results_count: number;
  algorithm: string;
  passages: DocumentChunk[];
  incident_context?: string;
}

export interface Evidence {
  id: number;
  incident_id: number;
  source_type: string; // LOG, METRIC, DEPLOYMENT, ALERT, RAG_DOCUMENT
  source_id: number | null;
  relevance: number;
  detail?: string | null;
}

export interface Recommendation {
  id: number;
  incident_id: number;
  action: string;
  risk: string; // LOW, MEDIUM, HIGH
  confidence: number;
}

export interface Action {
  id: number;
  incident_id: number;
  approved_by: string | null;
  status: string; // PENDING, APPROVED, REJECTED, SIMULATED
  result: string | null;
}

export interface Postmortem {
  id: number;
  incident_id: number;
  summary: string;
  root_cause: string;
  prevention: string;
}

export interface HealthCheck {
  status: string;
  timestamp: string;
  database: string;
  active_incidents: number;
  services_count: number;
  version: string;
  environment?: string;
  synthetic_mode: boolean;
}

export interface SimulationStatus {
  simulation_mode: string;
  state: 'HEALTHY' | 'INCIDENT';
  active_incident_id: number | null;
  active_incident_title: string | null;
  db_pool_size: number;
  db_pool_utilization_pct: number;
  traffic_rps: number;
  latency_p95_ms: number;
  error_rate_pct: number;
  active_version: string;
  services_count?: number;
  is_synthetic: boolean;
  description?: string;
}

export interface SimulationEvent {
  type: 'DEPLOYMENT' | 'LOG' | 'INCIDENT';
  timestamp: string;
  title: string;
  detail: string;
  service_id: number;
  is_synthetic: boolean;
}

export interface InvestigationStatus {
  incident_id: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | string;
  incident_state: string;
  progress_pct: number;
  current_step: string;
  steps_log: string[];
  findings: Record<string, any>;
  timeline: IncidentTimeline[];
}
