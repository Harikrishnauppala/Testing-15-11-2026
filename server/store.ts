import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BatchCcpStepLog,
  FactoryDatabase,
  Ingredient,
  IngredientSupplier,
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  QaStatus,
  Recipe,
  WorkerBatchSheetPayload,
} from '../src/types/factory.ts';
import { SEED_DATABASE } from './seedData.ts';
import { buildWorkerMakingSteps } from '../src/utils/makingChart.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'factory-db.json');

let writeQueue = Promise.resolve();

function normalizeIngredient(ing: Ingredient): Ingredient {
  const rawList = Array.isArray(ing.suppliers) ? ing.suppliers : [];
  let suppliers: IngredientSupplier[] = rawList
    .map((s, idx) => ({
      id: s.id || `sup-${ing.id}-${idx + 1}`,
      name: String(s.name || '').trim(),
      contactName: String(s.contactName || '').trim(),
      email: String(s.email || '').trim(),
      leadTimeDays: Math.max(0, Number(s.leadTimeDays) || 0),
      isPrimary: Boolean(s.isPrimary),
    }))
    .filter((s) => s.name || s.contactName || s.email);

  if (suppliers.length === 0 && ing.supplier && ing.supplier.trim()) {
    suppliers = [
      {
        id: `sup-${ing.id}-1`,
        name: ing.supplier.trim(),
        contactName: '',
        email: '',
        leadTimeDays: 7,
        isPrimary: true,
      },
    ];
  }

  if (suppliers.length > 0) {
    let primaryIdx = suppliers.findIndex((s) => s.isPrimary);
    if (primaryIdx < 0) primaryIdx = 0;
    suppliers = suppliers.map((s, idx) => ({
      ...s,
      isPrimary: idx === primaryIdx,
    }));
  }

  const primary = suppliers.find((s) => s.isPrimary) || suppliers[0];
  return {
    ...ing,
    supplier: primary ? primary.name : ing.supplier || '',
    suppliers,
  };
}

async function ensureDbFile(): Promise<FactoryDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as FactoryDatabase;
    if (parsed.seedVersion === SEED_DATABASE.seedVersion) {
      const seedBatchMap = new Map(SEED_DATABASE.batches.map((b) => [b.id, b]));
      const seedRecipeMap = new Map(SEED_DATABASE.recipes.map((r) => [r.id, r]));
      const needsMachinesMigration = !Array.isArray(parsed.machines);

      const batches = Array.isArray(parsed.batches)
        ? parsed.batches.map((b) => {
            const seeded = seedBatchMap.get(b.id);
            let next = b;
            if (b.ccpStepLogs === undefined && seeded?.ccpStepLogs) {
              next = { ...next, ccpStepLogs: structuredClone(seeded.ccpStepLogs) };
            }
            if (needsMachinesMigration && seeded) {
              next = { ...next, lineName: seeded.lineName };
            }
            return next;
          })
        : [];

      const recipes = Array.isArray(parsed.recipes)
        ? parsed.recipes.map((r) => {
            if (!needsMachinesMigration) return r;
            const seeded = seedRecipeMap.get(r.id);
            if (!seeded) return r;
            return {
              ...r,
              steps: structuredClone(seeded.steps),
            };
          })
        : [];

      const machines = Array.isArray(parsed.machines)
        ? parsed.machines
        : structuredClone(SEED_DATABASE.machines || []);

      const needsPmMigration = !Array.isArray(parsed.maintenanceTasks);
      const maintenanceTasks = Array.isArray(parsed.maintenanceTasks)
        ? parsed.maintenanceTasks
        : structuredClone(SEED_DATABASE.maintenanceTasks || []);

      const needsResourceSeed = !parsed.resourceSeeded;
      let mergedBatches = batches;
      if (needsResourceSeed) {
        const existingIds = new Set(batches.map((b) => b.id));
        const extraScheduled = SEED_DATABASE.batches.filter(
          (b) => b.runStatus === 'Scheduled' && !existingIds.has(b.id)
        );
        if (extraScheduled.length > 0) {
          mergedBatches = [...extraScheduled, ...batches];
        }
      }

      const result: FactoryDatabase = {
        ...parsed,
        resourceSeeded: true,
        machines,
        maintenanceTasks,
        recipes,
        ingredients: Array.isArray(parsed.ingredients)
          ? parsed.ingredients.map(normalizeIngredient)
          : [],
        batches: mergedBatches,
      };

      if (needsMachinesMigration || needsPmMigration || needsResourceSeed) {
        await fs.writeFile(DB_FILE, JSON.stringify(result, null, 2), 'utf-8');
      }
      return result;
    }
  } catch {
    // file missing or invalid; initialize below
  }
  const initial = structuredClone(SEED_DATABASE);
  await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

