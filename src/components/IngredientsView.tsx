import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  Download,
  X,
  Building2,
} from 'lucide-react';
import type { Allergen, Ingredient, ProductionBatch, Recipe } from '../types/factory';
import { downloadCsv, formatCurrency } from '../utils/calculations';
import {
  getPrimarySupplier,
  normalizeSuppliersList,
  SuppliersListEditor,
  SuppliersModal,
} from './SuppliersModal';
import { SupplierDashboardPanel } from './SupplierDashboardPanel';
import { ProcurementForecastPanel } from './ProcurementForecastPanel';

const ALLERGENS: Allergen[] = [
  'Wheat',
  'Milk',
  'Egg',
  'Soy',
  'Tree Nuts',
  'Peanuts',
  'Sesame',
  'Fish',
  'Shellfish',
  'Sulfites',
];

const CATEGORIES = [
  'Millet Flours & Grains',
  'Sweeteners & Syrups',
  'Fats & Oils',
  'Inclusions & Flavors',
  'Binders & Leavening',
  'Dairy & Liquids',
];

interface IngredientsViewProps {
  ingredients: Ingredient[];
  recipes?: Recipe[];
  batches?: ProductionBatch[];
  onSaveIngredient: (ingredient: Ingredient, isNew: boolean) => Promise<void>;
  onDeleteIngredient: (ingredientId: string) => Promise<void>;
  highlightedIngredientId?: string | null;
}

