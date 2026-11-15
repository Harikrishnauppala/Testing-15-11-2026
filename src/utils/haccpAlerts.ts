import type {
  BatchCcpStepLog,
  ProcessStep,
  ProductionBatch,
  Recipe,
} from '../types/factory';

export interface EvaluatedCcpStep {
  stepId: string;
  stepNumber: number;
  stage: string;
  title: string;
  equipment: string;
  ccpNote: string;
  allottedMin: number;
  actualMin: number | null;
  startedAt?: string;
  completedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  correctiveAction?: string;
  isRunning: boolean;
  isOverrun: boolean;
  overrunMin: number;
  overrunPct: number;
  severity: 'critical' | 'warning' | 'nominal' | 'pending';
}

export interface HaccpBatchAlert {
  id: string;
  batch: ProductionBatch;
  step: EvaluatedCcpStep;
  isAcknowledged: boolean;
}

export interface BatchHaccpSummary {
  steps: EvaluatedCcpStep[];
  overruns: EvaluatedCcpStep[];
  unacknowledgedOverruns: EvaluatedCcpStep[];
  runningSteps: EvaluatedCcpStep[];
  maxOverrunMin: number;
  status: 'alert' | 'acknowledged' | 'running' | 'compliant' | 'none';
}

export function evaluateBatchHaccp(
  batch: ProductionBatch,
  recipe: Recipe | undefined,
  nowMs: number = Date.now()
): BatchHaccpSummary {
  const ccpRecipeSteps: ProcessStep[] = recipe
    ? recipe.steps
        .filter((s) => s.isCcp)
        .slice()
        .sort((a, b) => a.stepNumber - b.stepNumber)
    : [];

  const existingLogs = batch.ccpStepLogs || [];
  const logByStepId = new Map<string, BatchCcpStepLog>(
    existingLogs.map((l) => [l.stepId, l])
  );
  const seenStepIds = new Set<string>();

  const steps: EvaluatedCcpStep[] = [];

  for (const rStep of ccpRecipeSteps) {
    seenStepIds.add(rStep.id);
    const log = logByStepId.get(rStep.id);
    const allottedMin = Number(rStep.durationMin) || log?.allottedMin || 0;
    const isRunning = Boolean(
      log?.startedAt && !log?.completedAt && log?.actualMin === null
    );
    let actualMin: number | null =
      log?.actualMin !== undefined && log?.actualMin !== null
        ? Number(log.actualMin)
        : null;

    if (actualMin === null && isRunning && log?.startedAt) {
      const startMs = Date.parse(log.startedAt);
      if (!Number.isNaN(startMs)) {
        actualMin = Math.max(0, Number(((nowMs - startMs) / 60_000).toFixed(2)));
      }
    }

    const isOverrun =
      allottedMin > 0 && actualMin !== null && actualMin > allottedMin + 0.01;
    const overrunMin =
      isOverrun && actualMin !== null
        ? Number((actualMin - allottedMin).toFixed(2))
        : 0;
    const overrunPct =
      isOverrun && allottedMin > 0 ? (overrunMin / allottedMin) * 100 : 0;

    let severity: EvaluatedCcpStep['severity'] = 'pending';
    if (isOverrun) {
      severity = overrunPct >= 20 || overrunMin >= 3 ? 'critical' : 'warning';
    } else if (actualMin !== null && !isRunning) {
      severity = 'nominal';
    }

    steps.push({
      stepId: rStep.id,
      stepNumber: rStep.stepNumber,
      stage: rStep.stage,
      title: rStep.title,
      equipment: rStep.equipment,
      ccpNote: rStep.ccpNote,
      allottedMin,
      actualMin,
      startedAt: log?.startedAt,
      completedAt: log?.completedAt,
      acknowledgedAt: log?.acknowledgedAt,
      acknowledgedBy: log?.acknowledgedBy,
      correctiveAction: log?.correctiveAction,
      isRunning,
      isOverrun,
      overrunMin,
      overrunPct,
      severity,
    });
  }

  // Include any orphaned historical CCP logs not currently in recipe.steps
  for (const log of existingLogs) {
    if (seenStepIds.has(log.stepId)) continue;
    const allottedMin = Number(log.allottedMin) || 0;
    const isRunning = Boolean(log.startedAt && !log.completedAt && log.actualMin === null);
    let actualMin: number | null =
      log.actualMin !== undefined && log.actualMin !== null
        ? Number(log.actualMin)
        : null;
    if (actualMin === null && isRunning && log.startedAt) {
      const startMs = Date.parse(log.startedAt);
      if (!Number.isNaN(startMs)) {
        actualMin = Math.max(0, Number(((nowMs - startMs) / 60_000).toFixed(2)));
      }
    }
    const isOverrun =
      allottedMin > 0 && actualMin !== null && actualMin > allottedMin + 0.01;
    const overrunMin =
      isOverrun && actualMin !== null
        ? Number((actualMin - allottedMin).toFixed(2))
        : 0;
    const overrunPct =
      isOverrun && allottedMin > 0 ? (overrunMin / allottedMin) * 100 : 0;

    steps.push({
      stepId: log.stepId,
      stepNumber: log.stepNumber,
      stage: log.stage,
      title: log.title,
      equipment: 'Recorded Line Equipment',
      ccpNote: '',
      allottedMin,
      actualMin,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      acknowledgedAt: log.acknowledgedAt,
      acknowledgedBy: log.acknowledgedBy,
      correctiveAction: log.correctiveAction,
      isRunning,
      isOverrun,
      overrunMin,
      overrunPct,
      severity: isOverrun
        ? overrunPct >= 20 || overrunMin >= 3
          ? 'critical'
          : 'warning'
        : actualMin !== null && !isRunning
        ? 'nominal'
        : 'pending',
    });
  }

  const overruns = steps.filter((s) => s.isOverrun);
  const unacknowledgedOverruns = overruns.filter((s) => !s.acknowledgedAt);
  const runningSteps = steps.filter((s) => s.isRunning);
  const maxOverrunMin =
    overruns.length > 0 ? Math.max(...overruns.map((o) => o.overrunMin)) : 0;

  let status: BatchHaccpSummary['status'] = 'none';
  if (steps.length === 0) {
    status = 'none';
  } else if (unacknowledgedOverruns.length > 0) {
    status = 'alert';
  } else if (overruns.length > 0) {
    status = 'acknowledged';
  } else if (runningSteps.length > 0) {
    status = 'running';
  } else if (steps.some((s) => s.actualMin !== null)) {
    status = 'compliant';
  }

  return {
    steps,
    overruns,
    unacknowledgedOverruns,
    runningSteps,
    maxOverrunMin,
    status,
  };
}

