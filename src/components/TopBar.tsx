import React from 'react';
import { Menu, Plus, Printer } from 'lucide-react';

interface TopBarProps {
  breadcrumbs: string[];
  onOpenMobileNav: () => void;
  onNewRecipe: () => void;
  onPrintSheet?: () => void;
  canPrint?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  breadcrumbs,
  onOpenMobileNav,
  onNewRecipe,
  onPrintSheet,
  canPrint = false,
}) => {
  return (
    <header className="no-print flex h-14 shrink-0 items-center justify-between gap-8 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu className="h-4 w-4" />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${crumb}-${idx}`}>
                {idx > 0 && (
                  <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
                    /
                  </span>
                )}
                <span
                  className={`truncate ${
                    isLast
                      ? 'font-display font-semibold text-slate-900 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {crumb}
                </span>
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {canPrint && onPrintSheet && (
          <button
            type="button"
            onClick={onPrintSheet}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005FB8] whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Batch Sheet</span>
          </button>
        )}

        <button
          type="button"
          onClick={onNewRecipe}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#004E98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005FB8] whitespace-nowrap shrink-0 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Recipe</span>
        </button>
      </div>
    </header>
  );
};
