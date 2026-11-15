import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  createProductionBatch,
  deleteIngredient,
  deleteMachine,
  deleteMaintenanceTask,
  deleteRecipe,
  getWorkerBatchSheet,
  getWorkspace,
  importWorkspace,
  resetWorkspace,
  updateBatchQaStatus,
  updateFactorySettings,
  upsertIngredient,
  upsertMachine,
  upsertMaintenanceTask,
  upsertRecipe,
} from './server/store.ts';
import type {
  BatchCcpStepLog,
  FactoryDatabase,
  Ingredient,
  MaintenanceTask,
  PlantMachine,
  ProductionBatch,
  QaStatus,
  Recipe,
} from './src/types/factory.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'BatchLedger' });
  });

  // Workspace load
  app.get('/api/workspace', async (_req, res) => {
    try {
      const db = await getWorkspace();
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load workspace' });
    }
  });

  // Factory settings
  app.put('/api/factory-settings', async (req, res) => {
    try {
      const { factoryName, plantCode } = req.body as { factoryName: string; plantCode: string };
      const db = await updateFactorySettings(factoryName, plantCode);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update settings' });
    }
  });

  // Recipes CRUD
  app.post('/api/recipes', async (req, res) => {
    try {
      const recipe = req.body as Recipe;
      const db = await upsertRecipe(recipe);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save recipe' });
    }
  });

  app.put('/api/recipes/:id', async (req, res) => {
    try {
      const recipe = { ...(req.body as Recipe), id: req.params.id };
      const db = await upsertRecipe(recipe);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update recipe' });
    }
  });

  app.delete('/api/recipes/:id', async (req, res) => {
    try {
      const db = await deleteRecipe(req.params.id);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete recipe' });
    }
  });

  // Ingredients CRUD
  app.post('/api/ingredients', async (req, res) => {
    try {
      const ingredient = req.body as Ingredient;
      const db = await upsertIngredient(ingredient);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save ingredient' });
    }
  });

  app.put('/api/ingredients/:id', async (req, res) => {
    try {
      const ingredient = { ...(req.body as Ingredient), id: req.params.id };
      const db = await upsertIngredient(ingredient);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update ingredient' });
    }
  });

  app.delete('/api/ingredients/:id', async (req, res) => {
    try {
      const result = await deleteIngredient(req.params.id);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json(result.db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete ingredient' });
    }
  });

  // Machines CRUD
  app.post('/api/machines', async (req, res) => {
    try {
      const machine = req.body as PlantMachine;
      const db = await upsertMachine(machine);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save machine' });
    }
  });

  app.put('/api/machines/:id', async (req, res) => {
    try {
      const machine = { ...(req.body as PlantMachine), id: req.params.id };
      const db = await upsertMachine(machine);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update machine' });
    }
  });

  app.delete('/api/machines/:id', async (req, res) => {
    try {
      const db = await deleteMachine(req.params.id);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete machine' });
    }
  });

  // Preventive Maintenance CRUD
  app.post('/api/maintenance', async (req, res) => {
    try {
      const task = req.body as MaintenanceTask;
      const db = await upsertMaintenanceTask(task);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save maintenance task' });
    }
  });

  app.put('/api/maintenance/:id', async (req, res) => {
    try {
      const task = { ...(req.body as MaintenanceTask), id: req.params.id };
      const db = await upsertMaintenanceTask(task);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update maintenance task' });
    }
  });

  app.delete('/api/maintenance/:id', async (req, res) => {
    try {
      const db = await deleteMaintenanceTask(req.params.id);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete maintenance task' });
    }
  });

  // Production batches
  app.post('/api/batches', async (req, res) => {
    try {
      const batch = req.body as ProductionBatch;
      const db = await createProductionBatch(batch);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to log production batch' });
    }
  });

  app.patch('/api/batches/:id', async (req, res) => {
    try {
      const { qaStatus, actualOutputKg, ccpStepLogs, startedAt, runStatus } = req.body as {
        qaStatus?: QaStatus;
        actualOutputKg?: number;
        ccpStepLogs?: BatchCcpStepLog[];
        startedAt?: string;
        runStatus?: 'Completed' | 'Scheduled';
      };
      const db = await updateBatchQaStatus(
        req.params.id,
        qaStatus,
        actualOutputKg,
        ccpStepLogs,
        startedAt,
        runStatus
      );
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update batch' });
    }
  });

  // Worker-safe batch sheet endpoint (no costs, suppliers, or recipe formula)
  app.get('/api/worker-batch-sheet/:id', async (req, res) => {
    try {
      const sheet = await getWorkerBatchSheet(req.params.id);
      if (!sheet) {
        res.status(404).json({ error: 'Worker batch sheet not found for this lot or ID.' });
        return;
      }
      res.json(sheet);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load worker batch sheet' });
    }
  });

  // Import / Reset
  app.post('/api/workspace/import', async (req, res) => {
    try {
      const payload = req.body as FactoryDatabase;
      const db = await importWorkspace(payload);
      res.json(db);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid workspace JSON' });
    }
  });

  app.post('/api/workspace/reset', async (_req, res) => {
    try {
      const db = await resetWorkspace();
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reset workspace' });
    }
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BatchLedger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
