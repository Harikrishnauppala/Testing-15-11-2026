import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { ProductLine, Recipe } from '../types/factory';

interface NewRecipeModalProps {
  open: boolean;
  onClose: () => void;
  existingRecipes: Recipe[];
  onCreate: (data: {
    code: string;
    name: string;
    productLine: ProductLine;
    yieldPct: number;
    unitWeightG: number;
    shelfLifeDays: number;
    storageTemp: string;
    cloneFromId?: string;
  }) => void;
}

const PRODUCT_LINES: ProductLine[] = [
  'Millet Cookies',
  'Millet Biscuits',
  'Millet Muffins',
  'Ready-to-Eat Snacks',
  'Gluten-Free & R&D',
];

export const NewRecipeModal: React.FC<NewRecipeModalProps> = ({
  open,
  onClose,
  existingRecipes,
  onCreate,
}) => {
  const [code, setCode] = useState(`FRM-${Math.floor(5000 + Math.random() * 4000)}`);
  const [name, setName] = useState('');
  const [productLine, setProductLine] = useState<ProductLine>('Millet Cookies');
  const [yieldPct, setYieldPct] = useState(86);
  const [unitWeightG, setUnitWeightG] = useState(120);
  const [shelfLifeDays, setShelfLifeDays] = useState(180);
  const [storageTemp, setStorageTemp] = useState('Ambient 18–24°C (Flow-Pack)');
  const [cloneFromId, setCloneFromId] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onCreate({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      productLine,
      yieldPct: Math.max(1, Math.min(100, Number(yieldPct) || 95)),
      unitWeightG: Math.max(1, Number(unitWeightG) || 100),
      shelfLifeDays: Math.max(1, Number(shelfLifeDays) || 30),
      storageTemp: storageTemp.trim() || 'Ambient 18–22°C',
      cloneFromId: cloneFromId || undefined,
    });
    setName('');
    setCloneFromId('');
    setCode(`FRM-${Math.floor(5000 + Math.random() * 4000)}`);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            New Manufacturing Formulation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Formula Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Product Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Honey Oat Sandwich Loaf"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Product Line
              </label>
              <select
                value={productLine}
                onChange={(e) => setProductLine(e.target.value as ProductLine)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {PRODUCT_LINES.map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Starting Template
              </label>
              <select
                value={cloneFromId}
                onChange={(e) => setCloneFromId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Blank Formulation</option>
                {existingRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    Clone {r.code} ({r.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Process Yield (%)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                value={yieldPct}
                onChange={(e) => setYieldPct(Number(e.target.value))}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Unit Pack (g)
              </label>
              <input
                type="number"
                min={1}
                value={unitWeightG}
                onChange={(e) => setUnitWeightG(Number(e.target.value))}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Shelf Life (days)
              </label>
              <input
                type="number"
                min={1}
                value={shelfLifeDays}
                onChange={(e) => setShelfLifeDays(Number(e.target.value))}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Storage & Handling Condition
            </label>
            <input
              type="text"
              value={storageTemp}
              onChange={(e) => setStorageTemp(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white hover:bg-[#004E98] dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              Create Formulation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface RevisionModalProps {
  open: boolean;
  currentVersion: string;
  onClose: () => void;
  onSaveRevision: (newVersion: string, author: string, notes: string) => void;
}

export const RevisionModal: React.FC<RevisionModalProps> = ({
  open,
  currentVersion,
  onClose,
  onSaveRevision,
}) => {
  const suggestNextVersion = (ver: string) => {
    const match = ver.match(/^v?(\d+)\.(\d+)$/i);
    if (!match) return `${ver}.1`;
    return `v${match[1]}.${Number(match[2]) + 1}`;
  };

  const [version, setVersion] = useState(suggestNextVersion(currentVersion));
  const [author, setAuthor] = useState('E. Lindqvist (Lead Formulator)');
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!version.trim() || !notes.trim()) return;
    onSaveRevision(version.trim(), author.trim() || 'Plant Engineering', notes.trim());
    setNotes('');
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Save Controlled Revision
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                New Version
              </label>
              <input
                type="text"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="font-mono w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Author / QA Reviewer
              </label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Engineering Change Note
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe ingredient adjustments, process changes, or QA rationale..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#005FB8] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white hover:bg-[#004E98] dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              Commit Revision
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel,
  destructive = true,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
              destructive
                ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`rounded-md px-4 py-2 text-xs font-medium text-white ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#005FB8] hover:bg-[#004E98] dark:bg-sky-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
