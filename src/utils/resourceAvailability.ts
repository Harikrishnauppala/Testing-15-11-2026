import type {
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  Recipe,
} from '../types/factory';
import {
  addDaysYmd,
  diffDaysYmd,
  evaluatePmTask,
  getTodayYmd,
  type EvaluatedPmTask,
} from './maintenance';

export type AvailabilityVerdict = 'Conflict' | 'Caution' | 'Clear';

export type ConflictKind =
  | 'pm_same_day'
  | 'machine_offline'
  | 'pm_overdue_carryover'
  | 'multi_batch_contention'
  | 'pm_adjacent';

export interface MachineRequirement {
  machine: PlantMachine;
  stepNumbers: number[];
  durationMin: number;
  hasCcp: boolean;
}

export interface ConflictDetail {
  id: string;
  severity: 'conflict' | 'warning';
  kind: ConflictKind;
  machine: PlantMachine;
  pmTask?: EvaluatedPmTask;
  competingBatches?: ProductionBatch[];
  message: string;
}

export interface RunAvailabilityEvaluation {
  batch?: ProductionBatch;
  recipe?: Recipe;
  runDateYmd: string;
  isScheduled: boolean;
  verdict: AvailabilityVerdict;
  requiredMachines: MachineRequirement[];
  totalCycleMin: number;
  conflicts: ConflictDetail[];
  conflictCount: number;
  warningCount: number;
  earliestClearDate: string | null;
}

export type MatrixCellState =
  | 'conflict'
  | 'caution'
  | 'pm_only'
  | 'busy'
  | 'free';

export interface AvailabilityMatrixBatchEntry {
  batch: ProductionBatch;
  recipe?: Recipe;
  durationMin: number;
  verdict: AvailabilityVerdict;
}

export interface AvailabilityMatrixCell {
  machineId: string;
  ymd: string;
  batches: AvailabilityMatrixBatchEntry[];
  pmTasks: EvaluatedPmTask[];
  cellState: MatrixCellState;
}

export interface ResourceAvailabilityReport {
  evaluatedRuns: RunAvailabilityEvaluation[];
  windowDates: string[];
  matrix: Record<string, Record<string, AvailabilityMatrixCell>>;
  totalConflictRuns: number;
  scheduledConflictRuns: number;
  cautionRuns: number;
  clearRuns: number;
  impactedMachineIds: string[];
}

export function extractBatchDateYmd(startedAt: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((startedAt || '').trim());
  if (m) return m[1];
  const parsed = new Date(startedAt);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const mo = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return getTodayYmd();
}

export function isBatchScheduled(
  batch: ProductionBatch,
  todayYmd: string = getTodayYmd()
): boolean {
  if (batch.runStatus === 'Scheduled') return true;
  return extractBatchDateYmd(batch.startedAt) > todayYmd;
}

function equipmentMatchesMachine(text: string, machine: PlantMachine): boolean {
  const hay = text.toLowerCase();
  const needle = machine.name.toLowerCase();
  if (hay.includes(needle)) return true;
  if (
    machine.name === 'Horizontal Flow Wrap Packing Machine' &&
    hay.includes('flow wrap')
  ) {
    return true;
  }
  return false;
}

export function getRequiredMachinesForRun(
  recipe: Recipe | undefined,
  machines: PlantMachine[],
  lineName?: string
): MachineRequirement[] {
  const map = new Map<string, MachineRequirement>();

  if (recipe && recipe.steps.length > 0) {
    const sorted = recipe.steps.slice().sort((a, b) => a.stepNumber - b.stepNumber);
    for (const step of sorted) {
      for (const m of machines) {
        if (equipmentMatchesMachine(step.equipment, m)) {
          const existing = map.get(m.id);
          if (existing) {
            existing.stepNumbers.push(step.stepNumber);
            existing.durationMin += step.durationMin || 0;
            if (step.isCcp) existing.hasCcp = true;
          } else {
            map.set(m.id, {
              machine: m,
              stepNumbers: [step.stepNumber],
              durationMin: step.durationMin || 0,
              hasCcp: Boolean(step.isCcp),
            });
          }
        }
      }
    }
  }

  // Fallback to lineName string matching if recipe has no matched steps
  if (map.size === 0 && lineName) {
    for (const m of machines) {
      if (equipmentMatchesMachine(lineName, m)) {
        map.set(m.id, {
          machine: m,
          stepNumbers: [],
          durationMin: 0,
          hasCcp: false,
        });
      }
    }
  }

  return Array.from(map.values());
}

