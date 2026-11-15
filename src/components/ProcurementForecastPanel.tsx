import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  MinusCircle,
  PackagePlus,
  Search,
} from 'lucide-react';
import type { Ingredient, ProductionBatch, Recipe } from '../types/factory';
import { downloadCsv, formatCurrency } from '../utils/calculations';
import {
  buildProcurementForecast,
  formatFullDate,
  formatShortDate,
  type ForecastLookback,
  type ForecastUrgency,
  type MaterialProcurementForecast,
} from '../utils/procurementForecast';

interface ProcurementForecastPanelProps {
  ingredients: Ingredient[];
  recipes: Recipe[];
  batches: ProductionBatch[];
  onRestockIngredient: (ingredient: Ingredient, suggestedQtyKg?: number) => void;
  onManageSuppliers: (ingredient: Ingredient) => void;
}

const TIMELINE_HORIZON_DAYS = 35;

export const ProcurementForecastPanel: React.FC<ProcurementForecastPanelProps> = ({
  ingredients,
  recipes,
  batches,
  onRestockIngredient,
  onManageSuppliers,
}) => {
  const [lookback, setLookback] = useState<ForecastLookback>('observed');
  const [safetyBufferDays, setSafetyBufferDays] = useState<number>(2);
  const [targetCoverageDays, setTargetCoverageDays] = useState<number>(21);
  const [includeBomDerived, setIncludeBomDerived] = useState<boolean>(true);
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | ForecastUrgency>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const forecast = useMemo(
    () =>
      buildProcurementForecast({
        ingredients,
        recipes,
        batches,
        lookback,
        safetyBufferDays,
        targetCoverageDays,
        includeBomDerived,
      }),
    [
      ingredients,
      recipes,
      batches,
      lookback,
      safetyBufferDays,
      targetCoverageDays,
      includeBomDerived,
    ]
  );

  // Active items shown in the runway timeline chart (consumed materials or immediate low-stock items)
  const timelineItems = useMemo(() => {
    const active = forecast.items.filter(
      (item) => item.avgDailyKg > 0 || item.urgency === 'Order Now'
    );
    return active.slice(0, 14);
  }, [forecast.items]);

  const selectedItem = useMemo<MaterialProcurementForecast | null>(() => {
    if (selectedId) {
      const found = forecast.items.find((i) => i.ingredient.id === selectedId);
      if (found) return found;
    }
    return timelineItems[0] || forecast.items[0] || null;
  }, [selectedId, forecast.items, timelineItems]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forecast.items.filter((item) => {
      if (urgencyFilter !== 'all' && item.urgency !== urgencyFilter) return false;
      if (!q) return true;
      return (
        item.ingredient.sku.toLowerCase().includes(q) ||
        item.ingredient.name.toLowerCase().includes(q) ||
        (item.primarySupplier?.name || '').toLowerCase().includes(q)
      );
    });
  }, [forecast.items, urgencyFilter, search]);

  const handleExportCsv = () => {
    downloadCsv(
      'procurement-reorder-forecast.csv',
      [
        'SKU',
        'Raw Material',
        'Category',
        'On Hand (kg)',
        'Reorder Point (kg)',
        'Avg Daily Usage (kg/day)',
        'Historical Batches',
        'Primary Supplier',
        'Lead Time (days)',
        'Days to Stockout',
        'Days Until Order',
        'Suggested Order Date',
        'Suggested Order Qty (kg)',
        'Estimated PO Cost (INR)',
        'Urgency',
      ],
      filteredRows.map((r) => [
        r.ingredient.sku,
        r.ingredient.name,
        r.ingredient.category,
        r.ingredient.stockKg.toFixed(1),
        r.ingredient.reorderPointKg.toFixed(0),
        r.avgDailyKg.toFixed(2),
        r.batchCount,
        r.primarySupplier?.name || 'Unassigned',
        r.leadTimeDays,
        r.daysToStockout !== null ? r.daysToStockout.toFixed(1) : 'N/A',
        r.daysUntilOrder !== null ? r.daysUntilOrder.toFixed(1) : 'N/A',
        r.suggestedOrderDate ? formatFullDate(r.suggestedOrderDate) : 'No Usage',
        r.suggestedOrderKg.toFixed(0),
        r.estimatedOrderCost.toFixed(2),
        r.urgency,
      ])
    );
  };

  if (batches.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
        <CalendarClock className="mx-auto h-8 w-8 text-slate-400" />
        <h3 className="font-display mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          No Historical Production Batches Available
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Log production batches in the Batch Scaler so the procurement forecast can calculate average daily consumption rates and reorder dates for each raw material.
        </p>
      </div>
    );
  }

  // Timeline SVG geometry
  const timelineGeometry = (() => {
    const width = 640;
    const labelW = 198;
    const rightPad = 58;
    const topPad = 26;
    const rowH = 26;
    const bottomPad = 24;
    const plotW = width - labelW - rightPad;
    const height = topPad + Math.max(1, timelineItems.length) * rowH + bottomPad;
    const toX = (day: number) =>
      labelW + (Math.max(0, Math.min(TIMELINE_HORIZON_DAYS, day)) / TIMELINE_HORIZON_DAYS) * plotW;
    return { width, height, labelW, rightPad, topPad, rowH, plotW, toX };
  })();

  // Depletion curve SVG geometry for selectedItem
  const curveGeometry = (() => {
    const width = 460;
    const height = 210;
    const padL = 48;
    const padR = 18;
    const padT = 18;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const horizonDays = selectedItem?.daysToStockout
      ? Math.max(21, Math.min(60, Math.ceil(selectedItem.daysToStockout + 4)))
      : 30;
    const maxStockY = selectedItem
      ? Math.max(
          10,
          selectedItem.ingredient.stockKg * 1.15,
          selectedItem.ingredient.reorderPointKg * 1.5,
          selectedItem.suggestedOrderKg * 1.1
        )
      : 100;

    const toX = (day: number) => padL + (Math.max(0, Math.min(horizonDays, day)) / horizonDays) * plotW;
    const toY = (kg: number) => padT + plotH - (Math.max(0, Math.min(maxStockY, kg)) / maxStockY) * plotH;

    return { width, height, padL, padR, padT, padB, plotW, plotH, horizonDays, maxStockY, toX, toY };
  })();

  return (
    <div className="space-y-5">
      {/* Parameter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              History Window
            </span>
            <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
              {(
                [
                  ['observed', `Observed (${forecast.effectiveSpanDays}d)`],
                  ['7d', '7 Days'],
                  ['14d', '14 Days'],
                  ['30d', '30 Days'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLookback(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    lookback === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="forecast-safety-buffer"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Safety Buffer
            </label>
            <select
              id="forecast-safety-buffer"
              value={safetyBufferDays}
              onChange={(e) => setSafetyBufferDays(Number(e.target.value))}
              className="font-mono rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value={0}>0 days</option>
              <option value={2}>2 days</option>
              <option value={4}>4 days</option>
              <option value={7}>7 days</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="forecast-coverage-target"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Order Cover
            </label>
            <select
              id="forecast-coverage-target"
              value={targetCoverageDays}
              onChange={(e) => setTargetCoverageDays(Number(e.target.value))}
              className="font-mono rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value={14}>14 days</option>
              <option value={21}>21 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setIncludeBomDerived(true)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                includeBomDerived
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Logged + BOM Usage
            </button>
            <button
              type="button"
              onClick={() => setIncludeBomDerived(false)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                !includeBomDerived
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Logged Lots Only
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Forecast CSV</span>
          </button>
        </div>
      </div>

      {/* Top 4-Column Forecast KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Order Immediately
          </div>
          <div
            className={`font-mono mt-1 text-2xl font-semibold tabular-nums ${
              forecast.orderNowCount > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {forecast.orderNowCount}
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              SKUs due today
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Below reorder floor or within vendor lead time
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Reorders Due Within 7 Days
          </div>
          <div
            className={`font-mono mt-1 text-2xl font-semibold tabular-nums ${
              forecast.dueSoonCount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {forecast.dueSoonCount}
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              upcoming POs
            </span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Includes +{safetyBufferDays}d safety buffer
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Avg. Daily Material Consumption
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {forecast.totalDailyUsageKg.toFixed(1)} kg/d
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatCurrency(forecast.totalDailyBurnCost)}/day · {forecast.batchesInWindow} batches / {forecast.effectiveSpanDays}d
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Projected 30-Day PO Budget
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {formatCurrency(forecast.thirtyDayOrderBudget)}
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Target cover: {targetCoverageDays}d · As of {formatShortDate(forecast.referenceDate)}
          </div>
        </div>
      </div>

      {/* 2-Column Visualization Split: Runway & Reorder Timeline + Selected Material Depletion Curve */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Stock Runway & Reorder Date Timeline */}
        <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Stock Runway &amp; Suggested Reorder Timeline (Next {TIMELINE_HORIZON_DAYS} Days)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Order dates subtract primary vendor lead time and safety buffer before stock reaches its reorder floor. Click any material row to inspect its depletion curve.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#005FB8]" />
                  <span>Safe Runway</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-400" />
                  <span>Lead + Buffer Window</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rotate-45 bg-red-600" />
                  <span>Suggested PO Trigger</span>
                </span>
              </div>
            </div>

            {timelineItems.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                No materials recorded consumption in the selected window. Switch to &ldquo;Logged + BOM Usage&rdquo; or &ldquo;Observed&rdquo; window to inspect full batch history.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <svg
                  viewBox={`0 0 ${timelineGeometry.width} ${timelineGeometry.height}`}
                  className="h-auto w-full min-w-[520px]"
                  role="img"
                  aria-label="Horizontal stock runway and suggested reorder timeline per raw material"
                >
                  {/* Vertical Day Gridlines */}
                  {[0, 7, 14, 21, 28, 35].map((day) => {
                    const x = timelineGeometry.toX(day);
                    const tickDate = new Date(forecast.referenceDate);
                    tickDate.setDate(tickDate.getDate() + day);
                    return (
                      <g key={day}>
                        <line
                          x1={x}
                          y1={timelineGeometry.topPad - 6}
                          x2={x}
                          y2={timelineGeometry.height - 18}
                          stroke="currentColor"
                          className={
                            day === 0
                              ? 'text-slate-300 dark:text-slate-600'
                              : 'text-slate-100 dark:text-slate-800'
                          }
                          strokeDasharray={day === 0 ? undefined : '3 3'}
                          strokeWidth={1}
                        />
                        <text
                          x={x}
                          y={14}
                          textAnchor="middle"
                          className="fill-slate-400 font-mono text-[9px]"
                        >
                          {day === 0 ? 'Today' : `+${day}d`}
                        </text>
                        <text
                          x={x}
                          y={timelineGeometry.height - 4}
                          textAnchor="middle"
                          className="fill-slate-400 font-mono text-[9px]"
                        >
                          {formatShortDate(tickDate)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Material Rows */}
                  {timelineItems.map((item, idx) => {
                    const y = timelineGeometry.topPad + idx * timelineGeometry.rowH;
                    const barY = y + 7;
                    const barH = 10;
                    const isSelected = selectedItem?.ingredient.id === item.ingredient.id;

                    const thresholdDays = item.daysToReorderPt ?? 0;
                    const stockoutDays = item.daysToStockout ?? 0;
                    const rawOrderDays = item.daysUntilOrder ?? 0;
                    const clampedOrderDays = Math.max(0, rawOrderDays);

                    const x0 = timelineGeometry.toX(0);
                    const xOrder = timelineGeometry.toX(clampedOrderDays);
                    const xThreshold = timelineGeometry.toX(thresholdDays);
                    const xStockout = timelineGeometry.toX(stockoutDays);

                    const markerColor =
                      item.urgency === 'Order Now'
                        ? '#DC2626'
                        : item.urgency === 'Due Soon'
                        ? '#D97706'
                        : item.urgency === 'Planned'
                        ? '#005FB8'
                        : '#16A34A';

                    const shortName =
                      item.ingredient.name.length > 21
                        ? `${item.ingredient.name.slice(0, 20)}…`
                        : item.ingredient.name;

                    return (
                      <g
                        key={item.ingredient.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedId(item.ingredient.id)}
                      >
                        {isSelected && (
                          <rect
                            x={2}
                            y={y + 1}
                            width={timelineGeometry.width - 4}
                            height={timelineGeometry.rowH - 2}
                            rx={4}
                            className="fill-sky-50 dark:fill-sky-950/40"
                          />
                        )}

                        {/* Row Label */}
                        <text
                          x={8}
                          y={y + 15}
                          className={`text-[10px] ${
                            isSelected
                              ? 'fill-[#005FB8] font-semibold dark:fill-sky-400'
                              : 'fill-slate-700 font-medium dark:fill-slate-300'
                          }`}
                        >
                          <tspan className="font-mono">{item.ingredient.sku}</tspan>{' '}
                          <tspan>{shortName}</tspan>
                        </text>

                        {/* Total stockout runway track (soft slate) */}
                        {stockoutDays > 0 && (
                          <rect
                            x={x0}
                            y={barY}
                            width={Math.max(2, xStockout - x0)}
                            height={barH}
                            rx={2}
                            className="fill-slate-200 dark:fill-slate-700"
                          />
                        )}

                        {/* Safe runway up to order trigger */}
                        {clampedOrderDays > 0 && (
                          <rect
                            x={x0}
                            y={barY}
                            width={Math.max(2, xOrder - x0)}
                            height={barH}
                            rx={2}
                            fill={
                              item.urgency === 'Due Soon'
                                ? '#0284C7'
                                : '#005FB8'
                            }
                            opacity={0.85}
                          />
                        )}

                        {/* Lead time + safety buffer zone before reorder threshold */}
                        {thresholdDays > clampedOrderDays && (
                          <rect
                            x={xOrder}
                            y={barY}
                            width={Math.max(2, xThreshold - xOrder)}
                            height={barH}
                            fill="#F59E0B"
                            opacity={0.55}
                          />
                        )}

                        {/* Suggested PO Trigger Diamond */}
                        {clampedOrderDays <= TIMELINE_HORIZON_DAYS && (
                          <g>
                            <line
                              x1={xOrder}
                              y1={barY - 3}
                              x2={xOrder}
                              y2={barY + barH + 3}
                              stroke={markerColor}
                              strokeWidth={1.5}
                            />
                            <polygon
                              points={`${xOrder},${barY - 4} ${xOrder + 4},${barY + barH / 2} ${xOrder},${barY + barH + 4} ${xOrder - 4},${barY + barH / 2}`}
                              fill={markerColor}
                            />
                          </g>
                        )}

                        {/* Right-side Date / Urgency label */}
                        <text
                          x={timelineGeometry.width - 6}
                          y={y + 15}
                          textAnchor="end"
                          className="font-mono text-[10px] font-medium tabular-nums"
                          fill={markerColor}
                        >
                          {item.urgency === 'Order Now'
                            ? 'Order Now'
                            : item.suggestedOrderDate
                            ? formatShortDate(item.suggestedOrderDate)
                            : '—'}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Reference Date: <strong className="font-mono text-slate-700 dark:text-slate-300">{formatFullDate(forecast.referenceDate)}</strong> · Span: {forecast.effectiveSpanDays}d ({forecast.batchesInWindow} production batches)
            </span>
            <span>
              Showing {timelineItems.length} highest-priority materials
            </span>
          </div>
        </div>

        {/* Right: Selected Material Depletion Curve & Historical Batch Breakdown */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          {selectedItem ? (
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedItem.ingredient.sku} · {selectedItem.ingredient.category}
                    </div>
                    <h3 className="font-display truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedItem.ingredient.name}
                    </h3>
                  </div>
                  <span
                    className={`font-mono shrink-0 text-xs font-semibold ${
                      selectedItem.urgency === 'Order Now'
                        ? 'text-red-700 dark:text-red-400'
                        : selectedItem.urgency === 'Due Soon'
                        ? 'text-amber-700 dark:text-amber-400'
                        : selectedItem.urgency === 'Planned'
                        ? 'text-[#005FB8] dark:text-sky-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {selectedItem.urgency}
                  </span>
                </div>

                {/* Projected Inventory Depletion Line Chart */}
                <div className="mt-3">
                  <svg
                    viewBox={`0 0 ${curveGeometry.width} ${curveGeometry.height}`}
                    className="h-auto w-full"
                    role="img"
                    aria-label={`Projected inventory depletion curve for ${selectedItem.ingredient.name}`}
                  >
                    {/* Horizontal grid */}
                    {[0, 0.5, 1].map((t) => {
                      const val = Math.round(curveGeometry.maxStockY * t);
                      const y = curveGeometry.toY(val);
                      return (
                        <g key={t}>
                          <line
                            x1={curveGeometry.padL}
                            y1={y}
                            x2={curveGeometry.width - curveGeometry.padR}
                            y2={y}
                            stroke="currentColor"
                            className="text-slate-100 dark:text-slate-800"
                          />
                          <text
                            x={curveGeometry.padL - 6}
                            y={y + 3}
                            textAnchor="end"
                            className="fill-slate-400 font-mono text-[9px]"
                          >
                            {val}kg
                          </text>
                        </g>
                      );
                    })}

                    {/* Reorder point floor dashed line */}
                    {(() => {
                      const ry = curveGeometry.toY(selectedItem.ingredient.reorderPointKg);
                      return (
                        <g>
                          <line
                            x1={curveGeometry.padL}
                            y1={ry}
                            x2={curveGeometry.width - curveGeometry.padR}
                            y2={ry}
                            stroke="#D97706"
                            strokeDasharray="4 3"
                            strokeWidth={1.2}
                          />
                          <text
                            x={curveGeometry.width - curveGeometry.padR}
                            y={ry - 4}
                            textAnchor="end"
                            className="fill-amber-700 font-mono text-[9px] dark:fill-amber-400"
                          >
                            Reorder Floor ({selectedItem.ingredient.reorderPointKg.toFixed(0)} kg)
                          </text>
                        </g>
                      );
                    })()}

                    {/* X-axis ticks */}
                    {[0, Math.round(curveGeometry.horizonDays / 2), curveGeometry.horizonDays].map(
                      (day) => {
                        const x = curveGeometry.toX(day);
                        return (
                          <text
                            key={day}
                            x={x}
                            y={curveGeometry.height - 8}
                            textAnchor="middle"
                            className="fill-slate-400 font-mono text-[9px]"
                          >
                            {day === 0 ? 'Today' : `+${day}d`}
                          </text>
                        );
                      }
                    )}

                    {/* Depletion curve & replenishment trajectory */}
                    {selectedItem.avgDailyKg > 0 ? (
                      (() => {
                        const startX = curveGeometry.toX(0);
                        const startY = curveGeometry.toY(selectedItem.ingredient.stockKg);
                        const stockoutDay = selectedItem.daysToStockout ?? curveGeometry.horizonDays;
                        const clampedEndDay = Math.min(curveGeometry.horizonDays, stockoutDay);
                        const endStock = Math.max(
                          0,
                          selectedItem.ingredient.stockKg - selectedItem.avgDailyKg * clampedEndDay
                        );
                        const endX = curveGeometry.toX(clampedEndDay);
                        const endY = curveGeometry.toY(endStock);

                        const orderDay = Math.max(0, selectedItem.daysUntilOrder ?? 0);
                        const arrivalDay = orderDay + selectedItem.leadTimeDays;
                        const stockAtOrder = Math.max(
                          0,
                          selectedItem.ingredient.stockKg - selectedItem.avgDailyKg * orderDay
                        );
                        const stockAtArrival = Math.max(
                          0,
                          selectedItem.ingredient.stockKg - selectedItem.avgDailyKg * arrivalDay
                        );

                        return (
                          <g>
                            {/* Current depletion path */}
                            <line
                              x1={startX}
                              y1={startY}
                              x2={endX}
                              y2={endY}
                              stroke="#005FB8"
                              strokeWidth={2}
                            />

                            {/* Suggested PO Trigger vertical line */}
                            {orderDay <= curveGeometry.horizonDays && (
                              <g>
                                <line
                                  x1={curveGeometry.toX(orderDay)}
                                  y1={curveGeometry.padT}
                                  x2={curveGeometry.toX(orderDay)}
                                  y2={curveGeometry.height - curveGeometry.padB}
                                  stroke="#DC2626"
                                  strokeDasharray="3 3"
                                  strokeWidth={1.2}
                                />
                                <circle
                                  cx={curveGeometry.toX(orderDay)}
                                  cy={curveGeometry.toY(stockAtOrder)}
                                  r={4}
                                  fill="#DC2626"
                                />
                                <text
                                  x={Math.min(
                                    curveGeometry.width - curveGeometry.padR - 4,
                                    curveGeometry.toX(orderDay) + 4
                                  )}
                                  y={curveGeometry.padT + 10}
                                  className="fill-red-600 font-mono text-[9px] font-semibold dark:fill-red-400"
                                >
                                  PO Trigger
                                </text>
                              </g>
                            )}

                            {/* Projected post-delivery sawtooth replenishment */}
                            {arrivalDay <= curveGeometry.horizonDays &&
                              selectedItem.suggestedOrderKg > 0 && (
                                <polyline
                                  fill="none"
                                  stroke="#16A34A"
                                  strokeDasharray="3 2"
                                  strokeWidth={1.5}
                                  points={`${curveGeometry.toX(arrivalDay)},${curveGeometry.toY(
                                    stockAtArrival
                                  )} ${curveGeometry.toX(arrivalDay)},${curveGeometry.toY(
                                    stockAtArrival + selectedItem.suggestedOrderKg
                                  )} ${curveGeometry.toX(
                                    curveGeometry.horizonDays
                                  )},${curveGeometry.toY(
                                    Math.max(
                                      0,
                                      stockAtArrival +
                                        selectedItem.suggestedOrderKg -
                                        selectedItem.avgDailyKg *
                                          (curveGeometry.horizonDays - arrivalDay)
                                    )
                                  )}`}
                                />
                              )}
                          </g>
                        );
                      })()
                    ) : (
                      <line
                        x1={curveGeometry.toX(0)}
                        y1={curveGeometry.toY(selectedItem.ingredient.stockKg)}
                        x2={curveGeometry.toX(curveGeometry.horizonDays)}
                        y2={curveGeometry.toY(selectedItem.ingredient.stockKg)}
                        stroke="#64748B"
                        strokeWidth={2}
                      />
                    )}
                  </svg>
                </div>

                {/* Key Recommendation Readout */}
                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Suggested Order Date
                    </div>
                    <div className="font-mono mt-0.5 font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {selectedItem.suggestedOrderDate
                        ? formatFullDate(selectedItem.suggestedOrderDate)
                        : 'No recent demand'}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {selectedItem.daysUntilOrder === null
                        ? 'Zero batch usage in window'
                        : selectedItem.daysUntilOrder <= 0
                        ? `Immediate (${Math.abs(Math.round(selectedItem.daysUntilOrder))}d buffer deficit)`
                        : `In ${Math.round(selectedItem.daysUntilOrder)} days · ${selectedItem.leadTimeDays}d lead`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Recommended PO Qty &amp; Spend
                    </div>
                    <div className="font-mono mt-0.5 font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {selectedItem.suggestedOrderKg > 0
                        ? `${selectedItem.suggestedOrderKg.toFixed(0)} kg · ${formatCurrency(
                            selectedItem.estimatedOrderCost
                          )}`
                        : 'No order needed'}
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedItem.primarySupplier?.name || 'No vendor assigned'}
                    </div>
                  </div>
                </div>

                {/* Historical Batch Consumption Breakdown */}
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span>Historical Batch Usage ({selectedItem.batchCount})</span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {selectedItem.totalConsumedKg.toFixed(1)} kg total ({selectedItem.avgDailyKg.toFixed(2)} kg/d)
                    </span>
                  </div>
                  {selectedItem.contributions.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Not consumed by any batches in this lookback window.
                    </p>
                  ) : (
                    <div className="mt-2 max-h-36 divide-y divide-slate-100 overflow-y-auto text-[11px] dark:divide-slate-800">
                      {selectedItem.contributions.map((c) => (
                        <div
                          key={`${c.batchId}-${c.source}`}
                          className="flex items-center justify-between gap-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {c.lotCode}
                            </span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span className="text-slate-600 dark:text-slate-400">
                              {c.recipeCode}
                            </span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span className="text-slate-500">
                              {formatShortDate(new Date(c.startedAt))}
                            </span>
                          </div>
                          <div className="font-mono shrink-0 font-medium text-slate-900 tabular-nums dark:text-slate-100">
                            {c.consumedKg.toFixed(1)} kg
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                              ({c.source === 'logged' ? 'lot' : 'BOM'})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onManageSuppliers(selectedItem.ingredient)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Suppliers</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onRestockIngredient(
                      selectedItem.ingredient,
                      selectedItem.suggestedOrderKg > 0 ? selectedItem.suggestedOrderKg : 250
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] whitespace-nowrap shrink-0 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  <span>Receive Stock</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Detailed Reorder Forecast Schedule Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Material Reorder Forecast Schedule ({filteredRows.length})
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Suggested PO dates calculated from historical consumption rate, on-hand balance, reorder threshold, and primary supplier lead time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-60">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter SKU, material, vendor..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
              {(
                [
                  ['all', 'All'],
                  ['Order Now', 'Order Now'],
                  ['Due Soon', 'Due ≤ 7d'],
                  ['Planned', 'Planned'],
                  ['No Usage', 'No Usage'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setUrgencyFilter(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    urgencyFilter === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Raw Material</th>
                <th className="py-2.5 px-3 text-right font-medium">On Hand / Floor</th>
                <th className="py-2.5 px-3 text-right font-medium">Avg Consumption</th>
                <th className="py-2.5 px-3 text-right font-medium">Stockout Runway</th>
                <th className="py-2.5 px-3 font-medium">Primary Vendor</th>
                <th className="py-2.5 px-3 font-medium">Suggested Reorder Date</th>
                <th className="py-2.5 px-3 text-right font-medium">Suggested PO</th>
                <th className="py-2.5 px-3 font-medium">Urgency</th>
                <th className="py-2.5 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No raw materials match the current forecast filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isSelected = selectedItem?.ingredient.id === r.ingredient.id;
                  return (
                    <tr
                      key={r.ingredient.id}
                      onClick={() => setSelectedId(r.ingredient.id)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        isSelected ? 'bg-sky-50/60 dark:bg-sky-950/25' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.ingredient.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {r.ingredient.sku} · {r.ingredient.category}
                        </div>
                      </td>

                      <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                        <span
                          className={
                            r.ingredient.stockKg <= r.ingredient.reorderPointKg
                              ? 'font-semibold text-red-700 dark:text-red-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }
                        >
                          {r.ingredient.stockKg.toFixed(0)}
                        </span>
                        <span className="text-slate-400">
                          {' '}
                          / {r.ingredient.reorderPointKg.toFixed(0)} kg
                        </span>
                      </td>

                      <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.avgDailyKg > 0 ? `${r.avgDailyKg.toFixed(1)} kg/d` : '0.0 kg/d'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {r.batchCount > 0 ? `${r.batchCount} batches` : 'Idle'}
                        </div>
                      </td>

                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {r.daysToStockout !== null ? `${r.daysToStockout.toFixed(1)}d` : '—'}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {r.primarySupplier?.name || 'Unassigned'}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                          {r.leadTimeDays}d lead time
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        {r.suggestedOrderDate ? (
                          <div>
                            <div className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                              {formatFullDate(r.suggestedOrderDate)}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                              {r.daysUntilOrder !== null && r.daysUntilOrder <= 0
                                ? 'Order today'
                                : r.daysUntilOrder !== null
                                ? `In ${Math.round(r.daysUntilOrder)} days`
                                : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                        {r.suggestedOrderKg > 0 ? (
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {r.suggestedOrderKg.toFixed(0)} kg
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatCurrency(r.estimatedOrderCost)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        {r.urgency === 'Order Now' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>Order Now</span>
                          </span>
                        ) : r.urgency === 'Due Soon' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span>Due Soon</span>
                          </span>
                        ) : r.urgency === 'Planned' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-[#005FB8] dark:text-sky-400">
                            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                            <span>Planned</span>
                          </span>
                        ) : r.urgency === 'Healthy' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>Healthy</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <MinusCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>No Usage</span>
                          </span>
                        )}
                      </td>

                      <td
                        className="py-2.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onRestockIngredient(
                                r.ingredient,
                                r.suggestedOrderKg > 0 ? r.suggestedOrderKg : 250
                              )
                            }
                            title="Receive stock"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#005FB8] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onManageSuppliers(r.ingredient)}
                            title="Manage suppliers"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#005FB8] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                          >
                            <Building2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
};
