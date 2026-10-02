import React, { useState } from 'react';
import {
  Wrench,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  Terminal,
  FileCheck,
  X
} from 'lucide-react';
import { Action, Incident } from '../types';

interface RemediationViewProps {
  actions: Action[];
  incidents: Incident[];
  onApprove: (actionId: number, approvedBy: string, phrase: string) => Promise<void>;
  onSimulate: (actionId: number) => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
}

export const RemediationView: React.FC<RemediationViewProps> = ({
  actions,
  incidents,
  onApprove,
  onSimulate,
  onRefresh,
  isLoading
}) => {
  const [activeActionForApproval, setActiveActionForApproval] = useState<Action | null>(null);
  const [operatorName, setOperatorName] = useState('Principal SRE On-Call');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const REQUIRED_PHRASE = 'APPROVE REMEDIATION';

  const handleOpenApproval = (action: Action) => {
    setActiveActionForApproval(action);
    setConfirmationInput('');
    setApprovalError(null);
  };

  const handleConfirmApproval = async () => {
    if (!activeActionForApproval) return;
    if (confirmationInput.trim().toUpperCase() !== REQUIRED_PHRASE) {
      setApprovalError(`Confirmation phrase must be exactly: ${REQUIRED_PHRASE}`);
      return;
    }

    setIsProcessing(true);
    setApprovalError(null);
    try {
      await onApprove(activeActionForApproval.id, operatorName, confirmationInput);
      setActiveActionForApproval(null);
    } catch (err: any) {
      setApprovalError(err.message || 'Failed to approve action');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulateExecution = async (actionId: number) => {
    setIsProcessing(true);
    try {
      await onSimulate(actionId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Strict SRE Safety Policy Banner */}
      <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-amber-200">
            Mandatory SRE Safety Guardrail: Human Approval Gating Enforced
          </span>
          <p className="text-amber-300/80 leading-relaxed">
            Actions in the Action table require explicit human authorization ('APPROVE REMEDIATION') prior to simulation. Real infrastructure changes remain strictly prohibited.
          </p>
        </div>
      </div>

      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Remediation Action Console (Action Table)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluate proposed mitigation plans, authorize human approval, and validate simulated recovery.
          </p>
        </div>
        <span className="text-[11px] font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-2.5 py-1 rounded">
          Sandbox Mode: Safe Synthetic Execution
        </span>
      </div>

      {/* Action Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading actions from database...</div>
        ) : actions.length === 0 ? (
          <div className="p-12 text-center rounded-lg bg-[#0c1220] border border-slate-800 text-xs text-slate-400">
            No remediation actions found.
          </div>
        ) : (
          actions.map((action) => {
            const isPending = action.status === 'PENDING';
            const isApproved = action.status === 'APPROVED';
            const isSimulated = action.status === 'SIMULATED';

            return (
              <div
                key={action.id}
                className={`p-5 rounded-lg bg-[#0c1220] border transition space-y-4 ${
                  isSimulated
                    ? 'border-emerald-800/60'
                    : isApproved
                    ? 'border-cyan-800/60'
                    : 'border-slate-800/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-cyan-400">
                      ACTION-{action.id}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono text-xs text-slate-400">
                      Target Incident #{action.incident_id}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-mono px-2.5 py-0.5 rounded flex items-center gap-1.5 ${
                      isSimulated
                        ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/40'
                        : isApproved
                        ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/40'
                        : 'text-amber-400 bg-amber-950/40 border border-amber-800/40 animate-pulse'
                    }`}
                  >
                    {isSimulated && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {isApproved && <ShieldCheck className="w-3.5 h-3.5" />}
                    {isPending && <ShieldAlert className="w-3.5 h-3.5" />}
                    Status: {action.status}
                  </span>
                </div>

                {action.approved_by && (
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Approved by:</span>
                      <span className="font-semibold text-slate-200">{action.approved_by}</span>
                    </div>
                  </div>
                )}

                {action.result && (
                  <div className="rounded bg-slate-950 border border-slate-800/80 overflow-hidden text-xs">
                    <div className="px-3 py-1.5 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between font-mono text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        Execution / Audit Result
                      </span>
                    </div>
                    <pre className="p-3 text-[11px] font-mono text-emerald-300/90 whitespace-pre-wrap overflow-x-auto">
                      {action.result}
                    </pre>
                  </div>
                )}

                {/* Controls */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-end gap-2 text-xs">
                  {isPending && (
                    <button
                      onClick={() => handleOpenApproval(action)}
                      className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium transition flex items-center gap-1.5 shadow-sm"
                    >
                      <FileCheck className="w-4 h-4" />
                      <span>Authorize Human Approval</span>
                    </button>
                  )}

                  {isApproved && (
                    <button
                      onClick={() => handleSimulateExecution(action.id)}
                      disabled={isProcessing}
                      className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-medium transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{isProcessing ? 'Executing...' : 'Run Safe Sandbox Simulation'}</span>
                    </button>
                  )}

                  {isSimulated && (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simulation Verified & Incident Resolved</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Human Approval Modal */}
      {activeActionForApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Authorize Remediation Action #{activeActionForApproval.id}
                </h3>
              </div>
              <button
                onClick={() => setActiveActionForApproval(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Authorizing SRE Operator Name:
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Type Confirmation Phrase to Authorize:
                </label>
                <div className="text-[11px] font-mono text-cyan-400 mb-1">
                  Required: <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{REQUIRED_PHRASE}</span>
                </div>
                <input
                  type="text"
                  placeholder="Type 'APPROVE REMEDIATION'"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500 font-mono uppercase"
                />
              </div>

              {approvalError && (
                <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
                  {approvalError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveActionForApproval(null)}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                disabled={isProcessing || confirmationInput.trim().toUpperCase() !== REQUIRED_PHRASE}
                className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs disabled:opacity-40 transition"
              >
                {isProcessing ? 'Verifying...' : 'Confirm Human Authorization'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