function evaluateCoreRun(params: {
  batch?: ProductionBatch;
  recipe?: Recipe;
  runDateYmd: string;
  isScheduled: boolean;
  lineName?: string;
  machines: PlantMachine[];
  evaluatedPm: EvaluatedPmTask[];
  allBatches: ProductionBatch[];
  recipeMap: Map<string, Recipe>;
  todayYmd: string;
  skipClearDateSearch?: boolean;
}): RunAvailabilityEvaluation {
  const {
    batch,
    recipe,
    runDateYmd,
    isScheduled,
    lineName,
    machines,
    evaluatedPm,
    allBatches,
    recipeMap,
    todayYmd,
    skipClearDateSearch,
  } = params;

  const requiredMachines = getRequiredMachinesForRun(recipe, machines, lineName);
  const totalCycleMin = recipe
    ? recipe.steps.reduce((acc, s) => acc + (s.durationMin || 0), 0)
    : requiredMachines.reduce((acc, r) => acc + r.durationMin, 0);

  const conflicts: ConflictDetail[] = [];

  for (const req of requiredMachines) {
    const m = req.machine;
    const machinePm = evaluatedPm.filter(
      (ev) =>
        ev.task.machineId === m.id ||
        ev.task.machineName.toLowerCase() === m.name.toLowerCase()
    );

    // 1. Machine currently offline / under maintenance
    if (m.status === 'Maintenance') {
      conflicts.push({
        id: `offline-${m.id}-${runDateYmd}`,
        severity: 'conflict',
        kind: 'machine_offline',
        machine: m,
        message: `${m.name} is currently set to Maintenance status.`,
      });
    } else if (m.status === 'Standby') {
      conflicts.push({
        id: `standby-${m.id}-${runDateYmd}`,
        severity: 'warning',
        kind: 'machine_offline',
        machine: m,
        message: `${m.name} is on Standby; verify pre-run startup check.`,
      });
    }

    // 2. Direct Same-Day PM Overlap (active or scheduled PM on runDateYmd)
    for (const ev of machinePm) {
      if (ev.state === 'Completed') continue;
      if (ev.task.scheduledDate === runDateYmd) {
        conflicts.push({
          id: `pm-day-${ev.task.id}-${runDateYmd}`,
          severity: 'conflict',
          kind: 'pm_same_day',
          machine: m,
          pmTask: ev,
          message: `${m.name} has ${ev.task.taskType} PM "${ev.task.title}" scheduled on ${runDateYmd} (${ev.task.technician}).`,
        });
      } else if (
        ev.state === 'Overdue' &&
        runDateYmd >= ev.task.scheduledDate
      ) {
        // 3. Overdue unresolved PM carryover on or before run date
        conflicts.push({
          id: `pm-overdue-${ev.task.id}-${runDateYmd}`,
          severity:
            ev.task.taskType === 'Critical' || ev.task.taskType === 'Calibration'
              ? 'conflict'
              : 'warning',
          kind: 'pm_overdue_carryover',
          machine: m,
          pmTask: ev,
          message: `${m.name} has an unresolved overdue ${ev.task.taskType} PM from ${ev.task.scheduledDate}: "${ev.task.title}".`,
        });
      } else if (Math.abs(diffDaysYmd(ev.task.scheduledDate, runDateYmd)) === 1) {
        // 4. Adjacent ±1 day turnaround warning
        conflicts.push({
          id: `pm-adj-${ev.task.id}-${runDateYmd}`,
          severity: 'warning',
          kind: 'pm_adjacent',
          machine: m,
          pmTask: ev,
          message: `${m.name} has PM "${ev.task.title}" on ${ev.task.scheduledDate} (±1 day turnaround buffer).`,
        });
      }
    }

    // 5. Same-Day Multi-Batch Machine Contention
    const sameDayOtherBatches = allBatches.filter((other) => {
      if (batch && other.id === batch.id) return false;
      if (extractBatchDateYmd(other.startedAt) !== runDateYmd) return false;
      const otherRecipe = recipeMap.get(other.recipeId);
      const otherReqs = getRequiredMachinesForRun(
        otherRecipe,
        machines,
        other.lineName
      );
      return otherReqs.some((r) => r.machine.id === m.id);
    });

    if (sameDayOtherBatches.length > 0) {
      conflicts.push({
        id: `multi-${m.id}-${runDateYmd}`,
        severity: 'warning',
        kind: 'multi_batch_contention',
        machine: m,
        competingBatches: sameDayOtherBatches,
        message: `${m.name} is also scheduled for ${sameDayOtherBatches.length} other run(s) on ${runDateYmd} (${sameDayOtherBatches
          .map((b) => b.lotCode)
          .join(', ')}).`,
      });
    }
  }

  const conflictCount = conflicts.filter((c) => c.severity === 'conflict').length;
  const warningCount = conflicts.filter((c) => c.severity === 'warning').length;
  const verdict: AvailabilityVerdict =
    conflictCount > 0 ? 'Conflict' : warningCount > 0 ? 'Caution' : 'Clear';

  let earliestClearDate: string | null = null;
  if (!skipClearDateSearch && conflictCount > 0 && recipe) {
    const startSearch =
      runDateYmd >= todayYmd ? addDaysYmd(runDateYmd, 1) : todayYmd;
    for (let offset = 0; offset < 30; offset++) {
      const candidate = addDaysYmd(startSearch, offset);
      const probe = evaluateCoreRun({
        batch,
        recipe,
        runDateYmd: candidate,
        isScheduled: true,
        lineName,
        machines,
        evaluatedPm,
        allBatches,
        recipeMap,
        todayYmd,
        skipClearDateSearch: true,
      });
      if (probe.conflictCount === 0) {
        earliestClearDate = candidate;
        break;
      }
    }
  }

  return {
    batch,
    recipe,
    runDateYmd,
    isScheduled,
    verdict,
    requiredMachines,
    totalCycleMin,
    conflicts,
    conflictCount,
    warningCount,
    earliestClearDate,
  };
}

