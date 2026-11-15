import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Wrench,
  PauseCircle,
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowRight,
  ShieldAlert,
  Calendar as CalendarIcon,
  Layers,
  X,
} from 'lucide-react';
import type {
  MachineCategory,
  MachineStatus,
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  Recipe,
} from '../types/factory';
import {
  addDaysYmd,
  formatShortDate,
  getTodayYmd,
  summarizeMaintenanceHealth,
} from '../utils/maintenance';
import { buildResourceAvailabilityReport } from '../utils/resourceAvailability';
import { PreventiveMaintenancePanel } from './PreventiveMaintenancePanel';
import { ResourceAvailabilityPanel } from './ResourceAvailabilityPanel';
import { ConfirmModal } from './Modals';

interface MachinesViewProps {
  machines: PlantMachine[];
  recipes: Recipe[];
  batches?: ProductionBatch[];
  maintenanceTasks?: MaintenanceTask[];
  onSaveMachine: (machine: PlantMachine, isNew: boolean) => Promise<void>;
  onDeleteMachine: (machineId: string) => Promise<void>;
  onSaveMaintenanceTask: (task: MaintenanceTask, isNew: boolean) => Promise<void>;
  onDeleteMaintenanceTask: (taskId: string) => Promise<void>;
  onScheduleProductionBatch: (batch: ProductionBatch) => Promise<void>;
  onUpdateBatchSchedule: (
    batchId: string,
    startedAt: string,
    runStatus?: 'Completed' | 'Scheduled'
  ) => Promise<void>;
  onOpenRecipeProcess: (recipeId: string) => void;
  onNavigateToBatches: () => void;
}

const CATEGORIES: MachineCategory[] = [
  'Milling & Grinding',
  'Mixing & Blending',
  'Forming & Depositing',
  'Baking & Thermal',
  'Packaging & Sealing',
  'Other',
];

const STATUSES: MachineStatus[] = ['Operational', 'Maintenance', 'Standby'];

const MachineStatusBadge: React.FC<{ status: MachineStatus }> = ({ status }) => {
  if (status === 'Operational') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Operational</span>
      </span>
    );
  }
  if (status === 'Maintenance') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span>Maintenance</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
      <PauseCircle className="h-3.5 w-3.5 shrink-0" />
      <span>Standby</span>
    </span>
  );
};

interface MachineFormModalProps {
  open: boolean;
  initial: PlantMachine | null;
  nextCode: string;
  onClose: () => void;
  onSave: (machine: PlantMachine, isNew: boolean) => Promise<void>;
}

