import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Plus,
  Wrench,
} from 'lucide-react';
import type {
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  Recipe,
} from '../types/factory';
import {
  addDaysYmd,
  formatShortDate,
  getShortMachineLabel,
  getTodayYmd,
} from '../utils/maintenance';
import {
  buildResourceAvailabilityReport,
  evaluatePlannedProductRun,
  type AvailabilityMatrixCell,
  type RunAvailabilityEvaluation,
} from '../utils/resourceAvailability';

interface ResourceAvailabilityPanelProps {
  machines: PlantMachine[];
  recipes: Recipe[];
  batches: ProductionBatch[];
  maintenanceTasks: MaintenanceTask[];
  onSaveMaintenanceTask: (task: MaintenanceTask, isNew: boolean) => Promise<void>;
  onScheduleProductionBatch: (batch: ProductionBatch) => Promise<void>;
  onUpdateBatchSchedule: (
    batchId: string,
    startedAt: string,
    runStatus?: 'Completed' | 'Scheduled'
  ) => Promise<void>;
  onOpenMachinePm: (machineId: string) => void;
  onNavigateToBatches: () => void;
}

function getWeekdayShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function getDayNumber(ymd: string): string {
  const parts = ymd.split('-');
  return parts[2] || ymd;
}

export const ResourceAvailabilityPanel: React.FC<
  ResourceAvailabilityPanelProps
