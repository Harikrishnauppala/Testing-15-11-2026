import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type {
  MaintenancePriority,
  MaintenanceTask,
  PlantMachine,
} from '../types/factory';
import {
  addDaysYmd,
  buildMonthGrid,
  formatShortDate,
  getShortMachineLabel,
  getTodayYmd,
  summarizeMaintenanceHealth,
  type EvaluatedPmTask,
} from '../utils/maintenance';
import { ConfirmModal } from './Modals';

interface PreventiveMaintenancePanelProps {
  machines: PlantMachine[];
  tasks: MaintenanceTask[];
  initialMachineFilter?: string | null;
  onSaveTask: (task: MaintenanceTask, isNew: boolean) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

const TASK_TYPES: MaintenancePriority[] = ['Routine', 'Calibration', 'Critical'];

interface PmModalProps {
  open: boolean;
  initial: MaintenanceTask | null;
  defaultMachineId?: string;
  defaultDate?: string;
  machines: PlantMachine[];
  onClose: () => void;
  onSave: (task: MaintenanceTask, isNew: boolean) => Promise<void>;
}

const PmTaskModal: React.FC<PmModalProps> = ({
  open,
  initial,
  defaultMachineId,
  defaultDate,
  machines,
  onClose,
  onSave,
}) => {
  const isNew = !initial;
  const fallbackMachine =
    machines.find((m) => m.id === (initial?.machineId || defaultMachineId)) ||
    machines[0];

  const [machineId, setMachineId] = useState(
    initial?.machineId || fallbackMachine?.id || ''
  );
  const [title, setTitle] = useState(initial?.title || '');
  const [taskType, setTaskType] = useState<MaintenancePriority>(
    initial?.taskType || 'Routine'
  );
  const [scheduledDate, setScheduledDate] = useState(
    initial?.scheduledDate || defaultDate || getTodayYmd()
  );
  const [intervalDays, setIntervalDays] = useState<number>(
    initial?.intervalDays ?? 30
  );
  const [technician, setTechnician] = useState(
    initial?.technician || 'R. Deshpande'
  );
  const [status, setStatus] = useState<'Scheduled' | 'Completed'>(
    initial?.status || 'Scheduled'
  );
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const machine = machines.find((m) => m.id === machineId) || fallbackMachine;
    if (!machine || !title.trim() || !scheduledDate) return;
    setSaving(true);
    try {
      await onSave(
        {
          id: initial?.id || `pm-${Date.now()}`,
          machineId: machine.id,
          machineCode: machine.code,
          machineName: machine.name,
          title: title.trim(),
          taskType,
          scheduledDate,
          intervalDays: Math.max(0, Number(intervalDays) || 0),
          technician: technician.trim() || 'Maintenance Team',
          status,
          completedDate:
            status === 'Completed'
              ? initial?.completedDate || getTodayYmd()
              : undefined,
          notes: notes.trim(),
        },
        isNew
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {isNew ? 'Schedule Preventive Maintenance' : 'Edit Maintenance Task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close maintenance modal"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Target Machine
              </label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} · {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Service Type
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as MaintenancePriority)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Maintenance Procedure / Checklist Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g., 80-Mesh Screen Inspection & Rotor Bearing Grease"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Service Date
              </label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Repeat Every (days)
              </label>
              <input
                type="number"
                min={0}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Status
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'Scheduled' | 'Completed')
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Assigned Technician / QA Lead
            </label>
            <input
              type="text"
              required
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Service &amp; Parts Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Food-grade lubricant spec, PID tolerance, spare parts needed..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white hover:bg-[#004E98] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {saving ? 'Saving...' : isNew ? 'Schedule Service' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PreventiveMaintenancePanel: React.FC<
  PreventiveMaintenancePanelProps
> = ({
  machines,
  tasks,
  initialMachineFilter = null,
  onSaveTask,
  onDeleteTask,
}) => {
  const todayYmd = useMemo(() => getTodayYmd(), []);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(
    initialMachineFilter || 'all'
  );
  const [tableFilter, setTableFilter] = useState<
    'upcoming' | 'overdue' | 'completed' | 'all'
  >('upcoming');

  const [calCursor, setCalCursor] = useState(() => {
    const [y, m] = todayYmd.split('-').map(Number);
    return { year: y || 2026, monthZero: (m || 11) - 1 };
  });
  const [selectedDateYmd, setSelectedDateYmd] = useState<string>(todayYmd);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null);
  const [prefillDate, setPrefillDate] = useState<string>(todayYmd);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceTask | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const healthSummary = useMemo(
    () => summarizeMaintenanceHealth(machines, tasks, todayYmd),
    [machines, tasks, todayYmd]
  );

  const filteredEvaluated = useMemo(() => {
    return healthSummary.evaluatedTasks.filter((ev) => {
      if (selectedMachineId !== 'all' && ev.task.machineId !== selectedMachineId) {
        return false;
      }
      if (tableFilter === 'overdue') return ev.state === 'Overdue';
      if (tableFilter === 'completed') return ev.state === 'Completed';
      if (tableFilter === 'upcoming') return ev.state !== 'Completed';
      return true;
    });
  }, [healthSummary.evaluatedTasks, selectedMachineId, tableFilter]);

  const calendarCells = useMemo(
    () => buildMonthGrid(calCursor.year, calCursor.monthZero),
    [calCursor]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EvaluatedPmTask[]>();
    for (const ev of healthSummary.evaluatedTasks) {
      if (selectedMachineId !== 'all' && ev.task.machineId !== selectedMachineId) {
        continue;
      }
      const key =
        ev.state === 'Completed' && ev.task.completedDate
          ? ev.task.completedDate
          : ev.task.scheduledDate;
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [healthSummary.evaluatedTasks, selectedMachineId]);

  const selectedDayEvents = useMemo(
    () => eventsByDate.get(selectedDateYmd) || [],
    [eventsByDate, selectedDateYmd]
  );

  const monthTitle = useMemo(() => {
    return new Date(Date.UTC(calCursor.year, calCursor.monthZero, 1)).toLocaleDateString(
      'en-US',
      { month: 'long', year: 'numeric', timeZone: 'UTC' }
    );
  }, [calCursor]);

  const shiftMonth = (delta: number) => {
    setCalCursor((prev) => {
      const dt = new Date(Date.UTC(prev.year, prev.monthZero + delta, 1));
      return { year: dt.getUTCFullYear(), monthZero: dt.getUTCMonth() };
    });
  };

  const handleCompleteAndRoll = async (ev: EvaluatedPmTask) => {
    const t = ev.task;
    setBusyTaskId(t.id);
    try {
      await onSaveTask(
        {
          ...t,
          status: 'Completed',
          completedDate: todayYmd,
        },
        false
      );
      if (t.intervalDays > 0) {
        const nextDate = addDaysYmd(todayYmd, t.intervalDays);
        await onSaveTask(
          {
            ...t,
            id: `pm-${Date.now()}`,
            scheduledDate: nextDate,
            status: 'Scheduled',
            completedDate: undefined,
          },
          true
        );
      }
    } finally {
      setBusyTaskId(null);
    }
  };

  const renderStateLabel = (ev: EvaluatedPmTask) => {
    if (ev.state === 'Completed') {
      return (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Completed</span>
        </span>
      );
    }
    if (ev.state === 'Overdue') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
          <span>Overdue ({Math.abs(ev.daysUntil)}d)</span>
        </span>
      );
    }
    if (ev.state === 'Due Soon') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{ev.daysUntil === 0 ? 'Due Today' : `Due in ${ev.daysUntil}d`}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-medium text-sky-700 dark:text-sky-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>In {ev.daysUntil}d</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Machine Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedMachineId('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedMachineId === 'all'
                ? 'bg-[#005FB8] text-white dark:bg-sky-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            All Machines ({machines.length})
          </button>
          {machines.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedMachineId(m.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedMachineId === m.id
                  ? 'bg-[#005FB8] text-white dark:bg-sky-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {getShortMachineLabel(m.name)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingTask(null);
            setPrefillDate(selectedDateYmd || todayYmd);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004E98] whitespace-nowrap shrink-0 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Schedule Service</span>
        </button>
      </div>

      {/* Calendar Overview of Machine Health + Selected Day & Per-Machine Health Matrix */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Monthly Calendar Grid (7 columns) */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-[#005FB8] dark:text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Machine Health &amp; Service Calendar — {monthTitle}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const [y, m] = todayYmd.split('-').map(Number);
                  setCalCursor({ year: y || 2026, monthZero: (m || 11) - 1 });
                  setSelectedDateYmd(todayYmd);
                }}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <AlertOctagon className="h-3 w-3 text-red-600 dark:text-red-400" />
              <span>Overdue PM</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              <span>Due &le; 7 Days</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-[#005FB8] dark:text-sky-400" />
              <span>Scheduled</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>Completed</span>
            </span>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-t border-l border-slate-200 dark:border-slate-800">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div
                key={d}
                className="border-r border-b border-slate-200 bg-slate-50 py-1.5 text-center text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"
              >
                {d}
              </div>
            ))}

            {calendarCells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.ymd) || [];
              const isToday = cell.ymd === todayYmd;
              const isSelected = cell.ymd === selectedDateYmd;

              return (
                <button
                  key={cell.ymd}
                  type="button"
                  onClick={() => setSelectedDateYmd(cell.ymd)}
                  className={`flex min-h-[78px] flex-col items-stretch justify-start border-r border-b border-slate-200 p-1.5 text-left transition-colors dark:border-slate-800 ${
                    isSelected
                      ? 'bg-sky-50/80 ring-1 ring-inset ring-[#005FB8] dark:bg-sky-950/40 dark:ring-sky-500'
                      : cell.inMonth
                      ? 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50'
                      : 'bg-slate-50/60 text-slate-400 dark:bg-slate-950/40 dark:text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isToday
                          ? 'font-bold text-[#005FB8] underline underline-offset-2 dark:text-sky-400'
                          : cell.inMonth
                          ? 'font-medium text-slate-700 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {cell.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const cls =
                        ev.state === 'Overdue'
                          ? 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          : ev.state === 'Due Soon'
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : ev.state === 'Completed'
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300';
                      return (
                        <div
                          key={ev.task.id}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${cls}`}
                          title={`${ev.task.machineName}: ${ev.task.title}`}
                        >
                          {getShortMachineLabel(ev.task.machineName)}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className="font-mono text-[10px] text-slate-500">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Day Agenda + Per-Machine Health Summary */}
        <div className="space-y-5 lg:col-span-4">
          {/* Selected Date Service Detail */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 dark:border-slate-800">
              <div>
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Selected Date · {selectedDateYmd}
                </div>
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatShortDate(selectedDateYmd)} Service Agenda
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setPrefillDate(selectedDateYmd);
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Plus className="h-3 w-3" />
                <span>Add</span>
              </button>
            </div>

            {selectedDayEvents.length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                No preventive maintenance logged on {formatShortDate(selectedDateYmd)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedDayEvents.map((ev) => (
                  <div key={ev.task.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {ev.task.machineName}
                      </span>
                      {renderStateLabel(ev)}
                    </div>
                    <div className="mt-0.5 text-slate-700 dark:text-slate-300">
                      {ev.task.title}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {ev.task.taskType} · {ev.task.technician}
                      </span>
                      {ev.state !== 'Completed' && (
                        <button
                          type="button"
                          disabled={busyTaskId === ev.task.id}
                          onClick={() => void handleCompleteAndRoll(ev)}
                          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Machine Health Overview Matrix */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 pb-2.5 dark:border-slate-800">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Machine Health Overview
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Real-time PM compliance across your floor equipment.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {healthSummary.byMachine.map((item) => (
                <div key={item.machine.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.machine.name}
                    </span>
                    {item.grade === 'Critical' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400">
                        <Wrench className="h-3 w-3 shrink-0" />
                        <span>
                          {item.overdueCount > 0
                            ? `${item.overdueCount} Overdue`
                            : 'Maintenance'}
                        </span>
                      </span>
                    ) : item.grade === 'Due Soon' ? (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Service Due Soon</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span>Healthy</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    <span>
                      Next:{' '}
                      {item.nextTask
                        ? formatShortDate(item.nextTask.task.scheduledDate)
                        : 'Unscheduled'}
                    </span>
                    <span>
                      Last:{' '}
                      {item.lastCompletedDate
                        ? formatShortDate(item.lastCompletedDate)
                        : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preventive Maintenance Service Schedule Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Preventive Maintenance Service Schedule
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Completing a recurring task logs today&rsquo;s service date and automatically schedules the next interval.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['upcoming', `Upcoming (${healthSummary.overdueTotal + healthSummary.dueSoonTotal + healthSummary.scheduledTotal})`],
                ['overdue', `Overdue (${healthSummary.overdueTotal})`],
                ['completed', `Completed (${healthSummary.completedTotal})`],
                ['all', 'All'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTableFilter(key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tableFilter === key
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-medium">Schedule Health</th>
                <th className="py-2.5 px-3.5 font-medium">Machine</th>
                <th className="py-2.5 px-3.5 font-medium">Service Procedure</th>
                <th className="py-2.5 px-3.5 font-medium">Type</th>
                <th className="py-2.5 px-3.5 font-medium">Service Date</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Interval</th>
                <th className="py-2.5 px-3.5 font-medium">Technician</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEvaluated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No maintenance tasks match this filter.
                  </td>
                </tr>
              ) : (
                filteredEvaluated.map((ev) => {
                  const t = ev.task;
                  const isBusy = busyTaskId === t.id;
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-3.5">{renderStateLabel(ev)}</td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t.machineName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {t.machineCode}
                        </div>
                      </td>
                      <td className="max-w-md py-2.5 px-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {t.title}
                        </div>
                        {t.notes && (
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {t.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">
                        {t.taskType}
                      </td>
                      <td className="font-mono py-2.5 px-3.5 tabular-nums text-slate-800 dark:text-slate-200">
                        <div>{t.scheduledDate}</div>
                        {t.completedDate && (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            Done {t.completedDate}
                          </div>
                        )}
                      </td>
                      <td className="font-mono py-2.5 px-3.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {t.intervalDays > 0 ? `Every ${t.intervalDays}d` : 'One-off'}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">
                        {t.technician}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {ev.state !== 'Completed' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleCompleteAndRoll(ev)}
                              title="Mark service complete and schedule next interval"
                              className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            >
                              <Check className="h-3 w-3" />
                              <span>Complete</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTask(t);
                              setModalOpen(true);
                            }}
                            aria-label={`Edit ${t.title}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(t)}
                            aria-label={`Delete ${t.title}`}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      <PmTaskModal
        key={editingTask?.id || (modalOpen ? `new-${prefillDate}` : 'closed')}
        open={modalOpen}
        initial={editingTask}
        defaultMachineId={selectedMachineId !== 'all' ? selectedMachineId : undefined}
        defaultDate={prefillDate}
        machines={machines}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
        }}
        onSave={onSaveTask}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Remove "${deleteTarget.title}"?` : ''}
        message="This permanently removes the preventive maintenance record from the schedule."
        confirmLabel="Delete Task"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            void onDeleteTask(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
