import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Download,
  Mail,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Ingredient, IngredientSupplier } from '../types/factory';
import { downloadCsv, formatCurrency } from '../utils/calculations';
import { getPrimarySupplier } from './SuppliersModal';

interface SupplierDashboardPanelProps {
  ingredients: Ingredient[];
  onManageSuppliers: (ingredient: Ingredient) => void;
  onQuickSwitchPrimary?: (ingredient: Ingredient, newPrimarySupplierId: string) => Promise<void>;
}

type LeadBucketKey = 'all' | 'fast' | 'regional' | 'extended' | 'long';

interface MaterialProcurementRow {
  ingredient: Ingredient;
  primary: IngredientSupplier | null;
  leadDays: number;
  supplierCount: number;
  isSingleSource: boolean;
  isLowStock: boolean;
  isLongLead: boolean;
  fasterAlternate: IngredientSupplier | null;
  flags: string[];
  severityRank: number;
}

interface AggregatedVendorRow {
  vendorKey: string;
  name: string;
  contactName: string;
  email: string;
  primarySkus: Ingredient[];
  alternateSkus: Ingredient[];
  leadTimes: number[];
  avgLeadDays: number;
  minLeadDays: number;
  maxLeadDays: number;
  avgCostPerKg: number;
  primaryStockValue: number;
  lowStockPrimaryCount: number;
}

