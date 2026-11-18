'use client';

import React from 'react';
import { useDataset } from '../context/DatasetContext';
import { CheckCircle2, AlertTriangle, RefreshCw, X } from 'lucide-react';

export default function SaveFeedbackBanner() {
  const { saveFeedback, retrySave, dismissFeedback } = useDataset();

  if (saveFeedback.status === 'idle') return null;

  const isError = saveFeedback.status === 'error';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg border transition-all duration-200 flex items-start gap-3 ${
        isError
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="mt-0.5 flex-shrink-0">
        {isError ? (
          <AlertTriangle className="text-rose-600" size={20} />
        ) : (
          <CheckCircle2 className="text-emerald-600" size={20} />
        )}
      </div>

      <div className="flex-1 text-sm">
        <p className="font-semibold">
          {isError ? 'Save Warning / Storage Error' : 'Workspace Saved'}
        </p>
        <p className="mt-0.5 text-xs opacity-90">{saveFeedback.message}</p>
        {saveFeedback.lastSavedAt && (
          <p className="mt-1 text-[11px] opacity-75">
            Last saved at: {saveFeedback.lastSavedAt}
          </p>
        )}

        {isError && (
          <button
            onClick={() => retrySave()}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium transition-colors"
          >
            <RefreshCw size={13} />
            Retry Save
          </button>
        )}
      </div>

      <button
        onClick={dismissFeedback}
        className="text-slate-400 hover:text-slate-600 p-1 -mr-1 rounded"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
