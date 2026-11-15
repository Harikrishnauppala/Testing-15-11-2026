import React, { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import type { WorkerBatchSheetPayload } from '../types/factory';
import { buildWorkerBatchQrUrl } from '../utils/workerSheet';
import { QrCodeGraphic } from './QrCodeGraphic';
import { WorkerBatchSheetView } from './WorkerBatchSheetView';

interface BatchQrModalProps {
  open: boolean;
  batchId?: string;
  payload: WorkerBatchSheetPayload | null;
  onClose: () => void;
}

export const BatchQrModal: React.FC<BatchQrModalProps> = ({
  open,
  batchId,
  payload,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const qrUrl = useMemo(() => {
    if (!payload) return '';
    return buildWorkerBatchQrUrl({ batchId, payload });
  }, [batchId, payload]);

  if (!open || !payload) return null;

  if (previewOpen) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F3F5F8] dark:bg-slate-950">
        <WorkerBatchSheetView
          previewPayload={payload}
          onClosePreview={() => setPreviewOpen(false)}
        />
      </div>
    );
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleDownloadPng = async () => {
    try {
      const pngUrl = await QRCode.toDataURL(qrUrl, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: qrUrl.length > 1400 ? 'L' : 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `batch-qr-${payload.lotCode.toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore generation failure
    }
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
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Worker-Safe Batch QR — <span className="font-mono">{payload.lotCode}</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Scan on floor tablets or handhelds to open the redacted PrintBatchSheet checklist.
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

        <div className="space-y-4 p-5 text-xs">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="shrink-0 rounded-md border border-slate-200 bg-white p-3">
              <QrCodeGraphic value={qrUrl} size={168} />
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Batch Weigh Summary
                </div>
                <div className="font-mono mt-0.5 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  {payload.totalWeighKg.toFixed(2)} kg · {payload.itemCount} materials
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Line: {payload.lineName}
                </div>
              </div>

              <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-2.5 text-[11px] text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>Worker-Safe Data Access</span>
                </div>
                <div className="mt-1 leading-relaxed">
                  Includes: Lot code, SKUs, weighed ingredients, lot numbers, and simple step-by-step making chart.
                  <br />
                  Redacted: Product name, formula percentages, ingredient costs, and supplier details.
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Worker Sheet Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={qrUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Preview Worker Sheet</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#005FB8] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004E98] dark:bg-sky-600"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download QR PNG</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
