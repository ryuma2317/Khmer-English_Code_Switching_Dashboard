'use client';

import React, { useState, useRef } from 'react';
import { useDataset } from '../../context/DatasetContext';
import {
  Upload,
  FileCheck,
  AlertCircle,
  Clock,
  Check,
  X,
  FileText,
  RotateCcw,
  Sparkles,
  Database
} from 'lucide-react';

export default function ImportPage() {
  const {
    tasks,
    stagedImport,
    stageImport,
    confirmImport,
    cancelImport,
    loadSyntheticSample,
    clearData
  } = useDataset();

  const [dragActive, setDragActive] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setImportSuccessMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        stageImport(content, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirm = () => {
    if (!stagedImport) return;
    const count = stagedImport.candidateTasks.length;
    confirmImport();
    setImportSuccessMessage(`Successfully committed ${count} records to your dataset workspace!`);
  };

  const handleCancel = () => {
    cancelImport();
    setImportSuccessMessage('Import cancelled. Previous workspace was preserved with zero changes.');
  };

  const handleLoadSample = async () => {
    setImportSuccessMessage(null);
    await loadSyntheticSample();
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Page Header */}
      <div>
        <div className="foundation-eyebrow text-xs font-semibold text-indigo-600 tracking-wider uppercase">
          Sprint 2 / Data Ingestion
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
          Import & Preview Reconciliation
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Upload Label Studio JSON or Speech Annotation Platform export files. Inspect validation,
          reconcile new vs existing tasks, and confirm before saving.
        </p>
      </div>

      {/* Success / Status Banner */}
      {importSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600" />
            <span>{importSuccessMessage}</span>
          </div>
          <button
            onClick={() => setImportSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Zone (Visible when no staged preview is pending) */}
      {!stagedImport && (
        <div className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-indigo-600 bg-indigo-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-white'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
              <Upload size={24} />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              Select or drop an export file
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Supports Label Studio JSON and Speech Annotation Platform JSON/JSONL
            </p>
            <p className="text-xs text-indigo-600 font-medium mt-3">
              Click to browse your files
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={handleLoadSample}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-colors border border-indigo-200"
            >
              <Sparkles size={16} />
              Load Synthetic Sample for Preview
            </button>

            {tasks.length > 0 && (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>
                  Current Workspace: <strong>{tasks.length}</strong> active task records
                </span>
                <button
                  onClick={clearData}
                  className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-medium"
                >
                  <RotateCcw size={13} />
                  Reset Workspace
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staged Preview & Reconciliation Card (PM-56) */}
      {stagedImport && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 mb-2">
                <Clock size={13} />
                Preview Mode — Pending Confirmation
              </span>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileCheck size={22} className="text-indigo-600" />
                Reconciliation for: {stagedImport.report.filename}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review proposed additions and field values before committing to local storage.
              </p>
            </div>

            {/* Explicit Confirm / Cancel Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <X size={16} />
                Cancel & Discard
              </button>
              <button
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs"
              >
                <Check size={16} />
                Confirm & Save Import
              </button>
            </div>
          </div>

          {/* Reconciliation Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-xs font-medium text-slate-500">Incoming Tasks</span>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {stagedImport.reconciliation.incomingTotal}
              </p>
              <span className="text-[11px] text-slate-400">Total in file</span>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-xs font-medium text-emerald-700">New Additions</span>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                +{stagedImport.reconciliation.newCount}
              </p>
              <span className="text-[11px] text-emerald-600">Unique new records</span>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-xs font-medium text-blue-700">Updates / Overwrites</span>
              <p className="text-2xl font-bold text-blue-800 mt-1">
                {stagedImport.reconciliation.updatedCount}
              </p>
              <span className="text-[11px] text-blue-600">Existing keys updated</span>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-xs font-medium text-amber-700">Duration Unknown</span>
              <p className="text-2xl font-bold text-amber-800 mt-1">
                {stagedImport.reconciliation.missingDurationCount}
              </p>
              <span className="text-[11px] text-amber-600">Missing audio_duration</span>
            </div>
          </div>

          {/* Warnings & Validation Issues (if any) */}
          {stagedImport.report.issues.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                <AlertCircle size={15} />
                Validation Warnings & Notes ({stagedImport.report.issues.length})
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700 max-h-28 overflow-y-auto pl-1">
                {stagedImport.report.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Staged Rows Sample Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold">Candidate Records Preview (First 10)</span>
              <span>Showing {Math.min(10, stagedImport.candidateTasks.length)} of {stagedImport.candidateTasks.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Task ID</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Audio Ref</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Duration</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Collector</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Topic</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Annotations</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {stagedImport.candidateTasks.slice(0, 10).map((t) => (
                    <tr key={`${t.project_id}_${t.task_id}`} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-mono text-slate-800 font-medium">#{t.task_id}</td>
                      <td className="px-4 py-2.5 text-slate-600 truncate max-w-xs">{t.audio_ref}</td>
                      <td className="px-4 py-2.5">
                        {t.duration_seconds !== null && t.duration_seconds !== undefined ? (
                          <span className="font-mono text-slate-700">{t.duration_seconds}s</span>
                        ) : (
                          <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                            Unknown
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{t.collector_source_id || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{t.topic || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            t.is_annotated
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.is_annotated ? 'Annotated' : 'Unannotated'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
