import type {
  Ingredient,
  ProductionBatch,
  Recipe,
  WorkerBatchSheetPayload,
  WorkerMakingStep,
} from '../types/factory';
import type { ScaledBatchResult } from './calculations';
import { buildWorkerMakingSteps } from './makingChart';

export function buildWorkerSheetFromBatch(
  batch: ProductionBatch,
  factoryName: string,
  plantCode: string,
  recipe?: Recipe | null,
  ingredients: Ingredient[] = []
): WorkerBatchSheetPayload {
  const items = batch.consumedLots.map((lot, idx) => ({
    seq: idx + 1,
    sku: lot.ingredientSku,
    materialName: lot.ingredientName,
    requiredKg: lot.requiredKg,
    lotNumber: lot.lotNumber,
  }));
  const totalWeighKg = items.reduce((sum, item) => sum + item.requiredKg, 0);

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
    ingredients,
    weighedByIngredientId,
    multiplier: batch.multiplier,
  });

  return {
    batchId: batch.id,
    lotCode: batch.lotCode,
    factoryName,
    plantCode,
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

export function buildWorkerSheetFromScaled(input: {
  factoryName: string;
  plantCode: string;
  recipe?: Recipe | null;
  scaled: ScaledBatchResult;
  lotNumbers?: Record<string, string>;
  plannedLotCode?: string;
  lineName?: string;
  operator?: string;
}): WorkerBatchSheetPayload {
  const items = input.scaled.rows.map((row, idx) => ({
    seq: idx + 1,
    sku: row.ingredient?.sku || '—',
    materialName: row.ingredient?.name || 'Unknown Material',
    requiredKg: Number(row.scaledKg.toFixed(3)),
    lotNumber: (input.lotNumbers && input.lotNumbers[row.line.ingredientId]) || '',
  }));

  const weighedByIngredientId: Record<
    string,
    { materialName: string; requiredKg: number }
  > = {};
  for (const row of input.scaled.rows) {
    weighedByIngredientId[row.line.ingredientId] = {
      materialName: row.ingredient?.name || 'Unknown Material',
      requiredKg: Number(row.scaledKg.toFixed(3)),
    };
  }

  const makingSteps = buildWorkerMakingSteps({
    recipe: input.recipe,
    weighedByIngredientId,
    multiplier: input.scaled.multiplier,
  });

  return {
    lotCode: input.plannedLotCode?.trim() || 'PENDING-LOT',
    factoryName: input.factoryName,
    plantCode: input.plantCode,
    lineName: input.lineName?.trim() || 'Production Floor',
    startedAt: new Date().toISOString(),
    qaStatus: 'Pending QA',
    totalWeighKg: Number(input.scaled.scaledInputKg.toFixed(3)),
    itemCount: items.length,
    operator: input.operator?.trim() || 'Floor Operator',
    notes: '',
    items,
    makingSteps,
  };
}

type CompactStepTuple = [
  number,
  string,
  string,
  string,
  number,
  number | null,
  string,
  string,
  number,
  [string, number][],
];

export function encodeWorkerSheetData(payload: WorkerBatchSheetPayload): string {
  // Compact minimal tuple structure to keep QR code density low and strictly worker-safe
  const compact = {
    l: payload.lotCode,
    f: payload.factoryName,
    p: payload.plantCode,
    ln: payload.lineName,
    d: payload.startedAt,
    q: payload.qaStatus,
    o: payload.operator,
    i: payload.items.map((it) => [
      it.sku,
      it.materialName,
      Number(it.requiredKg.toFixed(3)),
      it.lotNumber,
    ]),
    ms: (payload.makingSteps || []).map(
      (s): CompactStepTuple => [
        s.stepNumber,
        s.stage,
        s.actionTitle,
        s.equipment,
        s.durationMin,
        s.targetTempC,
        s.speedOrSetting,
        s.checkNote,
        s.isCcp ? 1 : 0,
        s.addMaterials.map((m) => [
          m.materialName,
          Number(m.requiredKg.toFixed(3)),
        ]),
      ]
    ),
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeWorkerSheetData(token: string): WorkerBatchSheetPayload | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as {
      l: string;
      f: string;
      p: string;
      ln: string;
      d: string;
      q: WorkerBatchSheetPayload['qaStatus'];
      o: string;
      i: [string, string, number, string][];
      ms?: CompactStepTuple[];
    };
    const items = (parsed.i || []).map((tuple, idx) => ({
      seq: idx + 1,
      sku: String(tuple[0] || ''),
      materialName: String(tuple[1] || ''),
      requiredKg: Number(tuple[2]) || 0,
      lotNumber: String(tuple[3] || ''),
    }));
    const makingSteps: WorkerMakingStep[] = (parsed.ms || []).map((tuple, idx) => ({
      stepNumber: Number(tuple[0]) || idx + 1,
      stage: String(tuple[1] || ''),
      actionTitle: String(tuple[2] || ''),
      equipment: String(tuple[3] || ''),
      durationMin: Number(tuple[4]) || 0,
      targetTempC: tuple[5] === null || tuple[5] === undefined ? null : Number(tuple[5]),
      speedOrSetting: String(tuple[6] || ''),
      checkNote: String(tuple[7] || ''),
      isCcp: Boolean(tuple[8]),
      addMaterials: Array.isArray(tuple[9])
        ? tuple[9].map((m) => ({
            materialName: String(m[0] || ''),
            requiredKg: Number(m[1]) || 0,
          }))
        : [],
    }));
    const totalWeighKg = items.reduce((sum, item) => sum + item.requiredKg, 0);
    return {
      lotCode: String(parsed.l || 'BATCH'),
      factoryName: String(parsed.f || 'Factory'),
      plantCode: String(parsed.p || ''),
      lineName: String(parsed.ln || 'Production Floor'),
      startedAt: String(parsed.d || new Date().toISOString()),
      qaStatus: parsed.q || 'Pending QA',
      totalWeighKg: Number(totalWeighKg.toFixed(3)),
      itemCount: items.length,
      operator: String(parsed.o || 'Floor Operator'),
      notes: '',
      items,
      makingSteps,
    };
  } catch {
    return null;
  }
}

export function buildWorkerBatchQrUrl(options: {
  batchId?: string;
  payload: WorkerBatchSheetPayload;
}): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  if (options.batchId) {
    return `${origin}/?workerSheet=${encodeURIComponent(options.batchId)}`;
  }
  const encoded = encodeWorkerSheetData(options.payload);
  return `${origin}/?workerSheetData=${encodeURIComponent(encoded)}`;
}