export const IngredientsView: React.FC<IngredientsViewProps> = ({
  ingredients,
  recipes = [],
  batches = [],
  onSaveIngredient,
  onDeleteIngredient,
  highlightedIngredientId,
}) => {
  const [activeSection, setActiveSection] = useState<'inventory' | 'suppliers' | 'forecast'>(
    'inventory'
  );
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editing, setEditing] = useState<{ item: Ingredient; isNew: boolean } | null>(null);
  const [suppliersTarget, setSuppliersTarget] = useState<Ingredient | null>(null);
  const [restockTarget, setRestockTarget] = useState<Ingredient | null>(null);
  const [restockQty, setRestockQty] = useState(250);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set(ingredients.map((i) => i.category));
    return ['All', ...Array.from(set).sort()];
  }, [ingredients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ingredients.filter((ing) => {
      if (categoryFilter !== 'All' && ing.category !== categoryFilter) return false;
      if (lowStockOnly && ing.stockKg > ing.reorderPointKg) return false;
      if (!q) return true;
      const supplierMatch = (ing.suppliers || []).some(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.contactName.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
      );
      return (
        ing.name.toLowerCase().includes(q) ||
        ing.sku.toLowerCase().includes(q) ||
        ing.supplier.toLowerCase().includes(q) ||
        supplierMatch
      );
    });
  }, [ingredients, search, categoryFilter, lowStockOnly]);

  const lowStockCount = useMemo(
    () => ingredients.filter((i) => i.stockKg <= i.reorderPointKg).length,
    [ingredients]
  );

  const totalInventoryValue = useMemo(
    () => ingredients.reduce((sum, i) => sum + i.stockKg * i.costPerKg, 0),
    [ingredients]
  );

  const procurementStats = useMemo(() => {
    let totalContacts = 0;
    let leadSum = 0;
    let leadCount = 0;
    for (const ing of ingredients) {
      const list = ing.suppliers || [];
      totalContacts += list.length;
      const primary = getPrimarySupplier(ing);
      if (primary) {
        leadSum += primary.leadTimeDays;
        leadCount += 1;
      }
    }
    return {
      totalContacts,
      avgLeadDays: leadCount > 0 ? leadSum / leadCount : 0,
    };
  }, [ingredients]);

  const openNewIngredient = () => {
    const nextNum = 500 + ingredients.length + 1;
    setEditing({
      isNew: true,
      item: {
        id: `ing-${Date.now()}`,
        sku: `RM-${nextNum}`,
        name: '',
        category: 'Millet Flours & Grains',
        supplier: '',
        suppliers: [],
        costPerKg: 120,
        stockKg: 500,
        reorderPointKg: 100,
        shelfLifeDays: 180,
        allergens: [],
        nutritionPer100g: {
          calories: 0,
          proteinG: 0,
          fatG: 0,
          satFatG: 0,
          carbsG: 0,
          sugarsG: 0,
          fiberG: 0,
          sodiumMg: 0,
        },
      },
    });
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setErrorMsg(null);
    const normalizedSuppliers = normalizeSuppliersList(editing.item.suppliers || []);
    const primary = normalizedSuppliers.find((s) => s.isPrimary) || normalizedSuppliers[0];
    const itemToSave: Ingredient = {
      ...editing.item,
      suppliers: normalizedSuppliers,
      supplier: primary ? primary.name : editing.item.supplier,
    };
    await onSaveIngredient(itemToSave, editing.isNew);
    setEditing(null);
  };

  const handleRestockConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    const updated: Ingredient = {
      ...restockTarget,
      stockKg: Number((restockTarget.stockKg + Math.max(0, restockQty)).toFixed(2)),
    };
    await onSaveIngredient(updated, false);
    setRestockTarget(null);
  };

  const handleDelete = async (id: string) => {
    setErrorMsg(null);
    try {
      await onDeleteIngredient(id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete raw material.');
    }
  };

  const handleQuickSwitchPrimary = async (
    ingredient: Ingredient,
    newPrimarySupplierId: string
  ) => {
    const nextSuppliers = (ingredient.suppliers || []).map((s) => ({
      ...s,
      isPrimary: s.id === newPrimarySupplierId,
    }));
    const primary = nextSuppliers.find((s) => s.isPrimary) || nextSuppliers[0];
    await onSaveIngredient(
      {
        ...ingredient,
        suppliers: nextSuppliers,
        supplier: primary ? primary.name : ingredient.supplier,
      },
      false
    );
  };

  const handleExportCsv = () => {
    downloadCsv(
      'raw-materials-inventory.csv',
      [
        'SKU',
        'Name',
        'Category',
        'Primary Supplier',
        'Contact Name',
        'Contact Email',
        'Lead Time (days)',
        'All Suppliers',
        'Cost (₹/kg)',
        'Stock (kg)',
        'Reorder Point (kg)',
        'Allergens',
        'Shelf Life (days)',
      ],
      filtered.map((i) => {
        const primary = getPrimarySupplier(i);
        const allSuppliersStr = (i.suppliers || [])
          .map((s) => `${s.name} (${s.contactName || 'No contact'}, ${s.email || 'No email'}, ${s.leadTimeDays}d)`)
          .join('; ');
        return [
          i.sku,
          i.name,
          i.category,
          primary?.name || i.supplier,
          primary?.contactName || '',
          primary?.email || '',
          primary ? primary.leadTimeDays : '',
          allSuppliersStr,
          i.costPerKg.toFixed(2),
          i.stockKg.toFixed(2),
          i.reorderPointKg.toFixed(2),
          i.allergens.join('; '),
          i.shelfLifeDays,
        ];
      })
    );
  };

  return (
    <div className="space-y-5">
      {/* Section Switcher: Material Inventory vs Supplier Management Dashboard */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md bg-slate-200/70 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveSection('inventory')}
            className={`rounded px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'inventory'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Material Inventory ({ingredients.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('suppliers')}
            className={`rounded px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'suppliers'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Supplier Management
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('forecast')}
            className={`rounded px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'forecast'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Procurement Forecast
          </button>
        </div>
      </div>

      {activeSection === 'suppliers' ? (
        <SupplierDashboardPanel
          ingredients={ingredients}
          onManageSuppliers={(ing) => setSuppliersTarget(ing)}
          onQuickSwitchPrimary={handleQuickSwitchPrimary}
        />
      ) : activeSection === 'forecast' ? (
        <ProcurementForecastPanel
          ingredients={ingredients}
          recipes={recipes}
          batches={batches}
          onRestockIngredient={(ing, suggestedQtyKg) => {
            setRestockTarget(ing);
            setRestockQty(suggestedQtyKg && suggestedQtyKg > 0 ? suggestedQtyKg : 250);
          }}
          onManageSuppliers={(ing) => setSuppliersTarget(ing)}
        />
      ) : (
        <>
          {/* Top 4-column Inventory Summary Strip */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cataloged Materials
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {ingredients.length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Low-Stock Alerts
          </div>
          <div
            className={`font-mono mt-1 text-2xl font-semibold tabular-nums ${
              lowStockCount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {lowStockCount}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            On-Hand Stock Valuation
          </div>
          <div className="font-mono mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {formatCurrency(totalInventoryValue)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Avg. Primary Lead Time
          </div>
          <div className="font-mono mt-1 flex items-baseline gap-2 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            <span>{procurementStats.avgLeadDays.toFixed(1)}d</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              · {procurementStats.totalContacts} vendor contacts
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, material, supplier, contact..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'All' ? 'All Categories' : cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              lowStockOnly
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                : 'border-slate-300 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
          >
            Low Stock Only ({lowStockCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openNewIngredient}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] whitespace-nowrap shrink-0 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Material</span>
          </button>
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-medium">SKU</th>
                <th className="py-2.5 px-3.5 font-medium">Raw Material</th>
                <th className="py-2.5 px-3.5 font-medium">Suppliers & Contacts</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Lead Time</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Cost / kg</th>
                <th className="py-2.5 px-3.5 text-right font-medium">On Hand</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Reorder At</th>
                <th className="py-2.5 px-3.5 font-medium">Status</th>
                <th className="py-2.5 px-3.5 font-medium">Allergens</th>
                <th className="py-2.5 px-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm text-slate-500">
                    No raw materials match your current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((ing) => {
                  const isLow = ing.stockKg <= ing.reorderPointKg;
                  const isHighlighted = highlightedIngredientId === ing.id;
                  const supplierList = ing.suppliers || [];
                  const primary = getPrimarySupplier(ing);
                  const altCount = Math.max(0, supplierList.length - 1);
                  return (
                    <tr
                      key={ing.id}
                      className={`h-11 transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50 ${
                        isHighlighted ? 'bg-sky-50/70 dark:bg-sky-950/30' : ''
                      }`}
                    >
                      <td className="font-mono py-2 px-3.5 font-medium text-slate-700 dark:text-slate-300">
                        {ing.sku}
                      </td>
                      <td className="py-2 px-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {ing.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ing.category} · {ing.shelfLifeDays}d shelf life
                        </div>
                      </td>
                      <td className="py-2 px-3.5">
                        <button
                          type="button"
                          onClick={() => setSuppliersTarget(ing)}
                          className="group text-left"
                        >
                          <div className="font-medium text-slate-800 group-hover:text-[#005FB8] dark:text-slate-200 dark:group-hover:text-sky-400">
                            {primary?.name || ing.supplier || 'Assign supplier'}
                            {altCount > 0 && (
                              <span className="ml-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                · +{altCount} alt
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {primary?.contactName || primary?.email
                              ? `${primary.contactName || 'Contact'}${
                                  primary.email ? ` · ${primary.email}` : ''
                                }`
                              : 'Click to add contact & email'}
                          </div>
                        </button>
                      </td>
                      <td className="font-mono py-2 px-3.5 text-right text-slate-700 tabular-nums dark:text-slate-300">
                        {primary ? `${primary.leadTimeDays}d` : '—'}
                      </td>
                      <td className="font-mono py-2 px-3.5 text-right text-slate-900 tabular-nums dark:text-slate-100">
                        {formatCurrency(ing.costPerKg)}
                      </td>
                      <td className="font-mono py-2 px-3.5 text-right font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {ing.stockKg.toFixed(1)} kg
                      </td>
                      <td className="font-mono py-2 px-3.5 text-right text-slate-500 tabular-nums dark:text-slate-400">
                        {ing.reorderPointKg.toFixed(0)} kg
                      </td>
                      <td className="py-2 px-3.5">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>Low Stock</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>In Stock</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">
                        {ing.allergens.length > 0 ? ing.allergens.join(' · ') : 'None'}
                      </td>
                      <td className="py-2 px-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSuppliersTarget(ing)}
                            title="Manage suppliers"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#005FB8] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                          >
                            <Building2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRestockTarget(ing);
                              setRestockQty(250);
                            }}
                            title="Receive stock"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#005FB8] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing({ item: structuredClone(ing), isNew: false })}
                            title="Edit material"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ing.id)}
                            title="Delete material"
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
        </>
      )}

      {/* Restock Modal */}
      {restockTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setRestockTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Receive Inventory — {restockTarget.sku}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {restockTarget.name} (Current: {restockTarget.stockKg.toFixed(1)} kg)
            </p>
            <form onSubmit={handleRestockConfirm} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Quantity Received (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={restockQty}
                  onChange={(e) => setRestockQty(Number(e.target.value))}
                  className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRestockTarget(null)}
                  className="rounded-md border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#005FB8] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] dark:bg-sky-600"
                >
                  Add Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Add Ingredient Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editing.isNew ? 'Add Raw Material' : `Edit Material — ${editing.item.sku}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 p-5 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editing.item.sku}
                    onChange={(e) =>
                      setEditing({ ...editing, item: { ...editing.item, sku: e.target.value } })
                    }
                    className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Ingredient Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editing.item.name}
                    onChange={(e) =>
                      setEditing({ ...editing, item: { ...editing.item, name: e.target.value } })
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  value={editing.item.category}
                  onChange={(e) =>
                    setEditing({ ...editing, item: { ...editing.item, category: e.target.value } })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Cost (₹ / kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editing.item.costPerKg}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        item: { ...editing.item, costPerKg: Number(e.target.value) },
                      })
                    }
                    className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Stock On Hand (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={editing.item.stockKg}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        item: { ...editing.item, stockKg: Number(e.target.value) },
                      })
                    }
                    className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Reorder Point (kg)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={editing.item.reorderPointKg}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        item: { ...editing.item, reorderPointKg: Number(e.target.value) },
                      })
                    }
                    className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Shelf Life (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editing.item.shelfLifeDays}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        item: { ...editing.item, shelfLifeDays: Number(e.target.value) },
                      })
                    }
                    className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <SuppliersListEditor
                suppliers={editing.item.suppliers || []}
                onChange={(nextSuppliers) => {
                  const primary = nextSuppliers.find((s) => s.isPrimary) || nextSuppliers[0];
                  setEditing({
                    ...editing,
                    item: {
                      ...editing.item,
                      suppliers: nextSuppliers,
                      supplier: primary ? primary.name : '',
                    },
                  });
                }}
              />

              <div>
                <div className="mb-2 font-medium text-slate-700 dark:text-slate-300">
                  Declared Allergens
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {ALLERGENS.map((alg) => {
                    const checked = editing.item.allergens.includes(alg);
                    return (
                      <label
                        key={alg}
                        className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? editing.item.allergens.filter((a) => a !== alg)
                              : [...editing.item.allergens, alg];
                            setEditing({
                              ...editing,
                              item: { ...editing.item, allergens: next },
                            });
                          }}
                          className="accent-[#005FB8]"
                        />
                        <span>{alg}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 font-medium text-slate-700 dark:text-slate-300">
                  Nutritional Profile (per 100g)
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ['calories', 'Calories (kcal)'],
                      ['proteinG', 'Protein (g)'],
                      ['fatG', 'Total Fat (g)'],
                      ['satFatG', 'Sat. Fat (g)'],
                      ['carbsG', 'Carbs (g)'],
                      ['sugarsG', 'Sugars (g)'],
                      ['fiberG', 'Fiber (g)'],
                      ['sodiumMg', 'Sodium (mg)'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                        {label}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editing.item.nutritionPer100g[key]}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            item: {
                              ...editing.item,
                              nutritionPer100g: {
                                ...editing.item.nutritionPer100g,
                                [key]: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="font-mono w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#005FB8] px-4 py-2 font-medium text-white hover:bg-[#004E98] dark:bg-sky-600"
                >
                  Save Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Suppliers Management Modal */}
      {suppliersTarget && (
        <SuppliersModal
          key={suppliersTarget.id}
          ingredient={suppliersTarget}
          onClose={() => setSuppliersTarget(null)}
          onSave={async (updated) => {
            await onSaveIngredient(updated, false);
          }}
        />
      )}
    </div>
  );
};
