import React, { useEffect, useMemo, useState } from 'react';
import {
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  QrCode,
} from 'lucide-react';
import type { Ingredient, PlantMachine, ProductionBatch, Recipe } from '../types/factory';
import {
  calculateRecipeMetrics,
  downloadCsv,
  formatCurrency,
  scaleRecipe,
  type ScaleMode,
  type ScaledBatchResult,
} from '../utils/calculations';
import { buildWorkerSheetFromScaled } from '../utils/workerSheet';
import { BatchQrModal } from './BatchQrModal';

interface BatchScalerViewProps {
  factoryName: string;
  plantCode: string;
  recipes: Recipe[];
  ingredients: Ingredient[];
  batches: ProductionBatch[];
  machines?: PlantMachine[];
  selectedRecipeId: string | null;
  onSelectRecipeId: (id: string) => void;
  onScaledChange: (
    recipe: Recipe | null,
    scaled: ScaledBatchResult | null,
    lotNumbers: Record<string, string>,
    plannedLotCode: string,
    lineName: string,
    operator: string
  ) => void;
  onPrintBatchSheet: () => void;
  onLogProductionBatch: (batch: ProductionBatch) => Promise<void>;
  onNavigateToBatches: () => void;
}

export const BatchScalerView: React.FC<BatchScalerViewProps> = ({
  factoryName,
  plantCode,
  recipes,
  ingredients,
  batches,
  machines = [],
  selectedRecipeId,
  onSelectRecipeId,
  onScaledChange,
  onPrintBatchSheet,
  onLogProductionBatch,
  onNavigateToBatches,
}) => {
  const activeRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || recipes[0] || null,
    [recipes, selectedRecipeId]
  );

  const baseMetrics = useMemo(
    () => (activeRecipe ? calculateRecipeMetrics(activeRecipe, ingredients) : null),
    [activeRecipe, ingredients]
  );

  const derivedLineName = useMemo(() => {
    if (activeRecipe && activeRecipe.steps.length > 0) {
      const names = activeRecipe.steps
        .slice()
        .sort((a, b) => a.stepNumber - b.stepNumber)
        .map((s) =>
          s.equipment === 'Horizontal Flow Wrap Packing Machine' ? 'Flow Wrap' : s.equipment
        );
      return `Main Line · ${names.join(' → ')}`;
    }
    if (machines.length > 0) {
      return `Main Line · ${machines
        .map((m) => (m.name === 'Horizontal Flow Wrap Packing Machine' ? 'Flow Wrap' : m.name))
        .join(' → ')}`;
    }
    return 'Main Line · Pulverizer → Planetary Mixer → Cookie Dropper → Rotary Oven → Flow Wrap';
  }, [activeRecipe, machines]);

  const [mode, setMode] = useState<ScaleMode>('outputKg');
  const [targetValue, setTargetValue] = useState<number>(1000);
  const [lotNumbers, setLotNumbers] = useState<Record<string, string>>({});
  const [lineName, setLineName] = useState(derivedLineName);
  const [operator, setOperator] = useState('K. Raghavan');
  const [batchNotes, setBatchNotes] = useState('');
  const [plannedLotCode, setPlannedLotCode] = useState(() => {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `LOT-${d}-01`;
  });
  const [logging, setLogging] = useState(false);
  const [loggedSuccess, setLoggedSuccess] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Sync sensible default target & machine line when switching recipe or mode
  useEffect(() => {
    if (!baseMetrics || !activeRecipe) return;
    if (mode === 'outputKg') {
      setTargetValue(Number(baseMetrics.expectedOutputKg.toFixed(1)));
    } else if (mode === 'unitCount') {
      setTargetValue(baseMetrics.unitCount || 1000);
    } else {
      setTargetValue(1);
    }
  }, [activeRecipe?.id, mode]);

  useEffect(() => {
    setLineName(derivedLineName);
  }, [derivedLineName]);

  const recipeMachineLineup = useMemo(() => {
    if (!activeRecipe) return [];
    const sorted = activeRecipe.steps.slice().sort((a, b) => a.stepNumber - b.stepNumber);
    return sorted.map((step) => {
      const matched = machines.find((m) =>
        step.equipment.toLowerCase().includes(m.name.toLowerCase())
      );
      return {
        stepNumber: step.stepNumber,
        title: step.title,
        equipment: step.equipment,
        durationMin: step.durationMin,
        targetTempC: step.targetTempC,
        isCcp: step.isCcp,
        machine: matched || null,
      };
    });
  }, [activeRecipe, machines]);

  const scaled = useMemo(() => {
    if (!activeRecipe) return null;
    return scaleRecipe(activeRecipe, ingredients, mode, targetValue);
  }, [activeRecipe, ingredients, mode, targetValue]);

  useEffect(() => {
    onScaledChange(activeRecipe, scaled, lotNumbers, plannedLotCode, lineName, operator);
  }, [activeRecipe, scaled, lotNumbers, plannedLotCode, lineName, operator, onScaledChange]);

  const matchingBatch = useMemo(
    () => batches.find((b) => b.lotCode.trim() === plannedLotCode.trim()),
    [batches, plannedLotCode]
  );

  const workerSheetPayload = useMemo(() => {
    if (!scaled) return null;
    return buildWorkerSheetFromScaled({
      factoryName,
      plantCode,
      recipe: activeRecipe,
      scaled,
      lotNumbers,
      plannedLotCode,
      lineName,
      operator,
    });
  }, [factoryName, plantCode, activeRecipe, scaled, lotNumbers, plannedLotCode, lineName, operator]);

  const handleExportPickList = () => {
    if (!activeRecipe || !scaled) return;
    const batchRef = plannedLotCode.trim() || 'batch';
    downloadCsv(
      `picklist-${batchRef.toLowerCase()}.csv`,
      [
        'Batch Lot',
        'Seq #',
        'SKU',
        'Material',
        'Required (kg)',
        'On Hand (kg)',
        'Shortfall (kg)',
        'Raw Material Lot #',
      ],
      scaled.rows.map((r, idx) => [
        plannedLotCode.trim() || 'UNASSIGNED',
        idx + 1,
        r.ingredient?.sku || '',
        r.ingredient?.name || '',
        r.scaledKg.toFixed(3),
        r.stockKg.toFixed(2),
        r.shortfallKg.toFixed(3),
        lotNumbers[r.line.ingredientId] || '',
      ])
    );
  };

  const handleLogRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecipe || !scaled) return;
    setLogging(true);
    setLoggedSuccess(null);
    try {
      const batch: ProductionBatch = {
        id: `bat-${Date.now()}`,
        lotCode: plannedLotCode.trim() || `LOT-${Date.now()}`,
        recipeId: activeRecipe.id,
        recipeCode: activeRecipe.code,
        recipeName: activeRecipe.name,
        version: activeRecipe.version,
        lineName: lineName.trim() || 'Line 1',
        targetOutputKg: Number(scaled.scaledOutputKg.toFixed(2)),
        actualOutputKg: Number(scaled.scaledOutputKg.toFixed(2)),
        multiplier: Number(scaled.multiplier.toFixed(4)),
        operator: operator.trim() || 'Floor Operator',
        qaStatus: 'Pending QA',
        startedAt: new Date().toISOString(),
        notes: batchNotes.trim() || 'Logged from Batch Scaler pick list.',
        consumedLots: scaled.rows.map((r) => ({
          ingredientId: r.line.ingredientId,
          ingredientSku: r.ingredient?.sku || 'RM',
          ingredientName: r.ingredient?.name || 'Unknown Material',
          requiredKg: Number(r.scaledKg.toFixed(3)),
          lotNumber: lotNumbers[r.line.ingredientId] || 'UNASSIGNED',
        })),
        ccpStepLogs: activeRecipe.steps
          .filter((s) => s.isCcp)
          .sort((a, b) => a.stepNumber - b.stepNumber)
          .map((s) => ({
            stepId: s.id,
            stepNumber: s.stepNumber,
            title: s.title,
            stage: s.stage,
            allottedMin: s.durationMin,
            actualMin: null,
          })),
      };
      await onLogProductionBatch(batch);
      setLoggedSuccess(batch.lotCode);
      const nextSeq = Math.floor(10 + Math.random() * 89);
      const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      setPlannedLotCode(`LOT-${d}-${nextSeq}`);
      setBatchNotes('');
    } finally {
      setLogging(false);
    }
  };

  if (!activeRecipe || !scaled || !baseMetrics) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Create a formulation first to scale production batches.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Control Panel */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Target Formulation
              </label>
              <select
                value={activeRecipe.id}
                onChange={(e) => onSelectRecipeId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name} ({r.version})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Scaling Basis
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                {(
                  [
                    ['outputKg', 'Output kg'],
                    ['unitCount', 'Units'],
                    ['multiplier', 'Factor (x)'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      mode === m
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {mode === 'outputKg'
                  ? 'Desired Finished Weight (kg)'
                  : mode === 'unitCount'
                  ? `Target Pack Count (${activeRecipe.unitWeightG}g each)`
                  : 'Batch Multiplier (1.0 = Standard)'}
              </label>
              <input
                type="number"
                step={mode === 'multiplier' ? '0.05' : '1'}
                min="0.01"
                value={targetValue}
                onChange={(e) => setTargetValue(Number(e.target.value))}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              title="Generate worker-safe Batch QR code"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>Batch QR</span>
            </button>
            <button
              type="button"
              onClick={handleExportPickList}
              title="Export blind worker pick list CSV (recipe details hidden)"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Pick List CSV</span>
            </button>
            <button
              type="button"
              onClick={onPrintBatchSheet}
              title="Print blind worker weigh & pick sheet (recipe details hidden)"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* 4-column Scaled Output Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 lg:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Scaled Input Mass</div>
            <div className="font-mono mt-0.5 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {scaled.scaledInputKg.toFixed(2)} kg
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              {scaled.multiplier.toFixed(3)}x standard batch
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Expected Output ({activeRecipe.yieldPct}% yield)
            </div>
            <div className="font-mono mt-0.5 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {scaled.scaledOutputKg.toFixed(2)} kg
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              {scaled.scaledUnitCount.toLocaleString()} packs @ {activeRecipe.unitWeightG}g
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Estimated Batch Cost</div>
            <div className="font-mono mt-0.5 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {formatCurrency(scaled.scaledTotalCost)}
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              {formatCurrency(baseMetrics.costPerOutputKg)} / output kg
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Inventory Readiness</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              {scaled.hasShortages ? (
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{scaled.shortageCount} material shortage(s)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>All stock available</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {loggedSuccess && (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span>
            Production run <strong className="font-mono">{loggedSuccess}</strong> logged and raw
            material inventory deducted.
          </span>
          <button
            type="button"
            onClick={onNavigateToBatches}
            className="inline-flex items-center gap-1 font-semibold underline"
          >
            <span>View Production Log</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Scaled Pick-List Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Floor Weighing Pick List & Lot Assignment
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-medium">SKU</th>
                <th className="py-2.5 px-3.5 font-medium">Ingredient</th>
                <th className="py-2.5 px-3.5 font-medium">Stage</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Formula %</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Required (kg)</th>
                <th className="py-2.5 px-3.5 text-right font-medium">On Hand (kg)</th>
                <th className="py-2.5 px-3.5 font-medium">Stock Check</th>
                <th className="py-2.5 px-3.5 font-medium">Raw Material Lot #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {scaled.rows.map((row) => (
                <tr key={row.line.id} className="h-11 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="font-mono py-2 px-3.5 text-slate-600 dark:text-slate-400">
                    {row.ingredient?.sku || '—'}
                  </td>
                  <td className="py-2 px-3.5 font-medium text-slate-900 dark:text-slate-100">
                    {row.ingredient?.name || 'Unknown Material'}
                  </td>
                  <td className="py-2 px-3.5 text-slate-600 dark:text-slate-400">
                    {row.line.stage}
                  </td>
                  <td className="font-mono py-2 px-3.5 text-right text-slate-600 tabular-nums dark:text-slate-400">
                    {row.formulaPct.toFixed(2)}%
                  </td>
                  <td className="font-mono py-2 px-3.5 text-right font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {row.scaledKg.toFixed(3)}
                  </td>
                  <td className="font-mono py-2 px-3.5 text-right text-slate-600 tabular-nums dark:text-slate-400">
                    {row.stockKg.toFixed(1)}
                  </td>
                  <td className="py-2 px-3.5">
                    {row.shortfallKg > 0.001 ? (
                      <span className="font-mono inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>Short {row.shortfallKg.toFixed(1)} kg</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>OK</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-3.5">
                    <input
                      type="text"
                      placeholder="Enter lot #"
                      value={lotNumbers[row.line.ingredientId] || ''}
                      onChange={(e) =>
                        setLotNumbers((prev) => ({
                          ...prev,
                          [row.line.ingredientId]: e.target.value,
                        }))
                      }
                      className="font-mono w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Required Plant Machine Lineup & Readiness */}
      {recipeMachineLineup.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Assigned Machine Sequence &amp; Equipment Check
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Machines required to process and pack this batch in order.
              </p>
            </div>
            <div className="font-mono text-xs text-slate-600 tabular-nums dark:text-slate-400">
              Total Cycle:{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {recipeMachineLineup.reduce((s, item) => s + item.durationMin, 0)} min
              </strong>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {recipeMachineLineup.map((item, idx) => (
              <div
                key={`${item.stepNumber}-${idx}`}
                className="rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-950/60"
              >
                <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    Step {item.stepNumber}
                    {item.machine ? ` · ${item.machine.code}` : ''}
                  </span>
                  {item.machine?.status === 'Maintenance' ? (
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      Maintenance
                    </span>
                  ) : item.machine?.status === 'Standby' ? (
                    <span className="text-slate-500">Standby</span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">Ready</span>
                  )}
                </div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {item.equipment}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-400">
                  {item.durationMin} min ·{' '}
                  {item.targetTempC !== null ? `${item.targetTempC}°C` : 'Ambient'}
                  {item.isCcp ? ' · CCP' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commit Production Run Form */}
      <form
        onSubmit={handleLogRun}
        className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Commit Production Run & Deduct Inventory
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Creates a traceable lot record in Production Log and deducts weighed raw materials from stock.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Finished Lot Code
            </label>
            <input
              type="text"
              required
              value={plannedLotCode}
              onChange={(e) => setPlannedLotCode(e.target.value)}
              className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Production Line
            </label>
            <input
              type="text"
              required
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Lead Operator
            </label>
            <input
              type="text"
              required
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={logging}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#004E98] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{logging ? 'Logging Run...' : 'Log Production Run'}</span>
            </button>
          </div>
        </div>

        <div className="mt-3">
          <input
            type="text"
            placeholder="Optional shift or process notes..."
            value={batchNotes}
            onChange={(e) => setBatchNotes(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </form>

      <BatchQrModal
        open={qrModalOpen}
        batchId={matchingBatch?.id}
        payload={workerSheetPayload}
        onClose={() => setQrModalOpen(false)}
      />
    </div>
  );
};
