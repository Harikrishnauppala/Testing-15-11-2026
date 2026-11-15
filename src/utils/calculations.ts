import type {
  Allergen,
  BomLine,
  FactoryDatabase,
  Ingredient,
  NutritionPer100g,
  Recipe,
} from '../types/factory';

export interface EnrichedBomRow {
  line: BomLine;
  ingredient: Ingredient | undefined;
  formulaPct: number;
  lineCost: number;
  unitCostPerKg: number;
  retainedGramsPer100g: number;
  nutritionContribution: NutritionPer100g;
}

export interface MacroEnergySplit {
  proteinPct: number;
  fatPct: number;
  carbsPct: number;
  proteinKcal: number;
  fatKcal: number;
  carbsKcal: number;
}

export interface RecipeMetrics {
  totalInputKg: number;
  expectedOutputKg: number;
  totalBatchCost: number;
  costPerInputKg: number;
  costPerOutputKg: number;
  costPerUnit: number;
  unitCount: number;
  allergens: Allergen[];
  nutritionPer100g: NutritionPer100g;
  macroEnergySplit: MacroEnergySplit;
  bomRows: EnrichedBomRow[];
}

const ZERO_NUTRITION: NutritionPer100g = {
  calories: 0,
  proteinG: 0,
  fatG: 0,
  satFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fiberG: 0,
  sodiumMg: 0,
};

export function calculateRecipeMetrics(
  recipe: Recipe,
  ingredients: Ingredient[]
): RecipeMetrics {
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  const totalInputKg = recipe.bom.reduce((acc, row) => acc + (Number(row.quantityKg) || 0), 0);
  const yieldFactor = Math.max(1, Math.min(100, recipe.yieldPct || 100)) / 100;
  const expectedOutputKg = totalInputKg * yieldFactor;
  const output100gPortions = expectedOutputKg > 0 ? expectedOutputKg * 10 : 0;

  let totalBatchCost = 0;
  const allergenSet = new Set<Allergen>();

  const totals = {
    calories: 0,
    proteinG: 0,
    fatG: 0,
    satFatG: 0,
    carbsG: 0,
    sugarsG: 0,
    fiberG: 0,
    sodiumMg: 0,
  };

  const bomRows: EnrichedBomRow[] = recipe.bom.map((line) => {
    const ingredient = ingMap.get(line.ingredientId);
    const qty = Number(line.quantityKg) || 0;
    const unitCostPerKg = ingredient ? ingredient.costPerKg : 0;
    const lineCost = qty * unitCostPerKg;
    totalBatchCost += lineCost;

    let retainedGramsPer100g = 0;
    let nutritionContribution: NutritionPer100g = { ...ZERO_NUTRITION };

    if (ingredient) {
      for (const a of ingredient.allergens) {
        allergenSet.add(a);
      }
      const retainedFactor = Math.max(0, 1 - (Number(line.processLossPct) || 0) / 100);
      // qty in kg * 10 = number of 100g portions
      const portions100g = qty * 10 * retainedFactor;
      const contribCalories = portions100g * ingredient.nutritionPer100g.calories;
      const contribProtein = portions100g * ingredient.nutritionPer100g.proteinG;
      const contribFat = portions100g * ingredient.nutritionPer100g.fatG;
      const contribSatFat = portions100g * ingredient.nutritionPer100g.satFatG;
      const contribCarbs = portions100g * ingredient.nutritionPer100g.carbsG;
      const contribSugars = portions100g * ingredient.nutritionPer100g.sugarsG;
      const contribFiber = portions100g * ingredient.nutritionPer100g.fiberG;
      const contribSodium = portions100g * ingredient.nutritionPer100g.sodiumMg;

      totals.calories += contribCalories;
      totals.proteinG += contribProtein;
      totals.fatG += contribFat;
      totals.satFatG += contribSatFat;
      totals.carbsG += contribCarbs;
      totals.sugarsG += contribSugars;
      totals.fiberG += contribFiber;
      totals.sodiumMg += contribSodium;

      if (output100gPortions > 0) {
        retainedGramsPer100g = (qty * retainedFactor * 1000) / output100gPortions;
        nutritionContribution = {
          calories: contribCalories / output100gPortions,
          proteinG: contribProtein / output100gPortions,
          fatG: contribFat / output100gPortions,
          satFatG: contribSatFat / output100gPortions,
          carbsG: contribCarbs / output100gPortions,
          sugarsG: contribSugars / output100gPortions,
          fiberG: contribFiber / output100gPortions,
          sodiumMg: contribSodium / output100gPortions,
        };
      }
    }

    return {
      line,
      ingredient,
      formulaPct: totalInputKg > 0 ? (qty / totalInputKg) * 100 : 0,
      lineCost,
      unitCostPerKg,
      retainedGramsPer100g,
      nutritionContribution,
    };
  });

  const nutritionPer100g: NutritionPer100g =
    output100gPortions > 0
      ? {
          calories: totals.calories / output100gPortions,
          proteinG: totals.proteinG / output100gPortions,
          fatG: totals.fatG / output100gPortions,
          satFatG: totals.satFatG / output100gPortions,
          carbsG: totals.carbsG / output100gPortions,
          sugarsG: totals.sugarsG / output100gPortions,
          fiberG: totals.fiberG / output100gPortions,
          sodiumMg: totals.sodiumMg / output100gPortions,
        }
      : { ...ZERO_NUTRITION };

  const proteinKcal = nutritionPer100g.proteinG * 4;
  const fatKcal = nutritionPer100g.fatG * 9;
  const carbsKcal = nutritionPer100g.carbsG * 4;
  const totalMacroKcal = proteinKcal + fatKcal + carbsKcal;

  const macroEnergySplit: MacroEnergySplit =
    totalMacroKcal > 0
      ? {
          proteinPct: (proteinKcal / totalMacroKcal) * 100,
          fatPct: (fatKcal / totalMacroKcal) * 100,
          carbsPct: (carbsKcal / totalMacroKcal) * 100,
          proteinKcal,
          fatKcal,
          carbsKcal,
        }
      : {
          proteinPct: 0,
          fatPct: 0,
          carbsPct: 0,
          proteinKcal: 0,
          fatKcal: 0,
          carbsKcal: 0,
        };

  const costPerInputKg = totalInputKg > 0 ? totalBatchCost / totalInputKg : 0;
  const costPerOutputKg = expectedOutputKg > 0 ? totalBatchCost / expectedOutputKg : 0;
  const unitWeightG = recipe.unitWeightG > 0 ? recipe.unitWeightG : 0;
  const costPerUnit = unitWeightG > 0 ? (costPerOutputKg * unitWeightG) / 1000 : 0;
  const unitCount = unitWeightG > 0 ? Math.floor((expectedOutputKg * 1000) / unitWeightG) : 0;

  return {
    totalInputKg,
    expectedOutputKg,
    totalBatchCost,
    costPerInputKg,
    costPerOutputKg,
    costPerUnit,
    unitCount,
    allergens: Array.from(allergenSet).sort(),
    nutritionPer100g,
    macroEnergySplit,
    bomRows,
  };
}

