import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, BookOpen, Package, Scale, Plus, X } from 'lucide-react';
import type { Ingredient, Recipe } from '../types/factory';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  recipes: Recipe[];
  ingredients: Ingredient[];
  onSelectRecipe: (recipeId: string) => void;
  onScaleRecipe: (recipeId: string) => void;
  onSelectIngredient: (ingredientId: string) => void;
  onNewRecipe: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  recipes,
  ingredients,
  onSelectRecipe,
  onScaleRecipe,
  onSelectIngredient,
  onNewRecipe,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes.slice(0, 6);
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.productLine.toLowerCase().includes(q)
    );
  }, [query, recipes]);

  const filteredIngredients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ingredients.slice(0, 5);
    return ingredients
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.supplier.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query, ingredients]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 pt-20 px-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to recipe code, product name, or raw material SKU..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {/* Quick Actions */}
          <div className="p-2">
            <div className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Actions
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNewRecipe();
              }}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-2.5">
                <Plus className="h-4 w-4 text-[#005FB8] dark:text-sky-400" />
                <span>Create New Formulation</span>
              </span>
              <span className="font-mono text-xs text-slate-400">Ctrl+N</span>
            </button>
          </div>

          {/* Recipes */}
          <div className="p-2">
            <div className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Formulations ({filteredRecipes.length})
            </div>
            {filteredRecipes.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-500">No matching recipes.</div>
            ) : (
              filteredRecipes.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectRecipe(r.id);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="font-mono shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {r.code}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {r.name}
                    </span>
                    <span className="font-mono shrink-0 text-xs text-slate-400">{r.version}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onScaleRecipe(r.id);
                      onClose();
                    }}
                    className="ml-2 inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#005FB8] hover:bg-[#005FB8]/10 dark:text-sky-400 dark:hover:bg-sky-400/10"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    <span>Scale</span>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Ingredients */}
          <div className="p-2">
            <div className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Raw Materials ({filteredIngredients.length})
            </div>
            {filteredIngredients.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-500">No matching raw materials.</div>
            ) : (
              filteredIngredients.map((ing) => (
                <button
                  key={ing.id}
                  type="button"
                  onClick={() => {
                    onSelectIngredient(ing.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Package className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="font-mono shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {ing.sku}
                    </span>
                    <span className="truncate text-sm text-slate-800 dark:text-slate-200">
                      {ing.name}
                    </span>
                  </span>
                  <span className="font-mono ml-2 shrink-0 text-xs text-slate-500 tabular-nums">
                    {ing.stockKg.toFixed(1)} kg
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
