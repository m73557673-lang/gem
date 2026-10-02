import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  Copy,
  Check,
  AlertCircle
} from 'lucide-react';
import { Postmortem, Incident } from '../types';

interface PostmortemsViewProps {
  postmortem: Postmortem | null;
  incidents: Incident[];
  selectedIncidentId: number;
  onSelectIncident: (id: number) => void;
  onGeneratePostmortem: (incidentId: number) => Promise<void>;
  isLoading: boolean;
}

export const PostmortemsView: React.FC<PostmortemsViewProps> = ({
  postmortem,
  incidents,
  selectedIncidentId,
  onSelectIncident,
  onGeneratePostmortem,
  isLoading
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  const handleGenerate = async () => {
    if (!currentIncident) return;
    setIsGenerating(true);
    try {
      await onGeneratePostmortem(currentIncident.id);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!postmortem) return;
    const md = `# Incident Postmortem: INC-${postmortem.incident_id}\n\n**Incident ID:** ${postmortem.incident_id}\n**Postmortem ID:** ${postmortem.id}\n\n## Summary\n${postmortem.summary}\n\n## Root Cause\n${postmortem.root_cause}\n\n## Prevention & Action Items\n${postmortem.prevention}`;

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              SRE Postmortem Engine (Postmortem Table)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Retrieved via <code className="font-mono text-cyan-300">GET /incidents/{currentIncident?.id}/postmortem</code>.
          </p>
        </div>

        {/* Generator Controls */}
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

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Synthesizing...' : 'Generate Postmortem'}</span>
          </button>
        </div>
      </div>

      {/* Postmortem Document */}
      <div className="max-w-4xl">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading postmortem from database...</div>
        ) : !postmortem ? (
          <div className="p-12 text-center rounded-lg bg-[#0c1220] border border-slate-800 space-y-3">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-300 font-medium">No postmortem document generated for Incident #{currentIncident?.id} yet.</p>
            <button
              onClick={handleGenerate}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-medium"
            >
              Generate Postmortem Report
            </button>
          </div>
        ) : (
          <div className="p-6 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-4 border-b border-slate-800 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-cyan-400 font-semibold">PM-{postmortem.id}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs text-slate-400 font-mono">Incident #{postmortem.incident_id}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-100">
                  Incident Postmortem Report: INC-{postmortem.incident_id}
                </h3>
              </div>

              <button
                onClick={handleCopyMarkdown}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium transition flex items-center gap-1.5 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied MD</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Export Markdown</span>
                  </>
                )}
              </button>
            </div>

            {/* Summary */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-mono uppercase tracking-wider text-slate-400 font-semibold text-[11px]">
                1. Executive Summary
              </h4>
              <p className="text-slate-200 leading-relaxed p-3.5 rounded bg-slate-900/50 border border-slate-800/60">
                {postmortem.summary}
              </p>
            </div>

            {/* Root Cause */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-mono uppercase tracking-wider text-slate-400 font-semibold text-[11px]">
                2. Root Cause Analysis
              </h4>
              <p className="text-slate-200 leading-relaxed p-3.5 rounded bg-slate-900/50 border border-slate-800/60 font-mono text-[11px]">
                {postmortem.root_cause}
              </p>
            </div>

            {/* Prevention */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-mono uppercase tracking-wider text-slate-400 font-semibold text-[11px]">
                3. Prevention & Corrective Actions
              </h4>
              <pre className="text-slate-200 leading-relaxed p-3.5 rounded bg-slate-900/50 border border-slate-800/60 font-mono text-[11px] whitespace-pre-wrap">
                {postmortem.prevention}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
