import React, { useEffect, useState } from 'react';
import {
  Printer,
  CheckCircle2,
  Clock,
  AlertOctagon,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Thermometer,
  Gauge,
} from 'lucide-react';
import type { WorkerBatchSheetPayload } from '../types/factory';
import { factoryApi } from '../utils/api';
import { decodeWorkerSheetData } from '../utils/workerSheet';

interface WorkerBatchSheetViewProps {
  workerSheetId?: string | null;
  workerSheetDataToken?: string | null;
  previewPayload?: WorkerBatchSheetPayload | null;
  onClosePreview?: () => void;
}

export const WorkerBatchSheetView: React.FC<WorkerBatchSheetViewProps> = ({
  workerSheetId,
  workerSheetDataToken,
  previewPayload,
  onClosePreview,
}) => {
  const [payload, setPayload] = useState<WorkerBatchSheetPayload | null>(
    previewPayload || null
  );
  const [loading, setLoading] = useState<boolean>(!previewPayload);
  const [error, setError] = useState<string | null>(null);
  const [checkedSeqs, setCheckedSeqs] = useState<Record<number, boolean>>({});
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (previewPayload) {
      setPayload(previewPayload);
      setLoading(false);
      setError(null);
      return;
    }

    if (workerSheetDataToken) {
      const decoded = decodeWorkerSheetData(workerSheetDataToken);
      if (decoded) {
        setPayload(decoded);
        setError(null);
      } else {
        setError('Invalid or corrupted batch sheet QR token.');
      }
      setLoading(false);
      return;
    }

    if (workerSheetId) {
      let cancelled = false;
      setLoading(true);
      setError(null);
      factoryApi
        .getWorkerBatchSheet(workerSheetId)
        .then((res) => {
          if (!cancelled) {
            setPayload(res);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : 'Unable to load worker batch sheet.'
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    setLoading(false);
    setError('No batch sheet reference provided.');
  }, [previewPayload, workerSheetDataToken, workerSheetId]);

  const toggleChecked = (seq: number) => {
    setCheckedSeqs((prev) => ({ ...prev, [seq]: !prev[seq] }));
  };

  const toggleStepChecked = (stepNumber: number) => {
    setCheckedSteps((prev) => ({ ...prev, [stepNumber]: !prev[stepNumber] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F5F8] p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F5F8] p-6 dark:bg-slate-950">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Batch Sheet Unavailable
          </h1>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            {error || 'The requested worker batch sheet could not be found.'}
          </p>
          {onClosePreview && (
            <button
              type="button"
              onClick={onClosePreview}
              className="mt-4 rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white"
            >
              Back to Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  const weighedCount = payload.items.filter((i) => checkedSeqs[i.seq]).length;
  const makingSteps = payload.makingSteps || [];
  const stepsDoneCount = makingSteps.filter((s) => checkedSteps[s.stepNumber]).length;

  return (
    <div className="min-h-screen bg-[#F3F5F8] px-4 py-6 text-slate-900 sm:px-6 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Top Action / Context Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              Worker-Safe Floor View · Costs, internal suppliers, and recipe formulas redacted
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onClosePreview && (
              <button
                type="button"
                onClick={onClosePreview}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Close Preview</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] dark:bg-sky-600"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* Batch Sheet Header */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {payload.factoryName} · {payload.plantCode}
              </div>
              <h1 className="font-display mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                Batch Weigh &amp; Making Sheet —{' '}
                <span className="font-mono">{payload.lotCode}</span>
              </h1>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Line: {payload.lineName} · Lead Operator: {payload.operator} ·{' '}
                {new Date(payload.startedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-medium">
              {payload.qaStatus === 'Passed' && (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>QA Passed</span>
                </span>
              )}
              {payload.qaStatus === 'Pending QA' && (
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>Pending QA</span>
                </span>
              )}
              {payload.qaStatus === 'Hold' && (
                <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-400">
                  <AlertOctagon className="h-4 w-4 shrink-0" />
                  <span>QA Hold</span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Batch Lot Code</div>
              <div className="font-mono mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {payload.lotCode}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Total Weigh Mass</div>
              <div className="font-mono mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {payload.totalWeighKg.toFixed(2)} kg
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Ingredients Weighed</div>
              <div className="font-mono mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {weighedCount} / {payload.itemCount} items
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Making Chart Steps</div>
              <div className="font-mono mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {makingSteps.length > 0
                  ? `${stepsDoneCount} / ${makingSteps.length} steps`
                  : 'Checklist only'}
              </div>
            </div>
          </div>
        </div>

        {/* Part 1: Material Pick & Weigh Table */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Part 1 — Material Pick &amp; Weigh Checklist
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Weigh each material first and tap a row to mark it ready before starting Part 2.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium">#</th>
                  <th className="py-2.5 px-3 font-medium">SKU</th>
                  <th className="py-2.5 px-3 font-medium">Raw Material</th>
                  <th className="py-2.5 px-3 text-right font-medium">Required (kg)</th>
                  <th className="py-2.5 px-3 font-medium">Raw Material Lot #</th>
                  <th className="py-2.5 px-4 text-center font-medium">Weighed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payload.items.map((item) => {
                  const done = Boolean(checkedSeqs[item.seq]);
                  return (
                    <tr
                      key={`${item.seq}-${item.sku}`}
                      onClick={() => toggleChecked(item.seq)}
                      className={`cursor-pointer transition-colors ${
                        done
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="font-mono py-2.5 px-4 text-slate-500 tabular-nums">
                        {item.seq}
                      </td>
                      <td className="font-mono py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                        {item.sku}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                        {item.materialName}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {item.requiredKg.toFixed(3)}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {item.lotNumber || 'UNASSIGNED'}
                      </td>
                      <td
                        className="py-2.5 px-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleChecked(item.seq)}
                          aria-label={`Mark ${item.materialName} weighed`}
                          className="h-4 w-4 accent-[#005FB8]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Part 2: Beginner-Friendly Simple Making Chart */}
        {makingSteps.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Part 2 — Simple Making Chart (Step-by-Step Guide)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Follow Steps 1 to {makingSteps.length} in exact order. Tap any step once completed.
              </p>

              {/* Visual Step Flow Overview */}
              <div className="mt-3 flex flex-wrap items-stretch gap-2">
                {makingSteps.map((step, idx) => {
                  const stepDone = Boolean(checkedSteps[step.stepNumber]);
                  return (
                    <React.Fragment key={step.stepNumber}>
                      <div
                        className={`min-w-[155px] flex-1 rounded-md border px-3 py-2 text-xs ${
                          stepDone
                            ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                            : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50'
                        }`}
                      >
                        <div className="font-mono text-[11px] font-semibold text-[#005FB8] dark:text-sky-400">
                          Step {step.stepNumber} · {step.durationMin} min ·{' '}
                          {step.targetTempC !== null ? `${step.targetTempC}°C` : 'Room Temp'}
                        </div>
                        <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                          {step.actionTitle}
                        </div>
                      </div>
                      {idx < makingSteps.length - 1 && (
                        <div className="hidden items-center text-slate-400 sm:flex">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {makingSteps.map((step) => {
                const done = Boolean(checkedSteps[step.stepNumber]);
                return (
                  <div
                    key={step.stepNumber}
                    onClick={() => toggleStepChecked(step.stepNumber)}
                    className={`cursor-pointer p-5 transition-colors ${
                      done
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`font-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${
                            done
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-[#005FB8] bg-sky-50 text-[#005FB8] dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-300'
                          }`}
                        >
                          {step.stepNumber}
                        </div>
                        <div>
                          <div className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {step.actionTitle}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                            Machine: <strong className="text-slate-800 dark:text-slate-200">{step.equipment}</strong>
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggleStepChecked(step.stepNumber)}
                            aria-label={`Mark step ${step.stepNumber} complete`}
                            className="h-4 w-4 accent-[#005FB8]"
                          />
                          <span>{done ? 'Step Done' : 'Mark Done'}</span>
                        </label>
                      </div>
                    </div>

                    {/* Clear 3-metric Machine Settings Strip */}
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-3 dark:border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-[#005FB8] dark:text-sky-400" />
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Run Time</div>
                          <div className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                            {step.durationMin} minutes
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Thermometer className="h-3.5 w-3.5 shrink-0 text-[#005FB8] dark:text-sky-400" />
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Target Temp</div>
                          <div className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                            {step.targetTempC !== null ? `${step.targetTempC} °C` : 'Room Temp'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Gauge className="h-3.5 w-3.5 shrink-0 text-[#005FB8] dark:text-sky-400" />
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Speed / Setting</div>
                          <div className="font-mono truncate font-semibold text-slate-900 dark:text-slate-100">
                            {step.speedOrSetting || 'Standard'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Ingredients to Add in This Step & Quality Check */}
                    <div className="mt-3 grid grid-cols-1 gap-4 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2 dark:border-slate-800/80">
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-300">
                          Add These Weighed Bags
                        </div>
                        {step.addMaterials.length > 0 ? (
                          <ul className="mt-1.5 space-y-1">
                            {step.addMaterials.map((mat, idx) => (
                              <li
                                key={idx}
                                className="flex items-center justify-between gap-2 text-slate-800 dark:text-slate-200"
                              >
                                <span className="truncate">• {mat.materialName}</span>
                                <span className="font-mono shrink-0 font-semibold tabular-nums">
                                  {mat.requiredKg.toFixed(3)} kg
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-slate-500 dark:text-slate-400">
                            No new ingredients — transfer mix from previous step.
                          </p>
                        )}
                      </div>

                      <div
                        className={`rounded-md px-3 py-2 ${
                          step.isCcp
                            ? 'bg-amber-50/70 dark:bg-amber-950/30'
                            : 'bg-slate-50/80 dark:bg-slate-950/40'
                        }`}
                      >
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {step.isCcp ? 'CRITICAL CHECK (Verify Before Next Step)' : 'Quality Check'}
                        </div>
                        <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
                          {step.checkNote || 'Confirm smooth, uniform texture and clean equipment.'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {payload.notes && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="font-medium text-slate-700 dark:text-slate-300">Shift &amp; QA Notes</div>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{payload.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
};