export function evaluatePlannedProductRun(params: {
  recipe: Recipe;
  runDateYmd: string;
  machines: PlantMachine[];
  maintenanceTasks: MaintenanceTask[];
  existingBatches: ProductionBatch[];
  recipes: Recipe[];
  todayYmd?: string;
}): RunAvailabilityEvaluation {
  const todayYmd = params.todayYmd || getTodayYmd();
  const evaluatedPm = params.maintenanceTasks.map((t) =>
    evaluatePmTask(t, todayYmd)
  );
  const recipeMap = new Map(params.recipes.map((r) => [r.id, r]));
  return evaluateCoreRun({
    recipe: params.recipe,
    runDateYmd: params.runDateYmd,
    isScheduled: params.runDateYmd >= todayYmd,
    machines: params.machines,
    evaluatedPm,
    allBatches: params.existingBatches,
    recipeMap,
    todayYmd,
  });
}

export function buildResourceAvailabilityReport(params: {
  machines: PlantMachine[];
  batches: ProductionBatch[];
  recipes: Recipe[];
  maintenanceTasks: MaintenanceTask[];
  windowStartYmd: string;
  dayCount?: number;
  todayYmd?: string;
}): ResourceAvailabilityReport {
  const {
    machines,
    batches,
    recipes,
    maintenanceTasks,
    windowStartYmd,
    dayCount = 14,
  } = params;
  const todayYmd = params.todayYmd || getTodayYmd();
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const evaluatedPm = maintenanceTasks.map((t) => evaluatePmTask(t, todayYmd));

  const evaluatedRuns = batches
    .map((batch) => {
      const recipe = recipeMap.get(batch.recipeId);
      const runDateYmd = extractBatchDateYmd(batch.startedAt);
      const scheduled = isBatchScheduled(batch, todayYmd);
      return evaluateCoreRun({
        batch,
        recipe,
        runDateYmd,
        isScheduled: scheduled,
        lineName: batch.lineName,
        machines,
        evaluatedPm,
        allBatches: batches,
        recipeMap,
        todayYmd,
      });
    })
    .sort((a, b) => {
      // Scheduled/upcoming conflicts first, then other conflicts, then scheduled, then date desc
      const rank = (r: RunAvailabilityEvaluation) => {
        if (r.isScheduled && r.verdict === 'Conflict') return 0;
        if (r.verdict === 'Conflict') return 1;
        if (r.isScheduled && r.verdict === 'Caution') return 2;
        if (r.isScheduled) return 3;
        if (r.verdict === 'Caution') return 4;
        return 5;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return b.runDateYmd.localeCompare(a.runDateYmd);
    });

  const windowDates: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    windowDates.push(addDaysYmd(windowStartYmd, i));
  }

  const matrix: Record<string, Record<string, AvailabilityMatrixCell>> = {};
  for (const m of machines) {
    matrix[m.id] = {};
    for (const ymd of windowDates) {
      matrix[m.id][ymd] = {
        machineId: m.id,
        ymd,
        batches: [],
        pmTasks: [],
        cellState: 'free',
      };
    }
  }

  for (const ev of evaluatedPm) {
    const keyYmd =
      ev.state === 'Completed' && ev.task.completedDate
        ? ev.task.completedDate
        : ev.task.scheduledDate;
    const cell = matrix[ev.task.machineId]?.[keyYmd];
    if (cell) {
      cell.pmTasks.push(ev);
    }
  }

  for (const run of evaluatedRuns) {
    if (!run.batch) continue;
    for (const req of run.requiredMachines) {
      const cell = matrix[req.machine.id]?.[run.runDateYmd];
      if (cell) {
        cell.batches.push({
          batch: run.batch,
          recipe: run.recipe,
          durationMin: req.durationMin,
          verdict: run.verdict,
        });
      }
    }
  }

  for (const m of machines) {
    for (const ymd of windowDates) {
      const cell = matrix[m.id][ymd];
      const activePms = cell.pmTasks.filter((p) => p.state !== 'Completed');
      const hasBatch = cell.batches.length > 0;
      const hasActivePm = activePms.length > 0;

      // Also check if this machine has an unresolved overdue Critical/Calibration PM affecting this date
      const hasOverdueCarryoverConflict = evaluatedPm.some(
        (ev) =>
          (ev.task.machineId === m.id ||
            ev.task.machineName.toLowerCase() === m.name.toLowerCase()) &&
          ev.state === 'Overdue' &&
          (ev.task.taskType === 'Critical' ||
            ev.task.taskType === 'Calibration') &&
          ymd >= ev.task.scheduledDate
      );

      if (
        hasBatch &&
        (hasActivePm || m.status === 'Maintenance' || hasOverdueCarryoverConflict)
      ) {
        cell.cellState = 'conflict';
      } else if (hasBatch && cell.batches.length > 1) {
        cell.cellState = 'caution';
      } else if (cell.pmTasks.length > 0) {
        cell.cellState = 'pm_only';
      } else if (hasBatch) {
        cell.cellState = 'busy';
      } else {
        cell.cellState = 'free';
      }
    }
  }

  const impactedSet = new Set<string>();
  let totalConflictRuns = 0;
  let scheduledConflictRuns = 0;
  let cautionRuns = 0;
  let clearRuns = 0;

  for (const r of evaluatedRuns) {
    if (r.verdict === 'Conflict') {
      totalConflictRuns += 1;
      if (r.isScheduled) scheduledConflictRuns += 1;
      for (const c of r.conflicts) {
        if (c.severity === 'conflict') impactedSet.add(c.machine.id);
      }
    } else if (r.verdict === 'Caution') {
      cautionRuns += 1;
    } else {
      clearRuns += 1;
    }
  }

  return {
    evaluatedRuns,
    windowDates,
    matrix,
    totalConflictRuns,
    scheduledConflictRuns,
    cautionRuns,
    clearRuns,
    impactedMachineIds: Array.from(impactedSet),
  };
}
