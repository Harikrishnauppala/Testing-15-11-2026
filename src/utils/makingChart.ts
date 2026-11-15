import type {
  Ingredient,
  Recipe,
  WorkerMakingStep,
  WorkerMakingStepInput,
} from '../types/factory.ts';

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

function extractStagePrefix(stage: string): string {
  const m = stage.trim().match(/^stage\s*\d+/i);
  return m ? m[0].toLowerCase().replace(/\s+/g, '') : '';
}

const STAGE_KEYWORDS = [
  'pulveriz',
  'mill',
  'grind',
  'cream',
  'dry',
  'wet',
  'emulsion',
  'dough',
  'syrup',
  'herb',
  'spice',
  'fat',
  'oil',
  'fruit',
  'grain',
  'binder',
  'crisp',
  'chip',
  'fold',
  'seed',
  'topping',
];

function findMatchingStepIndex(
  bomStage: string,
  steps: Recipe['steps']
): number {
  if (steps.length === 0) return -1;
  const target = normalizeText(bomStage);

  // 1. Exact stage match
  const exactIdx = steps.findIndex((s) => normalizeText(s.stage) === target);
  if (exactIdx >= 0) return exactIdx;

  // 2. Stage number prefix match (e.g. "Stage 2:" -> "Stage 2:")
  const targetPrefix = extractStagePrefix(bomStage);
  if (targetPrefix) {
    const prefixIdx = steps.findIndex(
      (s) => extractStagePrefix(s.stage) === targetPrefix
    );
    if (prefixIdx >= 0) return prefixIdx;
  }

  // 3. Keyword overlap against step stage or title
  for (const kw of STAGE_KEYWORDS) {
    if (target.includes(kw)) {
      const kwIdx = steps.findIndex(
        (s) =>
          normalizeText(s.stage).includes(kw) ||
          normalizeText(s.title).includes(kw)
      );
      if (kwIdx >= 0) return kwIdx;
    }
  }

  // 4. Fallback to first mixing/prep step (never leave a weighed bag unassigned)
  return 0;
}

export function buildWorkerMakingSteps(params: {
  recipe?: Recipe | null;
  ingredients?: Ingredient[];
  weighedByIngredientId?: Record<
    string,
    { materialName: string; requiredKg: number }
  >;
  multiplier?: number;
}): WorkerMakingStep[] {
  const { recipe, ingredients = [], weighedByIngredientId = {}, multiplier = 1 } =
    params;
  if (!recipe || !Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    return [];
  }

  const sortedSteps = recipe.steps
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber);

  const ingredientNameMap = new Map(ingredients.map((i) => [i.id, i.name]));
  const stepInputs: WorkerMakingStepInput[][] = sortedSteps.map(() => []);

  for (const bomLine of recipe.bom || []) {
    const weighed = weighedByIngredientId[bomLine.ingredientId];
    const materialName =
      weighed?.materialName ||
      ingredientNameMap.get(bomLine.ingredientId) ||
      'Material';
    const requiredKg =
      weighed !== undefined
        ? weighed.requiredKg
        : Number(((Number(bomLine.quantityKg) || 0) * multiplier).toFixed(3));

    if (requiredKg <= 0) continue;

    const targetStepIdx = findMatchingStepIndex(bomLine.stage || '', sortedSteps);
    if (targetStepIdx >= 0) {
      stepInputs[targetStepIdx].push({
        materialName,
        requiredKg: Number(requiredKg.toFixed(3)),
      });
    }
  }

  return sortedSteps.map((step, idx) => ({
    stepNumber: idx + 1,
    stage: step.stage,
    actionTitle: step.title,
    equipment: step.equipment,
    durationMin: step.durationMin,
    targetTempC: step.targetTempC,
    speedOrSetting: step.speedOrSetting,
    checkNote: step.ccpNote || '',
    isCcp: Boolean(step.isCcp),
    addMaterials: stepInputs[idx],
  }));
}
