import React, { useState, useEffect } from 'react';
import {
  SearchCode,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldAlert,
  AlertCircle,
  Play,
  CheckCircle2,
  Clock,
  Terminal,
  Activity,
  FileCode,
  GitCommit,
  UserCheck,
  BookOpen
} from 'lucide-react';
import { Incident, Recommendation, Evidence, IncidentTimeline, InvestigationStatus, DocumentChunk } from '../types';
import { api } from '../api';

interface InvestigationViewProps {
  incidents: Incident[];
  selectedIncidentId: number;
  onSelectIncident: (id: number) => void;
  recommendation: Recommendation | null;
  evidence: Evidence[];
  timeline: IncidentTimeline[];
  investigationStatus: InvestigationStatus | null;
  onStartInvestigation: (incidentId: number) => Promise<void>;
  onNavigate: (tab: any) => void;
  isLoading: boolean;
}

const LIFECYCLE_STATES = [
  { id: 'detected', label: '1. Detected' },
  { id: 'investigating', label: '2. Investigating' },
  { id: 'awaiting_approval', label: '3. Awaiting Approval' },
  { id: 'remediating', label: '4. Remediating' },
  { id: 'validating', label: '5. Validating' },
  { id: 'resolved', label: '6. Resolved' }
];

export const InvestigationView: React.FC<InvestigationViewProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  recommendation,
  evidence,
  timeline,
  investigationStatus,
  onStartInvestigation,
  onNavigate,
  isLoading
}) => {
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [ragPassages, setRagPassages] = useState<DocumentChunk[]>([]);
  const [isLoadingRag, setIsLoadingRag] = useState(false);

  const currentIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  useEffect(() => {
    if (currentIncident?.id) {
      loadRAGContext(currentIncident.id);
    }
  }, [currentIncident?.id]);

  const loadRAGContext = async (incidentId: number) => {
    setIsLoadingRag(true);
    try {
      const res = await api.getIncidentRAGContext(incidentId);
      setRagPassages(res.passages || []);
    } catch (err) {
      console.error('Failed to load RAG context for incident:', err);
    } finally {
      setIsLoadingRag(false);
    }
  };

  const handleRunInvestigation = async () => {
    if (!currentIncident) return;
    setIsInvestigating(true);
    try {
      await onStartInvestigation(currentIncident.id);
      await loadRAGContext(currentIncident.id);
    } finally {
      setIsInvestigating(false);
    }
  };

  const currentStatusClean = currentIncident?.status?.toLowerCase() || 'detected';
  const currentStateIndex = LIFECYCLE_STATES.findIndex(s => s.id === currentStatusClean);

  return (
    <div className="space-y-6">
      {/* View Header with Incident Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <SearchCode className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Deterministic Investigation Engine & Lifecycle
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Collects logs, metrics, deployment changes, and synthesizes root-cause evidence without an LLM.
          </p>
        </div>

        {/* Incident Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Target Incident:</label>
          <select
            value={currentIncident?.id}
            onChange={(e) => onSelectIncident(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                INC-{inc.id} ({inc.severity}) [{inc.status}] - {inc.service_name || `Service ${inc.service_id}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Incident Lifecycle Pipeline Status Bar */}
      <div className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
            Incident State Machine (7 Audited States)
          </span>
          <span className="text-xs font-mono text-cyan-400 font-semibold uppercase bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            Current State: {currentIncident?.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {LIFECYCLE_STATES.map((step, idx) => {
            const isPassed = currentStateIndex >= idx;
            const isCurrent = currentStatusClean === step.id;
            return (
              <div
                key={step.id}
                className={`p-2 rounded text-center text-xs font-mono transition border ${
                  isCurrent
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-semibold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : isPassed
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300'
                    : 'bg-slate-950/40 border-slate-900 text-slate-600'
                }`}
              >
                <div className="truncate text-[11px]">{step.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Investigation Action Control & Real-time Progress */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Automated Root-Cause Investigation Orchestrator
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Correlates telemetry window, deployment commit log, and HikariCP error logs.
            </p>
          </div>

          <button
            onClick={handleRunInvestigation}
            disabled={isInvestigating || currentIncident?.status === 'resolved'}
            className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-semibold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isInvestigating ? 'animate-spin' : ''}`} />
            <span>{isInvestigating ? 'Investigating...' : 'Start Investigation (POST /incidents/{id}/investigate)'}</span>
          </button>
        </div>

        {/* Progress Bar & Steps Log */}
        {investigationStatus && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">{investigationStatus.current_step}</span>
              <span className="text-cyan-400 font-semibold">{investigationStatus.progress_pct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-cyan-400 transition-all duration-500"
                style={{ width: `${investigationStatus.progress_pct}%` }}
              />
            </div>

            {investigationStatus.steps_log?.length > 0 && (
              <div className="mt-3 p-3 rounded bg-slate-950 border border-slate-900 space-y-1 font-mono text-[11px] text-slate-300">
                {investigationStatus.steps_log.map((stepMsg, sIdx) => (
                  <div key={sIdx} className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>{stepMsg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recommendation Card */}
      {recommendation && (
        <div className="p-5 rounded-lg bg-[#0c1220] border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.06)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">REC-{recommendation.id}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                  Formulated Remediation
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded text-amber-400 bg-amber-950/40 border border-amber-800/40">
                  Risk: {recommendation.risk}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-slate-100">
                Recommended Corrective Action
              </h4>
            </div>

            {/* Confidence Meter */}
            <div className="flex items-center gap-3 shrink-0 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg">
              <div className="text-right">
                <div className="text-[10px] uppercase font-mono text-slate-500">Confidence</div>
                <div className="text-base font-mono font-semibold text-cyan-400">
                  {(recommendation.confidence * 100).toFixed(0)}%
                </div>
              </div>
              <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400"
                  style={{ width: `${recommendation.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed font-mono bg-slate-950/60 p-3.5 rounded border border-slate-800/70">
            {recommendation.action}
          </p>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500 font-mono">
              Status: {currentIncident?.status}
            </span>
            <button
              onClick={() => onNavigate('remediation')}
              className="px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              <span>Proceed to Human Remediation Gating</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Retrieved RAG Context Passages (Runbooks & Postmortems) */}
      <div className="p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              Retrieved RAG Operational Context (BM25 Lexical Matching)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Relevant runbooks, troubleshooting guides, and historical postmortems retrieved for this failure mode.
            </p>
          </div>
          <div className="text-[10px] text-amber-400 font-mono uppercase bg-amber-950/30 border border-amber-800/30 px-2 py-0.5 rounded">
            Passage Context Only · Non-Executable
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isLoadingRag ? (
            <div className="col-span-2 p-6 text-center text-xs font-mono text-slate-500">
              Retrieving relevant runbook passages...
            </div>
          ) : ragPassages.length === 0 ? (
            <div className="col-span-2 p-6 text-center text-xs text-slate-500">
              No matching knowledge passages retrieved.
            </div>
          ) : (
            ragPassages.map((chunk) => (
              <div
                key={chunk.id}
                className="p-3.5 rounded bg-slate-950/70 border border-slate-900 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-cyan-300 font-semibold truncate text-[11px]">
                    {chunk.document_title}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 shrink-0">
                    BM25: {chunk.score?.toFixed(2)}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  Section: {chunk.section}
                </div>
                <p className="text-[11px] font-mono text-slate-300 leading-relaxed line-clamp-3 bg-slate-900/50 p-2 rounded">
                  {chunk.relevance_excerpt || chunk.content}
                </p>
                <div className="text-[10px] font-mono text-slate-500 truncate pt-1 border-t border-slate-900">
                  {chunk.source}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Split layout: Chronological Audit Timeline & Evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chronological Audit Timeline (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Chronological Audit Timeline (IncidentTimeline Table)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every state transition logged with timestamp and actor via <code className="font-mono text-cyan-300">GET /incidents/{currentIncident?.id}/timeline</code>.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {timeline.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No timeline transitions recorded yet.
              </div>
            ) : (
              timeline.map((item) => (
                <div key={item.id} className="p-3 rounded bg-slate-950/60 border border-slate-900 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-cyan-400 font-semibold">
                        {item.from_state ? `${item.from_state} → ${item.to_state}` : item.to_state}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        Actor: {item.actor}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-mono pl-1">
                    {item.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Correlated Evidence Window (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Correlated Evidence Items ({evidence.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Relevance-scored telemetry signals
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {evidence.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Run investigation to populate correlated evidence.
              </div>
            ) : (
              evidence.map((ev) => (
                <div key={ev.id} className="p-3 rounded bg-slate-950/60 border border-slate-900 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-cyan-300 font-medium">EVD-{ev.id} ({ev.source_type})</span>
                    <span className="font-mono text-slate-400 text-[11px]">
                      Relevance: {(ev.relevance * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-300 leading-relaxed">
                    {ev.detail || `Correlated ${ev.source_type} event tied to incident #${ev.incident_id}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