const MachineFormModal: React.FC<MachineFormModalProps> = ({
  open,
  initial,
  nextCode,
  onClose,
  onSave,
}) => {
  const isNew = !initial;
  const [code, setCode] = useState(initial?.code || nextCode);
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState<MachineCategory>(
    initial?.category || 'Mixing & Blending'
  );
  const [stageRole, setStageRole] = useState(initial?.stageRole || '');
  const [capacitySpec, setCapacitySpec] = useState(initial?.capacitySpec || '');
  const [defaultSetting, setDefaultSetting] = useState(initial?.defaultSetting || '');
  const [defaultTempC, setDefaultTempC] = useState<string>(
    initial?.defaultTempC !== null && initial?.defaultTempC !== undefined
      ? String(initial.defaultTempC)
      : ''
  );
  const [status, setStatus] = useState<MachineStatus>(initial?.status || 'Operational');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const parsedTemp = defaultTempC.trim() === '' ? null : Number(defaultTempC);
      await onSave(
        {
          id: initial?.id || `mch-${Date.now()}`,
          code: code.trim() || nextCode,
          name: name.trim(),
          category,
          stageRole: stageRole.trim() || category,
          capacitySpec: capacitySpec.trim() || 'Standard Batch Capacity',
          defaultSetting: defaultSetting.trim() || 'Standard Operating Setting',
          defaultTempC: parsedTemp !== null && Number.isFinite(parsedTemp) ? parsedTemp : null,
          status,
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
            {isNew ? 'Add Plant Machine' : `Edit ${initial.code} — ${initial.name}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close machine modal"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Asset Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Machine Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Rotary Oven"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Process Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MachineCategory)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Operational Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MachineStatus)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Line Stage Role
              </label>
              <input
                type="text"
                placeholder="e.g., Convection Rack Baking (CCP)"
                value={stageRole}
                onChange={(e) => setStageRole(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Capacity / Spec
              </label>
              <input
                type="text"
                placeholder="e.g., 32-Tray Double Rack Rotary"
                value={capacitySpec}
                onChange={(e) => setCapacitySpec(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Default Speed / Machine Setting
              </label>
              <input
                type="text"
                placeholder="e.g., 45 packs/min · 138°C End Jaw"
                value={defaultSetting}
                onChange={(e) => setDefaultSetting(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Default Temp (°C)
              </label>
              <input
                type="number"
                placeholder="Ambient"
                value={defaultTempC}
                onChange={(e) => setDefaultTempC(e.target.value)}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Operator &amp; Maintenance Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Screen mesh size, CCP checks, sanitation notes..."
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
              {saving ? 'Saving...' : isNew ? 'Add Machine' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const MachinesView: React.FC<MachinesViewProps> = ({
  machines,
  recipes,
  batches = [],
  maintenanceTasks = [],
  onSaveMachine,
  onDeleteMachine,
  onSaveMaintenanceTask,
  onDeleteMaintenanceTask,
  onScheduleProductionBatch,
  onUpdateBatchSchedule,
  onOpenRecipeProcess,
  onNavigateToBatches,
}) => {
  const [activeTab, setActiveTab] = useState<'line' | 'maintenance' | 'availability'>('line');
  const [pmMachineFilter, setPmMachineFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | MachineStatus>('All');
  const [editingMachine, setEditingMachine] = useState<PlantMachine | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlantMachine | null>(null);

  const machineUsageMap = useMemo(() => {
    const map = new Map<string, { recipeCount: number; stepCount: number; ccpCount: number }>();
    for (const m of machines) {
      map.set(m.id, { recipeCount: 0, stepCount: 0, ccpCount: 0 });
    }
    for (const recipe of recipes) {
      const matchedMachineIds = new Set<string>();
      for (const step of recipe.steps) {
        const eqLower = step.equipment.toLowerCase();
        for (const m of machines) {
          if (eqLower.includes(m.name.toLowerCase())) {
            matchedMachineIds.add(m.id);
            const cur = map.get(m.id)!;
            cur.stepCount += 1;
            if (step.isCcp) cur.ccpCount += 1;
          }
        }
      }
      for (const id of matchedMachineIds) {
        map.get(id)!.recipeCount += 1;
      }
    }
    return map;
  }, [machines, recipes]);

  const operationalCount = useMemo(
    () => machines.filter((m) => m.status === 'Operational').length,
    [machines]
  );

  const maintenanceCount = useMemo(
    () => machines.filter((m) => m.status === 'Maintenance').length,
    [machines]
  );

  const ccpMachinesCount = useMemo(() => {
    let count = 0;
    for (const m of machines) {
      if ((machineUsageMap.get(m.id)?.ccpCount || 0) > 0) count += 1;
    }
    return count;
  }, [machines, machineUsageMap]);

  const filteredMachines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return machines.filter((m) => {
      if (statusFilter !== 'All' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.stageRole.toLowerCase().includes(q)
      );
    });
  }, [machines, search, statusFilter]);

  const pmSummary = useMemo(
    () => summarizeMaintenanceHealth(machines, maintenanceTasks, getTodayYmd()),
    [machines, maintenanceTasks]
  );

  const pmByMachineId = useMemo(() => {
    const map = new Map<string, (typeof pmSummary.byMachine)[number]>();
    for (const item of pmSummary.byMachine) {
      map.set(item.machine.id, item);
    }
    return map;
  }, [pmSummary]);

  const availabilitySummary = useMemo(
    () =>
      buildResourceAvailabilityReport({
        machines,
        batches,
        recipes,
        maintenanceTasks,
        windowStartYmd: addDaysYmd(getTodayYmd(), -1),
        dayCount: 14,
      }),
    [machines, batches, recipes, maintenanceTasks]
  );

  const nextMachineCode = `MCH-${String(machines.length + 1).padStart(2, '0')}`;
  const activePmCount =
    pmSummary.overdueTotal + pmSummary.dueSoonTotal + pmSummary.scheduledTotal;

  return (
    <div className="space-y-5">
      {/* 4-Column Plant Machinery & PM KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Registered Plant Machines
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{machines.length}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {ccpMachinesCount} CCP · {recipes.length} SKUs
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Line Operational Readiness
          </div>
          <div
            className={`font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums ${
              maintenanceCount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <span>
              {operationalCount} / {machines.length}
            </span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {maintenanceCount > 0 ? `${maintenanceCount} maint.` : 'all ready'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setPmMachineFilter(null);
            setActiveTab('maintenance');
          }}
          className="rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#005FB8] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Preventive Maintenance
          </div>
          <div
            className={`font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums ${
              pmSummary.overdueTotal > 0
                ? 'text-red-700 dark:text-red-400'
                : pmSummary.dueSoonTotal > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <span>{pmSummary.overdueTotal + pmSummary.dueSoonTotal}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {pmSummary.overdueTotal > 0
                ? `${pmSummary.overdueTotal} overdue · ${pmSummary.dueSoonTotal} ≤7d`
                : `${pmSummary.dueSoonTotal} due ≤7d`}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('availability')}
          className="rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#005FB8] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Schedule × PM Conflicts
          </div>
          <div
            className={`font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums ${
              availabilitySummary.totalConflictRuns > 0
                ? 'text-red-700 dark:text-red-400'
                : availabilitySummary.cautionRuns > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <span>{availabilitySummary.totalConflictRuns}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {availabilitySummary.scheduledConflictRuns} upcoming ·{' '}
              {availabilitySummary.cautionRuns} caution
            </span>
          </div>
        </button>
      </div>

      {/* Segmented Workspace Sub-Views */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab('line')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'line'
                ? 'bg-[#005FB8] text-white dark:bg-sky-600'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Equipment &amp; Process Line</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'maintenance'
                ? 'bg-[#005FB8] text-white dark:bg-sky-600'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Preventive Maintenance &amp; Health Calendar</span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                activeTab === 'maintenance'
                  ? 'text-sky-100'
                  : pmSummary.overdueTotal > 0
                  ? 'font-semibold text-red-700 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              ({activePmCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('availability')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'availability'
                ? 'bg-[#005FB8] text-white dark:bg-sky-600'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Resource Availability</span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                activeTab === 'availability'
                  ? 'text-sky-100'
                  : availabilitySummary.totalConflictRuns > 0
                  ? 'font-semibold text-red-700 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              ({availabilitySummary.totalConflictRuns > 0
                ? `${availabilitySummary.totalConflictRuns} conflicts`
                : 'Clear'})
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'availability' ? (
        <ResourceAvailabilityPanel
          machines={machines}
          recipes={recipes}
          batches={batches}
          maintenanceTasks={maintenanceTasks}
          onSaveMaintenanceTask={onSaveMaintenanceTask}
          onScheduleProductionBatch={onScheduleProductionBatch}
          onUpdateBatchSchedule={onUpdateBatchSchedule}
          onOpenMachinePm={(machineId) => {
            setPmMachineFilter(machineId);
            setActiveTab('maintenance');
          }}
          onNavigateToBatches={onNavigateToBatches}
        />
      ) : activeTab === 'maintenance' ? (
        <PreventiveMaintenancePanel
          key={pmMachineFilter || 'all'}
          machines={machines}
          tasks={maintenanceTasks}
          initialMachineFilter={pmMachineFilter}
          onSaveTask={onSaveMaintenanceTask}
          onDeleteTask={onDeleteMaintenanceTask}
        />
      ) : (
        <>
          {/* Production Line Process Sequence Overview */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Floor Production Line Sequence
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Standard shop-floor equipment flow used across Formulations, Batch Scaler, and Worker Making Charts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004E98] whitespace-nowrap shrink-0 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Machine</span>
              </button>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-[780px] items-stretch gap-2">
                {machines.map((machine, idx) => {
                  const usage = machineUsageMap.get(machine.id);
                  const pmHealth = pmByMachineId.get(machine.id);
                  return (
                    <React.Fragment key={machine.id}>
                      <div className="flex flex-1 flex-col justify-between rounded-md bg-slate-50 p-3 dark:bg-slate-950/60">
                        <div>
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold">
                              {String(idx + 1).padStart(2, '0')} · {machine.code}
                            </span>
                            <MachineStatusBadge status={machine.status} />
                          </div>
                          <div className="font-display mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {machine.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                            {machine.stageRole}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-[11px] dark:border-slate-800">
                          <div className="font-mono text-slate-700 tabular-nums dark:text-slate-300">
                            {machine.defaultTempC !== null ? `${machine.defaultTempC}°C` : 'Ambient'} ·{' '}
                            {usage?.recipeCount || 0} recipes
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPmMachineFilter(machine.id);
                              setActiveTab('maintenance');
                            }}
                            className={`font-mono block text-left tabular-nums hover:underline ${
                              pmHealth && pmHealth.overdueCount > 0
                                ? 'font-semibold text-red-700 dark:text-red-400'
                                : pmHealth && pmHealth.dueSoonCount > 0
                                ? 'font-medium text-amber-700 dark:text-amber-400'
                                : 'text-[#005FB8] dark:text-sky-400'
                            }`}
                          >
                            {pmHealth?.overdueCount
                              ? `${pmHealth.overdueCount} PM Overdue`
                              : pmHealth?.nextTask
                              ? `Next PM: ${formatShortDate(pmHealth.nextTask.task.scheduledDate)}`
                              : 'Schedule PM'}
                          </button>
                        </div>
                      </div>
                      {idx < machines.length - 1 && (
                        <div className="flex items-center text-slate-400 dark:text-slate-600">
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search machine, code, stage..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            {(['All', ...STATUSES] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Machine Registry Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Machine Specifications &amp; Operational Status
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-medium">Code</th>
                <th className="py-2.5 px-3.5 font-medium">Machine Name &amp; Role</th>
                <th className="py-2.5 px-3.5 font-medium">Capacity / Spec</th>
                <th className="py-2.5 px-3.5 font-medium">Default Settings</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Default Temp</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Formulations</th>
                <th className="py-2.5 px-3.5 font-medium">Status</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMachines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No machines match your filter.
                  </td>
                </tr>
              ) : (
                filteredMachines.map((m) => {
                  const usage = machineUsageMap.get(m.id);
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="font-mono py-2.5 px-3.5 font-semibold text-slate-700 dark:text-slate-300">
                        {m.code}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {m.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.category} · {m.stageRole}
                        </div>
                        {m.notes && (
                          <div className="mt-0.5 max-w-md text-[11px] text-slate-500 dark:text-slate-400">
                            {m.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">
                        {m.capacitySpec}
                      </td>
                      <td className="font-mono py-2.5 px-3.5 text-[11px] text-slate-700 dark:text-slate-300">
                        {m.defaultSetting}
                      </td>
                      <td className="font-mono py-2.5 px-3.5 text-right tabular-nums text-slate-800 dark:text-slate-200">
                        {m.defaultTempC !== null ? `${m.defaultTempC}°C` : 'Ambient'}
                      </td>
                      <td className="font-mono py-2.5 px-3.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        <div>{usage?.recipeCount || 0} recipes</div>
                        {(usage?.ccpCount || 0) > 0 && (
                          <div className="inline-flex items-center gap-1 text-[11px] text-red-700 dark:text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            <span>{usage?.ccpCount} CCP steps</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <select
                          aria-label={`Status for ${m.name}`}
                          value={m.status}
                          onChange={(e) =>
                            void onSaveMachine(
                              { ...m, status: e.target.value as MachineStatus },
                              false
                            )
                          }
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingMachine(m)}
                            aria-label={`Edit ${m.name}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(m)}
                            aria-label={`Delete ${m.name}`}
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

      {/* Product × Machine Process Routing Matrix */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Product Process Routing Across Your Machines
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shows the exact machine sequence and total cycle time configured for each food product.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-medium">Product</th>
                <th className="py-2.5 px-3.5 font-medium">Machine Sequence</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Cycle Time</th>
                <th className="py-2.5 px-3.5 text-right font-medium">CCP Steps</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Configure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recipes.map((r) => {
                const sorted = r.steps.slice().sort((a, b) => a.stepNumber - b.stepNumber);
                const totalMin = sorted.reduce((acc, s) => acc + (s.durationMin || 0), 0);
                const ccpCount = sorted.filter((s) => s.isCcp).length;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {r.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {r.code} · {r.productLine}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">
                      {sorted.length === 0 ? (
                        <span className="text-slate-400">No process steps defined</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sorted.map((step, i) => (
                            <React.Fragment key={step.id}>
                              <span
                                className={
                                  step.isCcp
                                    ? 'font-medium text-red-700 dark:text-red-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }
                              >
                                {step.equipment}
                              </span>
                              {i < sorted.length - 1 && (
                                <span className="text-slate-400">→</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="font-mono py-2.5 px-3.5 text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {totalMin} min
                    </td>
                    <td className="font-mono py-2.5 px-3.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {ccpCount} CCP
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenRecipeProcess(r.id)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                      >
                        Edit Process Steps
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      <MachineFormModal
        key={editingMachine?.id || (addModalOpen ? 'new' : 'closed')}
        open={addModalOpen || Boolean(editingMachine)}
        initial={editingMachine}
        nextCode={nextMachineCode}
        onClose={() => {
          setAddModalOpen(false);
          setEditingMachine(null);
        }}
        onSave={onSaveMachine}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Remove ${deleteTarget.name}?` : ''}
        message="This removes the machine from the plant equipment registry. Existing formulation step text remains unchanged."
        confirmLabel="Remove Machine"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            void onDeleteMachine(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
