import React, { useState } from 'react';
import {
  Layers,
  AlertCircle,
  FileCode,
  TrendingDown,
  GitCommit,
  Terminal,
  Copy,
  Check,
  Clock
} from 'lucide-react';
import { Incident, Evidence } from '../types';

interface EvidenceChainViewProps {
  incidents: Incident[];
  selectedIncidentId: number;
  onSelectIncident: (id: number) => void;
  evidence: Evidence[];
  isLoading: boolean;
}

export const EvidenceChainView: React.FC<EvidenceChainViewProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  evidence,
  isLoading
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const currentIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  const filteredEvidence = evidence.filter(ev => {
    if (filterType !== 'ALL' && ev.source_type !== filterType) return false;
    return true;
  });

  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ALERT':
        return <AlertCircle className="w-4 h-4 text-rose-400" />;
      case 'LOG':
        return <FileCode className="w-4 h-4 text-amber-400" />;
      case 'METRIC':
        return <TrendingDown className="w-4 h-4 text-cyan-400" />;
      case 'DEPLOYMENT':
        return <GitCommit className="w-4 h-4 text-purple-400" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Target Incident Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Correlated Operational Evidence Chain
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Retrieved via <code className="font-mono text-cyan-300">GET /incidents/{currentIncident?.id}/evidence</code> from SQLite Evidence table.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Incident:</label>
          <select
            value={currentIncident?.id}
            onChange={(e) => onSelectIncident(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                INC-{inc.id} - {inc.service_name || `Service ${inc.service_id}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['ALL', 'ALERT', 'LOG', 'METRIC', 'DEPLOYMENT'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
              filterType === type
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Evidence Timeline */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading correlated evidence from database...</div>
        ) : filteredEvidence.length === 0 ? (
          <div className="p-12 text-center rounded-lg bg-[#0c1220] border border-slate-800 text-xs text-slate-400">
            No evidence records found for selected filter.
          </div>
        ) : (
          filteredEvidence.map((ev) => (
            <div
              key={ev.id}
              className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 hover:border-slate-700 transition space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    {getTypeIcon(ev.source_type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-cyan-400">EVD-{ev.id}</span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {ev.source_type}
                      </span>
                      {ev.source_id && (
                        <span className="font-mono text-xs text-slate-400">
                          Ref #{ev.source_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-mono text-slate-300">
                    Relevance: {(ev.relevance * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Detail Payload */}
              <div className="rounded bg-slate-950/70 border border-slate-900 p-3 font-mono text-[11px] text-cyan-200/90 flex items-start justify-between gap-3">
                <span className="leading-relaxed">{ev.detail || `Correlated ${ev.source_type} event tied to incident #${ev.incident_id}`}</span>
                <button
                  onClick={() => handleCopy(ev.id, ev.detail || '')}
                  className="hover:text-slate-200 flex items-center gap-1 transition text-slate-400 text-xs shrink-0"
                >
                  {copiedId === ev.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
