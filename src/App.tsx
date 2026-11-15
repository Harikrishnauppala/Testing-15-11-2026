import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FormulationsView } from './components/FormulationsView';
import { BatchScalerView } from './components/BatchScalerView';
import { IngredientsView } from './components/IngredientsView';
import { MachinesView } from './components/MachinesView';
import { ProductionLogView } from './components/ProductionLogView';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmModal, NewRecipeModal } from './components/Modals';
import {
  PrintableBatchSheet,
  PrintSheetPreviewModal,
} from './components/PrintableBatchSheet';
import { WorkerBatchSheetView } from './components/WorkerBatchSheetView';
import type {
  BatchCcpStepLog,
  FactoryDatabase,
  Ingredient,
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  ProductLine,
  QaStatus,
  Recipe,
  WorkspaceView,
} from './types/factory';
import { factoryApi } from './utils/api';
import {
  calculateRecipeMetrics,
  downloadWorkspaceJson,
  scaleRecipe,
  type ScaledBatchResult,
} from './utils/calculations';

export default function App() {
  const workerParams = useMemo(() => {
    if (typeof window === 'undefined') {
      return { workerSheetId: null, workerSheetDataToken: null };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      workerSheetId: params.get('workerSheet'),
      workerSheetDataToken: params.get('workerSheetData'),
    };
  }, []);
  const isWorkerSheetMode = Boolean(
    workerParams.workerSheetId || workerParams.workerSheetDataToken
  );

  const [db, setDb] = useState<FactoryDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>('formulations');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [formulationInitialTab, setFormulationInitialTab] = useState<
    'bom' | 'process' | 'nutrition' | 'revisions' | 'diff' | null
  >(null);
  const [scalerRecipeId, setScalerRecipeId] = useState<string | null>(null);
  const [highlightedIngredientId, setHighlightedIngredientId] = useState<string | null>(null);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newRecipeModalOpen, setNewRecipeModalOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Dark Mode State synced with <html>
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('batchledger-theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('batchledger-theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  // Print context state
  const [printContext, setPrintContext] = useState<{
    recipe: Recipe | null;
    scaled: ScaledBatchResult | null;
    lotNumbers: Record<string, string>;
    plannedLotCode: string;
    lineName: string;
    operator: string;
  }>({
    recipe: null,
    scaled: null,
    lotNumbers: {},
    plannedLotCode: '',
    lineName: '',
    operator: '',
  });

  const loadWorkspace = useCallback(async () => {
    if (isWorkerSheetMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await factoryApi.getWorkspace();
      setDb(data);
      if (data.recipes.length > 0 && !scalerRecipeId) {
        setScalerRecipeId(data.recipes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to workstation server.');
    } finally {
      setLoading(false);
    }
  }, [isWorkerSheetMode, scalerRecipeId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // Global keyboard shortcuts (Ctrl+K, Ctrl+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setNewRecipeModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const flashBanner = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 3500);
  };

  // Handlers
  const handleCreateRecipe = async (input: {
    code: string;
    name: string;
    productLine: ProductLine;
    yieldPct: number;
    unitWeightG: number;
    shelfLifeDays: number;
    storageTemp: string;
    cloneFromId?: string;
  }) => {
    if (!db) return;
    const source = input.cloneFromId
      ? db.recipes.find((r) => r.id === input.cloneFromId)
      : undefined;

    const newRecipe: Recipe = {
      id: `rec-${Date.now()}`,
      code: input.code,
      name: input.name,
      productLine: input.productLine,
      status: 'R&D Trial',
      version: 'v0.1',
      yieldPct: input.yieldPct,
      unitWeightG: input.unitWeightG,
      targetBatchKg: source ? source.targetBatchKg : 500,
      shelfLifeDays: input.shelfLifeDays,
      storageTemp: input.storageTemp,
      notes: source ? `Cloned from ${source.code} (${source.name}).` : '',
      bom: source
        ? source.bom.map((b, idx) => ({ ...b, id: `b-${Date.now()}-${idx}` }))
        : [],
      steps: source
        ? source.steps.map((s, idx) => ({ ...s, id: `st-${Date.now()}-${idx}` }))
        : [],
      revisions: [
        {
          version: 'v0.1',
          date: new Date().toISOString().slice(0, 10),
          author: 'Plant Engineering',
          notes: source ? `Initial draft cloned from ${source.code}` : 'Initial formulation draft',
          snapshotTotalKg: 0,
          snapshotCostPerKg: 0,
          yieldPctSnapshot: input.yieldPct,
          bomSnapshot: source
            ? source.bom.map((b, idx) => ({ ...b, id: `b-${Date.now()}-${idx}` }))
            : [],
          stepsSnapshot: source
            ? source.steps.map((s, idx) => ({ ...s, id: `st-${Date.now()}-${idx}` }))
            : [],
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    const updated = await factoryApi.createRecipe(newRecipe);
    setDb(updated);
    setActiveView('formulations');
    setSelectedRecipeId(newRecipe.id);
    flashBanner(`Created ${newRecipe.code} — ${newRecipe.name}`);
  };

  const handleSaveRecipe = async (recipe: Recipe) => {
    const updated = await factoryApi.saveRecipe(recipe);
    setDb(updated);
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    const updated = await factoryApi.deleteRecipe(recipeId);
    setDb(updated);
    setSelectedRecipeId(null);
    flashBanner('Formulation deleted.');
  };

  const handleSaveIngredient = async (ingredient: Ingredient, isNew: boolean) => {
    const updated = isNew
      ? await factoryApi.createIngredient(ingredient)
      : await factoryApi.saveIngredient(ingredient);
    setDb(updated);
    flashBanner(isNew ? `Added ${ingredient.sku}` : `Updated ${ingredient.sku}`);
  };

  const handleDeleteIngredient = async (ingredientId: string) => {
    const updated = await factoryApi.deleteIngredient(ingredientId);
    setDb(updated);
    flashBanner('Raw material deleted.');
  };

  const handleSaveMachine = async (machine: PlantMachine, isNew: boolean) => {
    const updated = isNew
      ? await factoryApi.createMachine(machine)
      : await factoryApi.saveMachine(machine);
    setDb(updated);
    flashBanner(isNew ? `Added machine ${machine.name}` : `Updated ${machine.name}`);
  };

  const handleDeleteMachine = async (machineId: string) => {
    const updated = await factoryApi.deleteMachine(machineId);
    setDb(updated);
    flashBanner('Machine removed from plant registry.');
  };

  const handleSaveMaintenanceTask = async (
    task: MaintenanceTask,
    isNew: boolean
  ) => {
    const updated = isNew
      ? await factoryApi.createMaintenanceTask(task)
      : await factoryApi.saveMaintenanceTask(task);
    setDb(updated);
    flashBanner(
      isNew
        ? `Scheduled PM for ${task.machineName} (${task.scheduledDate})`
        : `Updated PM: ${task.title}`
    );
  };

  const handleDeleteMaintenanceTask = async (taskId: string) => {
    const updated = await factoryApi.deleteMaintenanceTask(taskId);
    setDb(updated);
    flashBanner('Maintenance schedule task deleted.');
  };

  const handleLogProductionBatch = async (batch: ProductionBatch) => {
    const updated = await factoryApi.createBatch(batch);
    setDb(updated);
  };

  const handleUpdateQaStatus = async (batchId: string, qaStatus: QaStatus) => {
    const updated = await factoryApi.updateBatchQa(batchId, qaStatus);
    setDb(updated);
  };

  const handleUpdateBatchCcpLogs = async (
    batchId: string,
    ccpStepLogs: BatchCcpStepLog[],
    qaStatus?: QaStatus
  ) => {
    const updated = await factoryApi.updateBatchCcpLogs(batchId, ccpStepLogs, qaStatus);
    setDb(updated);
  };

  const handleUpdateBatchSchedule = async (
    batchId: string,
    startedAt: string,
    runStatus?: 'Completed' | 'Scheduled'
  ) => {
    const updated = await factoryApi.updateBatchSchedule(
      batchId,
      startedAt,
      runStatus
    );
    setDb(updated);
    flashBanner(`Rescheduled production run to ${startedAt.slice(0, 10)}.`);
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FactoryDatabase;
      const updated = await factoryApi.importWorkspace(parsed);
      setDb(updated);
      setSelectedRecipeId(null);
      flashBanner(`Imported backup (${updated.recipes.length} formulas).`);
    } catch (err) {
      flashBanner(
        err instanceof Error ? `Import error: ${err.message}` : 'Invalid JSON backup file.'
      );
    }
  };

  const handleResetWorkspace = async () => {
    const updated = await factoryApi.resetWorkspace();
    setDb(updated);
    setSelectedRecipeId(null);
    setScalerRecipeId(updated.recipes[0]?.id || null);
    flashBanner('Sample factory catalog restored.');
  };

  const handleScaledChange = useCallback(
    (
      recipe: Recipe | null,
      scaled: ScaledBatchResult | null,
      lotNumbers: Record<string, string>,
      plannedLotCode: string,
      lineName: string,
      operator: string
    ) => {
      setPrintContext({ recipe, scaled, lotNumbers, plannedLotCode, lineName, operator });
    },
    []
  );

  // Determine active printable recipe (either current scaler or opened formulation)
  const effectivePrintData = useMemo(() => {
    if (!db) return null;
    if (activeView === 'scaler' && printContext.recipe && printContext.scaled) {
      return printContext;
    }
    if (activeView === 'formulations' && selectedRecipeId) {
      const rec = db.recipes.find((r) => r.id === selectedRecipeId);
      if (rec) {
        const scaled = scaleRecipe(rec, db.ingredients, 'multiplier', 1);
        return {
          recipe: rec,
          scaled,
          lotNumbers: {},
          plannedLotCode: '',
          lineName: 'Production Floor',
          operator: 'Floor Operator',
        };
      }
    }
    return null;
  }, [db, activeView, printContext, selectedRecipeId]);

  const handlePrint = () => {
    if (!effectivePrintData) return;
    setPrintPreviewOpen(true);
  };

  // Breadcrumb calculation
  const breadcrumbs = useMemo(() => {
    const plant = db?.factoryName || 'MillWorks Plant 01';
    if (activeView === 'formulations') {
      const activeRec = db?.recipes.find((r) => r.id === selectedRecipeId);
      return activeRec
        ? [plant, 'Formulations', `${activeRec.code} · ${activeRec.name}`]
        : [plant, 'Formulations'];
    }
    if (activeView === 'scaler') return [plant, 'Batch Scaler'];
    if (activeView === 'ingredients') return [plant, 'Raw Materials'];
    if (activeView === 'machines') return [plant, 'Machines & Line'];
    return [plant, 'Production Log'];
  }, [db, activeView, selectedRecipeId]);

  const lowStockCount = useMemo(
    () => (db ? db.ingredients.filter((i) => i.stockKg <= i.reorderPointKg).length : 0),
    [db]
  );

  const pendingQaCount = useMemo(
    () => (db ? db.batches.filter((b) => b.qaStatus === 'Pending QA').length : 0),
    [db]
  );

  const maintenanceMachineCount = useMemo(
    () => (db?.machines ? db.machines.filter((m) => m.status === 'Maintenance').length : 0),
    [db]
  );

  // Total active recipe count check for unused imports
  void calculateRecipeMetrics;

  if (isWorkerSheetMode) {
    return (
      <WorkerBatchSheetView
        workerSheetId={workerParams.workerSheetId}
        workerSheetDataToken={workerParams.workerSheetDataToken}
      />
    );
  }

  return (
    <div className="app-shell flex h-screen w-full overflow-hidden bg-[#F3F5F8] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        factoryName={db?.factoryName || 'MillWorks Plant 01'}
        plantCode={db?.plantCode || 'MW-P01'}
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          setPrintPreviewOpen(false);
          if (v !== 'ingredients') setHighlightedIngredientId(null);
          if (v !== 'formulations') setFormulationInitialTab(null);
        }}
        onOpenCommandPalette={() => setCommandOpen(true)}
        recipeCount={db?.recipes.length || 0}
        lowStockCount={lowStockCount}
        pendingQaCount={pendingQaCount}
        machineCount={db?.machines?.length || 0}
        maintenanceMachineCount={maintenanceMachineCount}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onExportJson={() => {
          if (db) downloadWorkspaceJson(db);
        }}
        onImportJson={(file) => void handleImportJson(file)}
        onRequestReset={() => setResetConfirmOpen(true)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="no-print flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          breadcrumbs={breadcrumbs}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onNewRecipe={() => setNewRecipeModalOpen(true)}
          canPrint={Boolean(effectivePrintData)}
          onPrintSheet={handlePrint}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[1320px]">
            {statusBanner && (
              <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-medium text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">
                {statusBanner}
              </div>
            )}

            {loading ? (
              <div className="space-y-4">
                <div className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
                <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              </div>
            ) : error || !db ? (
              <div className="rounded-lg border border-red-200 bg-white p-6 text-center dark:border-red-900/50 dark:bg-slate-900">
                <div className="font-display text-sm font-semibold text-red-700 dark:text-red-400">
                  Unable to load factory database
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadWorkspace()}
                  className="mt-4 rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              <>
                {activeView === 'formulations' && (
                  <FormulationsView
                    recipes={db.recipes}
                    ingredients={db.ingredients}
                    machines={db.machines || []}
                    selectedRecipeId={selectedRecipeId}
                    initialTab={formulationInitialTab}
                    onSelectRecipeId={(id) => {
                      setFormulationInitialTab(null);
                      setSelectedRecipeId(id);
                    }}
                    onSaveRecipe={handleSaveRecipe}
                    onDeleteRecipe={handleDeleteRecipe}
                    onOpenScalerForRecipe={(id) => {
                      setScalerRecipeId(id);
                      setActiveView('scaler');
                    }}
                  />
                )}

                {activeView === 'scaler' && (
                  <BatchScalerView
                    factoryName={db.factoryName}
                    plantCode={db.plantCode}
                    recipes={db.recipes}
                    ingredients={db.ingredients}
                    batches={db.batches}
                    machines={db.machines || []}
                    selectedRecipeId={scalerRecipeId}
                    onSelectRecipeId={setScalerRecipeId}
                    onScaledChange={handleScaledChange}
                    onPrintBatchSheet={handlePrint}
                    onLogProductionBatch={handleLogProductionBatch}
                    onNavigateToBatches={() => setActiveView('batches')}
                  />
                )}

                {activeView === 'ingredients' && (
                  <IngredientsView
                    ingredients={db.ingredients}
                    recipes={db.recipes}
                    batches={db.batches}
                    onSaveIngredient={handleSaveIngredient}
                    onDeleteIngredient={handleDeleteIngredient}
                    highlightedIngredientId={highlightedIngredientId}
                  />
                )}

                {activeView === 'machines' && (
                  <MachinesView
                    machines={db.machines || []}
                    recipes={db.recipes}
                    batches={db.batches}
                    maintenanceTasks={db.maintenanceTasks || []}
                    onSaveMachine={handleSaveMachine}
                    onDeleteMachine={handleDeleteMachine}
                    onSaveMaintenanceTask={handleSaveMaintenanceTask}
                    onDeleteMaintenanceTask={handleDeleteMaintenanceTask}
                    onScheduleProductionBatch={async (batch) => {
                      await handleLogProductionBatch(batch);
                      flashBanner(
                        `Scheduled ${batch.lotCode} (${batch.recipeCode}) for ${batch.startedAt.slice(0, 10)}.`
                      );
                    }}
                    onUpdateBatchSchedule={handleUpdateBatchSchedule}
                    onOpenRecipeProcess={(recipeId) => {
                      setSelectedRecipeId(recipeId);
                      setFormulationInitialTab('process');
                      setActiveView('formulations');
                    }}
                    onNavigateToBatches={() => setActiveView('batches')}
                  />
                )}

                {activeView === 'batches' && (
                  <ProductionLogView
                    factoryName={db.factoryName}
                    plantCode={db.plantCode}
                    batches={db.batches}
                    recipes={db.recipes}
                    ingredients={db.ingredients}
                    onUpdateQaStatus={handleUpdateQaStatus}
                    onUpdateBatchCcpLogs={handleUpdateBatchCcpLogs}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Print Preview Modal & Ctrl+P Fallback Blind Worker Pick List with QR */}
      {db && effectivePrintData && (
        printPreviewOpen ? (
          <PrintSheetPreviewModal
            open={printPreviewOpen}
            onClose={() => setPrintPreviewOpen(false)}
            factoryName={db.factoryName}
            plantCode={db.plantCode}
            recipe={effectivePrintData.recipe}
            scaled={effectivePrintData.scaled}
            lotNumbers={effectivePrintData.lotNumbers}
            plannedLotCode={effectivePrintData.plannedLotCode}
            matchedBatchId={
              db.batches.find(
                (b) => b.lotCode.trim() === effectivePrintData.plannedLotCode.trim()
              )?.id
            }
            lineName={effectivePrintData.lineName}
            operator={effectivePrintData.operator}
          />
        ) : (
          <PrintableBatchSheet
            factoryName={db.factoryName}
            plantCode={db.plantCode}
            recipe={effectivePrintData.recipe}
            scaled={effectivePrintData.scaled}
            lotNumbers={effectivePrintData.lotNumbers}
            plannedLotCode={effectivePrintData.plannedLotCode}
            matchedBatchId={
              db.batches.find(
                (b) => b.lotCode.trim() === effectivePrintData.plannedLotCode.trim()
              )?.id
            }
            lineName={effectivePrintData.lineName}
            operator={effectivePrintData.operator}
          />
        )
      )}

      {/* Command Palette (Ctrl+K) */}
      {db && (
        <CommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          recipes={db.recipes}
          ingredients={db.ingredients}
          onSelectRecipe={(id) => {
            setActiveView('formulations');
            setSelectedRecipeId(id);
          }}
          onScaleRecipe={(id) => {
            setScalerRecipeId(id);
            setActiveView('scaler');
          }}
          onSelectIngredient={(id) => {
            setHighlightedIngredientId(id);
            setActiveView('ingredients');
          }}
          onNewRecipe={() => setNewRecipeModalOpen(true)}
        />
      )}

      {/* New Formulation Modal */}
      {db && (
        <NewRecipeModal
          open={newRecipeModalOpen}
          onClose={() => setNewRecipeModalOpen(false)}
          existingRecipes={db.recipes}
          onCreate={(data) => void handleCreateRecipe(data)}
        />
      )}

      {/* Restore Sample Catalog Confirmation */}
      <ConfirmModal
        open={resetConfirmOpen}
        title="Restore Sample Factory Catalog?"
        message="This will replace your current formulations, raw material stock levels, and batch logs with the default starter dataset."
        confirmLabel="Restore Sample Data"
        destructive
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => void handleResetWorkspace()}
      />
    </div>
  );
}
