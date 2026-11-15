import type {
  Ingredient,
  IngredientSupplier,
  ProductionBatch,
  Recipe,
} from '../types/factory';

export type ForecastLookback = 'observed' | '7d' | '14d' | '30d';

export type ForecastUrgency =
  | 'Order Now'
  | 'Due Soon'
  | 'Planned'
  | 'Healthy'
  | 'No Usage';

export interface BatchConsumptionContribution {
  batchId: string;
  lotCode: string;
  recipeCode: string;
  recipeName: string;
  startedAt: string;
  consumedKg: number;
  source: 'logged' | 'bom-derived';
}

export interface MaterialProcurementForecast {
  ingredient: Ingredient;
  primarySupplier: IngredientSupplier | null;
  leadTimeDays: number;
  totalConsumedKg: number;
  avgDailyKg: number;
  dailyBurnCost: number;
  batchCount: number;
  loggedBatchCount: number;
  bomDerivedBatchCount: number;
  contributions: BatchConsumptionContribution[];
  daysToStockout: number | null;
  daysToReorderPt: number | null;
  daysUntilOrder: number | null;
  suggestedOrderDate: Date | null;
  stockoutDate: Date | null;
  thresholdDate: Date | null;
  suggestedOrderKg: number;
  estimatedOrderCost: number;
  urgency: ForecastUrgency;
  urgencyRank: number;
}

