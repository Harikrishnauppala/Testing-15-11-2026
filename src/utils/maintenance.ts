import type { MaintenanceTask, PlantMachine } from '../types/factory';

export type EffectivePmState = 'Completed' | 'Overdue' | 'Due Soon' | 'Scheduled';
export type MachineHealthGrade = 'Critical' | 'Due Soon' | 'Healthy';

export interface EvaluatedPmTask {
  task: MaintenanceTask;
  state: EffectivePmState;
  daysUntil: number;
}

export interface MachineHealthSummary {
  machine: PlantMachine;
  grade: MachineHealthGrade;
  overdueCount: number;
  dueSoonCount: number;
  upcomingCount: number;
  completedCount: number;
  nextTask: EvaluatedPmTask | null;
  lastCompletedDate: string | null;
}

export function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmdUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((n) => Number(n));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

export function addDaysYmd(ymd: string, days: number): string {
  const ms = parseYmdUtcMs(ymd);
  if (Number.isNaN(ms)) return ymd;
  const dt = new Date(ms + days * 86_400_000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDaysYmd(targetYmd: string, baseYmd: string): number {
  const t = parseYmdUtcMs(targetYmd);
  const b = parseYmdUtcMs(baseYmd);
  if (Number.isNaN(t) || Number.isNaN(b)) return 0;
  return Math.round((t - b) / 86_400_000);
}

export function evaluatePmTask(
  task: MaintenanceTask,
  todayYmd: string = getTodayYmd()
): EvaluatedPmTask {
  const daysUntil = diffDaysYmd(task.scheduledDate, todayYmd);
  if (task.status === 'Completed') {
    return { task, state: 'Completed', daysUntil };
  }
  if (daysUntil < 0) {
    return { task, state: 'Overdue', daysUntil };
  }
  if (daysUntil <= 7) {
    return { task, state: 'Due Soon', daysUntil };
  }
  return { task, state: 'Scheduled', daysUntil };
}

export function summarizeMaintenanceHealth(
  machines: PlantMachine[],
  tasks: MaintenanceTask[],
  todayYmd: string = getTodayYmd()
): {
  evaluatedTasks: EvaluatedPmTask[];
  byMachine: MachineHealthSummary[];
  overdueTotal: number;
  dueSoonTotal: number;
  scheduledTotal: number;
  completedTotal: number;
} {
  const evaluatedTasks = tasks
    .map((t) => evaluatePmTask(t, todayYmd))
    .sort((a, b) => {
      if (a.state === 'Completed' && b.state !== 'Completed') return 1;
      if (a.state !== 'Completed' && b.state === 'Completed') return -1;
      return a.task.scheduledDate.localeCompare(b.task.scheduledDate);
    });

  let overdueTotal = 0;
  let dueSoonTotal = 0;
  let scheduledTotal = 0;
  let completedTotal = 0;

  for (const ev of evaluatedTasks) {
    if (ev.state === 'Overdue') overdueTotal += 1;
    else if (ev.state === 'Due Soon') dueSoonTotal += 1;
    else if (ev.state === 'Scheduled') scheduledTotal += 1;
    else completedTotal += 1;
  }

  const byMachine: MachineHealthSummary[] = machines.map((machine) => {
    const mTasks = evaluatedTasks.filter(
      (ev) =>
        ev.task.machineId === machine.id ||
        ev.task.machineName.toLowerCase() === machine.name.toLowerCase()
    );
    const overdueCount = mTasks.filter((ev) => ev.state === 'Overdue').length;
    const dueSoonCount = mTasks.filter((ev) => ev.state === 'Due Soon').length;
    const upcoming = mTasks
      .filter((ev) => ev.state !== 'Completed')
      .sort((a, b) => a.task.scheduledDate.localeCompare(b.task.scheduledDate));
    const completed = mTasks
      .filter((ev) => ev.state === 'Completed')
      .sort((a, b) =>
        (b.task.completedDate || b.task.scheduledDate).localeCompare(
          a.task.completedDate || a.task.scheduledDate
        )
      );

    let grade: MachineHealthGrade = 'Healthy';
    if (machine.status === 'Maintenance' || overdueCount > 0) {
      grade = 'Critical';
    } else if (dueSoonCount > 0 || machine.status === 'Standby') {
      grade = 'Due Soon';
    }

    return {
      machine,
      grade,
      overdueCount,
      dueSoonCount,
      upcomingCount: upcoming.length,
      completedCount: completed.length,
      nextTask: upcoming[0] || null,
      lastCompletedDate:
        completed[0]?.task.completedDate || completed[0]?.task.scheduledDate || null,
    };
  });

  return {
    evaluatedTasks,
    byMachine,
    overdueTotal,
    dueSoonTotal,
    scheduledTotal,
    completedTotal,
  };
}

export interface CalendarCell {
  ymd: string;
  day: number;
  inMonth: boolean;
}

export function buildMonthGrid(year: number, monthZeroIdx: number): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, monthZeroIdx, 1));
  const daysInMonth = new Date(Date.UTC(year, monthZeroIdx + 1, 0)).getUTCDate();
  // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const totalCells = startOffset + daysInMonth > 35 ? 42 : 35;

  const gridStartMs = Date.UTC(year, monthZeroIdx, 1 - startOffset);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dt = new Date(gridStartMs + i * 86_400_000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const d = dt.getUTCDate();
    cells.push({
      ymd: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      inMonth: y === year && m === monthZeroIdx,
    });
  }
  return cells;
}

export function formatShortDate(ymd: string): string {
  const ms = parseYmdUtcMs(ymd);
  if (Number.isNaN(ms)) return ymd;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function getShortMachineLabel(name: string): string {
  if (name === 'Horizontal Flow Wrap Packing Machine') return 'Flow Wrap';
  return name;
}
