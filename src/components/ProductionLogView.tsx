import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Play,
  Square,
  Check,
} from 'lucide-react';
import type {
  BatchCcpStepLog,
  Ingredient,
  ProductionBatch,
  QaStatus,
  Recipe,
} from '../types/factory';
import { downloadCsv } from '../utils/calculations';
import {
  buildAllHaccpAlerts,
  serializeEvaluatedStepsToLogs,
  type EvaluatedCcpStep,
  type HaccpBatchAlert,
} from '../utils/haccpAlerts';
import { buildWorkerSheetFromBatch } from '../utils/workerSheet';
import { BatchQrModal } from './BatchQrModal';

interface ProductionLogViewProps {
  factoryName: string;
  plantCode: string;
  batches: ProductionBatch[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  onUpdateQaStatus: (batchId: string, qaStatus: QaStatus) => Promise<void>;
  onUpdateBatchCcpLogs?: (
    batchId: string,
    ccpStepLogs: BatchCcpStepLog[],
    qaStatus?: QaStatus
  ) => Promise<void>;
}

export const ProductionLogView: React.FC<ProductionLogViewProps> = ({
  factoryName,
  plantCode,
  batches,
  recipes,
  ingredients,
  onUpdateQaStatus,
  onUpdateBatchCcpLogs,
}) => {
  const [search, setSearch] = useState('');
  const [qaFilter, setQaFilter] = useState<'All' | QaStatus>('All');
  const [ccpAlertsOnly, setCcpAlertsOnly] = useState(false);
  const [alertViewMode, setAlertViewMode] = useState<'active' | 'all'>('active');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(
    batches[0]?.id || null
  );
  const [qrBatch, setQrBatch] = useState<ProductionBatch | null>(null);

  // Live clock for running CCP step timers
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Inline actual-duration drafts keyed by `${batchId}::${stepId}`
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  const [ackTargetKey, setAckTargetKey] = useState<string | null>(null);
  const [ackNoteDraft, setAckNoteDraft] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const haccpReport = useMemo(
    () => buildAllHaccpAlerts(batches, recipes, nowMs),
    [batches, recipes, nowMs]
  );

  const hasRunningTimers = useMemo(() => {
    for (const summary of haccpReport.byBatchId.values()) {
      if (summary.runningSteps.length > 0) return true;
    }
    return false;
  }, [haccpReport]);

  useEffect(() => {
    if (!hasRunningTimers) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasRunningTimers]);

  const approvedCount = useMemo(
    () => recipes.filter((r) => r.status === 'Approved').length,
    [recipes]
  );

  const avgEfficiency = useMemo(() => {
    if (batches.length === 0) return 0;
    const sum = batches.reduce((acc, b) => {
      if (b.targetOutputKg <= 0) return acc;
      return acc + (b.actualOutputKg / b.targetOutputKg) * 100;
    }, 0);
    return sum / batches.length;
  }, [batches]);

  const visibleAlerts = useMemo(() => {
    if (alertViewMode === 'active') {
      return haccpReport.alerts.filter((a) => !a.isAcknowledged);
    }
    return haccpReport.alerts;
  }, [haccpReport.alerts, alertViewMode]);

  const filteredBatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter((b) => {
      if (qaFilter !== 'All' && b.qaStatus !== qaFilter) return false;
      if (ccpAlertsOnly) {
        const summary = haccpReport.byBatchId.get(b.id);
        if (!summary || summary.overruns.length === 0) return false;
      }
      if (!q) return true;
      return (
        b.lotCode.toLowerCase().includes(q) ||
        b.recipeCode.toLowerCase().includes(q) ||
        b.recipeName.toLowerCase().includes(q) ||
        b.operator.toLowerCase().includes(q) ||
        b.lineName.toLowerCase().includes(q)
      );
    });
  }, [batches, search, qaFilter, ccpAlertsOnly, haccpReport]);

  const mutateBatchSteps = async (
    batchId: string,
    updater: (steps: EvaluatedCcpStep[]) => BatchCcpStepLog[],
    nextQaStatus?: QaStatus
  ) => {
    if (!onUpdateBatchCcpLogs) return;
    const summary = haccpReport.byBatchId.get(batchId);
    if (!summary) return;
    const nextLogs = updater(summary.steps);
    await onUpdateBatchCcpLogs(batchId, nextLogs, nextQaStatus);
  };

  const handleSaveActualMin = async (
    batch: ProductionBatch,
    step: EvaluatedCcpStep,
    rawVal: string
  ) => {
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const key = `${batch.id}::${step.stepId}`;
    setSavingKey(key);
    try {
      await mutateBatchSteps(batch.id, (steps) => {
        const logs = serializeEvaluatedStepsToLogs(steps);
        return logs.map((l) => {
          if (l.stepId !== step.stepId) return l;
          const stillOverrun = l.allottedMin > 0 && parsed > l.allottedMin + 0.01;
          return {
            ...l,
            actualMin: Number(parsed.toFixed(2)),
            completedAt: new Date().toISOString(),
            // Clear prior acknowledgment if duration changed to a fresh overrun
            acknowledgedAt: stillOverrun ? l.acknowledgedAt : undefined,
            acknowledgedBy: stillOverrun ? l.acknowledgedBy : undefined,
            correctiveAction: stillOverrun ? l.correctiveAction : undefined,
          };
        });
      });
      setDurationDrafts((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handleStartStepTimer = async (batch: ProductionBatch, step: EvaluatedCcpStep) => {
    const key = `${batch.id}::${step.stepId}`;
    setSavingKey(key);
    try {
      const nowIso = new Date().toISOString();
      await mutateBatchSteps(batch.id, (steps) =>
        serializeEvaluatedStepsToLogs(steps).map((l) =>
          l.stepId === step.stepId
            ? {
                ...l,
                actualMin: null,
                startedAt: nowIso,
                completedAt: undefined,
                acknowledgedAt: undefined,
                acknowledgedBy: undefined,
                correctiveAction: undefined,
              }
            : l
        )
      );
      setNowMs(Date.now());
    } finally {
      setSavingKey(null);
    }
  };

  const handleStopStepTimer = async (batch: ProductionBatch, step: EvaluatedCcpStep) => {
    const key = `${batch.id}::${step.stepId}`;
    setSavingKey(key);
    try {
      const elapsedMin = step.startedAt
        ? Math.max(0.1, Number(((Date.now() - Date.parse(step.startedAt)) / 60_000).toFixed(2)))
        : step.actualMin ?? step.allottedMin;
      await mutateBatchSteps(batch.id, (steps) =>
        serializeEvaluatedStepsToLogs(steps).map((l) =>
          l.stepId === step.stepId
            ? {
                ...l,
                actualMin: elapsedMin,
                completedAt: new Date().toISOString(),
              }
            : l
        )
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleAcknowledgeAlert = async (alert: HaccpBatchAlert, placeOnHold: boolean) => {
    const key = alert.id;
    setSavingKey(key);
    try {
      const actionNote =
        ackNoteDraft.trim() ||
        (placeOnHold
          ? 'Placed lot on QA Hold pending moisture, microbial, and sensory verification.'
          : 'Verified CCP core parameters within safe HACCP tolerance; batch cleared by QA.');

      await mutateBatchSteps(
        alert.batch.id,
        (steps) =>
          serializeEvaluatedStepsToLogs(steps).map((l) =>
            l.stepId === alert.step.stepId
              ? {
                  ...l,
                  acknowledgedAt: new Date().toISOString(),
                  acknowledgedBy: 'QA Lead',
                  correctiveAction: actionNote,
                }
              : l
          ),
        placeOnHold ? 'Hold' : undefined
      );
      setAckTargetKey(null);
      setAckNoteDraft('');
    } finally {
      setSavingKey(null);
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      'production-batch-log.csv',
      [
        'Lot Code',
        'Formula Code',
        'Product Name',
        'Version',
        'Line',
        'Target Output (kg)',
        'Actual Output (kg)',
        'Variance (%)',
        'Operator',
        'QA Status',
        'HACCP CCP Status',
        'Max CCP Overrun (min)',
        'Started At',
      ],
      filteredBatches.map((b) => {
        const variance =
          b.targetOutputKg > 0
            ? ((b.actualOutputKg - b.targetOutputKg) / b.targetOutputKg) * 100
            : 0;
        const haccp = haccpReport.byBatchId.get(b.id);
        return [
          b.lotCode,
          b.recipeCode,
          b.recipeName,
          b.version,
          b.lineName,
          b.targetOutputKg.toFixed(2),
          b.actualOutputKg.toFixed(2),
          `${variance >= 0 ? '+' : ''}${variance.toFixed(2)}%`,
          b.operator,
          b.qaStatus,
          haccp ? haccp.status : 'none',
          haccp && haccp.maxOverrunMin > 0 ? `+${haccp.maxOverrunMin.toFixed(1)}` : '0',
          b.startedAt,
        ];
      })
    );
  };

  return (
    <div className="space-y-5">
      {/* 4-Column Operational KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Approved Formulations
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {approvedCount} / {recipes.length}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            HACCP CCP Time Alerts
          </div>
          <div
            className={`font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums ${
              haccpReport.activeAlertCount > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <span>{haccpReport.activeAlertCount}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              active · {haccpReport.acknowledgedAlertCount} ack
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Logged Production Runs
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {batches.length}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Average Yield Efficiency
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {avgEfficiency.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Automated HACCP CCP Time-Overrun Alert Center */}
      {haccpReport.alerts.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <strong>HACCP Critical Control Timing Nominal:</strong> All logged production batches completed their critical control steps within allotted formulation limits.
            </span>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-start gap-2.5">
              {haccpReport.activeAlertCount > 0 ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Automated HACCP Critical Control Point (CCP) Time Alerts
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Triggers automatically whenever actual or live elapsed step duration exceeds the formulation&rsquo;s allotted HACCP CCP limit.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setAlertViewMode('active')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  alertViewMode === 'active'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Active Warnings ({haccpReport.activeAlertCount})
              </button>
              <button
                type="button"
                onClick={() => setAlertViewMode('all')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  alertViewMode === 'all'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                All Overruns ({haccpReport.alerts.length})
              </button>
            </div>
          </div>

          {visibleAlerts.length === 0 ? (
            <div className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
              All {haccpReport.acknowledgedAlertCount} CCP time overrun alert(s) have been acknowledged with corrective actions. Switch to &ldquo;All Overruns&rdquo; to review history.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleAlerts.map((alert) => {
                const isAckEditing = ackTargetKey === alert.id;
                const isBusy = savingKey === alert.id;
                return (
                  <div
                    key={alert.id}
                    className={`px-5 py-3.5 text-xs ${
                      !alert.isAcknowledged
                        ? alert.step.severity === 'critical'
                          ? 'bg-red-50/50 dark:bg-red-950/20'
                          : 'bg-amber-50/50 dark:bg-amber-950/20'
                        : 'bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {alert.isAcknowledged ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>Acknowledged</span>
                            </span>
                          ) : alert.step.severity === 'critical' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400">
                              <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                              <span>Critical CCP Overrun</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>CCP Time Warning</span>
                            </span>
                          )}
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {alert.batch.lotCode}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="text-slate-700 dark:text-slate-300">
                            {alert.batch.recipeCode} ({alert.batch.recipeName})
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            QA: {alert.batch.qaStatus}
                          </span>
                        </div>

                        <div className="text-slate-700 dark:text-slate-300">
                          <strong>
                            Step {alert.step.stepNumber}: {alert.step.title}
                          </strong>{' '}
                          <span className="font-mono tabular-nums text-red-700 dark:text-red-400">
                            ({alert.step.actualMin?.toFixed(1)} min{' '}
                            {alert.step.isRunning ? 'elapsed' : 'actual'} vs{' '}
                            {alert.step.allottedMin} min allotted — +
                            {alert.step.overrunMin.toFixed(1)} min / +
                            {alert.step.overrunPct.toFixed(0)}%)
                          </span>
                        </div>

                        {alert.step.ccpNote && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            HACCP Control Limit: {alert.step.ccpNote}
                          </div>
                        )}

                        {alert.isAcknowledged && alert.step.correctiveAction && (
                          <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                            Corrective Action ({alert.step.acknowledgedBy || 'QA'}):{' '}
                            {alert.step.correctiveAction}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandedBatchId(alert.batch.id)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Inspect CCP Steps
                        </button>

                        {alert.batch.qaStatus !== 'Hold' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onUpdateQaStatus(alert.batch.id, 'Hold')}
                            className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            Place QA Hold
                          </button>
                        )}

                        {!alert.isAcknowledged && onUpdateBatchCcpLogs && (
                          <button
                            type="button"
                            onClick={() => {
                              setAckTargetKey(isAckEditing ? null : alert.id);
                              setAckNoteDraft('');
                            }}
                            className="rounded-md bg-[#005FB8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
                          >
                            {isAckEditing ? 'Cancel' : 'Acknowledge'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isAckEditing && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                        <input
                          type="text"
                          value={ackNoteDraft}
                          onChange={(e) => setAckNoteDraft(e.target.value)}
                          placeholder="Enter HACCP corrective action note (e.g. checked core temp & moisture aw <= 0.42)..."
                          className="min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAcknowledgeAlert(alert, false)}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Save &amp; Acknowledge</span>
                        </button>
                        {alert.batch.qaStatus !== 'Hold' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleAcknowledgeAlert(alert, true)}
                            className="inline-flex items-center gap-1 rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                          >
                            <AlertOctagon className="h-3.5 w-3.5" />
                            <span>Acknowledge &amp; QA Hold</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lot code, formula, line..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            {(['All', 'Passed', 'Pending QA', 'Hold'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setQaFilter(status)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  qaFilter === status
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCcpAlertsOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              ccpAlertsOnly
                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                : 'border-slate-300 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>CCP Overruns Only ({haccpReport.alerts.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Traceability CSV</span>
        </button>
      </div>

      {/* Production Batch Log Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="w-8 py-2.5 px-3" />
                <th className="py-2.5 px-3 font-medium">Batch Lot Code</th>
                <th className="py-2.5 px-3 font-medium">Formulation</th>
                <th className="py-2.5 px-3 font-medium">Production Line</th>
                <th className="py-2.5 px-3 text-right font-medium">Target (kg)</th>
                <th className="py-2.5 px-3 text-right font-medium">Actual (kg)</th>
                <th className="py-2.5 px-3 text-right font-medium">Variance</th>
                <th className="py-2.5 px-3 font-medium">HACCP CCP Timing</th>
                <th className="py-2.5 px-3 font-medium">Operator</th>
                <th className="py-2.5 px-3 font-medium">QA Release</th>
                <th className="py-2.5 px-3 text-right font-medium">Worker QR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-sm text-slate-500">
                    No production runs match your filter. Use Batch Scaler to log a new production run.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const isExpanded = expandedBatchId === batch.id;
                  const variance =
                    batch.targetOutputKg > 0
                      ? ((batch.actualOutputKg - batch.targetOutputKg) / batch.targetOutputKg) * 100
                      : 0;
                  const haccp = haccpReport.byBatchId.get(batch.id);

                  return (
                    <React.Fragment key={batch.id}>
                      <tr
                        onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                        className="h-11 cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-2 px-3 text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </td>
                        <td className="font-mono py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {batch.lotCode}
                          <div className="font-sans text-[11px] font-normal text-slate-500">
                            {new Date(batch.startedAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {batch.runStatus === 'Scheduled' && (
                              <>
                                {' '}
                                ·{' '}
                                <span className="font-medium text-[#005FB8] dark:text-sky-400">
                                  Scheduled
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {batch.recipeName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {batch.recipeCode} · {batch.version} · {batch.multiplier.toFixed(2)}x
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {batch.lineName}
                        </td>
                        <td className="font-mono py-2 px-3 text-right text-slate-600 tabular-nums dark:text-slate-400">
                          {batch.targetOutputKg.toFixed(1)}
                        </td>
                        <td className="font-mono py-2 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                          {batch.actualOutputKg.toFixed(1)}
                        </td>
                        <td
                          className={`font-mono py-2 px-3 text-right tabular-nums ${
                            Math.abs(variance) > 2.5
                              ? 'font-medium text-amber-700 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {variance >= 0 ? '+' : ''}
                          {variance.toFixed(2)}%
                        </td>
                        <td className="py-2 px-3">
                          {!haccp || haccp.steps.length === 0 ? (
                            <span className="text-slate-400">No CCPs</span>
                          ) : haccp.status === 'alert' ? (
                            <span className="font-mono inline-flex items-center gap-1 font-semibold text-red-700 tabular-nums dark:text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>Overrun (+{haccp.maxOverrunMin.toFixed(1)}m)</span>
                            </span>
                          ) : haccp.status === 'acknowledged' ? (
                            <span className="font-mono inline-flex items-center gap-1 font-medium text-amber-700 tabular-nums dark:text-amber-400">
                              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                              <span>Ack (+{haccp.maxOverrunMin.toFixed(1)}m)</span>
                            </span>
                          ) : haccp.status === 'running' ? (
                            <span className="font-mono inline-flex items-center gap-1 font-medium text-[#005FB8] tabular-nums dark:text-sky-400">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Running ({haccp.runningSteps[0]?.actualMin?.toFixed(1) ?? '0.0'}m /{' '}
                                {haccp.runningSteps[0]?.allottedMin}m)
                              </span>
                            </span>
                          ) : haccp.status === 'compliant' ? (
                            <span className="font-mono inline-flex items-center gap-1 text-emerald-700 tabular-nums dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>{haccp.steps.length}/{haccp.steps.length} OK</span>
                            </span>
                          ) : (
                            <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                              {haccp.steps.length} CCP pending
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {batch.operator}
                        </td>
                        <td
                          className="py-2 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {batch.qaStatus === 'Passed' && (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            )}
                            {batch.qaStatus === 'Pending QA' && (
                              <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            )}
                            {batch.qaStatus === 'Hold' && (
                              <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                            )}
                            <select
                              aria-label={`QA Status for ${batch.lotCode}`}
                              value={batch.qaStatus}
                              onChange={(e) =>
                                onUpdateQaStatus(batch.id, e.target.value as QaStatus)
                              }
                              className="rounded border border-slate-200 bg-transparent px-1.5 py-1 text-xs font-medium text-slate-800 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:text-slate-200"
                            >
                              <option value="Passed">Passed</option>
                              <option value="Pending QA">Pending QA</option>
                              <option value="Hold">Hold</option>
                            </select>
                          </div>
                        </td>
                        <td
                          className="py-2 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setQrBatch(batch)}
                            title="Generate worker-safe Batch QR code"
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            <span>QR</span>
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-950/50">
                          <td colSpan={11} className="space-y-4 px-6 py-4">
                            {/* QA & Operator Notes */}
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                QA &amp; Operator Notes
                              </div>
                              <p className="max-w-3xl text-xs text-slate-700 dark:text-slate-300">
                                {batch.notes || 'No deviation notes recorded.'}
                              </p>
                            </div>

                            {/* HACCP Critical Control Step Timings */}
                            {haccp && haccp.steps.length > 0 && (
                              <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                      HACCP Critical Control Step Timings
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                      Linked to {batch.recipeCode} HACCP process limits. Recording an actual or live duration above the allotted time triggers an automated warning.
                                    </div>
                                  </div>
                                </div>

                                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                  <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                                        <th className="py-2 px-3 font-medium">CCP Step</th>
                                        <th className="py-2 px-3 font-medium">HACCP Verification Limit</th>
                                        <th className="py-2 px-3 text-right font-medium">Allotted</th>
                                        <th className="py-2 px-3 text-right font-medium">Actual / Elapsed</th>
                                        <th className="py-2 px-3 font-medium">Timing Compliance</th>
                                        <th className="py-2 px-3 text-right font-medium">Record / Timer</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                      {haccp.steps.map((step) => {
                                        const stepKey = `${batch.id}::${step.stepId}`;
                                        const draftVal =
                                          durationDrafts[stepKey] !== undefined
                                            ? durationDrafts[stepKey]
                                            : step.actualMin !== null && !step.isRunning
                                            ? String(step.actualMin)
                                            : '';
                                        const isBusy = savingKey === stepKey;
                                        return (
                                          <tr key={step.stepId}>
                                            <td className="py-2.5 px-3">
                                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                                Step {step.stepNumber} — {step.title}
                                              </div>
                                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                {step.stage} · {step.equipment}
                                              </div>
                                            </td>
                                            <td className="max-w-xs py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-300">
                                              {step.ccpNote || 'Verify CCP parameters per SOP.'}
                                            </td>
                                            <td className="font-mono py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                                              {step.allottedMin} min
                                            </td>
                                            <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                                              {step.isRunning ? (
                                                <span className="font-semibold text-[#005FB8] dark:text-sky-400">
                                                  {step.actualMin?.toFixed(2)} min (live)
                                                </span>
                                              ) : step.actualMin !== null ? (
                                                <span
                                                  className={
                                                    step.isOverrun
                                                      ? 'font-semibold text-red-700 dark:text-red-400'
                                                      : 'font-semibold text-slate-900 dark:text-slate-100'
                                                  }
                                                >
                                                  {step.actualMin.toFixed(1)} min
                                                </span>
                                              ) : (
                                                <span className="text-slate-400">Not recorded</span>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-3">
                                              {step.isOverrun ? (
                                                <div>
                                                  <div className="font-mono inline-flex items-center gap-1 font-semibold text-red-700 tabular-nums dark:text-red-400">
                                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                    <span>
                                                      +{step.overrunMin.toFixed(1)} min (+
                                                      {step.overrunPct.toFixed(0)}%)
                                                    </span>
                                                  </div>
                                                  {step.acknowledgedAt && (
                                                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                                      Acknowledged{step.correctiveAction ? `: ${step.correctiveAction}` : ''}
                                                    </div>
                                                  )}
                                                </div>
                                              ) : step.isRunning ? (
                                                <span className="inline-flex items-center gap-1 text-[#005FB8] dark:text-sky-400">
                                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                                  <span>Timer active</span>
                                                </span>
                                              ) : step.actualMin !== null ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                  <span>Within Limit</span>
                                                </span>
                                              ) : (
                                                <span className="text-slate-400">Pending</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                              {onUpdateBatchCcpLogs && (
                                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                                  {step.isRunning ? (
                                                    <button
                                                      type="button"
                                                      disabled={isBusy}
                                                      onClick={() =>
                                                        void handleStopStepTimer(batch, step)
                                                      }
                                                      className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 whitespace-nowrap dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                                                    >
                                                      <Square className="h-3 w-3" />
                                                      <span>Stop &amp; Save</span>
                                                    </button>
                                                  ) : (
                                                    <>
                                                      <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        aria-label={`Actual minutes for Step ${step.stepNumber}`}
                                                        placeholder="min"
                                                        value={draftVal}
                                                        onChange={(e) =>
                                                          setDurationDrafts((prev) => ({
                                                            ...prev,
                                                            [stepKey]: e.target.value,
                                                          }))
                                                        }
                                                        className="font-mono w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right text-[11px] text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                      />
                                                      <button
                                                        type="button"
                                                        disabled={isBusy || draftVal === ''}
                                                        onClick={() =>
                                                          void handleSaveActualMin(
                                                            batch,
                                                            step,
                                                            draftVal
                                                          )
                                                        }
                                                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] disabled:opacity-40 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                      >
                                                        Save
                                                      </button>
                                                      <button
                                                        type="button"
                                                        disabled={isBusy}
                                                        onClick={() =>
                                                          void handleStartStepTimer(batch, step)
                                                        }
                                                        title="Start live CCP step timer"
                                                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                      >
                                                        <Play className="h-3 w-3" />
                                                        <span>Timer</span>
                                                      </button>
                                                    </>
                                                  )}
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Consumed Raw Material Lots */}
                            {batch.consumedLots.length > 0 && (
                              <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Consumed Raw Material Lots
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {batch.consumedLots.map((lot, idx) => (
                                    <div
                                      key={`${lot.ingredientSku}-${idx}`}
                                      className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                                    >
                                      <div className="min-w-0 pr-2">
                                        <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                                          {lot.ingredientName}
                                        </div>
                                        <div className="font-mono text-[11px] text-slate-500">
                                          {lot.ingredientSku} · Lot {lot.lotNumber || 'N/A'}
                                        </div>
                                      </div>
                                      <div className="font-mono shrink-0 font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                                        {lot.requiredKg.toFixed(2)} kg
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BatchQrModal
        open={Boolean(qrBatch)}
        batchId={qrBatch?.id}
        payload={
          qrBatch
            ? buildWorkerSheetFromBatch(
                qrBatch,
                factoryName,
                plantCode,
                recipes.find((r) => r.id === qrBatch.recipeId) || null,
                ingredients
              )
            : null
        }
        onClose={() => setQrBatch(null)}
      />
    </div>
  );
};