async function saveDb(db: FactoryDatabase): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    await fs.rename(tmpFile, DB_FILE);
  });
  await writeQueue;
}

export async function getWorkspace(): Promise<FactoryDatabase> {
  return ensureDbFile();
}

export async function updateFactorySettings(
  factoryName: string,
  plantCode: string
): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  db.factoryName = factoryName.trim() || db.factoryName;
  db.plantCode = plantCode.trim() || db.plantCode;
  await saveDb(db);
  return db;
}

export async function upsertRecipe(recipe: Recipe): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  const idx = db.recipes.findIndex((r) => r.id === recipe.id);
  const updated: Recipe = {
    ...recipe,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    db.recipes[idx] = updated;
  } else {
    db.recipes.unshift(updated);
  }
  await saveDb(db);
  return db;
}

export async function deleteRecipe(recipeId: string): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  db.recipes = db.recipes.filter((r) => r.id !== recipeId);
  await saveDb(db);
  return db;
}

export async function upsertIngredient(ingredient: Ingredient): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  const normalized = normalizeIngredient(ingredient);
  const idx = db.ingredients.findIndex((i) => i.id === normalized.id);
  if (idx >= 0) {
    db.ingredients[idx] = normalized;
  } else {
    db.ingredients.push(normalized);
  }
  await saveDb(db);
  return db;
}

export async function deleteIngredient(ingredientId: string): Promise<{ ok: boolean; error?: string; db?: FactoryDatabase }> {
  const db = await ensureDbFile();
  const usedIn = db.recipes.filter((r) => r.bom.some((b) => b.ingredientId === ingredientId));
  if (usedIn.length > 0) {
    return {
      ok: false,
      error: `Cannot delete: used in ${usedIn.map((r) => r.code).join(', ')}. Remove it from those BOMs first.`,
    };
  }
  db.ingredients = db.ingredients.filter((i) => i.id !== ingredientId);
  await saveDb(db);
  return { ok: true, db };
}

export async function createProductionBatch(batch: ProductionBatch): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  // Deduct consumed raw materials from stock only for active/completed runs (floor at 0)
  if (batch.runStatus !== 'Scheduled') {
    for (const item of batch.consumedLots) {
      const ing = db.ingredients.find((i) => i.id === item.ingredientId);
      if (ing) {
        ing.stockKg = Math.max(0, Number((ing.stockKg - item.requiredKg).toFixed(3)));
      }
    }
  }
  db.batches.unshift(batch);
  await saveDb(db);
  return db;
}

export async function updateBatchQaStatus(
  batchId: string,
  qaStatus?: QaStatus,
  actualOutputKg?: number,
  ccpStepLogs?: BatchCcpStepLog[],
  startedAt?: string,
  runStatus?: 'Completed' | 'Scheduled'
): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  const batch = db.batches.find((b) => b.id === batchId);
  if (batch) {
    if (qaStatus) {
      batch.qaStatus = qaStatus;
    }
    if (typeof actualOutputKg === 'number' && Number.isFinite(actualOutputKg)) {
      batch.actualOutputKg = actualOutputKg;
    }
    if (Array.isArray(ccpStepLogs)) {
      batch.ccpStepLogs = ccpStepLogs;
    }
    if (typeof startedAt === 'string' && startedAt.trim()) {
      batch.startedAt = startedAt.trim();
    }
    if (runStatus === 'Completed' || runStatus === 'Scheduled') {
      batch.runStatus = runStatus;
    }
  }
  await saveDb(db);
  return db;
}

