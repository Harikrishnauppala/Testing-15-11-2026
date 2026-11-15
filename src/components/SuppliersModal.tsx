import React, { useState } from 'react';
import { Plus, Trash2, Mail, Star, X } from 'lucide-react';
import type { Ingredient, IngredientSupplier } from '../types/factory';

export function getPrimarySupplier(ingredient: Ingredient): IngredientSupplier | null {
  const list = ingredient.suppliers || [];
  if (list.length === 0) {
    if (ingredient.supplier?.trim()) {
      return {
        id: `sup-${ingredient.id}-fallback`,
        name: ingredient.supplier.trim(),
        contactName: '',
        email: '',
        leadTimeDays: 7,
        isPrimary: true,
      };
    }
    return null;
  }
  return list.find((s) => s.isPrimary) || list[0];
}

export function normalizeSuppliersList(list: IngredientSupplier[]): IngredientSupplier[] {
  const cleaned = list
    .map((s, idx) => ({
      ...s,
      id: s.id || `sup-${Date.now()}-${idx}`,
      name: s.name.trim(),
      contactName: s.contactName.trim(),
      email: s.email.trim(),
      leadTimeDays: Math.max(0, Number(s.leadTimeDays) || 0),
    }))
    .filter((s) => s.name || s.contactName || s.email);

  if (cleaned.length === 0) return [];
  let primaryIdx = cleaned.findIndex((s) => s.isPrimary);
  if (primaryIdx < 0) primaryIdx = 0;
  return cleaned.map((s, idx) => ({
    ...s,
    isPrimary: idx === primaryIdx,
  }));
}

interface SuppliersListEditorProps {
  suppliers: IngredientSupplier[];
  onChange: (next: IngredientSupplier[]) => void;
}

export const SuppliersListEditor: React.FC<SuppliersListEditorProps> = ({
  suppliers,
  onChange,
}) => {
  const handleAddSupplier = () => {
    const nextItem: IngredientSupplier = {
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      contactName: '',
      email: '',
      leadTimeDays: 5,
      isPrimary: suppliers.length === 0,
    };
    onChange([...suppliers, nextItem]);
  };

  const handleUpdateField = <K extends keyof IngredientSupplier>(
    index: number,
    field: K,
    value: IngredientSupplier[K]
  ) => {
    const next = suppliers.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(next);
  };

  const handleSetPrimary = (index: number) => {
    onChange(
      suppliers.map((s, i) => ({
        ...s,
        isPrimary: i === index,
      }))
    );
  };

  const handleRemove = (index: number) => {
    const remaining = suppliers.filter((_, i) => i !== index);
    if (remaining.length > 0 && !remaining.some((s) => s.isPrimary)) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }
    onChange(remaining);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-slate-700 dark:text-slate-300">
            Approved Suppliers ({suppliers.length})
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Maintain primary and alternate vendors with procurement contacts and lead times.
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddSupplier}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Supplier</span>
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No suppliers assigned yet. Click "Add Supplier" to record vendor contact and lead time.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-slate-50/50 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/50">
          {suppliers.map((sup, idx) => (
            <div key={sup.id} className="space-y-2.5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span className="font-mono">Vendor #{idx + 1}</span>
                  {sup.isPrimary && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#005FB8] dark:text-sky-400">Primary Supplier</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!sup.isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(idx)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-[#005FB8] hover:text-[#005FB8] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-400 dark:hover:text-sky-400"
                    >
                      <Star className="h-3 w-3" />
                      <span>Set Primary</span>
                    </button>
                  )}
                  {sup.email.trim() && (
                    <a
                      href={`mailto:${sup.email.trim()}`}
                      title={`Email ${sup.contactName || sup.name}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-[#005FB8] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-sky-400"
                    >
                      <Mail className="h-3 w-3" />
                      <span>Email</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    title="Remove supplier"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Deccan Millet Mills Ltd."
                    value={sup.name}
                    onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Raghavendra Rao"
                    value={sup.contactName}
                    onChange={(e) => handleUpdateField(idx, 'contactName', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="orders@supplier.in"
                    value={sup.email}
                    onChange={(e) => handleUpdateField(idx, 'email', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    Lead Time (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={sup.leadTimeDays}
                    onChange={(e) =>
                      handleUpdateField(idx, 'leadTimeDays', Math.max(0, Number(e.target.value) || 0))
                    }
                    className="font-mono w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-right text-xs text-slate-900 tabular-nums focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface SuppliersModalProps {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSave: (updated: Ingredient) => Promise<void>;
}

export const SuppliersModal: React.FC<SuppliersModalProps> = ({
  ingredient,
  onClose,
  onSave,
}) => {
  const [suppliers, setSuppliers] = useState<IngredientSupplier[]>(() => {
    if (!ingredient) return [];
    if (ingredient.suppliers && ingredient.suppliers.length > 0) {
      return structuredClone(ingredient.suppliers);
    }
    if (ingredient.supplier?.trim()) {
      return [
        {
          id: `sup-${ingredient.id}-1`,
          name: ingredient.supplier.trim(),
          contactName: '',
          email: '',
          leadTimeDays: 7,
          isPrimary: true,
        },
      ];
    }
    return [];
  });
  const [saving, setSaving] = useState(false);

  if (!ingredient) return null;

  const isLow = ingredient.stockKg <= ingredient.reorderPointKg;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const normalized = normalizeSuppliersList(suppliers);
      const primary = normalized.find((s) => s.isPrimary) || normalized[0];
      await onSave({
        ...ingredient,
        suppliers: normalized,
        supplier: primary ? primary.name : '',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Procurement Suppliers — {ingredient.sku}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {ingredient.name} · On hand:{' '}
              <span className="font-mono font-medium text-slate-700 tabular-nums dark:text-slate-200">
                {ingredient.stockKg.toFixed(1)} kg
              </span>{' '}
              (Reorder at{' '}
              <span className="font-mono tabular-nums">{ingredient.reorderPointKg.toFixed(0)} kg</span>
              )
              {isLow && (
                <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">
                  · Reorder Recommended
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 text-xs">
          <SuppliersListEditor suppliers={suppliers} onChange={setSuppliers} />

          <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[#005FB8] px-4 py-2 font-medium text-white hover:bg-[#004E98] disabled:opacity-50 dark:bg-sky-600"
            >
              {saving ? 'Saving...' : 'Save Suppliers'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
