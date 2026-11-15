import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ArrowLeft,
  Save,
  GitBranch,
  Scale,
  Trash2,
  Plus,
  Download,
  Utensils,
  CheckCircle2,
  FlaskConical,
  Archive,
  RotateCcw,
  GitCompare,
} from 'lucide-react';
import { RecipeDiffView } from './RecipeDiffView';
import { NutritionalAnalysisPanel } from './NutritionalAnalysisPanel';
import type {
  BomLine,
  Ingredient,
  PlantMachine,
  ProcessStep,
  ProductLine,
  Recipe,
  RecipeStatus,
} from '../types/factory';
import {
  calculateRecipeMetrics,
  downloadCsv,
  formatCurrency,
} from '../utils/calculations';
import { RevisionModal, ConfirmModal } from './Modals';

interface FormulationsViewProps {
  recipes: Recipe[];
  ingredients: Ingredient[];
  machines?: PlantMachine[];
  selectedRecipeId: string | null;
  initialTab?: 'bom' | 'process' | 'nutrition' | 'revisions' | 'diff' | null;
  onSelectRecipeId: (id: string | null) => void;
  onSaveRecipe: (recipe: Recipe) => Promise<void>;
  onDeleteRecipe: (recipeId: string) => Promise<void>;
  onOpenScalerForRecipe: (recipeId: string) => void;
}

const PRODUCT_LINES: ('All' | ProductLine)[] = [
  'All',
  'Millet Cookies',
  'Millet Biscuits',
  'Millet Muffins',
  'Ready-to-Eat Snacks',
  'Gluten-Free & R&D',
];

const StatusDisplay: React.FC<{ status: RecipeStatus }> = ({ status }) => {
  if (status === 'Approved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Approved</span>
      </span>
    );
  }
  if (status === 'R&D Trial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span>R&D Trial</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
      <Archive className="h-3.5 w-3.5 shrink-0" />
      <span>Archived</span>
    </span>
  );
};