export async function upsertMachine(machine: PlantMachine): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  const list = Array.isArray(db.machines) ? db.machines : [];
  const idx = list.findIndex((m) => m.id === machine.id);
  if (idx >= 0) {
    list[idx] = machine;
  } else {
    list.push(machine);
  }
  db.machines = list;
  await saveDb(db);
  return db;
}

export async function deleteMachine(machineId: string): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  db.machines = (db.machines || []).filter((m) => m.id !== machineId);
  await saveDb(db);
  return db;
}

export async function upsertMaintenanceTask(task: MaintenanceTask): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  const list = Array.isArray(db.maintenanceTasks) ? db.maintenanceTasks : [];
  const idx = list.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    list[idx] = task;
  } else {
    list.unshift(task);
  }
  db.maintenanceTasks = list;
  await saveDb(db);
  return db;
}

export async function deleteMaintenanceTask(taskId: string): Promise<FactoryDatabase> {
  const db = await ensureDbFile();
  db.maintenanceTasks = (db.maintenanceTasks || []).filter((t) => t.id !== taskId);
  await saveDb(db);
  return db;
}

export async function importWorkspace(payload: FactoryDatabase): Promise<FactoryDatabase> {
  const sanitized: FactoryDatabase = {
    seedVersion: SEED_DATABASE.seedVersion,
    resourceSeeded: true,
    factoryName: payload.factoryName || 'MillWorks Plant 01',
    plantCode: payload.plantCode || 'MW-P01',
    recipes: Array.isArray(payload.recipes) ? payload.recipes : [],
    ingredients: Array.isArray(payload.ingredients)
      ? payload.ingredients.map(normalizeIngredient)
      : [],
    batches: Array.isArray(payload.batches) ? payload.batches : [],
    machines: Array.isArray(payload.machines)
      ? payload.machines
      : structuredClone(SEED_DATABASE.machines || []),
    maintenanceTasks: Array.isArray(payload.maintenanceTasks)
      ? payload.maintenanceTasks
      : structuredClone(SEED_DATABASE.maintenanceTasks || []),
  };
  await saveDb(sanitized);
  return sanitized;
}

export async function resetWorkspace(): Promise<FactoryDatabase> {
  const fresh = structuredClone(SEED_DATABASE);
  await saveDb(fresh);
  return fresh;
}

export async function getWorkerBatchSheet(
  idOrLot: string
): Promise<WorkerBatchSheetPayload | null> {
  const db = await ensureDbFile();
  const key = idOrLot.trim();
  const batch = db.batches.find((b) => b.id === key || b.lotCode === key);
  if (!batch) return null;

  const items = batch.consumedLots.map((lot, idx) => ({
    seq: idx + 1,
    sku: lot.ingredientSku,
    materialName: lot.ingredientName,
    requiredKg: lot.requiredKg,
    lotNumber: lot.lotNumber,
  }));

  const totalWeighKg = items.reduce((sum, item) => sum + item.requiredKg, 0);
  const recipe = db.recipes.find((r) => r.id === batch.recipeId);
  const weighedByIngredientId: Record<
    string,
    { materialName: string; requiredKg: number }
  > = {};
  for (const lot of batch.consumedLots) {
    weighedByIngredientId[lot.ingredientId] = {
      materialName: lot.ingredientName,
      requiredKg: lot.requiredKg,
    };
  }
  const makingSteps = buildWorkerMakingSteps({
    recipe,
    ingredients: db.ingredients,
    weighedByIngredientId,
    multiplier: batch.multiplier,
  });

  return {
    batchId: batch.id,
    lotCode: batch.lotCode,
    factoryName: db.factoryName,
    plantCode: db.plantCode,
    lineName: batch.lineName,
    startedAt: batch.startedAt,
    qaStatus: batch.qaStatus,
    totalWeighKg: Number(totalWeighKg.toFixed(3)),
    itemCount: items.length,
    operator: batch.operator,
    notes: batch.notes,
    items,
    makingSteps,
  };
}
