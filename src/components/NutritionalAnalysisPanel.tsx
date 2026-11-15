import React, { useMemo, useState } from 'react';
import { Download, ShieldAlert, ArrowUpDown, AlertTriangle } from 'lucide-react';
import type { Recipe } from '../types/factory';
import type { RecipeMetrics } from '../utils/calculations';
import { downloadCsv } from '../utils/calculations';

interface NutritionalAnalysisPanelProps {
  draft: Recipe;
  draftMetrics: RecipeMetrics;
  savedMetrics: RecipeMetrics | null;
  isDirty: boolean;
}

type ContributionSortKey =
  | 'calories'
  | 'fatG'
  | 'proteinG'
  | 'carbsG'
  | 'retainedGrams'
  | 'bom';

const DAILY_REFERENCE_VALUES = {
  calories: 2000,
  proteinG: 50,
  fatG: 65,
  satFatG: 20,
  carbsG: 275,
  sugarsG: 50,
  fiberG: 28,
  sodiumMg: 2000,
} as const;

function formatSignedDelta(delta: number, decimals: number, unit: string): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)} ${unit} vs saved`;
}

export const NutritionalAnalysisPanel: React.FC<NutritionalAnalysisPanelProps> = ({
  draft,
  draftMetrics,
  savedMetrics,
  isDirty,
}) => {
  const [servingGrams, setServingGrams] = useState<number>(() =>
    draft.unitWeightG > 0 && draft.unitWeightG <= 100 ? draft.unitWeightG : 30
  );
  const [sortBy, setSortBy] = useState<ContributionSortKey>('calories');

  const n = draftMetrics.nutritionPer100g;
  const savedN = savedMetrics?.nutritionPer100g ?? null;
  const safeServingG = Math.max(1, Number(servingGrams) || 30);
  const packG = Math.max(1, Number(draft.unitWeightG) || 100);
  const energyKj = n.calories * 4.184;

  const missingIngredientsCount = useMemo(
    () => draftMetrics.bomRows.filter((row) => !row.ingredient).length,
    [draftMetrics.bomRows]
  );

  const sortedContributionRows = useMemo(() => {
    const rows = [...draftMetrics.bomRows];
    if (sortBy === 'bom') return rows;
    return rows.sort((a, b) => {
      if (sortBy === 'retainedGrams') {
        return b.retainedGramsPer100g - a.retainedGramsPer100g;
      }
      return b.nutritionContribution[sortBy] - a.nutritionContribution[sortBy];
    });
  }, [draftMetrics.bomRows, sortBy]);

  const totalRetainedGramsPer100g = useMemo(
    () => draftMetrics.bomRows.reduce((acc, row) => acc + row.retainedGramsPer100g, 0),
    [draftMetrics.bomRows]
  );

  const handleExportNutritionCsv = () => {
    const headers = [
      'Section',
      'Item / Nutrient',
      'Per 100g',
      `Per Serving (${safeServingG}g)`,
      `Per Pack (${packG}g)`,
      'Unit / Note',
    ];

    const summaryRows: (string | number)[][] = [
      [
        'Summary',
        'Calories (Energy)',
        n.calories.toFixed(1),
        ((n.calories * safeServingG) / 100).toFixed(1),
        ((n.calories * packG) / 100).toFixed(1),
        'kcal',
      ],
      [
        'Summary',
        'Energy (kJ)',
        energyKj.toFixed(0),
        ((energyKj * safeServingG) / 100).toFixed(0),
        ((energyKj * packG) / 100).toFixed(0),
        'kJ',
      ],
      [
        'Summary',
        'Protein',
        n.proteinG.toFixed(2),
        ((n.proteinG * safeServingG) / 100).toFixed(2),
        ((n.proteinG * packG) / 100).toFixed(2),
        'g',
      ],
      [
        'Summary',
        'Total Fat',
        n.fatG.toFixed(2),
        ((n.fatG * safeServingG) / 100).toFixed(2),
        ((n.fatG * packG) / 100).toFixed(2),
        'g',
      ],
      [
        'Summary',
        'Saturated Fat',
        n.satFatG.toFixed(2),
        ((n.satFatG * safeServingG) / 100).toFixed(2),
        ((n.satFatG * packG) / 100).toFixed(2),
        'g',
      ],
      [
        'Summary',
        'Total Carbohydrates',
        n.carbsG.toFixed(2),
        ((n.carbsG * safeServingG) / 100).toFixed(2),
        ((n.carbsG * packG) / 100).toFixed(2),
        'g',
      ],
      [
        'Summary',
        'Total Sugars',
        n.sugarsG.toFixed(2),
        ((n.sugarsG * safeServingG) / 100).toFixed(2),
        ((n.sugarsG * packG) / 100).toFixed(2),
        'g',
      ],
      [
        'Summary',
        'Dietary Fiber',
        n.fiberG.toFixed(2),
        ((n.fiberG * safeServingG) / 100).toFixed(2),
        ((n.fiberG * packG) / 100).toFixed(2),
        'g',
      ],
      [
        'Summary',
        'Sodium',
        n.sodiumMg.toFixed(1),
        ((n.sodiumMg * safeServingG) / 100).toFixed(1),
        ((n.sodiumMg * packG) / 100).toFixed(1),
        'mg',
      ],
    ];

    const ingredientRows: (string | number)[][] = sortedContributionRows.map((row) => [
      'Ingredient Contribution (per 100g)',
      row.ingredient ? `${row.ingredient.sku} - ${row.ingredient.name}` : 'Unknown Ingredient',
      row.nutritionContribution.calories.toFixed(1),
      `Fat ${row.nutritionContribution.fatG.toFixed(2)}g | Prot ${row.nutritionContribution.proteinG.toFixed(2)}g`,
      `Carb ${row.nutritionContribution.carbsG.toFixed(2)}g | Fib ${row.nutritionContribution.fiberG.toFixed(2)}g`,
      `${row.retainedGramsPer100g.toFixed(1)}g retained per 100g`,
    ]);

    downloadCsv(`${draft.code.toLowerCase()}-nutrition-${draft.version}.csv`, headers, [
      ...summaryRows,
      ...ingredientRows,
    ]);
  };

  const nutrientTableRows = [
    {
      label: 'Energy (Calories)',
      unit: 'kcal',
      per100: n.calories,
      decimals: 0,
      dvRef: DAILY_REFERENCE_VALUES.calories,
      emphasis: true,
    },
    {
      label: 'Energy (kJ)',
      unit: 'kJ',
      per100: energyKj,
      decimals: 0,
      dvRef: null,
      emphasis: false,
    },
    {
      label: 'Protein',
      unit: 'g',
      per100: n.proteinG,
      decimals: 1,
      dvRef: DAILY_REFERENCE_VALUES.proteinG,
      emphasis: true,
    },
    {
      label: 'Total Fat',
      unit: 'g',
      per100: n.fatG,
      decimals: 1,
      dvRef: DAILY_REFERENCE_VALUES.fatG,
      emphasis: true,
    },
    {
      label: 'Saturated Fat',
      unit: 'g',
      per100: n.satFatG,
      decimals: 1,
      dvRef: DAILY_REFERENCE_VALUES.satFatG,
      emphasis: false,
    },
    {
      label: 'Total Carbohydrates',
      unit: 'g',
      per100: n.carbsG,
      decimals: 1,
      dvRef: DAILY_REFERENCE_VALUES.carbsG,
      emphasis: true,
    },
    {
      label: 'Total Sugars',
      unit: 'g',
      per100: n.sugarsG,
      decimals: 1,
      dvRef: DAILY_REFERENCE_VALUES.sugarsG,
      emphasis: false,
    },
    {
      label: 'Dietary Fiber',
      unit: 'g',
      per100: n.fiberG,
      decimals: 1,
      dvRef: DAILY_REFERENCE_VALUES.fiberG,
      emphasis: false,
    },
    {
      label: 'Sodium',
      unit: 'mg',
      per100: n.sodiumMg,
      decimals: 0,
      dvRef: DAILY_REFERENCE_VALUES.sodiumMg,
      emphasis: false,
    },
  ] as const;

  const netCarbsG = Math.max(0, n.carbsG - n.fiberG);
  const sugarOfCarbsPct = n.carbsG > 0 ? (n.sugarsG / n.carbsG) * 100 : 0;
  const proteinPer100Kcal = n.calories > 0 ? (n.proteinG / n.calories) * 100 : 0;
  const concentrationFactor = draft.yieldPct > 0 ? 100 / draft.yieldPct : 1;

  return (
    <div className="space-y-5">
      {/* Header & Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nutritional Analysis — Per 100g Finished Product
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Aggregated from raw material nutrition specs, adjusted for{' '}
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              {draft.yieldPct}%
            </span>{' '}
            batch yield and per-ingredient process loss.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <label
              htmlFor="nutrition-serving-g"
              className="font-medium text-slate-600 dark:text-slate-400"
            >
              Serving (g)
            </label>
            <input
              id="nutrition-serving-g"
              type="number"
              min={1}
              max={1000}
              step="1"
              value={servingGrams}
              onChange={(e) => setServingGrams(Math.max(1, Number(e.target.value) || 1))}
              className="font-mono w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs text-slate-900 tabular-nums focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            {servingGrams !== packG && (
              <button
                type="button"
                onClick={() => setServingGrams(packG)}
                className="text-xs font-medium text-[#005FB8] hover:underline dark:text-sky-400"
              >
                Use pack ({packG}g)
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportNutritionCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Nutrition CSV</span>
          </button>
        </div>
      </div>

      {missingIngredientsCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {missingIngredientsCount} BOM row(s) do not reference a valid raw material in inventory
            and are excluded from nutritional totals.
          </span>
        </div>
      )}

      {/* 4-Column Macro Summary Cards (Per 100g) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Calories */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Calories / 100g
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-1.5 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{n.calories.toFixed(0)}</span>
            <span className="text-xs font-normal text-slate-500">kcal</span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {energyKj.toFixed(0)} kJ · {((n.calories * safeServingG) / 100).toFixed(0)} kcal /{' '}
            {safeServingG}g serving
          </div>
          {isDirty && savedN && Math.abs(n.calories - savedN.calories) >= 0.5 && (
            <div className="font-mono mt-1 text-[11px] font-medium text-[#005FB8] tabular-nums dark:text-sky-400">
              {formatSignedDelta(n.calories - savedN.calories, 0, 'kcal')}
            </div>
          )}
        </div>

        {/* Total Fats */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Fats / 100g
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-1.5 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{n.fatG.toFixed(1)}</span>
            <span className="text-xs font-normal text-slate-500">g</span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Sat. Fat {n.satFatG.toFixed(1)} g · {draftMetrics.macroEnergySplit.fatPct.toFixed(0)}%
            kcal
          </div>
          {isDirty && savedN && Math.abs(n.fatG - savedN.fatG) >= 0.05 && (
            <div className="font-mono mt-1 text-[11px] font-medium text-[#005FB8] tabular-nums dark:text-sky-400">
              {formatSignedDelta(n.fatG - savedN.fatG, 1, 'g')}
            </div>
          )}
        </div>

        {/* Proteins */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Proteins / 100g
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-1.5 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{n.proteinG.toFixed(1)}</span>
            <span className="text-xs font-normal text-slate-500">g</span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {draftMetrics.macroEnergySplit.proteinPct.toFixed(0)}% kcal ·{' '}
            {((n.proteinG * safeServingG) / 100).toFixed(1)} g / {safeServingG}g serving
          </div>
          {isDirty && savedN && Math.abs(n.proteinG - savedN.proteinG) >= 0.05 && (
            <div className="font-mono mt-1 text-[11px] font-medium text-[#005FB8] tabular-nums dark:text-sky-400">
              {formatSignedDelta(n.proteinG - savedN.proteinG, 1, 'g')}
            </div>
          )}
        </div>

        {/* Carbohydrates */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Carbohydrates / 100g
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-1.5 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{n.carbsG.toFixed(1)}</span>
            <span className="text-xs font-normal text-slate-500">g</span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Sugars {n.sugarsG.toFixed(1)} g · Fiber {n.fiberG.toFixed(1)} g
          </div>
          {isDirty && savedN && Math.abs(n.carbsG - savedN.carbsG) >= 0.05 && (
            <div className="font-mono mt-1 text-[11px] font-medium text-[#005FB8] tabular-nums dark:text-sky-400">
              {formatSignedDelta(n.carbsG - savedN.carbsG, 1, 'g')}
            </div>
          )}
        </div>
      </div>

      {/* Macronutrient Energy Split Bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300">
            Macronutrient Energy Split (Atwater 4-9-4 kcal/g)
          </h4>
          <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Carbs {draftMetrics.macroEnergySplit.carbsPct.toFixed(1)}% · Fats{' '}
            {draftMetrics.macroEnergySplit.fatPct.toFixed(1)}% · Protein{' '}
            {draftMetrics.macroEnergySplit.proteinPct.toFixed(1)}%
          </span>
        </div>

        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-[#005FB8] dark:bg-sky-500"
            style={{ width: `${draftMetrics.macroEnergySplit.carbsPct}%` }}
            title={`Carbohydrates: ${draftMetrics.macroEnergySplit.carbsPct.toFixed(1)}%`}
          />
          <div
            className="h-full bg-amber-500 dark:bg-amber-400"
            style={{ width: `${draftMetrics.macroEnergySplit.fatPct}%` }}
            title={`Fats: ${draftMetrics.macroEnergySplit.fatPct.toFixed(1)}%`}
          />
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-500"
            style={{ width: `${draftMetrics.macroEnergySplit.proteinPct}%` }}
            title={`Proteins: ${draftMetrics.macroEnergySplit.proteinPct.toFixed(1)}%`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#005FB8] dark:bg-sky-500" />
            <span>
              Carbohydrates:{' '}
              <strong className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                {draftMetrics.macroEnergySplit.carbsKcal.toFixed(0)} kcal
              </strong>{' '}
              ({n.carbsG.toFixed(1)} g)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500 dark:bg-amber-400" />
            <span>
              Total Fats:{' '}
              <strong className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                {draftMetrics.macroEnergySplit.fatKcal.toFixed(0)} kcal
              </strong>{' '}
              ({n.fatG.toFixed(1)} g)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500" />
            <span>
              Proteins:{' '}
              <strong className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                {draftMetrics.macroEnergySplit.proteinKcal.toFixed(0)} kcal
              </strong>{' '}
              ({n.proteinG.toFixed(1)} g)
            </span>
          </div>
        </div>
      </div>

      {/* Nutrition Facts Table + Allergens & Formulation Indicators */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Complete Nutrition Information Table
            </h4>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              % DV based on 2,000 kcal reference
            </span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 text-left font-medium">Nutrient</th>
                  <th className="py-2 px-2 text-right font-medium">Per 100g</th>
                  <th className="py-2 px-2 text-right font-medium">Serving ({safeServingG}g)</th>
                  <th className="py-2 px-2 text-right font-medium">Pack ({packG}g)</th>
                  <th className="py-2 pl-2 text-right font-medium">% DV (100g)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {nutrientTableRows.map((row) => {
                  const perServing = (row.per100 * safeServingG) / 100;
                  const perPack = (row.per100 * packG) / 100;
                  const dvPct = row.dvRef ? (row.per100 / row.dvRef) * 100 : null;
                  return (
                    <tr key={row.label}>
                      <td
                        className={`py-2 pr-3 ${
                          row.emphasis
                            ? 'font-semibold text-slate-900 dark:text-slate-100'
                            : 'pl-3 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {row.label}
                      </td>
                      <td className="font-mono py-2 px-2 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {row.per100.toFixed(row.decimals)} {row.unit}
                      </td>
                      <td className="font-mono py-2 px-2 text-right text-slate-600 tabular-nums dark:text-slate-400">
                        {perServing.toFixed(row.decimals)} {row.unit}
                      </td>
                      <td className="font-mono py-2 px-2 text-right text-slate-600 tabular-nums dark:text-slate-400">
                        {perPack.toFixed(row.decimals)} {row.unit}
                      </td>
                      <td className="font-mono py-2 pl-2 text-right text-slate-500 tabular-nums dark:text-slate-400">
                        {dvPct !== null ? `${dvPct.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          {/* Formulation Nutritional Indicators */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Formulation Quality Indicators
            </h4>
            <dl className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              <div className="flex items-center justify-between py-2">
                <dt className="text-slate-600 dark:text-slate-400">Net Digestible Carbs / 100g</dt>
                <dd className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                  {netCarbsG.toFixed(1)} g
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-slate-600 dark:text-slate-400">Sugars Share of Total Carbs</dt>
                <dd className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                  {sugarOfCarbsPct.toFixed(1)}%
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-slate-600 dark:text-slate-400">Protein Density</dt>
                <dd className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                  {proteinPer100Kcal.toFixed(2)} g / 100 kcal
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-slate-600 dark:text-slate-400">
                  Bake / Moisture Yield Concentration
                </dt>
                <dd className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                  {concentrationFactor.toFixed(2)}× ({draft.yieldPct}% yield)
                </dd>
              </div>
            </dl>
          </div>

          {/* Declared Allergen Rollup */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Declared Allergen Rollup
              </h4>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              {draftMetrics.allergens.length > 0
                ? `Contains: ${draftMetrics.allergens.join(' · ')}`
                : 'No major food allergens declared in current BOM.'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Automatically aggregated from active raw material specifications. Verify shared-line
              changeover sanitation before scheduling.
            </p>
          </div>
        </div>
      </div>

      {/* Ingredient-by-Ingredient Nutritional Contribution Breakdown */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ingredient Contribution per 100g Finished Product
            </h4>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Exact calorie, fat, protein, and carbohydrate contribution from each BOM ingredient
              after process loss and batch yield concentration.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <label htmlFor="contrib-sort" className="text-slate-500 dark:text-slate-400">
              Sort by
            </label>
            <select
              id="contrib-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ContributionSortKey)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="calories">Calories (kcal)</option>
              <option value="fatG">Total Fats (g)</option>
              <option value="proteinG">Proteins (g)</option>
              <option value="carbsG">Carbohydrates (g)</option>
              <option value="retainedGrams">Retained Wt / 100g</option>
              <option value="bom">BOM Sequence</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Ingredient</th>
                <th className="py-2.5 px-3 text-right font-medium">Batch Qty</th>
                <th className="py-2.5 px-3 text-right font-medium">Wt / 100g</th>
                <th className="py-2.5 px-3 text-right font-medium">Calories</th>
                <th className="py-2.5 px-3 text-right font-medium">Fats</th>
                <th className="py-2.5 px-3 text-right font-medium">Proteins</th>
                <th className="py-2.5 px-3 text-right font-medium">Carbs</th>
                <th className="py-2.5 px-4 text-right font-medium">Calorie Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedContributionRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Add ingredients to the Bill of Materials to calculate nutritional contribution.
                  </td>
                </tr>
              ) : (
                sortedContributionRows.map((row) => {
                  const calorieSharePct =
                    n.calories > 0 ? (row.nutritionContribution.calories / n.calories) * 100 : 0;
                  return (
                    <tr key={row.line.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {row.ingredient?.name || 'Missing Ingredient'}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {row.ingredient?.sku || row.line.ingredientId} · {row.line.stage}
                          {row.line.processLossPct > 0
                            ? ` · ${row.line.processLossPct}% line loss`
                            : ''}
                        </div>
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-600 tabular-nums dark:text-slate-400">
                        {row.line.quantityKg.toFixed(2)} kg
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {row.retainedGramsPer100g.toFixed(1)} g
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {row.nutritionContribution.calories.toFixed(1)} kcal
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {row.nutritionContribution.fatG.toFixed(2)} g
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {row.nutritionContribution.proteinG.toFixed(2)} g
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {row.nutritionContribution.carbsG.toFixed(2)} g
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full bg-[#005FB8] dark:bg-sky-500"
                              style={{ width: `${Math.min(100, calorieSharePct)}%` }}
                            />
                          </div>
                          <span className="font-mono w-12 text-right text-slate-700 tabular-nums dark:text-slate-300">
                            {calorieSharePct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {sortedContributionRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100">
                  <td className="py-2.5 px-4">Total per 100g Finished Product</td>
                  <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                    {draftMetrics.totalInputKg.toFixed(2)} kg
                  </td>
                  <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                    {totalRetainedGramsPer100g.toFixed(1)} g
                  </td>
                  <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                    {n.calories.toFixed(1)} kcal
                  </td>
                  <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                    {n.fatG.toFixed(2)} g
                  </td>
                  <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                    {n.proteinG.toFixed(2)} g
                  </td>
                  <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                    {n.carbsG.toFixed(2)} g
                  </td>
                  <td className="font-mono py-2.5 px-4 text-right tabular-nums">
                    {n.calories > 0 ? '100.0%' : '0.0%'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