export const FormulationsView: React.FC<FormulationsViewProps> = ({
  recipes,
  ingredients,
  machines = [],
  selectedRecipeId,
  initialTab = null,
  onSelectRecipeId,
  onSaveRecipe,
  onDeleteRecipe,
  onOpenScalerForRecipe,
}) => {
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState<'All' | ProductLine>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | RecipeStatus>('All');
  const [activeTab, setActiveTab] = useState<'bom' | 'process' | 'nutrition' | 'revisions' | 'diff'>(
    initialTab || 'bom'
  );
  const [diffBaselineKey, setDiffBaselineKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, selectedRecipeId]);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  );

  const [draft, setDraft] = useState<Recipe | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [newIngId, setNewIngId] = useState('');

  useEffect(() => {
    if (selectedRecipe) {
      setDraft(structuredClone(selectedRecipe));
      setIsDirty(false);
      setImgFailed(false);
      setSaveNotice(null);
    } else {
      setDraft(null);
      setIsDirty(false);
    }
  }, [selectedRecipe]);

  // Ctrl+S shortcut to save active formulation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && draft && isDirty) {
        e.preventDefault();
        void handleSaveDirect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (lineFilter !== 'All' && r.productLine !== lineFilter) return false;
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.productLine.toLowerCase().includes(q)
      );
    });
  }, [recipes, search, lineFilter, statusFilter]);

  const savedMetrics = useMemo(
    () => (selectedRecipe ? calculateRecipeMetrics(selectedRecipe, ingredients) : null),
    [selectedRecipe, ingredients]
  );

  const draftMetrics = useMemo(
    () => (draft ? calculateRecipeMetrics(draft, ingredients) : null),
    [draft, ingredients]
  );

  const financialImpact = useMemo(() => {
    if (!draftMetrics || !savedMetrics) return null;
    const batchDelta = draftMetrics.totalBatchCost - savedMetrics.totalBatchCost;
    const batchDeltaPct =
      savedMetrics.totalBatchCost > 0
        ? (batchDelta / savedMetrics.totalBatchCost) * 100
        : 0;
    const costPerKgDelta = draftMetrics.costPerOutputKg - savedMetrics.costPerOutputKg;
    const costPerUnitDelta = draftMetrics.costPerUnit - savedMetrics.costPerUnit;

    const sortedRows = draftMetrics.bomRows
      .slice()
      .sort((a, b) => b.lineCost - a.lineCost);
    const topRow = sortedRows[0];
    const topShare =
      topRow && draftMetrics.totalBatchCost > 0
        ? (topRow.lineCost / draftMetrics.totalBatchCost) * 100
        : 0;

    return {
      batchDelta,
      batchDeltaPct,
      costPerKgDelta,
      costPerUnitDelta,
      topDriverName: topRow?.ingredient?.name || 'None',
      topDriverCost: topRow?.lineCost || 0,
      topDriverShare: topShare,
    };
  }, [draftMetrics, savedMetrics]);

  const savedLineCostMap = useMemo(() => {
    if (!savedMetrics) return new Map<string, number>();
    return new Map(savedMetrics.bomRows.map((r) => [r.line.id, r.lineCost]));
  }, [savedMetrics]);

  const updateDraft = (updater: (prev: Recipe) => Recipe) => {
    setDraft((prev) => {
      if (!prev) return prev;
      setIsDirty(true);
      return updater(prev);
    });
  };

  const handleSaveDirect = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await onSaveRecipe(draft);
      setIsDirty(false);
      setSaveNotice('Formulation saved.');
      setTimeout(() => setSaveNotice(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleCommitRevision = async (version: string, author: string, notes: string) => {
    if (!draft || !draftMetrics) return;
    setSaving(true);
    try {
      const updated: Recipe = {
        ...draft,
        version,
        revisions: [
          {
            version,
            date: new Date().toISOString().slice(0, 10),
            author,
            notes,
            snapshotTotalKg: Number(draftMetrics.expectedOutputKg.toFixed(1)),
            snapshotCostPerKg: Number(draftMetrics.costPerOutputKg.toFixed(2)),
            yieldPctSnapshot: draft.yieldPct,
            bomSnapshot: structuredClone(draft.bom),
            stepsSnapshot: structuredClone(draft.steps),
          },
          ...draft.revisions,
        ],
      };
      await onSaveRecipe(updated);
      setDraft(updated);
      setIsDirty(false);
      setSaveNotice(`Committed ${version}.`);
      setTimeout(() => setSaveNotice(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBomIngredient = () => {
    const targetId = newIngId || ingredients[0]?.id;
    if (!targetId || !draft) return;
    const newLine: BomLine = {
      id: `b-${Date.now()}`,
      ingredientId: targetId,
      stage: draft.bom[draft.bom.length - 1]?.stage || 'Stage 1: Mixing',
      quantityKg: 10,
      processLossPct: 0,
      lotNote: '',
    };
    updateDraft((prev) => ({ ...prev, bom: [...prev.bom, newLine] }));
    setNewIngId('');
  };

  const handleAddProcessStep = () => {
    if (!draft) return;
    const nextNum = draft.steps.length + 1;
    const defaultMachine =
      machines.length > 0
        ? machines[Math.min(draft.steps.length, machines.length - 1)]
        : null;
    const newStep: ProcessStep = {
      id: `st-${Date.now()}`,
      stepNumber: nextNum,
      stage: defaultMachine
        ? `Stage ${nextNum}: ${defaultMachine.stageRole.split('(')[0].trim()}`
        : `Stage ${nextNum}`,
      title: defaultMachine
        ? `${defaultMachine.name} Operation`
        : 'New Manufacturing Operation',
      equipment: defaultMachine ? defaultMachine.name : 'Planetary Mixer',
      targetTempC: defaultMachine ? defaultMachine.defaultTempC : 22,
      durationMin: 12,
      speedOrSetting: defaultMachine ? defaultMachine.defaultSetting : 'Medium Speed',
      ccpNote: '',
      isCcp: defaultMachine?.category === 'Baking & Thermal',
    };
    updateDraft((prev) => ({ ...prev, steps: [...prev.steps, newStep] }));
  };

  const handleExportBomCsv = () => {
    if (!draft || !draftMetrics) return;
    downloadCsv(
      `${draft.code.toLowerCase()}-${draft.version}-bom.csv`,
      ['SKU', 'Ingredient', 'Stage', 'Quantity (kg)', 'Formula %', 'Process Loss %', 'Cost (₹/kg)', 'Line Cost (₹)'],
      draftMetrics.bomRows.map((r) => [
        r.ingredient?.sku || '',
        r.ingredient?.name || '',
        r.line.stage,
        r.line.quantityKg.toFixed(3),
        r.formulaPct.toFixed(2),
        r.line.processLossPct.toFixed(1),
        r.unitCostPerKg.toFixed(2),
        r.lineCost.toFixed(2),
      ])
    );
  };

  // Directory View (when no recipe is opened)
  if (!draft || !draftMetrics) {
    return (
      <div className="space-y-4">
        {/* Filter Toolbar */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search formula code, recipe name..."
                className="w-full rounded-md border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Status:</span>
              <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                {(['All', 'Approved', 'R&D Trial', 'Archived'] as const).map((st) => (
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

          {/* Product Line Segmented Filter */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            {PRODUCT_LINES.map((line) => (
              <button
                key={line}
                type="button"
                onClick={() => setLineFilter(line)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  lineFilter === line
                    ? 'bg-[#005FB8] text-white dark:bg-sky-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {line === 'All' ? 'All Product Lines' : line}
              </button>
            ))}
          </div>
        </div>

        {/* High-Density Formulations Directory Table */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium">Formula Code</th>
                  <th className="py-2.5 px-4 font-medium">Product Formulation</th>
                  <th className="py-2.5 px-4 font-medium">Product Line</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Ver.</th>
                  <th className="py-2.5 px-4 text-right font-medium">Batch Output</th>
                  <th className="py-2.5 px-4 text-right font-medium">Cost / Batch</th>
                  <th className="py-2.5 px-4 text-right font-medium">Cost / kg</th>
                  <th className="py-2.5 px-4 font-medium">Allergens</th>
                  <th className="py-2.5 px-4 text-right font-medium">Quick Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecipes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-sm text-slate-500">
                      No formulations match your current search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRecipes.map((rec) => {
                    const m = calculateRecipeMetrics(rec, ingredients);
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => onSelectRecipeId(rec.id)}
                        className="h-12 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="font-mono py-2 px-4 font-semibold text-[#005FB8] dark:text-sky-400">
                          {rec.code}
                        </td>
                        <td className="py-2 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {rec.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {rec.bom.length} ingredients · {rec.steps.length} process steps ·{' '}
                            {rec.unitWeightG}g pack
                          </div>
                        </td>
                        <td className="py-2 px-4 text-slate-600 dark:text-slate-300">
                          {rec.productLine}
                        </td>
                        <td className="py-2 px-4">
                          <StatusDisplay status={rec.status} />
                        </td>
                        <td className="font-mono py-2 px-4 text-slate-600 dark:text-slate-300">
                          {rec.version}
                        </td>
                        <td className="font-mono py-2 px-4 text-right text-slate-900 tabular-nums dark:text-slate-100">
                          {m.expectedOutputKg.toFixed(1)} kg
                        </td>
                        <td className="font-mono py-2 px-4 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                          {formatCurrency(m.totalBatchCost)}
                        </td>
                        <td className="font-mono py-2 px-4 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                          {formatCurrency(m.costPerOutputKg)}
                        </td>
                        <td className="py-2 px-4 text-slate-600 dark:text-slate-300">
                          {m.allergens.length > 0 ? m.allergens.join(' · ') : 'None'}
                        </td>
                        <td
                          className="py-2 px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenScalerForRecipe(rec.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                          >
                            <Scale className="h-3 w-3" />
                            <span>Scale</span>
                          </button>
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
  }

  // Formula Workbench Detail View
  return (
    <div className="space-y-5">
      {/* Workbench Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectRecipeId(null)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All Formulations</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {saveNotice && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {saveNotice}
            </span>
          )}
          {isDirty && !saveNotice && (
            <>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Unsaved edits
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedRecipe) {
                    setDraft(structuredClone(selectedRecipe));
                    setIsDirty(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Revert</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => onOpenScalerForRecipe(draft.id)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Scale className="h-3.5 w-3.5" />
            <span>Scale Batch</span>
          </button>

          <button
            type="button"
            onClick={() => setRevisionModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>Save Revision</span>
          </button>

          <button
            type="button"
            disabled={!isDirty || saving}
            onClick={handleSaveDirect}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] disabled:opacity-45 whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            aria-label="Delete formulation"
            className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Formula Spec Header Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
          {/* Product Thumbnail with Zero-Broken-Image Fallback */}
          <div className="w-full shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 lg:w-56 dark:border-slate-800 dark:bg-slate-950">
            {draft.imageUrl && !imgFailed ? (
              <img
                src={draft.imageUrl}
                alt={draft.name}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="aspect-[4/3] h-full w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 p-4 text-center dark:from-slate-900 dark:to-slate-800">
                <Utensils className="h-7 w-7 text-slate-400" />
                <span className="font-mono text-xs font-medium text-slate-500">{draft.code}</span>
              </div>
            )}
          </div>

          {/* Editable Formula Metadata */}
          <div className="flex flex-1 flex-col justify-between gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Formula Code
                </label>
                <input
                  type="text"
                  value={draft.code}
                  onChange={(e) => updateDraft((p) => ({ ...p, code: e.target.value }))}
                  className="font-mono w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Product Name
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft((p) => ({ ...p, name: e.target.value }))}
                  className="font-display w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Product Line
                </label>
                <select
                  value={draft.productLine}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, productLine: e.target.value as ProductLine }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {PRODUCT_LINES.filter((l) => l !== 'All').map((pl) => (
                    <option key={pl} value={pl}>
                      {pl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Release Status
                </label>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, status: e.target.value as RecipeStatus }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="Approved">Approved</option>
                  <option value="R&D Trial">R&D Trial</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Active Version
                </label>
                <div className="font-mono rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {draft.version}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Process Yield (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={0.5}
                  value={draft.yieldPct}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, yieldPct: Number(e.target.value) }))
                  }
                  className="font-mono w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Unit Pack Weight (g)
                </label>
                <input
                  type="number"
                  min={1}
                  value={draft.unitWeightG}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, unitWeightG: Number(e.target.value) }))
                  }
                  className="font-mono w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Shelf Life (days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={draft.shelfLifeDays}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, shelfLifeDays: Number(e.target.value) }))
                  }
                  className="font-mono w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Storage Condition
                </label>
                <input
                  type="text"
                  value={draft.storageTemp}
                  onChange={(e) => updateDraft((p) => ({ ...p, storageTemp: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Formulation notes, sensory targets, or customer spec..."
                value={draft.notes}
                onChange={(e) => updateDraft((p) => ({ ...p, notes: e.target.value }))}
                className="w-full rounded border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#005FB8] focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              />
            </div>
          </div>
        </div>

        {/* 4-Column Cost-per-Batch & Financial Impact Summary */}
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Cost per Batch (Raw Materials)
            </div>
            <div className="font-mono mt-0.5 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {formatCurrency(draftMetrics.totalBatchCost)}
            </div>
            {financialImpact && Math.abs(financialImpact.batchDelta) >= 0.01 ? (
              <div
                className={`font-mono mt-0.5 text-[11px] font-medium tabular-nums ${
                  financialImpact.batchDelta > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {financialImpact.batchDelta > 0 ? '+' : ''}
                {formatCurrency(financialImpact.batchDelta)} (
                {financialImpact.batchDelta > 0 ? '+' : ''}
                {financialImpact.batchDeltaPct.toFixed(1)}%) vs saved
              </div>
            ) : (
              <div className="font-mono mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Matches saved baseline
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Finished Cost / kg & Unit
            </div>
            <div className="font-mono mt-0.5 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {formatCurrency(draftMetrics.costPerOutputKg)}/kg
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({formatCurrency(draftMetrics.costPerUnit)}/pack)
              </span>
            </div>
            {financialImpact && Math.abs(financialImpact.costPerKgDelta) >= 0.01 ? (
              <div
                className={`font-mono mt-0.5 text-[11px] font-medium tabular-nums ${
                  financialImpact.costPerKgDelta > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {financialImpact.costPerKgDelta > 0 ? '+' : ''}
                {formatCurrency(financialImpact.costPerKgDelta)}/kg ·{' '}
                {financialImpact.costPerUnitDelta > 0 ? '+' : ''}
                {formatCurrency(financialImpact.costPerUnitDelta)}/pack
              </div>
            ) : (
              <div className="font-mono mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {draftMetrics.unitCount.toLocaleString()} packs @ {draft.unitWeightG}g
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Batch Mass & Output ({draft.yieldPct}% yield)
            </div>
            <div className="font-mono mt-0.5 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {draftMetrics.expectedOutputKg.toFixed(2)} kg
            </div>
            <div className="font-mono mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              From {draftMetrics.totalInputKg.toFixed(2)} kg input mass
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Top Batch Cost Driver
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {financialImpact?.topDriverName || '—'}
            </div>
            <div className="font-mono mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {financialImpact
                ? `${formatCurrency(financialImpact.topDriverCost)} (${financialImpact.topDriverShare.toFixed(1)}% of batch)`
                : 'No BOM items'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md bg-slate-200/70 p-1 dark:bg-slate-800">
          {(
            [
              ['bom', `Bill of Materials (${draft.bom.length})`],
              ['process', `Process & CCPs (${draft.steps.length})`],
              ['nutrition', 'Nutritional Analysis'],
              ['revisions', `Revisions (${draft.revisions.length})`],
              ['diff', 'Version Diff'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tabKey
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'bom' && (
          <button
            type="button"
            onClick={handleExportBomCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export BOM CSV</span>
          </button>
        )}
      </div>

      {/* TAB 1: BILL OF MATERIALS */}
      {activeTab === 'bom' && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-medium">Ingredient</th>
                  <th className="py-2.5 px-3 font-medium">Process Stage</th>
                  <th className="py-2.5 px-3 text-right font-medium">Qty (kg)</th>
                  <th className="py-2.5 px-3 text-right font-medium">Formula %</th>
                  <th className="py-2.5 px-3 text-right font-medium">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right font-medium">Line Cost</th>
                  <th className="py-2.5 px-3 text-right font-medium">Cost %</th>
                  <th className="py-2.5 px-3 text-right font-medium">Loss %</th>
                  <th className="py-2.5 px-3 font-medium">Floor Note</th>
                  <th className="w-10 py-2.5 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {draftMetrics.bomRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      No ingredients in this Bill of Materials yet. Add one below.
                    </td>
                  </tr>
                ) : (
                  draftMetrics.bomRows.map((row) => (
                    <tr key={row.line.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3">
                        <select
                          value={row.line.ingredientId}
                          onChange={(e) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bom: prev.bom.map((b) =>
                                b.id === row.line.id ? { ...b, ingredientId: e.target.value } : b
                              ),
                            }))
                          }
                          className="w-full min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.sku} · {ing.name} ({formatCurrency(ing.costPerKg)}/kg)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.line.stage}
                          onChange={(e) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bom: prev.bom.map((b) =>
                                b.id === row.line.id ? { ...b, stage: e.target.value } : b
                              ),
                            }))
                          }
                          className="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.line.quantityKg}
                          onChange={(e) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bom: prev.bom.map((b) =>
                                b.id === row.line.id
                                  ? { ...b, quantityKg: Number(e.target.value) }
                                  : b
                              ),
                            }))
                          }
                          className="font-mono w-24 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-900 tabular-nums focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </td>
                      <td className="font-mono py-2 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {row.formulaPct.toFixed(2)}%
                      </td>
                      <td className="font-mono py-2 px-3 text-right text-slate-600 tabular-nums dark:text-slate-400">
                        {formatCurrency(row.unitCostPerKg)}/kg
                      </td>
                      <td className="font-mono py-2 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        <div>{formatCurrency(row.lineCost)}</div>
                        {(() => {
                          const prevCost = savedLineCostMap.get(row.line.id);
                          const delta =
                            prevCost === undefined ? row.lineCost : row.lineCost - prevCost;
                          if (!isDirty || Math.abs(delta) < 0.01) return null;
                          return (
                            <div
                              className={`text-[10px] font-medium ${
                                delta > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {delta > 0 ? '+' : ''}
                              {formatCurrency(delta)}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="font-mono py-2 px-3 text-right text-slate-600 tabular-nums dark:text-slate-400">
                        {draftMetrics.totalBatchCost > 0
                          ? `${((row.lineCost / draftMetrics.totalBatchCost) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={row.line.processLossPct}
                          onChange={(e) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bom: prev.bom.map((b) =>
                                b.id === row.line.id
                                  ? { ...b, processLossPct: Number(e.target.value) }
                                  : b
                              ),
                            }))
                          }
                          className="font-mono w-16 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-700 tabular-nums focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="Handling instruction..."
                          value={row.line.lotNote}
                          onChange={(e) =>
                            updateDraft((prev) => ({
                              ...prev,
                              bom: prev.bom.map((b) =>
                                b.id === row.line.id ? { ...b, lotNote: e.target.value } : b
                              ),
                            }))
                          }
                          className="w-44 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((prev) => ({
                              ...prev,
                              bom: prev.bom.filter((b) => b.id !== row.line.id),
                            }))
                          }
                          aria-label="Remove BOM line"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {draftMetrics.bomRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100">
                    <td colSpan={2} className="py-2.5 px-3">
                      Total Cost per Batch
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                      {draftMetrics.totalInputKg.toFixed(2)} kg
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right tabular-nums">100.00%</td>
                    <td className="font-mono py-2.5 px-3 text-right text-slate-500 tabular-nums">
                      {formatCurrency(draftMetrics.costPerInputKg)}/kg avg
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                      {formatCurrency(draftMetrics.totalBatchCost)}
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right tabular-nums">100.0%</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Add Ingredient Row */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <select
              value={newIngId || ingredients[0]?.id || ''}
              onChange={(e) => setNewIngId(e.target.value)}
              className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.sku} — {ing.name} ({formatCurrency(ing.costPerKg)}/kg)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddBomIngredient}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Ingredient to BOM</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: PROCESS & HACCP CRITICAL CONTROL POINTS */}
      {activeTab === 'process' && (
        <div className="space-y-3">
          {draft.steps.map((step, idx) => (
            <div
              key={step.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        steps: p.steps.map((s) =>
                          s.id === step.id ? { ...s, title: e.target.value } : s
                        ),
                      }))
                    }
                    className="font-display w-64 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-[#005FB8] focus:bg-white focus:outline-none dark:text-slate-100 dark:focus:bg-slate-950"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={step.isCcp}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          steps: p.steps.map((s) =>
                            s.id === step.id ? { ...s, isCcp: e.target.checked } : s
                          ),
                        }))
                      }
                      className="accent-red-600"
                    />
                    <span className={step.isCcp ? 'text-red-700 dark:text-red-400' : ''}>
                      HACCP Critical Control Point (CCP)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((p) => ({
                        ...p,
                        steps: p.steps
                          .filter((s) => s.id !== step.id)
                          .map((s, i) => ({ ...s, stepNumber: i + 1 })),
                      }))
                    }
                    aria-label="Delete step"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Stage</label>
                  <input
                    type="text"
                    value={step.stage}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        steps: p.steps.map((s) =>
                          s.id === step.id ? { ...s, stage: e.target.value } : s
                        ),
                      }))
                    }
                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">
                    Plant Machine / Equipment
                  </label>
                  {(() => {
                    const matchedMachine = machines.find(
                      (m) => m.name.toLowerCase() === step.equipment.trim().toLowerCase()
                    );
                    const selectValue = matchedMachine ? matchedMachine.name : '__custom__';
                    return (
                      <div className="space-y-1">
                        {machines.length > 0 && (
                          <select
                            aria-label={`Machine for step ${idx + 1}`}
                            value={selectValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__custom__') {
                                updateDraft((p) => ({
                                  ...p,
                                  steps: p.steps.map((s) =>
                                    s.id === step.id
                                      ? {
                                          ...s,
                                          equipment: matchedMachine
                                            ? `${s.equipment} Line`
                                            : s.equipment,
                                        }
                                      : s
                                  ),
                                }));
                                return;
                              }
                              const chosen = machines.find((m) => m.name === val);
                              updateDraft((p) => ({
                                ...p,
                                steps: p.steps.map((s) =>
                                  s.id === step.id
                                    ? {
                                        ...s,
                                        equipment: chosen ? chosen.name : val,
                                        targetTempC:
                                          chosen && (s.targetTempC === null || s.targetTempC === 22)
                                            ? chosen.defaultTempC
                                            : s.targetTempC,
                                        speedOrSetting:
                                          chosen &&
                                          (!s.speedOrSetting || s.speedOrSetting === 'Medium Speed')
                                            ? chosen.defaultSetting
                                            : s.speedOrSetting,
                                      }
                                    : s
                                ),
                              }));
                            }}
                            className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          >
                            {machines.map((m) => (
                              <option key={m.id} value={m.name}>
                                {m.code} · {m.name}
                                {m.status !== 'Operational' ? ` (${m.status})` : ''}
                              </option>
                            ))}
                            <option value="__custom__">Custom / Multi-Machine...</option>
                          </select>
                        )}
                        {(selectValue === '__custom__' || machines.length === 0) && (
                          <input
                            type="text"
                            value={step.equipment}
                            onChange={(e) =>
                              updateDraft((p) => ({
                                ...p,
                                steps: p.steps.map((s) =>
                                  s.id === step.id ? { ...s, equipment: e.target.value } : s
                                ),
                              }))
                            }
                            placeholder="Enter machine or line equipment..."
                            className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          />
                        )}
                        {matchedMachine && matchedMachine.status !== 'Operational' && (
                          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            Machine currently marked {matchedMachine.status}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Temp (°C)</label>
                    <input
                      type="number"
                      value={step.targetTempC ?? ''}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          steps: p.steps.map((s) =>
                            s.id === step.id
                              ? {
                                  ...s,
                                  targetTempC: e.target.value === '' ? null : Number(e.target.value),
                                }
                              : s
                          ),
                        }))
                      }
                      className="font-mono w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Time (min)</label>
                    <input
                      type="number"
                      min={1}
                      value={step.durationMin}
                      onChange={(e) =>
                        updateDraft((p) => ({
                          ...p,
                          steps: p.steps.map((s) =>
                            s.id === step.id ? { ...s, durationMin: Number(e.target.value) } : s
                          ),
                        }))
                      }
                      className="font-mono w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Speed / Setting</label>
                  <input
                    type="text"
                    value={step.speedOrSetting}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        steps: p.steps.map((s) =>
                          s.id === step.id ? { ...s, speedOrSetting: e.target.value } : s
                        ),
                      }))
                    }
                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="mt-2.5">
                <input
                  type="text"
                  placeholder="SOP / HACCP verification limit..."
                  value={step.ccpNote}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      steps: p.steps.map((s) =>
                        s.id === step.id ? { ...s, ccpNote: e.target.value } : s
                      ),
                    }))
                  }
                  className={`w-full rounded border px-2.5 py-1.5 text-xs focus:outline-none ${
                    step.isCcp
                      ? 'border-red-200 bg-red-50/50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200'
                      : 'border-slate-200 bg-slate-50/70 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddProcessStep}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Process Step</span>
          </button>
        </div>
      )}

      {/* TAB 3: NUTRITIONAL ANALYSIS */}
      {activeTab === 'nutrition' && (
        <NutritionalAnalysisPanel
          key={draft.id}
          draft={draft}
          draftMetrics={draftMetrics}
          savedMetrics={savedMetrics}
          isDirty={isDirty}
        />
      )}

      {/* TAB 4: REVISION HISTORY */}
      {activeTab === 'revisions' && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Version</th>
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Author / QA</th>
                <th className="py-2.5 px-4 font-medium">Engineering Change Note</th>
                <th className="py-2.5 px-4 text-right font-medium">Output</th>
                <th className="py-2.5 px-4 text-right font-medium">Cost / kg</th>
                <th className="py-2.5 px-4 text-right font-medium">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {draft.revisions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No controlled revisions recorded yet. Click "Save Revision" above to log a snapshot.
                  </td>
                </tr>
              ) : (
                draft.revisions.map((rev, i) => (
                  <tr key={`${rev.version}-${i}`}>
                    <td className="font-mono py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {rev.version}
                    </td>
                    <td className="font-mono py-2.5 px-4 text-slate-600 tabular-nums dark:text-slate-400">
                      {rev.date}
                    </td>
                    <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200">{rev.author}</td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{rev.notes}</td>
                    <td className="font-mono py-2.5 px-4 text-right text-slate-700 tabular-nums dark:text-slate-300">
                      {rev.snapshotTotalKg.toFixed(1)} kg
                    </td>
                    <td className="font-mono py-2.5 px-4 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                      {formatCurrency(rev.snapshotCostPerKg)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setDiffBaselineKey(`rev:${rev.version}:${rev.date}`);
                          setActiveTab('diff');
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                      >
                        <GitCompare className="h-3 w-3" />
                        <span>Compare</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: VISUAL VERSION DIFF */}
      {activeTab === 'diff' && (
        <RecipeDiffView
          draft={draft}
          savedRecipe={selectedRecipe}
          isDirty={isDirty}
          ingredients={ingredients}
          initialBaselineKey={diffBaselineKey}
        />
      )}

      <RevisionModal
        open={revisionModalOpen}
        currentVersion={draft.version}
        onClose={() => setRevisionModalOpen(false)}
        onSaveRevision={handleCommitRevision}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title={`Delete ${draft.code} — ${draft.name}?`}
        message="This permanently removes the formulation, its Bill of Materials, and HACCP process steps from the factory database."
        confirmLabel="Delete Formulation"
        destructive
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void onDeleteRecipe(draft.id);
        }}
      />
    </div>
  );
};
