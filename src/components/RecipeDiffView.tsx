import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowLeftRight,
  Plus,
  Minus,
  Edit3,
  Check,
  ShieldAlert,
} from 'lucide-react';
import type { BomLine, Ingredient, ProcessStep, Recipe } from '../types/factory';
import { calculateRecipeMetrics, formatCurrency } from '../utils/calculations';

interface VersionSnapshot {
  key: string;
  label: string;
  version: string;
  date: string;
  author: string;
  notes: string;
  yieldPct: number;
  bom: BomLine[];
  steps: ProcessStep[];
  hasFullSnapshot: boolean;
}

interface RecipeDiffViewProps {
  draft: Recipe;
  savedRecipe: Recipe | null;
  isDirty: boolean;
  ingredients: Ingredient[];
  initialBaselineKey?: string | null;
}

export const RecipeDiffView: React.FC<RecipeDiffViewProps> = ({
  draft,
  savedRecipe,
  isDirty,
  ingredients,
  initialBaselineKey,
}) => {
  const ingMap = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  const versions = useMemo<VersionSnapshot[]>(() => {
    const list: VersionSnapshot[] = [];

    if (isDirty && savedRecipe) {
      list.push({
        key: '__draft__',
        label: `Working Draft (${draft.version} · Unsaved)`,
        version: `${draft.version}*`,
        date: 'Unsaved',
        author: 'Current Session',
        notes: 'Live unsaved formulation edits',
        yieldPct: draft.yieldPct,
        bom: draft.bom,
        steps: draft.steps,
        hasFullSnapshot: true,
      });
    }

    // Current saved active version (in case revisions[0] differs or is empty)
    const activeRev = draft.revisions[0];
    const currentBase = savedRecipe || draft;
    if (!activeRev || activeRev.version !== currentBase.version || !activeRev.bomSnapshot) {
      list.push({
        key: '__saved__',
        label: `${currentBase.version} (Current Saved)`,
        version: currentBase.version,
        date: currentBase.updatedAt.slice(0, 10),
        author: activeRev?.author || 'Plant Engineering',
        notes: activeRev?.notes || 'Current saved formulation',
        yieldPct: currentBase.yieldPct,
        bom: currentBase.bom,
        steps: currentBase.steps,
        hasFullSnapshot: true,
      });
    }

    for (const rev of draft.revisions) {
      const key = `rev:${rev.version}:${rev.date}`;
      const isCurrentAndMissing =
        rev.version === currentBase.version && !rev.bomSnapshot;
      list.push({
        key,
        label: `${rev.version} (${rev.date})`,
        version: rev.version,
        date: rev.date,
        author: rev.author,
        notes: rev.notes,
        yieldPct: rev.yieldPctSnapshot ?? currentBase.yieldPct,
        bom: rev.bomSnapshot ?? (isCurrentAndMissing ? currentBase.bom : []),
        steps: rev.stepsSnapshot ?? (isCurrentAndMissing ? currentBase.steps : []),
        hasFullSnapshot: Boolean(rev.bomSnapshot || isCurrentAndMissing),
      });
    }

    return list;
  }, [draft, savedRecipe, isDirty]);

  const [versionAKey, setVersionAKey] = useState<string>('');
  const [versionBKey, setVersionBKey] = useState<string>('');
  const [onlyChanged, setOnlyChanged] = useState(false);

  // Pick sensible defaults when recipe or initialBaselineKey changes
  useEffect(() => {
    if (versions.length === 0) return;
    if (initialBaselineKey && versions.some((v) => v.key === initialBaselineKey)) {
      setVersionAKey(initialBaselineKey);
      setVersionBKey(versions[0].key);
      return;
    }
    if (versions.length >= 2) {
      setVersionBKey(versions[0].key);
      setVersionAKey(versions[1].key);
    } else {
      setVersionAKey(versions[0].key);
      setVersionBKey(versions[0].key);
    }
  }, [draft.id, initialBaselineKey, versions.length]);

  const snapshotA = useMemo(
    () => versions.find((v) => v.key === versionAKey) || versions[1] || versions[0],
    [versions, versionAKey]
  );
  const snapshotB = useMemo(
    () => versions.find((v) => v.key === versionBKey) || versions[0],
    [versions, versionBKey]
  );

  const metricsA = useMemo(() => {
    if (!snapshotA) return null;
    return calculateRecipeMetrics(
      { ...draft, yieldPct: snapshotA.yieldPct, bom: snapshotA.bom, steps: snapshotA.steps },
      ingredients
    );
  }, [snapshotA, draft, ingredients]);

  const metricsB = useMemo(() => {
    if (!snapshotB) return null;
    return calculateRecipeMetrics(
      { ...draft, yieldPct: snapshotB.yieldPct, bom: snapshotB.bom, steps: snapshotB.steps },
      ingredients
    );
  }, [snapshotB, draft, ingredients]);

  // Align BOM rows by ingredientId (preserving order)
  const bomDiffRows = useMemo(() => {
    if (!snapshotA || !snapshotB || !metricsA || !metricsB) return [];

    // Aggregate quantities per ingredientId in case an ingredient appears once (standard)
    const mapA = new Map<string, { qty: number; pct: number; cost: number; stages: string[] }>();
    for (const r of metricsA.bomRows) {
      const existing = mapA.get(r.line.ingredientId);
      if (existing) {
        existing.qty += r.line.quantityKg;
        existing.pct += r.formulaPct;
        existing.cost += r.lineCost;
        if (!existing.stages.includes(r.line.stage)) existing.stages.push(r.line.stage);
      } else {
        mapA.set(r.line.ingredientId, {
          qty: r.line.quantityKg,
          pct: r.formulaPct,
          cost: r.lineCost,
          stages: [r.line.stage],
        });
      }
    }

    const mapB = new Map<string, { qty: number; pct: number; cost: number; stages: string[] }>();
    for (const r of metricsB.bomRows) {
      const existing = mapB.get(r.line.ingredientId);
      if (existing) {
        existing.qty += r.line.quantityKg;
        existing.pct += r.formulaPct;
        existing.cost += r.lineCost;
        if (!existing.stages.includes(r.line.stage)) existing.stages.push(r.line.stage);
      } else {
        mapB.set(r.line.ingredientId, {
          qty: r.line.quantityKg,
          pct: r.formulaPct,
          cost: r.lineCost,
          stages: [r.line.stage],
        });
      }
    }

    const orderedIds: string[] = [];
    for (const r of metricsB.bomRows) {
      if (!orderedIds.includes(r.line.ingredientId)) orderedIds.push(r.line.ingredientId);
    }
    for (const r of metricsA.bomRows) {
      if (!orderedIds.includes(r.line.ingredientId)) orderedIds.push(r.line.ingredientId);
    }

    return orderedIds.map((id) => {
      const a = mapA.get(id);
      const b = mapB.get(id);
      const ing = ingMap.get(id);

      const qtyA = a?.qty ?? 0;
      const qtyB = b?.qty ?? 0;
      const pctA = a?.pct ?? 0;
      const pctB = b?.pct ?? 0;
      const costA = a?.cost ?? 0;
      const costB = b?.cost ?? 0;
      const stageA = a?.stages.join(', ') || '—';
      const stageB = b?.stages.join(', ') || '—';

      let status: 'added' | 'removed' | 'modified' | 'unchanged' = 'unchanged';
      if (!a && b) status = 'added';
      else if (a && !b) status = 'removed';
      else if (
        Math.abs(qtyB - qtyA) > 0.005 ||
        Math.abs(pctB - pctA) > 0.05 ||
        stageA !== stageB
      ) {
        status = 'modified';
      }

      return {
        ingredientId: id,
        sku: ing?.sku || '—',
        name: ing?.name || 'Unknown Material',
        status,
        qtyA,
        qtyB,
        pctA,
        pctB,
        pctDelta: pctB - pctA,
        qtyDelta: qtyB - qtyA,
        costA,
        costB,
        costDelta: costB - costA,
        stageA,
        stageB,
      };
    });
  }, [snapshotA, snapshotB, metricsA, metricsB, ingMap]);

  // Align Process Steps by stepNumber
  const stepDiffs = useMemo(() => {
    if (!snapshotA || !snapshotB) return [];
    const maxLen = Math.max(snapshotA.steps.length, snapshotB.steps.length);
    const items: {
      stepNumber: number;
      status: 'added' | 'removed' | 'modified' | 'unchanged';
      stepA?: ProcessStep;
      stepB?: ProcessStep;
      changes: { field: string; from: string; to: string }[];
    }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const stepA = snapshotA.steps[i];
      const stepB = snapshotB.steps[i];
      const stepNumber = stepB?.stepNumber || stepA?.stepNumber || i + 1;

      if (!stepA && stepB) {
        items.push({ stepNumber, status: 'added', stepB, changes: [] });
        continue;
      }
      if (stepA && !stepB) {
        items.push({ stepNumber, status: 'removed', stepA, changes: [] });
        continue;
      }
      if (stepA && stepB) {
        const changes: { field: string; from: string; to: string }[] = [];
        if (stepA.title !== stepB.title) {
          changes.push({ field: 'Operation', from: stepA.title, to: stepB.title });
        }
        if (stepA.stage !== stepB.stage) {
          changes.push({ field: 'Stage', from: stepA.stage, to: stepB.stage });
        }
        if (stepA.equipment !== stepB.equipment) {
          changes.push({ field: 'Equipment', from: stepA.equipment, to: stepB.equipment });
        }
        if (stepA.targetTempC !== stepB.targetTempC) {
          changes.push({
            field: 'Target Temp',
            from: stepA.targetTempC !== null ? `${stepA.targetTempC}°C` : 'Ambient',
            to: stepB.targetTempC !== null ? `${stepB.targetTempC}°C` : 'Ambient',
          });
        }
        if (stepA.durationMin !== stepB.durationMin) {
          changes.push({
            field: 'Duration',
            from: `${stepA.durationMin} min`,
            to: `${stepB.durationMin} min`,
          });
        }
        if (stepA.speedOrSetting !== stepB.speedOrSetting) {
          changes.push({
            field: 'Speed / Setting',
            from: stepA.speedOrSetting,
            to: stepB.speedOrSetting,
          });
        }
        if (stepA.isCcp !== stepB.isCcp) {
          changes.push({
            field: 'HACCP CCP',
            from: stepA.isCcp ? 'Critical Control Point' : 'Standard Step',
            to: stepB.isCcp ? 'Critical Control Point' : 'Standard Step',
          });
        }
        if (stepA.ccpNote !== stepB.ccpNote) {
          changes.push({
            field: 'Verification Note',
            from: stepA.ccpNote || '—',
            to: stepB.ccpNote || '—',
          });
        }

        items.push({
          stepNumber,
          status: changes.length > 0 ? 'modified' : 'unchanged',
          stepA,
          stepB,
          changes,
        });
      }
    }

    return items;
  }, [snapshotA, snapshotB]);

  const visibleBomDiffs = useMemo(
    () => (onlyChanged ? bomDiffRows.filter((r) => r.status !== 'unchanged') : bomDiffRows),
    [bomDiffRows, onlyChanged]
  );

  const visibleStepDiffs = useMemo(
    () => (onlyChanged ? stepDiffs.filter((s) => s.status !== 'unchanged') : stepDiffs),
    [stepDiffs, onlyChanged]
  );

  const bomChangeCount = bomDiffRows.filter((r) => r.status !== 'unchanged').length;
  const stepChangeCount = stepDiffs.filter((s) => s.status !== 'unchanged').length;

  if (!snapshotA || !snapshotB || !metricsA || !metricsB) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Save at least one revision to compare historical snapshots.
      </div>
    );
  }

  const batchCostDiff = metricsB.totalBatchCost - metricsA.totalBatchCost;
  const costPerKgDiff = metricsB.costPerOutputKg - metricsA.costPerOutputKg;

  return (
    <div className="space-y-4">
      {/* Version Selector Bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 items-end gap-3 sm:grid-cols-11">
            <div className="sm:col-span-5">
              <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Baseline (Version A)
              </label>
              <select
                value={snapshotA.key}
                onChange={(e) => setVersionAKey(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {versions.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center sm:col-span-1">
              <button
                type="button"
                title="Swap Baseline and Target versions"
                onClick={() => {
                  const prevA = snapshotA.key;
                  const prevB = snapshotB.key;
                  setVersionAKey(prevB);
                  setVersionBKey(prevA);
                }}
                className="rounded-md border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="sm:col-span-5">
              <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Compare Target (Version B)
              </label>
              <select
                value={snapshotB.key}
                onChange={(e) => setVersionBKey(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {versions.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              className="accent-[#005FB8]"
            />
            <span>Show Only Differences</span>
          </label>
        </div>

        {(!snapshotA.hasFullSnapshot || !snapshotB.hasFullSnapshot) && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            One of the selected legacy revisions does not contain a full BOM snapshot. Commit new revisions via "Save Revision" to capture complete line-by-line snapshots.
          </div>
        )}

        {/* 4-Column Version Comparison Summary */}
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Batch Cost Impact</div>
            <div className="font-mono mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              <span>{formatCurrency(metricsA.totalBatchCost)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <span>{formatCurrency(metricsB.totalBatchCost)}</span>
            </div>
            <div
              className={`font-mono mt-0.5 text-[11px] font-medium tabular-nums ${
                Math.abs(batchCostDiff) < 0.01
                  ? 'text-slate-500'
                  : batchCostDiff > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {batchCostDiff >= 0 ? '+' : ''}
              {formatCurrency(batchCostDiff)} per batch
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Finished Cost / kg</div>
            <div className="font-mono mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              <span>{formatCurrency(metricsA.costPerOutputKg)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <span>{formatCurrency(metricsB.costPerOutputKg)}</span>
            </div>
            <div
              className={`font-mono mt-0.5 text-[11px] font-medium tabular-nums ${
                Math.abs(costPerKgDiff) < 0.01
                  ? 'text-slate-500'
                  : costPerKgDiff > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {costPerKgDiff >= 0 ? '+' : ''}
              {formatCurrency(costPerKgDiff)}/kg finished
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Yield & Batch Output</div>
            <div className="font-mono mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              <span>{metricsA.expectedOutputKg.toFixed(1)} kg</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <span>{metricsB.expectedOutputKg.toFixed(1)} kg</span>
            </div>
            <div className="font-mono mt-0.5 text-[11px] text-slate-500 tabular-nums">
              Yield: {snapshotA.yieldPct}% → {snapshotB.yieldPct}%
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Detected Differences</div>
            <div className="font-mono mt-0.5 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {bomChangeCount} ingredient · {stepChangeCount} process
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500">
              {snapshotB.notes}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Ingredient & Ratio Diff Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ingredient & Formula Ratio Diff ({snapshotA.version} vs {snapshotB.version})
          </h3>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {bomChangeCount} change{bomChangeCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium">SKU & Ingredient</th>
                <th className="py-2.5 px-3 text-right font-medium">{snapshotA.version} Qty / %</th>
                <th className="py-2.5 px-3 text-right font-medium">{snapshotB.version} Qty / %</th>
                <th className="py-2.5 px-3 text-right font-medium">Ratio Shift</th>
                <th className="py-2.5 px-3 text-right font-medium">Cost Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleBomDiffs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    {onlyChanged
                      ? 'No ingredient or ratio differences between these two versions.'
                      : 'No ingredients recorded.'}
                  </td>
                </tr>
              ) : (
                visibleBomDiffs.map((row) => {
                  const rowBg =
                    row.status === 'added'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/25'
                      : row.status === 'removed'
                      ? 'bg-red-50/70 dark:bg-red-950/25'
                      : row.status === 'modified'
                      ? 'bg-amber-50/60 dark:bg-amber-950/20'
                      : '';
                  return (
                    <tr key={row.ingredientId} className={rowBg}>
                      <td className="py-2.5 px-3">
                        {row.status === 'added' && (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <Plus className="h-3.5 w-3.5" />
                            <span>Added</span>
                          </span>
                        )}
                        {row.status === 'removed' && (
                          <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                            <Minus className="h-3.5 w-3.5" />
                            <span>Removed</span>
                          </span>
                        )}
                        {row.status === 'modified' && (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Adjusted</span>
                          </span>
                        )}
                        {row.status === 'unchanged' && (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <Check className="h-3.5 w-3.5" />
                            <span>Unchanged</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono mr-2 text-slate-500">{row.sku}</span>
                          <span className={row.status === 'removed' ? 'line-through opacity-75' : ''}>
                            {row.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {row.stageA === row.stageB
                            ? row.stageB
                            : `${row.stageA} → ${row.stageB}`}
                        </div>
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-600 tabular-nums dark:text-slate-400">
                        {row.status === 'added' ? (
                          '—'
                        ) : (
                          <>
                            <div>{row.qtyA.toFixed(2)} kg</div>
                            <div className="text-[11px]">{row.pctA.toFixed(2)}%</div>
                          </>
                        )}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {row.status === 'removed' ? (
                          '—'
                        ) : (
                          <>
                            <div>{row.qtyB.toFixed(2)} kg</div>
                            <div className="text-[11px] text-slate-500">{row.pctB.toFixed(2)}%</div>
                          </>
                        )}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                        {Math.abs(row.pctDelta) < 0.01 && Math.abs(row.qtyDelta) < 0.01 ? (
                          <span className="text-slate-400">0.00%</span>
                        ) : (
                          <div
                            className={`font-medium ${
                              row.pctDelta > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            <div>
                              {row.pctDelta > 0 ? '+' : ''}
                              {row.pctDelta.toFixed(2)}%
                            </div>
                            <div className="text-[11px] font-normal">
                              ({row.qtyDelta > 0 ? '+' : ''}
                              {row.qtyDelta.toFixed(2)} kg)
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                        {Math.abs(row.costDelta) < 0.01 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`font-medium ${
                              row.costDelta > 0
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {row.costDelta > 0 ? '+' : ''}
                            {formatCurrency(row.costDelta)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Process & HACCP Step Diff */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Process & HACCP Step Diff ({snapshotA.version} vs {snapshotB.version})
          </h3>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {stepChangeCount} change{stepChangeCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleStepDiffs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {onlyChanged
                ? 'No process or CCP parameter differences between these two versions.'
                : 'No process steps recorded.'}
            </div>
          ) : (
            visibleStepDiffs.map((item) => {
              const title = item.stepB?.title || item.stepA?.title || `Step ${item.stepNumber}`;
              const bgClass =
                item.status === 'added'
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                  : item.status === 'removed'
                  ? 'bg-red-50/50 dark:bg-red-950/20'
                  : item.status === 'modified'
                  ? 'bg-amber-50/40 dark:bg-amber-950/15'
                  : '';

              return (
                <div key={`step-diff-${item.stepNumber}`} className={`p-4 text-xs ${bgClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono flex h-5 w-5 items-center justify-center rounded bg-slate-200/80 text-[11px] font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        {item.stepNumber}
                      </span>
                      <span
                        className={`font-display text-sm font-semibold text-slate-900 dark:text-slate-100 ${
                          item.status === 'removed' ? 'line-through opacity-75' : ''
                        }`}
                      >
                        {title}
                      </span>
                      {(item.stepB?.isCcp || item.stepA?.isCcp) && (
                        <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>CCP</span>
                        </span>
                      )}
                    </div>

                    <div>
                      {item.status === 'added' && (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          Added Step
                        </span>
                      )}
                      {item.status === 'removed' && (
                        <span className="font-medium text-red-700 dark:text-red-400">
                          Removed Step
                        </span>
                      )}
                      {item.status === 'modified' && (
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {item.changes.length} parameter change{item.changes.length === 1 ? '' : 's'}
                        </span>
                      )}
                      {item.status === 'unchanged' && (
                        <span className="text-slate-500 dark:text-slate-400">Unchanged</span>
                      )}
                    </div>
                  </div>

                  {item.status === 'added' && item.stepB && (
                    <div className="mt-2 text-slate-700 dark:text-slate-300">
                      {item.stepB.stage} · {item.stepB.equipment} ·{' '}
                      <span className="font-mono">
                        {item.stepB.targetTempC !== null ? `${item.stepB.targetTempC}°C` : 'Ambient'} ·{' '}
                        {item.stepB.durationMin} min
                      </span>{' '}
                      · {item.stepB.ccpNote}
                    </div>
                  )}

                  {item.status === 'removed' && item.stepA && (
                    <div className="mt-2 text-slate-600 line-through dark:text-slate-400">
                      {item.stepA.stage} · {item.stepA.equipment} ·{' '}
                      <span className="font-mono">
                        {item.stepA.targetTempC !== null ? `${item.stepA.targetTempC}°C` : 'Ambient'} ·{' '}
                        {item.stepA.durationMin} min
                      </span>
                    </div>
                  )}

                  {item.status === 'modified' && (
                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {item.changes.map((c) => (
                        <div
                          key={c.field}
                          className="rounded border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
                        >
                          <div className="text-[11px] font-medium text-slate-500">{c.field}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-red-700 line-through dark:text-red-400">
                              {c.from}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              {c.to}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
