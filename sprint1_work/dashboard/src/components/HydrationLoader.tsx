'use client';

import React from 'react';
import { useDataset } from '../context/DatasetContext';

export default function HydrationLoader() {
  const { isLoading } = useDataset();

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center"
      aria-label="Restoring workspace from local storage"
    >
      <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full mx-4 text-center border border-slate-200">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
        <h3 className="text-sm font-semibold text-slate-800">Restoring Session Data...</h3>
        <p className="text-xs text-slate-500 mt-1">
          Loading previous recordings and dataset metrics from local storage.
        </p>
      </div>
    </div>
  );
}