export interface ProcurementForecastSummary {
  referenceDate: Date;
  windowStartDate: Date;
  effectiveSpanDays: number;
  batchesInWindow: number;
  orderNowCount: number;
  dueSoonCount: number;
  totalDailyUsageKg: number;
  totalDailyBurnCost: number;
  thirtyDayOrderBudget: number;
  items: MaterialProcurementForecast[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(d);
}

export function formatFullDate(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function getPrimary(ing: Ingredient): IngredientSupplier | null {
  const list = ing.suppliers || [];
  if (list.length > 0) {
    return list.find((s) => s.isPrimary) || list[0];
  }
  if (ing.supplier && ing.supplier.trim()) {
    return {
      id: `fallback-${ing.id}`,
      name: ing.supplier.trim(),
      contactName: '',
      email: '',
      leadTimeDays: 7,
      isPrimary: true,
    };
  }
  return null;
}

export function buildProcurementForecast(params: {
  ingredients: Ingredient[];
  recipes: Recipe[];
  batches: ProductionBatch[];
  lookback: ForecastLookback;
  safetyBufferDays: number;
  targetCoverageDays: number;
  includeBomDerived: boolean;
  now?: Date;
}): ProcurementForecastSummary {
  const {
    ingredients,
    recipes,
    batches,
    lookback,
    safetyBufferDays,
    targetCoverageDays,
    includeBomDerived,
    now = new Date(),
  } = params;

  const recipeMap = new Map(recipes.map((r) => [r.id, r]));

  const historicalBatches = batches.filter((b) => b.runStatus !== 'Scheduled');

  // Anchor reference date to today (or latest historical batch date if newer)
  const batchDates = historicalBatches
    .map((b) => new Date(b.startedAt))
    .filter((d) => !Number.isNaN(d.getTime()));

  let referenceDate = startOfDay(now);
  for (const bd of batchDates) {
    const day = startOfDay(bd);
    if (day.getTime() > referenceDate.getTime()) {
      referenceDate = day;
    }
  }

  let effectiveSpanDays = 1;
  let windowStartDate = referenceDate;

  if (lookback === 'observed') {
    if (batchDates.length > 0) {
      const earliestMs = Math.min(...batchDates.map((d) => startOfDay(d).getTime()));
      const earliestDay = new Date(earliestMs);
      windowStartDate = earliestDay;
      const diffDays = Math.round(
        (referenceDate.getTime() - earliestDay.getTime()) / 86_400_000
      );
      effectiveSpanDays = Math.max(1, diffDays + 1);
    }
  } else {
    const windowDays = lookback === '7d' ? 7 : lookback === '14d' ? 14 : 30;
    effectiveSpanDays = windowDays;
    windowStartDate = addDays(referenceDate, -(windowDays - 1));
  }

  const windowStartMs = windowStartDate.getTime();
  const batchesInWindow = historicalBatches.filter((b) => {
    const parsed = new Date(b.startedAt);
    if (Number.isNaN(parsed.getTime())) return false;
    if (lookback === 'observed') return true;
    return startOfDay(parsed).getTime() >= windowStartMs;
  });

  // Aggregate per-ingredient consumption from batches in window
  const usageMap = new Map<
    string,
    {
      totalKg: number;
      loggedCount: number;
      bomCount: number;
      contributions: BatchConsumptionContribution[];
    }
  >();

  const addContribution = (
    ingredientId: string,
    contrib: BatchConsumptionContribution
  ) => {
    if (contrib.consumedKg <= 0) return;
    let entry = usageMap.get(ingredientId);
    if (!entry) {
      entry = { totalKg: 0, loggedCount: 0, bomCount: 0, contributions: [] };
      usageMap.set(ingredientId, entry);
    }
    entry.totalKg += contrib.consumedKg;
    if (contrib.source === 'logged') entry.loggedCount += 1;
    else entry.bomCount += 1;
    entry.contributions.push(contrib);
  };

  for (const batch of batchesInWindow) {
    const seenInBatch = new Set<string>();

    for (const lot of batch.consumedLots || []) {
      if (lot.requiredKg > 0) {
        seenInBatch.add(lot.ingredientId);
        addContribution(lot.ingredientId, {
          batchId: batch.id,
          lotCode: batch.lotCode,
          recipeCode: batch.recipeCode,
          recipeName: batch.recipeName,
          startedAt: batch.startedAt,
          consumedKg: lot.requiredKg,
          source: 'logged',
        });
      }
    }

    if (includeBomDerived) {
      const recipe = recipeMap.get(batch.recipeId);
      if (recipe) {
        const mult = batch.multiplier > 0 ? batch.multiplier : 1;
        for (const line of recipe.bom) {
          if (seenInBatch.has(line.ingredientId)) continue;
          const derivedKg = (Number(line.quantityKg) || 0) * mult;
          if (derivedKg > 0) {
            seenInBatch.add(line.ingredientId);
            addContribution(line.ingredientId, {
              batchId: batch.id,
              lotCode: batch.lotCode,
              recipeCode: batch.recipeCode,
              recipeName: batch.recipeName,
              startedAt: batch.startedAt,
              consumedKg: derivedKg,
              source: 'bom-derived',
            });
          }
        }
      }
    }
  }

  let orderNowCount = 0;
  let dueSoonCount = 0;
  let totalDailyUsageKg = 0;
  let totalDailyBurnCost = 0;
  let thirtyDayOrderBudget = 0;

  const items: MaterialProcurementForecast[] = ingredients.map((ing) => {
    const primarySupplier = getPrimary(ing);
    const leadTimeDays = primarySupplier ? primarySupplier.leadTimeDays : 7;
    const usage = usageMap.get(ing.id);
    const totalConsumedKg = usage ? usage.totalKg : 0;
    const avgDailyKg = totalConsumedKg / effectiveSpanDays;
    const dailyBurnCost = avgDailyKg * ing.costPerKg;

    totalDailyUsageKg += avgDailyKg;
    totalDailyBurnCost += dailyBurnCost;

    const contributions = (usage?.contributions || [])
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (avgDailyKg <= 0.0001) {
      const isAlreadyLow = ing.stockKg <= ing.reorderPointKg;
      const suggestedOrderKg = isAlreadyLow
        ? Math.max(0, Math.ceil((ing.reorderPointKg * 2 - ing.stockKg) / 5) * 5)
        : 0;
      const estimatedOrderCost = suggestedOrderKg * ing.costPerKg;
      if (isAlreadyLow) {
        orderNowCount += 1;
        thirtyDayOrderBudget += estimatedOrderCost;
      }
      return {
        ingredient: ing,
        primarySupplier,
        leadTimeDays,
        totalConsumedKg: 0,
        avgDailyKg: 0,
        dailyBurnCost: 0,
        batchCount: 0,
        loggedBatchCount: 0,
        bomDerivedBatchCount: 0,
        contributions: [],
        daysToStockout: null,
        daysToReorderPt: isAlreadyLow ? 0 : null,
        daysUntilOrder: isAlreadyLow ? -leadTimeDays : null,
        suggestedOrderDate: isAlreadyLow ? referenceDate : null,
        stockoutDate: null,
        thresholdDate: isAlreadyLow ? referenceDate : null,
        suggestedOrderKg,
        estimatedOrderCost,
        urgency: isAlreadyLow ? 'Order Now' : 'No Usage',
        urgencyRank: isAlreadyLow ? 4 : 0,
      };
    }

    const daysToStockout = ing.stockKg / avgDailyKg;
    const daysToReorderPt = Math.max(0, (ing.stockKg - ing.reorderPointKg) / avgDailyKg);
    const rawDaysUntilOrder = daysToReorderPt - (leadTimeDays + safetyBufferDays);

    const stockoutDate = addDays(referenceDate, Math.round(daysToStockout));
    const thresholdDate = addDays(referenceDate, Math.round(daysToReorderPt));
    const suggestedOrderDate =
      rawDaysUntilOrder <= 0
        ? referenceDate
        : addDays(referenceDate, Math.round(rawDaysUntilOrder));

    let urgency: ForecastUrgency = 'Healthy';
    let urgencyRank = 1;
    if (ing.stockKg <= ing.reorderPointKg || rawDaysUntilOrder <= 0) {
      urgency = 'Order Now';
      urgencyRank = 4;
      orderNowCount += 1;
    } else if (rawDaysUntilOrder <= 7) {
      urgency = 'Due Soon';
      urgencyRank = 3;
      dueSoonCount += 1;
    } else if (rawDaysUntilOrder <= 21) {
      urgency = 'Planned';
      urgencyRank = 2;
    }

    // Target stock level = targetCoverageDays of consumption + reorder safety floor
    const targetStockKg = avgDailyKg * targetCoverageDays + ing.reorderPointKg;
    const projectedStockAtDelivery = Math.max(
      0,
      ing.stockKg - avgDailyKg * (Math.max(0, rawDaysUntilOrder) + leadTimeDays)
    );
    const rawOrderKg = Math.max(0, targetStockKg - projectedStockAtDelivery);
    const suggestedOrderKg = rawOrderKg > 0 ? Math.max(5, Math.ceil(rawOrderKg / 5) * 5) : 0;
    const estimatedOrderCost = suggestedOrderKg * ing.costPerKg;

    if (rawDaysUntilOrder <= 30) {
      thirtyDayOrderBudget += estimatedOrderCost;
    }

    return {
      ingredient: ing,
      primarySupplier,
      leadTimeDays,
      totalConsumedKg,
      avgDailyKg,
      dailyBurnCost,
      batchCount: contributions.length,
      loggedBatchCount: usage?.loggedCount || 0,
      bomDerivedBatchCount: usage?.bomCount || 0,
      contributions,
      daysToStockout,
      daysToReorderPt,
      daysUntilOrder: rawDaysUntilOrder,
      suggestedOrderDate,
      stockoutDate,
      thresholdDate,
      suggestedOrderKg,
      estimatedOrderCost,
      urgency,
      urgencyRank,
    };
  });

  items.sort((a, b) => {
    if (b.urgencyRank !== a.urgencyRank) return b.urgencyRank - a.urgencyRank;
    if (a.daysUntilOrder !== null && b.daysUntilOrder !== null) {
      return a.daysUntilOrder - b.daysUntilOrder;
    }
    if (a.daysUntilOrder !== null) return -1;
    if (b.daysUntilOrder !== null) return 1;
    return b.ingredient.costPerKg - a.ingredient.costPerKg;
  });

  return {
    referenceDate,
    windowStartDate,
    effectiveSpanDays,
    batchesInWindow: batchesInWindow.length,
    orderNowCount,
    dueSoonCount,
    totalDailyUsageKg,
    totalDailyBurnCost,
    thirtyDayOrderBudget,
    items,
  };
}