export type ScaleMode = 'outputKg' | 'unitCount' | 'multiplier';

export interface ScaledBomRow extends EnrichedBomRow {
  scaledKg: number;
  scaledCost: number;
  stockKg: number;
  shortfallKg: number;
}

export interface ScaledBatchResult {
  multiplier: number;
  scaledInputKg: number;
  scaledOutputKg: number;
  scaledUnitCount: number;
  scaledTotalCost: number;
  rows: ScaledBomRow[];
  hasShortages: boolean;
  shortageCount: number;
}

export function scaleRecipe(
  recipe: Recipe,
  ingredients: Ingredient[],
  mode: ScaleMode,
  targetValue: number
): ScaledBatchResult {
  const base = calculateRecipeMetrics(recipe, ingredients);
  const safeTarget = Math.max(0, Number(targetValue) || 0);

  let multiplier = 1;
  if (mode === 'multiplier') {
    multiplier = safeTarget;
  } else if (mode === 'outputKg') {
    multiplier = base.expectedOutputKg > 0 ? safeTarget / base.expectedOutputKg : 1;
  } else if (mode === 'unitCount') {
    const neededOutputKg = (safeTarget * Math.max(1, recipe.unitWeightG)) / 1000;
    multiplier = base.expectedOutputKg > 0 ? neededOutputKg / base.expectedOutputKg : 1;
  }

  let shortageCount = 0;
  const rows: ScaledBomRow[] = base.bomRows.map((row) => {
    const scaledKg = row.line.quantityKg * multiplier;
    const scaledCost = scaledKg * row.unitCostPerKg;
    const stockKg = row.ingredient ? row.ingredient.stockKg : 0;
    const shortfallKg = Math.max(0, scaledKg - stockKg);
    if (shortfallKg > 0.001) {
      shortageCount += 1;
    }
    return {
      ...row,
      scaledKg,
      scaledCost,
      stockKg,
      shortfallKg,
    };
  });

  const scaledInputKg = base.totalInputKg * multiplier;
  const scaledOutputKg = base.expectedOutputKg * multiplier;
  const scaledUnitCount =
    recipe.unitWeightG > 0 ? Math.floor((scaledOutputKg * 1000) / recipe.unitWeightG) : 0;

  return {
    multiplier,
    scaledInputKg,
    scaledOutputKg,
    scaledUnitCount,
    scaledTotalCost: base.totalBatchCost * multiplier,
    rows,
    hasShortages: shortageCount > 0,
    shortageCount,
  };
}

export function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function formatKg(val: number, decimals = 2): string {
  return `${val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kg`;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (cell: string | number) => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadWorkspaceJson(db: FactoryDatabase): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.download = `${db.plantCode.toLowerCase()}-backup-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