export const SupplierDashboardPanel: React.FC<SupplierDashboardPanelProps> = ({
  ingredients,
  onManageSuppliers,
  onQuickSwitchPrimary,
}) => {
  const [bucketFilter, setBucketFilter] = useState<LeadBucketKey>('all');
  const [bottlenecksOnly, setBottlenecksOnly] = useState(true);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [expandedVendorKey, setExpandedVendorKey] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const materialRows = useMemo<MaterialProcurementRow[]>(() => {
    return ingredients.map((ing) => {
      const list = ing.suppliers || [];
      const primary = getPrimarySupplier(ing);
      const leadDays = primary ? primary.leadTimeDays : 0;
      const supplierCount = list.length;
      const isSingleSource = supplierCount <= 1;
      const isLowStock = ing.stockKg <= ing.reorderPointKg;
      const isLongLead = leadDays >= 7;

      let fasterAlternate: IngredientSupplier | null = null;
      if (primary && list.length > 1) {
        const candidates = list
          .filter((s) => s.id !== primary.id && s.leadTimeDays < primary.leadTimeDays)
          .sort((a, b) => a.leadTimeDays - b.leadTimeDays);
        if (candidates.length > 0) {
          fasterAlternate = candidates[0];
        }
      }

      const flags: string[] = [];
      if (isLowStock) flags.push('Low Stock');
      if (isLongLead) flags.push(`Long Lead (${leadDays}d)`);
      if (isSingleSource) flags.push('Single-Sourced');
      if (fasterAlternate) {
        flags.push(
          `Faster Alt (${fasterAlternate.leadTimeDays}d via ${fasterAlternate.name})`
        );
      }

      let severityRank = 0;
      if (isLowStock && (isLongLead || isSingleSource)) severityRank = 4;
      else if (isLowStock) severityRank = 3;
      else if (isLongLead && isSingleSource) severityRank = 3;
      else if (isLongLead || fasterAlternate) severityRank = 2;
      else if (isSingleSource) severityRank = 1;

      return {
        ingredient: ing,
        primary,
        leadDays,
        supplierCount,
        isSingleSource,
        isLowStock,
        isLongLead,
        fasterAlternate,
        flags,
        severityRank,
      };
    });
  }, [ingredients]);

  const vendorRows = useMemo<AggregatedVendorRow[]>(() => {
    const map = new Map<
      string,
      {
        name: string;
        contactName: string;
        email: string;
        primarySkus: Ingredient[];
        alternateSkus: Ingredient[];
        leadTimes: number[];
        costSum: number;
        costCount: number;
        primaryStockValue: number;
        lowStockPrimaryCount: number;
      }
    >();

    for (const ing of ingredients) {
      const list = ing.suppliers && ing.suppliers.length > 0
        ? ing.suppliers
        : ing.supplier
        ? [
            {
              id: `fallback-${ing.id}`,
              name: ing.supplier,
              contactName: '',
              email: '',
              leadTimeDays: 7,
              isPrimary: true,
            },
          ]
        : [];

      const primary = getPrimarySupplier(ing);

      for (const sup of list) {
        const key = sup.name.trim().toLowerCase() || sup.id;
        let entry = map.get(key);
        if (!entry) {
          entry = {
            name: sup.name.trim() || 'Unnamed Vendor',
            contactName: sup.contactName || '',
            email: sup.email || '',
            primarySkus: [],
            alternateSkus: [],
            leadTimes: [],
            costSum: 0,
            costCount: 0,
            primaryStockValue: 0,
            lowStockPrimaryCount: 0,
          };
          map.set(key, entry);
        }
        if (!entry.contactName && sup.contactName) entry.contactName = sup.contactName;
        if (!entry.email && sup.email) entry.email = sup.email;

        entry.leadTimes.push(sup.leadTimeDays);
        entry.costSum += ing.costPerKg;
        entry.costCount += 1;

        const isPrimaryForIng = primary ? sup.id === primary.id : Boolean(sup.isPrimary);
        if (isPrimaryForIng) {
          entry.primarySkus.push(ing);
          entry.primaryStockValue += ing.stockKg * ing.costPerKg;
          if (ing.stockKg <= ing.reorderPointKg) {
            entry.lowStockPrimaryCount += 1;
          }
        } else {
          entry.alternateSkus.push(ing);
        }
      }
    }

    return Array.from(map.entries())
      .map(([vendorKey, v]) => {
        const avgLeadDays =
          v.leadTimes.length > 0
            ? v.leadTimes.reduce((a, b) => a + b, 0) / v.leadTimes.length
            : 0;
        const minLeadDays = v.leadTimes.length > 0 ? Math.min(...v.leadTimes) : 0;
        const maxLeadDays = v.leadTimes.length > 0 ? Math.max(...v.leadTimes) : 0;
        return {
          vendorKey,
          name: v.name,
          contactName: v.contactName,
          email: v.email,
          primarySkus: v.primarySkus,
          alternateSkus: v.alternateSkus,
          leadTimes: v.leadTimes,
          avgLeadDays,
          minLeadDays,
          maxLeadDays,
          avgCostPerKg: v.costCount > 0 ? v.costSum / v.costCount : 0,
          primaryStockValue: v.primaryStockValue,
          lowStockPrimaryCount: v.lowStockPrimaryCount,
        };
      })
      .sort((a, b) => {
        if (b.primarySkus.length !== a.primarySkus.length) {
          return b.primarySkus.length - a.primarySkus.length;
        }
        return b.primaryStockValue - a.primaryStockValue;
      });
  }, [ingredients]);

  const kpis = useMemo(() => {
    const dualSourcedCount = materialRows.filter((r) => !r.isSingleSource).length;
    const dualSourcedPct =
      materialRows.length > 0 ? (dualSourcedCount / materialRows.length) * 100 : 0;

    const leadList = materialRows.map((r) => r.leadDays);
    const avgLead =
      leadList.length > 0 ? leadList.reduce((a, b) => a + b, 0) / leadList.length : 0;
    const minLead = leadList.length > 0 ? Math.min(...leadList) : 0;
    const maxLead = leadList.length > 0 ? Math.max(...leadList) : 0;

    const criticalBottlenecks = materialRows.filter((r) => r.severityRank >= 2);
    const singleSourceCount = materialRows.filter((r) => r.isSingleSource).length;

    const avgCostPerKg =
      ingredients.length > 0
        ? ingredients.reduce((sum, i) => sum + i.costPerKg, 0) / ingredients.length
        : 0;
    const topCostMaterial = ingredients.slice().sort((a, b) => b.costPerKg - a.costPerKg)[0] || null;

    return {
      uniqueVendors: vendorRows.length,
      dualSourcedCount,
      dualSourcedPct,
      avgLead,
      minLead,
      maxLead,
      criticalBottleneckCount: criticalBottlenecks.length,
      singleSourceCount,
      avgCostPerKg,
      topCostMaterial,
    };
  }, [materialRows, vendorRows.length, ingredients]);

  const leadBuckets = useMemo(() => {
    const buckets: {
      key: Exclude<LeadBucketKey, 'all'>;
      label: string;
      rangeText: string;
      rows: MaterialProcurementRow[];
      stockValue: number;
    }[] = [
      { key: 'fast', label: '0–2 Days', rangeText: 'Local / Same-Week', rows: [], stockValue: 0 },
      { key: 'regional', label: '3–5 Days', rangeText: 'Regional Dispatch', rows: [], stockValue: 0 },
      { key: 'extended', label: '6–9 Days', rangeText: 'Extended Transit', rows: [], stockValue: 0 },
      { key: 'long', label: '10+ Days', rangeText: 'Import / Long-Lead', rows: [], stockValue: 0 },
    ];

    for (const r of materialRows) {
      const val = r.ingredient.stockKg * r.ingredient.costPerKg;
      if (r.leadDays <= 2) {
        buckets[0].rows.push(r);
        buckets[0].stockValue += val;
      } else if (r.leadDays <= 5) {
        buckets[1].rows.push(r);
        buckets[1].stockValue += val;
      } else if (r.leadDays <= 9) {
        buckets[2].rows.push(r);
        buckets[2].stockValue += val;
      } else {
        buckets[3].rows.push(r);
        buckets[3].stockValue += val;
      }
    }
    return buckets;
  }, [materialRows]);

  const filteredQueueRows = useMemo(() => {
    return materialRows
      .filter((r) => {
        if (bucketFilter === 'fast' && r.leadDays > 2) return false;
        if (bucketFilter === 'regional' && (r.leadDays < 3 || r.leadDays > 5)) return false;
        if (bucketFilter === 'extended' && (r.leadDays < 6 || r.leadDays > 9)) return false;
        if (bucketFilter === 'long' && r.leadDays < 10) return false;
        if (bottlenecksOnly && r.severityRank === 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.severityRank !== a.severityRank) return b.severityRank - a.severityRank;
        if (b.leadDays !== a.leadDays) return b.leadDays - a.leadDays;
        return b.ingredient.costPerKg - a.ingredient.costPerKg;
      });
  }, [materialRows, bucketFilter, bottlenecksOnly]);

  const fasterAltRows = useMemo(
    () =>
      materialRows
        .filter((r) => r.fasterAlternate !== null)
        .sort(
          (a, b) =>
            b.leadDays -
            (b.fasterAlternate?.leadTimeDays ?? b.leadDays) -
            (a.leadDays - (a.fasterAlternate?.leadTimeDays ?? a.leadDays))
        ),
    [materialRows]
  );

  // Scatter chart geometry
  const scatterGeometry = useMemo(() => {
    const width = 620;
    const height = 270;
    const padL = 56;
    const padR = 24;
    const padT = 18;
    const padB = 36;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxLead = Math.max(14, ...materialRows.map((r) => r.leadDays + 1));
    const maxCost = Math.max(500, ...materialRows.map((r) => Math.ceil(r.ingredient.costPerKg / 100) * 100));

    const toX = (days: number) => padL + (days / maxLead) * plotW;
    const toY = (cost: number) => padT + plotH - (cost / maxCost) * plotH;

    return { width, height, padL, padR, padT, padB, plotW, plotH, maxLead, maxCost, toX, toY };
  }, [materialRows]);

  const selectedPointRow = useMemo(() => {
    if (selectedPointId) {
      const found = materialRows.find((r) => r.ingredient.id === selectedPointId);
      if (found) return found;
    }
    return filteredQueueRows[0] || materialRows[0] || null;
  }, [selectedPointId, materialRows, filteredQueueRows]);

  const handleExportProcurementCsv = () => {
    downloadCsv(
      'supplier-procurement-analysis.csv',
      [
        'SKU',
        'Raw Material',
        'Primary Supplier',
        'Contact Name',
        'Email',
        'Primary Lead Time (days)',
        'Vendor Count',
        'Cost (₹/kg)',
        'On Hand (kg)',
        'Reorder Point (kg)',
        'Bottleneck Flags',
        'Faster Alternate',
      ],
      materialRows.map((r) => [
        r.ingredient.sku,
        r.ingredient.name,
        r.primary?.name || 'Unassigned',
        r.primary?.contactName || '',
        r.primary?.email || '',
        r.leadDays,
        r.supplierCount,
        r.ingredient.costPerKg.toFixed(2),
        r.ingredient.stockKg.toFixed(1),
        r.ingredient.reorderPointKg.toFixed(0),
        r.flags.join(' | ') || 'Nominal',
        r.fasterAlternate
          ? `${r.fasterAlternate.name} (${r.fasterAlternate.leadTimeDays}d)`
          : '',
      ])
    );
  };

  return (
    <div className="space-y-5">
      {/* Top 4-Column Procurement Efficiency KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Qualified Vendors & Dual-Sourcing
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {kpis.uniqueVendors}
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              vendors
            </span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {kpis.dualSourcedCount}/{materialRows.length} SKUs dual-sourced (
            {kpis.dualSourcedPct.toFixed(0)}%)
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Avg. Primary Lead Time
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {kpis.avgLead.toFixed(1)} days
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            Range: {kpis.minLead}d – {kpis.maxLead}d across catalog
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Supply Chain Bottlenecks
          </div>
          <div
            className={`font-mono mt-1 text-2xl font-semibold tabular-nums ${
              kpis.criticalBottleneckCount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {kpis.criticalBottleneckCount}
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              flagged SKUs
            </span>
          </div>
          <div className="font-mono mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {kpis.singleSourceCount} single-sourced · {fasterAltRows.length} faster alt available
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Catalog Avg. Cost / kg
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {formatCurrency(kpis.avgCostPerKg)}
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {kpis.topCostMaterial
              ? `Peak: ${kpis.topCostMaterial.sku} @ ${formatCurrency(kpis.topCostMaterial.costPerKg)}/kg`
              : '—'}
          </div>
        </div>
      </div>

      {/* 2-Column Analytical Visualization Row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Lead Time vs Cost-per-Ingredient Bottleneck Matrix */}
        <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Lead Time vs. Cost-per-Ingredient Matrix
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Identifies high-cost or low-stock ingredients exposed to extended vendor lead times. Click any point to inspect.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-red-600" />
                  <span>Critical (Low Stock / Single + Long Lead)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-600" />
                  <span>Watchlist</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#005FB8]" />
                  <span>Nominal</span>
                </span>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <svg
                viewBox={`0 0 ${scatterGeometry.width} ${scatterGeometry.height}`}
                className="h-auto w-full min-w-[480px]"
                role="img"
                aria-label="Scatter plot of primary supplier lead time in days versus ingredient cost per kilogram"
              >
                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const val = Math.round(scatterGeometry.maxCost * t);
                  const y = scatterGeometry.toY(val);
                  return (
                    <g key={t}>
                      <line
                        x1={scatterGeometry.padL}
                        y1={y}
                        x2={scatterGeometry.width - scatterGeometry.padR}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-100 dark:text-slate-800"
                        strokeWidth={1}
                      />
                      <text
                        x={scatterGeometry.padL - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-400 font-mono text-[10px]"
                      >
                        ₹{val}
                      </text>
                    </g>
                  );
                })}

                {/* 7-day high-lead bottleneck threshold line */}
                {(() => {
                  const x7 = scatterGeometry.toX(7);
                  return (
                    <g>
                      <line
                        x1={x7}
                        y1={scatterGeometry.padT}
                        x2={x7}
                        y2={scatterGeometry.height - scatterGeometry.padB}
                        stroke="#D97706"
                        strokeDasharray="4 3"
                        strokeWidth={1}
                        opacity={0.75}
                      />
                      <text
                        x={x7 + 4}
                        y={scatterGeometry.padT + 10}
                        className="fill-amber-600 font-mono text-[9px] dark:fill-amber-400"
                      >
                        7d lead threshold
                      </text>
                    </g>
                  );
                })()}

                {/* X-axis ticks */}
                {[0, 3, 6, 9, 12, 15].map((day) => {
                  if (day > scatterGeometry.maxLead) return null;
                  const x = scatterGeometry.toX(day);
                  return (
                    <g key={day}>
                      <line
                        x1={x}
                        y1={scatterGeometry.height - scatterGeometry.padB}
                        x2={x}
                        y2={scatterGeometry.height - scatterGeometry.padB + 4}
                        stroke="currentColor"
                        className="text-slate-300 dark:text-slate-700"
                      />
                      <text
                        x={x}
                        y={scatterGeometry.height - scatterGeometry.padB + 16}
                        textAnchor="middle"
                        className="fill-slate-400 font-mono text-[10px]"
                      >
                        {day}d
                      </text>
                    </g>
                  );
                })}

                {/* Axis labels */}
                <text
                  x={scatterGeometry.padL + scatterGeometry.plotW / 2}
                  y={scatterGeometry.height - 4}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-medium"
                >
                  Primary Supplier Lead Time (Days)
                </text>

                {/* Plotted Material Points */}
                {materialRows.map((r) => {
                  const cx = scatterGeometry.toX(r.leadDays);
                  const cy = scatterGeometry.toY(r.ingredient.costPerKg);
                  const isSelected = selectedPointRow?.ingredient.id === r.ingredient.id;
                  const fill =
                    r.severityRank >= 3
                      ? '#DC2626'
                      : r.severityRank >= 2
                      ? '#D97706'
                      : '#005FB8';
                  return (
                    <g
                      key={r.ingredient.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedPointId(r.ingredient.id)}
                    >
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={10}
                          fill="none"
                          stroke={fill}
                          strokeWidth={1.5}
                          opacity={0.5}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSelected ? 6 : 4.5}
                        fill={fill}
                        opacity={0.9}
                      >
                        <title>
                          {`${r.ingredient.sku} ${r.ingredient.name} — ${formatCurrency(
                            r.ingredient.costPerKg
                          )}/kg · ${r.leadDays}d lead (${r.primary?.name || 'Unassigned'})`}
                        </title>
                      </circle>
                      {(r.severityRank >= 3 || isSelected || r.ingredient.costPerKg >= 1000) && (
                        <text
                          x={cx + 8}
                          y={cy + 3}
                          className="fill-slate-700 font-mono text-[9px] font-medium dark:fill-slate-300"
                        >
                          {r.ingredient.sku}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Selected Point Readout */}
          {selectedPointRow && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
              <div className="min-w-0">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  <span className="font-mono mr-1.5 text-slate-500">
                    {selectedPointRow.ingredient.sku}
                  </span>
                  {selectedPointRow.ingredient.name}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Primary: {selectedPointRow.primary?.name || 'Unassigned'} ·{' '}
                  <span className="font-mono tabular-nums">
                    {selectedPointRow.leadDays}d lead
                  </span>{' '}
                  ·{' '}
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedPointRow.ingredient.costPerKg)}/kg
                  </span>
                  {selectedPointRow.flags.length > 0 &&
                    ` · ${selectedPointRow.flags.join(' · ')}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onManageSuppliers(selectedPointRow.ingredient)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Manage Suppliers</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Lead Time Distribution & Alternate Vendor Opportunities */}
        <div className="space-y-5 lg:col-span-5">
          {/* Lead Time Distribution Buckets */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Lead Time Distribution
              </h3>
              {bucketFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setBucketFilter('all')}
                  className="text-xs font-medium text-[#005FB8] hover:underline dark:text-sky-400"
                >
                  Clear filter
                </button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Click any lead bucket to filter the bottleneck queue below.
            </p>

            <div className="mt-3.5 space-y-2.5">
              {leadBuckets.map((b) => {
                const pct =
                  materialRows.length > 0 ? (b.rows.length / materialRows.length) * 100 : 0;
                const active = bucketFilter === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setBucketFilter(active ? 'all' : b.key)}
                    className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-[#005FB8] bg-sky-50/50 dark:border-sky-500 dark:bg-sky-950/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {b.label}{' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          · {b.rangeText}
                        </span>
                      </span>
                      <span className="font-mono text-slate-900 tabular-nums dark:text-slate-100">
                        {b.rows.length} SKUs ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full ${
                          b.key === 'long'
                            ? 'bg-red-600'
                            : b.key === 'extended'
                            ? 'bg-amber-500'
                            : 'bg-[#005FB8] dark:bg-sky-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Faster Backup Supplier Optimization */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Lead-Time Optimization Opportunities
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Materials where an alternate vendor offers shorter delivery lead time than the current primary supplier.
            </p>

            {fasterAltRows.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                All multi-sourced materials currently assign the fastest qualified vendor as primary.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {fasterAltRows.map((r) => {
                  const alt = r.fasterAlternate!;
                  const savedDays = r.leadDays - alt.leadTimeDays;
                  return (
                    <div
                      key={r.ingredient.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {r.ingredient.sku} · {r.ingredient.name}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {r.primary?.name} ({r.leadDays}d) → {alt.name} ({alt.leadTimeDays}d) ·{' '}
                          <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">
                            -{savedDays}d lead
                          </span>
                        </div>
                      </div>
                      {onQuickSwitchPrimary ? (
                        <button
                          type="button"
                          disabled={switchingId === r.ingredient.id}
                          onClick={async () => {
                            setSwitchingId(r.ingredient.id);
                            try {
                              await onQuickSwitchPrimary(r.ingredient, alt.id);
                            } finally {
                              setSwitchingId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>
                            {switchingId === r.ingredient.id ? 'Switching...' : 'Switch Primary'}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onManageSuppliers(r.ingredient)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200"
                        >
                          Review
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Supply Chain Bottlenecks & Procurement Risk Queue */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Supply Chain Bottleneck Queue ({filteredQueueRows.length})
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Prioritizes low-stock ingredients with extended delivery times, single-source dependencies, and cost exposure.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setBottlenecksOnly(true)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  bottlenecksOnly
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Flagged Bottlenecks
              </button>
              <button
                type="button"
                onClick={() => setBottlenecksOnly(false)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  !bottlenecksOnly
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                All Materials ({materialRows.length})
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportProcurementCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Procurement CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Raw Material</th>
                <th className="py-2.5 px-3 font-medium">Primary Vendor</th>
                <th className="py-2.5 px-3 font-medium">Bottleneck Factors</th>
                <th className="py-2.5 px-3 text-right font-medium">Lead Time</th>
                <th className="py-2.5 px-3 text-right font-medium">Cost / kg</th>
                <th className="py-2.5 px-3 text-right font-medium">Stock / Reorder</th>
                <th className="py-2.5 px-4 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredQueueRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No materials match the selected lead-time or bottleneck filter.
                  </td>
                </tr>
              ) : (
                filteredQueueRows.map((r) => (
                  <tr key={r.ingredient.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {r.ingredient.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {r.ingredient.sku} · {r.ingredient.category}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {r.primary?.name || 'Unassigned'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {r.primary?.contactName || 'No contact'}
                        {r.primary?.email ? ` · ${r.primary.email}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      {r.flags.length === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Nominal · Multi-sourced
                        </span>
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              r.severityRank >= 3
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          />
                          <span
                            className={
                              r.severityRank >= 3
                                ? 'font-medium text-red-700 dark:text-red-400'
                                : 'text-amber-800 dark:text-amber-300'
                            }
                          >
                            {r.flags.join(' · ')}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                      {r.leadDays}d
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right text-slate-900 tabular-nums dark:text-slate-100">
                      {formatCurrency(r.ingredient.costPerKg)}
                    </td>
                    <td className="font-mono py-2.5 px-3 text-right tabular-nums">
                      <span
                        className={
                          r.isLowStock
                            ? 'font-semibold text-red-700 dark:text-red-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {r.ingredient.stockKg.toFixed(0)}
                      </span>
                      <span className="text-slate-400">
                        {' '}
                        / {r.ingredient.reorderPointKg.toFixed(0)} kg
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onManageSuppliers(r.ingredient)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#005FB8] hover:text-[#005FB8] whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-400"
                      >
                        <Building2 className="h-3 w-3" />
                        <span>Suppliers ({r.supplierCount})</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aggregated Vendor Directory Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Vendor Procurement Directory ({vendorRows.length} Vendors)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Consolidated lead times, ingredient cost averages, and on-hand inventory exposure grouped by supplier.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Vendor & Procurement Contact</th>
                <th className="py-2.5 px-3 text-right font-medium">Assigned SKUs</th>
                <th className="py-2.5 px-3 text-right font-medium">Avg. Lead Time</th>
                <th className="py-2.5 px-3 text-right font-medium">Avg. Cost / kg</th>
                <th className="py-2.5 px-3 text-right font-medium">Primary Stock Value</th>
                <th className="py-2.5 px-4 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {vendorRows.map((v) => {
                const isExpanded = expandedVendorKey === v.vendorKey;
                const allVendorSkus = [
                  ...v.primarySkus.map((ing) => ({ ing, role: 'Primary' as const })),
                  ...v.alternateSkus.map((ing) => ({ ing, role: 'Backup' as const })),
                ];
                return (
                  <React.Fragment key={v.vendorKey}>
                    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedVendorKey(isExpanded ? null : v.vendorKey)
                            }
                            className="inline-flex items-center gap-1.5 font-medium text-slate-900 hover:text-[#005FB8] dark:text-slate-100 dark:hover:text-sky-400"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                            )}
                            <span>{v.name}</span>
                          </button>
                          {v.email && (
                            <a
                              href={`mailto:${v.email}`}
                              title={`Email ${v.contactName || v.name}`}
                              className="text-slate-400 hover:text-[#005FB8] dark:hover:text-sky-400"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="pl-5 text-[11px] text-slate-500 dark:text-slate-400">
                          {v.contactName || 'No contact name'}
                          {v.email ? ` · ${v.email}` : ''}
                        </div>
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {v.primarySkus.length} primary
                        {v.alternateSkus.length > 0 ? ` · ${v.alternateSkus.length} alt` : ''}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-900 tabular-nums dark:text-slate-100">
                        {v.avgLeadDays.toFixed(1)}d
                        {v.minLeadDays !== v.maxLeadDays && (
                          <span className="ml-1 text-[11px] text-slate-500">
                            ({v.minLeadDays}–{v.maxLeadDays}d)
                          </span>
                        )}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {formatCurrency(v.avgCostPerKg)}
                      </td>
                      <td className="font-mono py-2.5 px-3 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {formatCurrency(v.primaryStockValue)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {v.lowStockPrimaryCount > 0 ? (
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            {v.lowStockPrimaryCount} low-stock SKU
                            {v.lowStockPrimaryCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Healthy Stock
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/70 dark:bg-slate-950/50">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="space-y-1.5 text-xs">
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Supplied Raw Materials ({allVendorSkus.length})
                            </div>
                            <div className="divide-y divide-slate-200/70 rounded border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                              {allVendorSkus.map(({ ing, role }) => {
                                const sup = (ing.suppliers || []).find(
                                  (s) => s.name.trim().toLowerCase() === v.vendorKey
                                );
                                return (
                                  <div
                                    key={`${v.vendorKey}-${ing.id}-${role}`}
                                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                                  >
                                    <div>
                                      <span className="font-mono mr-2 text-slate-500">
                                        {ing.sku}
                                      </span>
                                      <span className="font-medium text-slate-900 dark:text-slate-100">
                                        {ing.name}
                                      </span>
                                      <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        · {role}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="font-mono text-slate-600 tabular-nums dark:text-slate-400">
                                        {sup ? `${sup.leadTimeDays}d lead` : '—'} ·{' '}
                                        {formatCurrency(ing.costPerKg)}/kg ·{' '}
                                        {ing.stockKg.toFixed(0)} kg on hand
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => onManageSuppliers(ing)}
                                        className="text-xs font-medium text-[#005FB8] hover:underline dark:text-sky-400"
                                      >
                                        Manage
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