export function buildAllHaccpAlerts(
  batches: ProductionBatch[],
  recipes: Recipe[],
  nowMs: number = Date.now()
): {
  byBatchId: Map<string, BatchHaccpSummary>;
  alerts: HaccpBatchAlert[];
  activeAlertCount: number;
  acknowledgedAlertCount: number;
} {
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const byBatchId = new Map<string, BatchHaccpSummary>();
  const alerts: HaccpBatchAlert[] = [];

  for (const batch of batches) {
    const summary = evaluateBatchHaccp(batch, recipeMap.get(batch.recipeId), nowMs);
    byBatchId.set(batch.id, summary);
    for (const step of summary.overruns) {
      alerts.push({
        id: `${batch.id}::${step.stepId}`,
        batch,
        step,
        isAcknowledged: Boolean(step.acknowledgedAt),
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.isAcknowledged !== b.isAcknowledged) {
      return a.isAcknowledged ? 1 : -1;
    }
    if (b.step.overrunMin !== a.step.overrunMin) {
      return b.step.overrunMin - a.step.overrunMin;
    }
    return Date.parse(b.batch.startedAt) - Date.parse(a.batch.startedAt);
  });

  const activeAlertCount = alerts.filter((a) => !a.isAcknowledged).length;
  const acknowledgedAlertCount = alerts.length - activeAlertCount;

  return {
    byBatchId,
    alerts,
    activeAlertCount,
    acknowledgedAlertCount,
  };
}

export function serializeEvaluatedStepsToLogs(
  steps: EvaluatedCcpStep[]
): BatchCcpStepLog[] {
  return steps.map((s) => ({
    stepId: s.stepId,
    stepNumber: s.stepNumber,
    title: s.title,
    stage: s.stage,
    allottedMin: s.allottedMin,
    actualMin: s.isRunning ? null : s.actualMin,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    acknowledgedAt: s.acknowledgedAt,
    acknowledgedBy: s.acknowledgedBy,
    correctiveAction: s.correctiveAction,
  }));
}
