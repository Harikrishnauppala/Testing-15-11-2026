import React, { useRef } from 'react';
import {
  BookOpen,
  Scale,
  Package,
  ClipboardList,
  Search,
  Sun,
  Moon,
  Download,
  Upload,
  RotateCcw,
  Factory,
  Cog,
  X,
} from 'lucide-react';
import type { WorkspaceView } from '../types/factory';

interface SidebarProps {
  factoryName: string;
  plantCode: string;
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  onOpenCommandPalette: () => void;
  recipeCount: number;
  lowStockCount: number;
  pendingQaCount: number;
  machineCount?: number;
  maintenanceMachineCount?: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onRequestReset: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  factoryName,
  plantCode,
  activeView,
  onSelectView,
  onOpenCommandPalette,
  recipeCount,
  lowStockCount,
  pendingQaCount,
  machineCount = 0,
  maintenanceMachineCount = 0,
  darkMode,
  onToggleDarkMode,
  onExportJson,
  onImportJson,
  onRequestReset,
  mobileOpen,
  onCloseMobile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems: {
    id: WorkspaceView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    meta?: string;
    alert?: boolean;
  }[] = [
    {
      id: 'formulations',
      label: 'Formulations',
      icon: BookOpen,
      meta: String(recipeCount),
    },
    {
      id: 'scaler',
      label: 'Batch Scaler',
      icon: Scale,
    },
    {
      id: 'ingredients',
      label: 'Raw Materials',
      icon: Package,
      meta: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
      alert: lowStockCount > 0,
    },
    {
      id: 'machines',
      label: 'Machines & Line',
      icon: Cog,
      meta:
        maintenanceMachineCount > 0
          ? `${maintenanceMachineCount} maint`
          : machineCount > 0
          ? String(machineCount)
          : undefined,
      alert: maintenanceMachineCount > 0,
    },
    {
      id: 'batches',
      label: 'Production Log',
      icon: ClipboardList,
      meta: pendingQaCount > 0 ? `${pendingQaCount} QA` : undefined,
    },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = '';
    }
  };

  const sidebarBody = (
    <div className="flex h-full w-[252px] flex-col border-r border-slate-200 bg-[#EEF1F5] text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      {/* Plant Title / Brand Block */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#005FB8] text-white dark:bg-sky-600">
            <Factory className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              BatchLedger
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {factoryName} · <span className="font-mono">{plantCode}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200/70 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Command Search (Ctrl+K) */}
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex w-full items-center justify-between rounded-md border border-slate-300/90 bg-white px-3 py-2 text-left text-xs text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005FB8] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Find recipe or SKU...</span>
          </span>
          <kbd className="font-mono ml-2 shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Primary Workspace Navigation */}
      <nav aria-label="Workspace modules" className="flex-1 space-y-0.5 px-2.5 py-2">
        <div className="px-2.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Manufacturing Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              className={`group flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005FB8] ${
                isActive
                  ? 'bg-white text-[#005FB8] shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-sky-400 dark:ring-slate-700'
                  : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive
                      ? 'text-[#005FB8] dark:text-sky-400'
                      : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.meta && (
                <span
                  className={`font-mono ml-2 shrink-0 text-xs tabular-nums ${
                    item.alert
                      ? 'font-medium text-amber-700 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.meta}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Desktop Data & Theme Utilities */}
      <div className="border-t border-slate-200 px-2.5 py-3 dark:border-slate-800">
        <div className="px-2.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Workstation Tools
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={onExportJson}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
          >
            <Download className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="truncate">Export Database (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
          >
            <Upload className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="truncate">Import Backup (.json)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
          >
            <span className="flex items-center gap-2.5 truncate">
              {darkMode ? (
                <Sun className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              ) : (
                <Moon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              )}
              <span className="truncate">{darkMode ? 'Light Theme' : 'Dark Theme'}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onRequestReset}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Restore Sample Catalog</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="no-print hidden lg:block lg:shrink-0">{sidebarBody}</aside>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-50 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
