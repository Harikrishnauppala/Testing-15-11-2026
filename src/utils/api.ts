import type {
  BatchCcpStepLog,
  FactoryDatabase,
  Ingredient,
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  QaStatus,
  Recipe,
  WorkerBatchSheetPayload,
} from '../types/factory';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore json parse errors
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const factoryApi = {
  getWorkspace: () => request<FactoryDatabase>('/api/workspace'),
  updateFactorySettings: (factoryName: string, plantCode: string) =>
    request<FactoryDatabase>('/api/factory-settings', {
      method: 'PUT',
      body: JSON.stringify({ factoryName, plantCode }),
    }),
  saveRecipe: (recipe: Recipe) =>
    request<FactoryDatabase>(`/api/recipes/${encodeURIComponent(recipe.id)}`, {
      method: 'PUT',
      body: JSON.stringify(recipe),
    }),
  createRecipe: (recipe: Recipe) =>
    request<FactoryDatabase>('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe),
    }),
  deleteRecipe: (id: string) =>
    request<FactoryDatabase>(`/api/recipes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  saveIngredient: (ingredient: Ingredient) =>
    request<FactoryDatabase>(`/api/ingredients/${encodeURIComponent(ingredient.id)}`, {
      method: 'PUT',
      body: JSON.stringify(ingredient),
    }),
  createIngredient: (ingredient: Ingredient) =>
    request<FactoryDatabase>('/api/ingredients', {
      method: 'POST',
      body: JSON.stringify(ingredient),
    }),
  deleteIngredient: (id: string) =>
    request<FactoryDatabase>(`/api/ingredients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  createMachine: (machine: PlantMachine) =>
    request<FactoryDatabase>('/api/machines', {
      method: 'POST',
      body: JSON.stringify(machine),
    }),
  saveMachine: (machine: PlantMachine) =>
    request<FactoryDatabase>(`/api/machines/${encodeURIComponent(machine.id)}`, {
      method: 'PUT',
      body: JSON.stringify(machine),
    }),
  deleteMachine: (id: string) =>
    request<FactoryDatabase>(`/api/machines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  createMaintenanceTask: (task: MaintenanceTask) =>
    request<FactoryDatabase>('/api/maintenance', {
      method: 'POST',
      body: JSON.stringify(task),
    }),
  saveMaintenanceTask: (task: MaintenanceTask) =>
    request<FactoryDatabase>(`/api/maintenance/${encodeURIComponent(task.id)}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    }),
  deleteMaintenanceTask: (id: string) =>
    request<FactoryDatabase>(`/api/maintenance/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  createBatch: (batch: ProductionBatch) =>
    request<FactoryDatabase>('/api/batches', {
      method: 'POST',
      body: JSON.stringify(batch),
    }),
  updateBatchQa: (id: string, qaStatus: QaStatus, actualOutputKg?: number) =>
    request<FactoryDatabase>(`/api/batches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ qaStatus, actualOutputKg }),
    }),
  updateBatchCcpLogs: (
    id: string,
    ccpStepLogs: BatchCcpStepLog[],
    qaStatus?: QaStatus
  ) =>
    request<FactoryDatabase>(`/api/batches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ccpStepLogs, qaStatus }),
    }),
  updateBatchSchedule: (
    id: string,
    startedAt: string,
    runStatus?: 'Completed' | 'Scheduled'
  ) =>
    request<FactoryDatabase>(`/api/batches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ startedAt, runStatus }),
    }),
  importWorkspace: (payload: FactoryDatabase) =>
    request<FactoryDatabase>('/api/workspace/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetWorkspace: () =>
    request<FactoryDatabase>('/api/workspace/reset', {
      method: 'POST',
    }),
  getWorkerBatchSheet: (idOrLot: string) =>
    request<WorkerBatchSheetPayload>(
      `/api/worker-batch-sheet/${encodeURIComponent(idOrLot)}`
    ),
};
