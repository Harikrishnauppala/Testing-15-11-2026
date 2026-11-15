import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, X } from 'lucide-react';
import type { Recipe, WorkerMakingStep } from '../types/factory';
import type { ScaledBatchResult } from '../utils/calculations';
import { buildWorkerMakingSteps } from '../utils/makingChart';
import { buildWorkerBatchQrUrl, buildWorkerSheetFromScaled } from '../utils/workerSheet';

export interface PrintableBatchSheetProps {
  factoryName: string;
  plantCode: string;
  recipe: Recipe | null;
  scaled: ScaledBatchResult | null;
  lotNumbers?: Record<string, string>;
  plannedLotCode?: string;
  matchedBatchId?: string;
  lineName?: string;
  operator?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMakingStepsForSheet(
  recipe: Recipe | null,
  scaled: ScaledBatchResult | null
): WorkerMakingStep[] {
  if (!recipe || !scaled) return [];
  const weighedByIngredientId: Record<
    string,
    { materialName: string; requiredKg: number }
  > = {};
  for (const row of scaled.rows) {
    weighedByIngredientId[row.line.ingredientId] = {
      materialName: row.ingredient?.name || 'Unknown Material',
      requiredKg: Number(row.scaledKg.toFixed(3)),
    };
  }
  return buildWorkerMakingSteps({
    recipe,
    weighedByIngredientId,
    multiplier: scaled.multiplier,
  });
}

const BatchSheetPaper: React.FC<
  PrintableBatchSheetProps & { qrDataUrl: string | null }
> = ({
  factoryName,
  plantCode,
  recipe,
  scaled,
  lotNumbers = {},
  plannedLotCode,
  lineName,
  operator,
  qrDataUrl,
}) => {
  const makingSteps = useMemo(
    () => getMakingStepsForSheet(recipe, scaled),
    [recipe, scaled]
  );

  if (!recipe || !scaled) return null;

  const today = new Date().toISOString().slice(0, 10);
  const batchLotDisplay = plannedLotCode?.trim() || '____________________';

  return (
    <div className="bg-white p-6 text-black sm:p-8">
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
            {factoryName} · {plantCode} — Floor Operations
          </div>
          <h1 className="mt-1 text-2xl font-bold text-black">
            Blind Batch Weigh &amp; Making Sheet
          </h1>
          <div className="mt-1 text-xs text-neutral-700">
            Confidentiality Mode: Product name, formula percentages, costs, and suppliers redacted.
          </div>
          <div className="mt-2 font-mono text-xs text-neutral-800">
            Date: {today} · Batch Lot: {batchLotDisplay} · Line:{' '}
            {lineName?.trim() || 'Production Floor'}
          </div>
        </div>
        {qrDataUrl && (
          <div className="shrink-0 border border-neutral-300 bg-white p-1.5 text-center">
            <img
              src={qrDataUrl}
              alt="Worker Batch Sheet QR Code"
              width={84}
              height={84}
              className="block h-[84px] w-[84px] bg-white"
            />
            <div className="mt-1 font-mono text-[9px] text-neutral-600">
              Scan for Digital Sheet
            </div>
          </div>
        )}
      </div>

      <div className="my-4 grid grid-cols-4 gap-3 border border-neutral-300 p-3 text-xs">
        <div>
          <div className="text-neutral-600">Batch Lot Reference</div>
          <div className="font-mono text-sm font-bold tabular-nums text-black">
            {plannedLotCode?.trim() || 'Pending Lot #'}
          </div>
        </div>
        <div>
          <div className="text-neutral-600">Total Weigh Mass</div>
          <div className="font-mono text-sm font-bold tabular-nums text-black">
            {scaled.scaledInputKg.toFixed(2)} kg
          </div>
        </div>
        <div>
          <div className="text-neutral-600">Ingredients to Weigh</div>
          <div className="font-mono text-sm font-bold tabular-nums text-black">
            {scaled.rows.length} SKUs
          </div>
        </div>
        <div>
          <div className="text-neutral-600">Making Steps</div>
          <div className="font-mono text-sm font-bold tabular-nums text-black">
            {makingSteps.length} Steps
          </div>
        </div>
      </div>

      {/* Part 1: Ingredients Pick & Weigh List */}
      <h2 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-black">
        Part 1 — Material Pick &amp; Weigh Checklist
      </h2>
      <table className="w-full border-collapse text-xs text-black">
        <thead>
          <tr className="border-y border-black bg-neutral-100 text-left">
            <th className="py-1.5 px-2">#</th>
            <th className="py-1.5 px-2">SKU</th>
            <th className="py-1.5 px-2">Material</th>
            <th className="py-1.5 px-2 text-right">Required (kg)</th>
            <th className="py-1.5 px-2">Raw Material Lot #</th>
            <th className="py-1.5 px-2 text-center">Weighed</th>
          </tr>
        </thead>
        <tbody>
          {scaled.rows.map((row, idx) => (
            <tr key={row.line.id} className="border-b border-neutral-300">
              <td className="py-1.5 px-2 font-mono tabular-nums">{idx + 1}</td>
              <td className="py-1.5 px-2 font-mono">{row.ingredient?.sku || '—'}</td>
              <td className="py-1.5 px-2 font-medium">
                {row.ingredient?.name || 'Unknown Material'}
              </td>
              <td className="py-1.5 px-2 text-right font-mono font-bold tabular-nums">
                {row.scaledKg.toFixed(3)}
              </td>
              <td className="py-1.5 px-2 font-mono">
                {lotNumbers[row.line.ingredientId] || '________________'}
              </td>
              <td className="py-1.5 px-2 text-center">[ &nbsp; ]</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Part 2: Beginner-Friendly Simple Making Chart */}
      {makingSteps.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-black">
            Part 2 — Simple Step-by-Step Making Chart (Follow in Order)
          </h2>
          <p className="mb-2.5 text-[11px] text-neutral-600">
            Follow Steps 1 to {makingSteps.length} in sequence. Add only the weighed bags listed inside each step.
          </p>

          {/* Visual Flow Overview */}
          <div className="mb-3 flex flex-wrap items-stretch gap-1.5">
            {makingSteps.map((step, idx) => (
              <React.Fragment key={step.stepNumber}>
                <div className="min-w-[135px] flex-1 border border-neutral-400 bg-neutral-50 px-2.5 py-1.5">
                  <div className="font-mono text-[10px] font-bold uppercase text-neutral-700">
                    Step {step.stepNumber} · {step.durationMin} min ·{' '}
                    {step.targetTempC !== null ? `${step.targetTempC}°C` : 'Room Temp'}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold leading-tight text-black">
                    {step.actionTitle}
                  </div>
                </div>
                {idx < makingSteps.length - 1 && (
                  <div className="flex items-center px-0.5 font-mono text-sm font-bold text-neutral-500">
                    →
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step-by-Step Beginner Making Table */}
          <table className="w-full border-collapse text-xs text-black">
            <thead>
              <tr className="border-y border-black bg-neutral-100 text-left">
                <th className="w-12 py-1.5 px-2">Step</th>
                <th className="py-1.5 px-2">What To Do &amp; Add These Weighed Bags</th>
                <th className="py-1.5 px-2">Machine &amp; Settings</th>
                <th className="py-1.5 px-2">What To Check</th>
                <th className="w-14 py-1.5 px-2 text-center">Done</th>
              </tr>
            </thead>
            <tbody>
              {makingSteps.map((step) => (
                <tr key={step.stepNumber} className="border-b border-neutral-300 align-top">
                  <td className="py-2 px-2 font-mono text-sm font-bold tabular-nums">
                    {step.stepNumber}
                  </td>
                  <td className="py-2 px-2">
                    <div className="font-bold text-black">{step.actionTitle}</div>
                    {step.addMaterials.length > 0 ? (
                      <div className="mt-1 space-y-0.5 text-[11px]">
                        <div className="font-semibold text-neutral-700">Add to machine:</div>
                        {step.addMaterials.map((m, mIdx) => (
                          <div key={mIdx} className="flex items-baseline justify-between gap-2 pl-2">
                            <span>• {m.materialName}</span>
                            <span className="font-mono font-bold tabular-nums shrink-0">
                              {m.requiredKg.toFixed(3)} kg
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] italic text-neutral-600">
                        Use mix from previous step (no new ingredients).
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-[11px]">
                    <div className="font-semibold text-black">{step.equipment}</div>
                    <div className="mt-1 font-mono tabular-nums text-neutral-800">
                      Time: <strong>{step.durationMin} min</strong>
                      <br />
                      Temp:{' '}
                      <strong>
                        {step.targetTempC !== null ? `${step.targetTempC}°C` : 'Room Temp'}
                      </strong>
                      {step.speedOrSetting && (
                        <>
                          <br />
                          Setting: <strong>{step.speedOrSetting}</strong>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-[11px]">
                    {step.isCcp && (
                      <div className="mb-0.5 font-mono text-[10px] font-bold uppercase text-black underline">
                        CRITICAL CHECK
                      </div>
                    )}
                    <div className="text-neutral-800">
                      {step.checkNote || 'Check uniform mix and clean equipment.'}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center font-mono">[ &nbsp; ]</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-7 grid grid-cols-3 gap-6 border-t border-black pt-4 text-xs text-black">
        <div>Picked / Weighed By: {operator?.trim() || '____________________'}</div>
        <div>QA Lot Verification: ____________________</div>
        <div>Shift / Line: {lineName?.trim() || '___________________________'}</div>
      </div>
    </div>
  );
};

function useBatchQrDataUrl(props: PrintableBatchSheetProps): string | null {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const qrUrl = useMemo(() => {
    if (!props.scaled) return '';
    const payload = buildWorkerSheetFromScaled({
      factoryName: props.factoryName,
      plantCode: props.plantCode,
      recipe: props.recipe,
      scaled: props.scaled,
      lotNumbers: props.lotNumbers,
      plannedLotCode: props.plannedLotCode,
      lineName: props.lineName,
      operator: props.operator,
    });
    return buildWorkerBatchQrUrl({
      batchId: props.matchedBatchId,
      payload,
    });
  }, [
    props.factoryName,
    props.plantCode,
    props.recipe,
    props.scaled,
    props.lotNumbers,
    props.plannedLotCode,
    props.matchedBatchId,
    props.lineName,
    props.operator,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!qrUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(qrUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: qrUrl.length > 1400 ? 'L' : 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  return qrDataUrl;
}

export const PrintableBatchSheet: React.FC<PrintableBatchSheetProps> = (props) => {
  const qrDataUrl = useBatchQrDataUrl(props);
  if (!props.recipe || !props.scaled) return null;

  return (
    <div className="print-only hidden bg-white text-black">
      <BatchSheetPaper {...props} qrDataUrl={qrDataUrl} />
    </div>
  );
};

interface PrintSheetPreviewModalProps extends PrintableBatchSheetProps {
  open: boolean;
  onClose: () => void;
}

export const PrintSheetPreviewModal: React.FC<PrintSheetPreviewModalProps> = ({
  open,
  onClose,
  ...sheetProps
}) => {
  const qrDataUrl = useBatchQrDataUrl(sheetProps);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const makingSteps = useMemo(
    () => getMakingStepsForSheet(sheetProps.recipe, sheetProps.scaled),
    [sheetProps.recipe, sheetProps.scaled]
  );

  useEffect(() => {
    if (!open) {
      setPrintNote(null);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !sheetProps.recipe || !sheetProps.scaled) return null;

  const handleTriggerPrint = () => {
    const start = Date.now();
    window.print();
    if (Date.now() - start < 120) {
      setPrintNote(
        'If your browser blocked the print dialog inside the preview frame, use "Download Printable HTML" and print from a normal tab.'
      );
    }
  };

  const handleDownloadHtml = () => {
    if (!sheetProps.scaled) return;
    const today = new Date().toISOString().slice(0, 10);
    const lot = sheetProps.plannedLotCode?.trim() || 'Pending Lot #';
    const line = sheetProps.lineName?.trim() || 'Production Floor';
    const op = sheetProps.operator?.trim() || '____________________';
    const rowsHtml = sheetProps.scaled.rows
      .map(
        (row, idx) => `
      <tr>
        <td class="mono">${idx + 1}</td>
        <td class="mono">${escapeHtml(row.ingredient?.sku || '—')}</td>
        <td class="bold">${escapeHtml(row.ingredient?.name || 'Unknown Material')}</td>
        <td class="mono right bold">${row.scaledKg.toFixed(3)}</td>
        <td class="mono">${escapeHtml(
          (sheetProps.lotNumbers && sheetProps.lotNumbers[row.line.ingredientId]) || '________________'
        )}</td>
        <td class="center">[ &nbsp; ]</td>
      </tr>`
      )
      .join('');

    const flowHtml = makingSteps
      .map(
        (step, idx) => `
        <div class="flow-box">
          <div class="flow-meta">STEP ${step.stepNumber} · ${step.durationMin} MIN · ${
            step.targetTempC !== null ? `${step.targetTempC}°C` : 'ROOM TEMP'
          }</div>
          <div class="flow-title">${escapeHtml(step.actionTitle)}</div>
        </div>${idx < makingSteps.length - 1 ? '<div class="flow-arrow">→</div>' : ''}`
      )
      .join('');

    const makingRowsHtml = makingSteps
      .map((step) => {
        const matsHtml =
          step.addMaterials.length > 0
            ? `<div class="mats"><div class="mats-hdr">Add to machine:</div>${step.addMaterials
                .map(
                  (m) =>
                    `<div class="mat-line"><span>• ${escapeHtml(m.materialName)}</span><span class="mono bold">${m.requiredKg.toFixed(
                      3
                    )} kg</span></div>`
                )
                .join('')}</div>`
            : `<div class="muted-note">Use mix from previous step (no new ingredients).</div>`;

        return `
        <tr>
          <td class="mono bold" style="font-size:14px;">${step.stepNumber}</td>
          <td>
            <div class="bold">${escapeHtml(step.actionTitle)}</div>
            ${matsHtml}
          </td>
          <td>
            <div class="bold">${escapeHtml(step.equipment)}</div>
            <div class="mono" style="margin-top:4px;font-size:11px;">
              Time: <strong>${step.durationMin} min</strong><br/>
              Temp: <strong>${step.targetTempC !== null ? `${step.targetTempC}°C` : 'Room Temp'}</strong>
              ${step.speedOrSetting ? `<br/>Setting: <strong>${escapeHtml(step.speedOrSetting)}</strong>` : ''}
            </div>
          </td>
          <td>
            ${step.isCcp ? '<div class="ccp">CRITICAL CHECK</div>' : ''}
            <div>${escapeHtml(step.checkNote || 'Check uniform mix and clean equipment.')}</div>
          </td>
          <td class="center mono">[ &nbsp; ]</td>
        </tr>`;
      })
      .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Blind Batch Weigh & Making Sheet — ${escapeHtml(lot)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #000; background: #fff; margin: 24px; }
  .toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
  .btn { padding: 8px 14px; font-size: 13px; font-weight: 600; background: #005FB8; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; }
  .kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; font-weight: 600; }
  h1 { margin: 4px 0; font-size: 22px; }
  .sub { font-size: 12px; color: #444; }
  .meta { margin-top: 8px; font-family: monospace; font-size: 12px; }
  .qr { border: 1px solid #ccc; padding: 6px; text-align: center; }
  .qr img { display: block; width: 84px; height: 84px; }
  .qr span { display: block; margin-top: 4px; font-family: monospace; font-size: 9px; color: #555; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; border: 1px solid #ccc; padding: 12px; margin: 16px 0; font-size: 12px; }
  .grid .val { font-family: monospace; font-size: 15px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin: 20px 0 6px; }
  .hint { font-size: 11px; color: #555; margin: 0 0 10px; }
  .flow { display: flex; align-items: stretch; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  .flow-box { flex: 1; min-width: 130px; border: 1px solid #888; background: #fafafa; padding: 6px 10px; }
  .flow-meta { font-family: monospace; font-size: 10px; font-weight: 700; color: #444; }
  .flow-title { font-size: 11px; font-weight: 600; margin-top: 2px; }
  .flow-arrow { display: flex; align-items: center; font-family: monospace; font-weight: 700; color: #666; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { border-top: 1px solid #000; border-bottom: 1px solid #000; background: #f3f3f3; text-align: left; padding: 6px 8px; }
  td { border-bottom: 1px solid #d4d4d4; padding: 6px 8px; vertical-align: top; }
  .mono { font-family: monospace; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: 600; }
  .mats { margin-top: 4px; font-size: 11px; }
  .mats-hdr { font-weight: 600; color: #444; }
  .mat-line { display: flex; justify-content: space-between; gap: 8px; padding-left: 8px; }
  .muted-note { margin-top: 4px; font-size: 11px; font-style: italic; color: #555; }
  .ccp { font-family: monospace; font-size: 10px; font-weight: 700; text-decoration: underline; margin-bottom: 2px; }
  .footer { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; border-top: 1px solid #000; padding-top: 14px; margin-top: 24px; font-size: 12px; }
  @media print { .no-print { display: none !important; } body { margin: 0; } }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn" onclick="window.print()">Print Sheet</button>
  </div>
  <div class="header">
    <div>
      <div class="kicker">${escapeHtml(sheetProps.factoryName)} · ${escapeHtml(sheetProps.plantCode)} — Floor Operations</div>
      <h1>Blind Batch Weigh &amp; Making Sheet</h1>
      <div class="sub">Confidentiality Mode: Product name, formula percentages, costs, and suppliers redacted.</div>
      <div class="meta">Date: ${today} · Batch Lot: ${escapeHtml(lot)} · Line: ${escapeHtml(line)}</div>
    </div>
    ${
      qrDataUrl
        ? `<div class="qr"><img src="${qrDataUrl}" alt="Batch QR" /><span>Scan for Digital Sheet</span></div>`
        : ''
    }
  </div>
  <div class="grid">
    <div><div>Batch Lot Reference</div><div class="val">${escapeHtml(lot)}</div></div>
    <div><div>Total Weigh Mass</div><div class="val">${sheetProps.scaled.scaledInputKg.toFixed(2)} kg</div></div>
    <div><div>Ingredients to Weigh</div><div class="val">${sheetProps.scaled.rows.length} SKUs</div></div>
    <div><div>Making Steps</div><div class="val">${makingSteps.length} Steps</div></div>
  </div>
  <h2>Part 1 — Material Pick &amp; Weigh Checklist</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>SKU</th>
        <th>Material</th>
        <th class="right">Required (kg)</th>
        <th>Raw Material Lot #</th>
        <th class="center">Weighed</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${
    makingSteps.length > 0
      ? `
  <h2>Part 2 — Simple Step-by-Step Making Chart (Follow in Order)</h2>
  <p class="hint">Follow Steps 1 to ${makingSteps.length} in sequence. Add only the weighed bags listed inside each step.</p>
  <div class="flow">${flowHtml}</div>
  <table>
    <thead>
      <tr>
        <th>Step</th>
        <th>What To Do &amp; Add These Weighed Bags</th>
        <th>Machine &amp; Settings</th>
        <th>What To Check</th>
        <th class="center">Done</th>
      </tr>
    </thead>
    <tbody>${makingRowsHtml}</tbody>
  </table>`
      : ''
  }
  <div class="footer">
    <div>Picked / Weighed By: ${escapeHtml(op)}</div>
    <div>QA Lot Verification: ____________________</div>
    <div>Shift / Line: ${escapeHtml(line)}</div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeLot = (sheetProps.plannedLotCode?.trim() || 'batch').toLowerCase();
    link.download = `weigh-making-sheet-${safeLot}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="print-preview-overlay fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-900/60 p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-[900px] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview Action Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-md dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Print Preview — Blind Batch Weigh &amp; Making Sheet
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Includes weighed ingredients list, simple step-by-step making chart, and worker-safe QR code. Recipe formulas, costs, and suppliers are hidden.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Printable HTML</span>
            </button>
            <button
              type="button"
              onClick={handleTriggerPrint}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] whitespace-nowrap dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Sheet</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close print preview"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {printNote && (
          <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
            {printNote}
          </div>
        )}

        {/* Paper Sheet Preview */}
        <div className="print-sheet-paper overflow-hidden rounded-md border border-slate-300 bg-white shadow-xl">
          <BatchSheetPaper {...sheetProps} qrDataUrl={qrDataUrl} />
        </div>
      </div>
    </div>
  );
};