> = ({
  machines,
  recipes,
  batches,
  maintenanceTasks,
  onSaveMaintenanceTask,
  onScheduleProductionBatch,
  onUpdateBatchSchedule,
  onOpenMachinePm,
  onNavigateToBatches,
}) => {
  const todayYmd = useMemo(() => getTodayYmd(), []);
  // Start window 1 day before today so recent batch overlaps (e.g. Nov 14) + 13 upcoming days appear immediately
  const defaultWindowStart = useMemo(() => addDaysYmd(todayYmd, -1), [todayYmd]);

  const [windowStartYmd, setWindowStartYmd] = useState<string>(defaultWindowStart);
  const [selectedCellKey, setSelectedCellKey] = useState<{
    machineId: string;
    ymd: string;
  } | null>(null);

  // What-If Product Run Conflict Checker & Scheduler state
  const [plannerRecipeId, setPlannerRecipeId] = useState<string>(
    recipes[0]?.id || ''
  );
  const [plannerDateYmd, setPlannerDateYmd] = useState<string>(
    addDaysYmd(todayYmd, 2)
  );
  const [plannerMultiplier, setPlannerMultiplier] = useState<number>(1);
  const [schedulingRun, setSchedulingRun] = useState(false);

  // Table Filters
  const [runFilter, setRunFilter] = useState<
    'all' | 'conflicts' | 'scheduled' | 'historical'
  >('all');
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const report = useMemo(
    () =>
      buildResourceAvailabilityReport({
        machines,
        batches,
        recipes,
        maintenanceTasks,
        windowStartYmd,
        dayCount: 14,
        todayYmd,
      }),
    [machines, batches, recipes, maintenanceTasks, windowStartYmd, todayYmd]
  );

  const selectedPlannerRecipe = useMemo(
    () => recipes.find((r) => r.id === plannerRecipeId) || recipes[0],
    [recipes, plannerRecipeId]
  );

  const plannerEval = useMemo(() => {
    if (!selectedPlannerRecipe) return null;
    return evaluatePlannedProductRun({
      recipe: selectedPlannerRecipe,
      runDateYmd: plannerDateYmd,
      machines,
      maintenanceTasks,
      existingBatches: batches,
      recipes,
      todayYmd,
    });
  }, [
    selectedPlannerRecipe,
    plannerDateYmd,
    machines,
    maintenanceTasks,
    batches,
    recipes,
    todayYmd,
  ]);

  // Pick a sensible initial inspected cell (first conflict cell in window if any)
  const inspectedCell: AvailabilityMatrixCell | null = useMemo(() => {
    if (selectedCellKey) {
      return (
        report.matrix[selectedCellKey.machineId]?.[selectedCellKey.ymd] || null
      );
    }
    for (const m of machines) {
      for (const ymd of report.windowDates) {
        const cell = report.matrix[m.id]?.[ymd];
        if (cell && cell.cellState === 'conflict') {
          return cell;
        }
      }
    }
    return null;
  }, [selectedCellKey, report, machines]);

  const inspectedMachine = useMemo(
    () =>
      inspectedCell
        ? machines.find((m) => m.id === inspectedCell.machineId) || null
        : null,
    [inspectedCell, machines]
  );

  const filteredRuns = useMemo(() => {
    return report.evaluatedRuns.filter((r) => {
      if (
        machineFilter !== 'all' &&
        !r.requiredMachines.some((req) => req.machine.id === machineFilter)
      ) {
        return false;
      }
      if (runFilter === 'conflicts') {
        return r.verdict === 'Conflict' || r.verdict === 'Caution';
      }
      if (runFilter === 'scheduled') {
        return r.isScheduled;
      }
      if (runFilter === 'historical') {
        return !r.isScheduled;
      }
      return true;
    });
  }, [report.evaluatedRuns, runFilter, machineFilter]);

  const handleSchedulePlannedRun = async () => {
    if (!selectedPlannerRecipe || !plannerDateYmd) return;
    setSchedulingRun(true);
    try {
      const dateCompact = plannerDateYmd.replace(/-/g, '');
      const sameDayCount = batches.filter(
        (b) => b.startedAt.slice(0, 10) === plannerDateYmd
      ).length;
      const seq = String(sameDayCount + 1).padStart(2, '0');
      const targetOutputKg = Number(
        (selectedPlannerRecipe.targetBatchKg * plannerMultiplier).toFixed(1)
      );
      const routeNames = (plannerEval?.requiredMachines || [])
        .map((r) => getShortMachineLabel(r.machine.name))
        .join(' → ');

      const newBatch: ProductionBatch = {
        id: `bat-${Date.now()}`,
        lotCode: `LOT-${dateCompact}-${seq}`,
        recipeId: selectedPlannerRecipe.id,
        recipeCode: selectedPlannerRecipe.code,
        recipeName: selectedPlannerRecipe.name,
        version: selectedPlannerRecipe.version,
        lineName: routeNames
          ? `Main Line · ${routeNames}`
          : 'Main Production Line',
        targetOutputKg,
        actualOutputKg: targetOutputKg,
        multiplier: plannerMultiplier,
        operator: 'Scheduled Floor Crew',
        qaStatus: 'Pending QA',
        runStatus: plannerDateYmd >= todayYmd ? 'Scheduled' : 'Completed',
        startedAt: `${plannerDateYmd}T08:00:00Z`,
        notes:
          plannerEval?.verdict === 'Conflict'
            ? `Scheduled via Resource Availability with ${plannerEval.conflictCount} flagged PM overlap(s); coordinate with maintenance.`
            : 'Scheduled via Resource Availability planner (zero PM conflicts).',
        consumedLots: [],
        ccpStepLogs: selectedPlannerRecipe.steps
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

      await onScheduleProductionBatch(newBatch);
      setWindowStartYmd(addDaysYmd(plannerDateYmd, -2));
    } finally {
      setSchedulingRun(false);
    }
  };

  const handleMoveBatchToDate = async (
    batch: ProductionBatch,
    targetYmd: string
  ) => {
    setBusyActionId(`move-batch-${batch.id}`);
    try {
      const timePart = batch.startedAt.includes('T')
        ? batch.startedAt.slice(10)
        : 'T08:00:00Z';
      await onUpdateBatchSchedule(
        batch.id,
        `${targetYmd}${timePart}`,
        targetYmd >= todayYmd ? 'Scheduled' : batch.runStatus
      );
    } finally {
      setBusyActionId(null);
    }
  };

  const handleShiftPmTask = async (task: MaintenanceTask, daysDelta: number) => {
    setBusyActionId(`move-pm-${task.id}`);
    try {
      const nextDate = addDaysYmd(task.scheduledDate, daysDelta);
      await onSaveMaintenanceTask(
        {
          ...task,
          scheduledDate: nextDate,
        },
        false
      );
    } finally {
      setBusyActionId(null);
    }
  };

  const renderVerdictLabel = (verdict: RunAvailabilityEvaluation['verdict']) => {
    if (verdict === 'Conflict') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
          <span>PM Overlap</span>
        </span>
      );
    }
    if (verdict === 'Caution') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Caution</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Clear</span>
      </span>
    );
  };

  const pmDowntimeSlotsInWindow = useMemo(() => {
    let count = 0;
    for (const m of machines) {
      for (const ymd of report.windowDates) {
        const cell = report.matrix[m.id]?.[ymd];
        if (cell && cell.pmTasks.some((t) => t.state !== 'Completed')) {
          count += 1;
        }
      }
    }
    return count;
  }, [machines, report]);

  return (
    <div className="space-y-5">
      {/* Cross-Reference Summary Banner */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Run × PM Conflicts
          </div>
          <div
            className={`font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums ${
              report.totalConflictRuns > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <span>{report.totalConflictRuns}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {report.scheduledConflictRuns} upcoming
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Contention / Buffer Cautions
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-amber-700 tabular-nums dark:text-amber-400">
            {report.cautionRuns} runs
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Conflict-Free Product Runs
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {report.clearRuns} / {report.evaluatedRuns.length}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            14-Day Planned PM Windows
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{pmDowntimeSlotsInWindow}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {report.impactedMachineIds.length} impacted assets
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Product Run Availability Checker & Scheduler */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3.5 dark:border-slate-800">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Check &amp; Schedule Product Run Availability
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Select a product formulation and target run date to check every required machine against Preventive Maintenance downtime and existing Production Log runs.
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateToBatches}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Open Production Log</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5">
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Product Formulation
            </label>
            <select
              value={selectedPlannerRecipe?.id || ''}
              onChange={(e) => setPlannerRecipeId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name} ({r.targetBatchKg} kg base)
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target Production Date
            </label>
            <input
              type="date"
              value={plannerDateYmd}
              onChange={(e) => setPlannerDateYmd(e.target.value)}
              className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Batch Scale
            </label>
            <select
              value={plannerMultiplier}
              onChange={(e) => setPlannerMultiplier(Number(e.target.value))}
              className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value={0.5}>0.5x Pilot</option>
              <option value={1}>1.0x Standard</option>
              <option value={1.5}>1.5x Extended</option>
              <option value={2}>2.0x Double</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="button"
              disabled={schedulingRun || !selectedPlannerRecipe}
              onClick={() => void handleSchedulePlannedRun()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004E98] disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{schedulingRun ? 'Scheduling...' : 'Schedule Run'}</span>
            </button>
          </div>
        </div>

        {plannerEval && (
          <div className="mt-4 border-t border-slate-200 pt-3.5 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {renderVerdictLabel(plannerEval.verdict)}
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="font-mono text-slate-700 tabular-nums dark:text-slate-300">
                  {plannerEval.requiredMachines.length} machines ·{' '}
                  {Math.round(plannerEval.totalCycleMin * plannerMultiplier)} min scaled cycle
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-slate-600 dark:text-slate-400">
                  {plannerEval.conflicts.length === 0
                    ? `All required equipment clear on ${formatShortDate(plannerDateYmd)}.`
                    : `${plannerEval.conflictCount} overlap(s), ${plannerEval.warningCount} caution(s) on ${formatShortDate(plannerDateYmd)}.`}
                </span>
              </div>

              {plannerEval.earliestClearDate && (
                <button
                  type="button"
                  onClick={() => setPlannerDateYmd(plannerEval.earliestClearDate!)}
                  className="font-mono inline-flex items-center gap-1 text-xs font-medium text-[#005FB8] hover:underline whitespace-nowrap dark:text-sky-400"
                >
                  <span>
                    Use Earliest Clear Date ({formatShortDate(plannerEval.earliestClearDate)})
                  </span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Per-machine sequence clearance strip */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {plannerEval.requiredMachines.map((req) => {
                const mConflicts = plannerEval.conflicts.filter(
                  (c) => c.machine.id === req.machine.id
                );
                const hasConflict = mConflicts.some(
                  (c) => c.severity === 'conflict'
                );
                const hasWarning = mConflicts.some(
                  (c) => c.severity === 'warning'
                );
                return (
                  <div
                    key={req.machine.id}
                    className={`rounded-md p-2.5 text-xs ${
                      hasConflict
                        ? 'bg-red-50/80 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                        : hasWarning
                        ? 'bg-amber-50/80 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'bg-slate-50 text-slate-800 dark:bg-slate-950/60 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate font-semibold">
                        {getShortMachineLabel(req.machine.name)}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums opacity-80">
                        {req.durationMin}m
                      </span>
                    </div>
                    <div className="mt-1 text-[11px]">
                      {hasConflict ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                          <AlertOctagon className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {mConflicts[0]?.pmTask
                              ? mConflicts[0].pmTask.task.taskType + ' PM'
                              : 'Conflict'}
                          </span>
                        </span>
                      ) : hasWarning ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>Contention / Buffer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>Available</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 14-Day Machine × Production Schedule Availability Matrix */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-[#005FB8] dark:text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                14-Day Machine Availability &amp; Overlap Matrix
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Cross-references Production Log batch dates against machine Preventive Maintenance dates. Click any cell to inspect or resolve overlaps.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWindowStartYmd((d) => addDaysYmd(d, -7))}
              aria-label="Previous 7 days"
              className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setWindowStartYmd(defaultWindowStart)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Current Window
            </button>
            <button
              type="button"
              onClick={() => setWindowStartYmd((d) => addDaysYmd(d, 7))}
              aria-label="Next 7 days"
              className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 border-b border-slate-100 px-5 py-2.5 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <AlertOctagon className="h-3 w-3 text-red-600 dark:text-red-400" />
            <span>Conflict (Run + PM Overlap)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>Multi-Run Contention</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="h-3 w-3 text-[#005FB8] dark:text-sky-400" />
            <span>PM Downtime Window</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            <span>Production Run (Clear)</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="w-48 py-2.5 px-3.5 font-medium">Plant Machine</th>
                {report.windowDates.map((ymd) => {
                  const isToday = ymd === todayYmd;
                  return (
                    <th
                      key={ymd}
                      className={`py-2 px-1 text-center font-medium ${
                        isToday
                          ? 'bg-sky-50/70 text-[#005FB8] dark:bg-sky-950/30 dark:text-sky-400'
                          : ''
                      }`}
                    >
                      <div className="text-[10px] opacity-75">
                        {getWeekdayShort(ymd)}
                      </div>
                      <div className="font-mono text-[11px] font-semibold tabular-nums">
                        {getDayNumber(ymd)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {machines.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 px-3.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {getShortMachineLabel(m.name)}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {m.code} · {m.status}
                    </div>
                  </td>

                  {report.windowDates.map((ymd) => {
                    const cell = report.matrix[m.id]?.[ymd];
                    const isSelected =
                      inspectedCell?.machineId === m.id &&
                      inspectedCell?.ymd === ymd;

                    const state = cell?.cellState || 'free';
                    const cellCls =
                      state === 'conflict'
                        ? 'bg-red-50 text-red-900 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/70'
                        : state === 'caution'
                        ? 'bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60'
                        : state === 'pm_only'
                        ? 'bg-sky-50 text-sky-900 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/60'
                        : state === 'busy'
                        ? 'bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/80 dark:bg-emerald-950/30 dark:text-emerald-200'
                        : 'bg-white text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-600 dark:hover:bg-slate-800/40';

                    const activePmCount =
                      cell?.pmTasks.filter((p) => p.state !== 'Completed')
                        .length || 0;
                    const batchCount = cell?.batches.length || 0;

                    return (
                      <td
                        key={ymd}
                        className="border-l border-slate-100 p-1 text-center align-middle dark:border-slate-800/70"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCellKey({ machineId: m.id, ymd })
                          }
                          title={`${m.name} on ${ymd}: ${batchCount} run(s), ${cell?.pmTasks.length || 0} PM task(s)`}
                          className={`flex h-12 w-full flex-col items-center justify-center rounded px-0.5 font-mono text-[10px] tabular-nums transition-colors ${cellCls} ${
                            isSelected
                              ? 'ring-2 ring-inset ring-[#005FB8] dark:ring-sky-400'
                              : ''
                          }`}
                        >
                          {state === 'conflict' ? (
                            <>
                              <AlertOctagon className="h-3 w-3 text-red-600 dark:text-red-400" />
                              <span className="mt-0.5 font-semibold">
                                {batchCount}R/{activePmCount > 0 ? `${activePmCount}PM` : 'OVR'}
                              </span>
                            </>
                          ) : state === 'caution' ? (
                            <>
                              <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                              <span className="mt-0.5 font-semibold">
                                {batchCount} Runs
                              </span>
                            </>
                          ) : state === 'pm_only' ? (
                            <>
                              <Wrench className="h-3 w-3 text-[#005FB8] dark:text-sky-400" />
                              <span className="mt-0.5 font-medium">
                                {activePmCount > 0 ? 'PM' : 'Done'}
                              </span>
                            </>
                          ) : state === 'busy' ? (
                            <>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {batchCount} Run
                              </span>
                            </>
                          ) : (
                            <span>—</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected Machine-Day Inspection Strip */}
        {inspectedCell && inspectedMachine && (
          <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-xs dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-[11px] font-semibold text-[#005FB8] dark:text-sky-400">
                  {inspectedMachine.code} · {inspectedCell.ymd} ({formatShortDate(inspectedCell.ymd)})
                </span>
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {inspectedMachine.name} — Schedule Inspection
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onOpenMachinePm(inspectedMachine.id)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Open {getShortMachineLabel(inspectedMachine.name)} in PM Calendar
              </button>
            </div>

            {inspectedCell.batches.length === 0 &&
            inspectedCell.pmTasks.length === 0 ? (
              <div className="mt-2 text-slate-500 dark:text-slate-400">
                No product runs or maintenance tasks scheduled on{' '}
                {formatShortDate(inspectedCell.ymd)}. Machine capacity is available.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Production Runs ({inspectedCell.batches.length})
                  </div>
                  {inspectedCell.batches.length === 0 ? (
                    <div className="text-slate-500 dark:text-slate-400">
                      No production runs on this date.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {inspectedCell.batches.map((b) => (
                        <div
                          key={b.batch.id}
                          className="flex items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {b.batch.lotCode} · {b.batch.recipeCode}
                            </div>
                            <div className="truncate text-slate-600 dark:text-slate-400">
                              {b.batch.recipeName} ({b.durationMin}m on machine)
                            </div>
                          </div>
                          {renderVerdictLabel(b.verdict)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Maintenance Tasks ({inspectedCell.pmTasks.length})
                  </div>
                  {inspectedCell.pmTasks.length === 0 ? (
                    <div className="text-slate-500 dark:text-slate-400">
                      No PM scheduled on this date.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {inspectedCell.pmTasks.map((ev) => (
                        <div
                          key={ev.task.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {ev.task.title}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {ev.task.taskType} · {ev.task.technician} ·{' '}
                              {ev.state}
                            </div>
                          </div>
                          {ev.state !== 'Completed' && (
                            <button
                              type="button"
                              disabled={busyActionId === `move-pm-${ev.task.id}`}
                              onClick={() => void handleShiftPmTask(ev.task, 1)}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              Shift PM +1d
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cross-Referenced Production Runs & Overlap Resolution Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Production Log × Preventive Maintenance Conflict Report
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every scheduled and historical batch cross-referenced against required machine maintenance calendars.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter conflict report by machine"
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Machines</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {getShortMachineLabel(m.name)}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['all', `All (${report.evaluatedRuns.length})`],
                  [
                    'conflicts',
                    `Overlaps (${report.totalConflictRuns + report.cautionRuns})`,
                  ],
                  [
                    'scheduled',
                    `Scheduled (${report.evaluatedRuns.filter((r) => r.isScheduled).length})`,
                  ],
                  [
                    'historical',
                    `Logged (${report.evaluatedRuns.filter((r) => !r.isScheduled).length})`,
                  ],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRunFilter(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    runFilter === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-medium">Availability</th>
                <th className="py-2.5 px-3.5 font-medium">Batch Lot &amp; Date</th>
                <th className="py-2.5 px-3.5 font-medium">Product Run</th>
                <th className="py-2.5 px-3.5 font-medium">Required Machines</th>
                <th className="py-2.5 px-3.5 font-medium">
                  Conflict / Downtime Overlap Details
                </th>
                <th className="py-2.5 px-3.5 text-right font-medium">
                  Resolution
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No product runs match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((run) => {
                  const batch = run.batch;
                  if (!batch) return null;
                  const primaryConflictPm = run.conflicts.find(
                    (c) => c.severity === 'conflict' && c.pmTask
                  )?.pmTask;

                  return (
                    <tr
                      key={batch.id}
                      className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-3.5">
                        {renderVerdictLabel(run.verdict)}
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {run.isScheduled ? 'Scheduled Run' : 'Logged Run'}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {batch.lotCode}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-400">
                          {run.runDateYmd} ({formatShortDate(run.runDateYmd)})
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {batch.recipeName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {batch.recipeCode} · {batch.targetOutputKg.toFixed(0)} kg ·{' '}
                          {run.totalCycleMin}m cycle
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="space-y-0.5 text-[11px]">
                          {run.requiredMachines.map((req) => {
                            const hasConflict = run.conflicts.some(
                              (c) =>
                                c.machine.id === req.machine.id &&
                                c.severity === 'conflict'
                            );
                            const hasWarn = run.conflicts.some(
                              (c) =>
                                c.machine.id === req.machine.id &&
                                c.severity === 'warning'
                            );
                            return (
                              <div
                                key={req.machine.id}
                                className={`font-mono flex items-center gap-1.5 tabular-nums ${
                                  hasConflict
                                    ? 'font-semibold text-red-700 dark:text-red-400'
                                    : hasWarn
                                    ? 'font-medium text-amber-700 dark:text-amber-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span>
                                  {getShortMachineLabel(req.machine.name)}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span>{req.durationMin}m</span>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="max-w-md py-3 px-3.5">
                        {run.conflicts.length === 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            All required machines clear of PM downtime and same-day overlaps.
                          </span>
                        ) : (
                          <div className="space-y-1.5">
                            {run.conflicts.map((c) => (
                              <div
                                key={c.id}
                                className={`text-[11px] ${
                                  c.severity === 'conflict'
                                    ? 'font-medium text-red-700 dark:text-red-300'
                                    : 'text-amber-800 dark:text-amber-300'
                                }`}
                              >
                                {c.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <div className="inline-flex flex-col items-end gap-1.5">
                          {run.isScheduled &&
                            run.verdict === 'Conflict' &&
                            run.earliestClearDate && (
                              <button
                                type="button"
                                disabled={
                                  busyActionId === `move-batch-${batch.id}`
                                }
                                onClick={() =>
                                  void handleMoveBatchToDate(
                                    batch,
                                    run.earliestClearDate!
                                  )
                                }
                                className="font-mono rounded border border-[#005FB8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#005FB8] hover:bg-sky-50 disabled:opacity-50 whitespace-nowrap dark:border-sky-500 dark:bg-slate-800 dark:text-sky-400"
                              >
                                Move Run → {formatShortDate(run.earliestClearDate)}
                              </button>
                            )}

                          {primaryConflictPm &&
                            primaryConflictPm.state !== 'Completed' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenMachinePm(
                                    primaryConflictPm.task.machineId
                                  )
                                }
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                Inspect PM ({getShortMachineLabel(primaryConflictPm.task.machineName)})
                              </button>
                            )}

                          {run.verdict === 'Clear' && (
                            <span className="font-mono text-[11px] text-slate-400">
                              Ready
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
