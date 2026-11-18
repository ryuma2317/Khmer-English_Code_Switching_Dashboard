'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  TaskRecord,
  DatasetMetrics,
  ImportBatchReport,
  Member,
  Target,
  SaveFeedback,
  ReconciliationSummary
} from '../types/dataset';
import {
  parseLabelStudioExport,
  calculateDatasetMetrics
} from '../lib/parser';

export interface StagedImportState {
  report: ImportBatchReport;
  candidateTasks: TaskRecord[];
  reconciliation: ReconciliationSummary;
  rawContent: string;
}

interface DatasetContextType {
  tasks: TaskRecord[];
  metrics: DatasetMetrics;
  members: Member[];
  targets: Target[];
  lastReport: ImportBatchReport | null;
  creditBasis: 'collector' | 'annotator';
  setCreditBasis: (basis: 'collector' | 'annotator') => void;
  isLoading: boolean;
  saveFeedback: SaveFeedback;
  dismissFeedback: () => void;
  retrySave: () => boolean;
  
  // Staging & Preview Reconciliation (PM-56)
  stagedImport: StagedImportState | null;
  stageImport: (content: string, filename?: string) => StagedImportState;
  confirmImport: () => void;
  cancelImport: () => void;

  // Direct import fallback & helpers
  importJsonContent: (content: string, filename?: string) => ImportBatchReport;
  loadSyntheticSample: () => Promise<void>;
  clearData: () => void;
}

const DEFAULT_MEMBERS: Member[] = [
  { member_id: 'member_a', display_alias: 'Member A' },
  { member_id: 'member_b', display_alias: 'Member B' },
  { member_id: 'member_c', display_alias: 'Member C' }
];

const DEFAULT_TARGETS: Target[] = [
  { project_id: 42, member_id: 'member_a', basis: 'collected_hours', target_seconds: null },
  { project_id: 42, member_id: 'member_b', basis: 'collected_hours', target_seconds: null },
  { project_id: 42, member_id: 'member_c', basis: 'collected_hours', target_seconds: null }
];

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [members, setMembers] = useState<Member[]>(DEFAULT_MEMBERS);
  const [targets, setTargets] = useState<Target[]>(DEFAULT_TARGETS);
  const [lastReport, setLastReport] = useState<ImportBatchReport | null>(null);
  const [creditBasis, setCreditBasis] = useState<'collector' | 'annotator'>('collector');
  const [isLoading, setIsLoading] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>({
    status: 'idle',
    message: null,
    lastSavedAt: null
  });
  const [stagedImport, setStagedImport] = useState<StagedImportState | null>(null);

  // 1. Hydration from LocalStorage (PM-61)
  useEffect(() => {
    try {
      const storedTasks = localStorage.getItem('cs_tasks');
      const storedReport = localStorage.getItem('cs_last_report');
      const storedTargets = localStorage.getItem('cs_targets');
      const storedCreditBasis = localStorage.getItem('cs_credit_basis');

      if (storedTasks) {
        const parsed = JSON.parse(storedTasks);
        if (Array.isArray(parsed)) {
          setTasks(parsed);
        }
      }
      if (storedReport) {
        setLastReport(JSON.parse(storedReport));
      }
      if (storedTargets) {
        setTargets(JSON.parse(storedTargets));
      }
      if (storedCreditBasis === 'collector' || storedCreditBasis === 'annotator') {
        setCreditBasis(storedCreditBasis);
      }
    } catch (err) {
      console.warn('Failed to hydrate from local storage:', err);
      setSaveFeedback({
        status: 'error',
        message: 'Could not read previous session from local storage. Starting fresh workspace.',
        lastSavedAt: null
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Core persist function with recoverable error handling (PM-61)
  const persistToStorage = useCallback((recordsToSave: TaskRecord[], reportToSave: ImportBatchReport | null) => {
    try {
      localStorage.setItem('cs_tasks', JSON.stringify(recordsToSave));
      if (reportToSave) {
        localStorage.setItem('cs_last_report', JSON.stringify(reportToSave));
      }
      localStorage.setItem('cs_targets', JSON.stringify(targets));
      localStorage.setItem('cs_credit_basis', creditBasis);

      setSaveFeedback({
        status: 'saved',
        message: `Saved ${recordsToSave.length} record(s) locally.`,
        lastSavedAt: new Date().toLocaleTimeString()
      });
      return true;
    } catch (err) {
      console.error('LocalStorage write failed:', err);
      setSaveFeedback({
        status: 'error',
        message: 'Storage full or blocked: Unable to save data locally. Please retry or download a backup.',
        lastSavedAt: null
      });
      return false;
    }
  }, [targets, creditBasis]);

  // Persist on data modifications once initialized
  useEffect(() => {
    if (isLoading) return;
    persistToStorage(tasks, lastReport);
  }, [tasks, lastReport, isLoading, persistToStorage]);

  const dismissFeedback = () => {
    setSaveFeedback(prev => ({ ...prev, status: 'idle', message: null }));
  };

  const retrySave = () => {
    return persistToStorage(tasks, lastReport);
  };

  // 3. Import Staging & Reconciliation (PM-56)
  const stageImport = (content: string, filename: string = 'export.json'): StagedImportState => {
    const { report, tasks: candidateTasks } = parseLabelStudioExport(content, filename, 42);

    // Calculate reconciliation against current workspace
    const existingKeySet = new Set(tasks.map(t => `${t.project_id}_${t.task_id}`));
    let newCount = 0;
    let updatedCount = 0;
    let missingDurationCount = 0;
    let knownDurationSeconds = 0;

    for (const ct of candidateTasks) {
      const key = `${ct.project_id}_${ct.task_id}`;
      if (existingKeySet.has(key)) {
        updatedCount++;
      } else {
        newCount++;
      }

      if (ct.duration_seconds === null || ct.duration_seconds === undefined) {
        missingDurationCount++;
      } else {
        knownDurationSeconds += ct.duration_seconds;
      }
    }

    const reconciliation: ReconciliationSummary = {
      incomingTotal: report.total_source_rows,
      acceptedCount: report.accepted_count,
      rejectedCount: report.rejected_count,
      newCount,
      updatedCount,
      unchangedCount: 0,
      missingDurationCount,
      knownDurationSeconds
    };

    const staged: StagedImportState = {
      report,
      candidateTasks,
      reconciliation,
      rawContent: content
    };

    setStagedImport(staged);
    return staged;
  };

  const confirmImport = () => {
    if (!stagedImport) return;

    if (stagedImport.report.status === 'completed' && stagedImport.candidateTasks.length > 0) {
      setTasks((prevTasks) => {
        const map = new Map<string, TaskRecord>();
        for (const t of prevTasks) {
          map.set(`${t.project_id}_${t.task_id}`, t);
        }
        for (const t of stagedImport.candidateTasks) {
          map.set(`${t.project_id}_${t.task_id}`, t);
        }
        return Array.from(map.values());
      });
      setLastReport(stagedImport.report);
    }

    setStagedImport(null);
  };

  const cancelImport = () => {
    setStagedImport(null);
  };

  // Direct import without staging preview (retained for backward compatibility)
  const importJsonContent = (content: string, filename: string = 'export.json'): ImportBatchReport => {
    const { report, tasks: importedTasks } = parseLabelStudioExport(content, filename, 42);

    if (report.status === 'completed' && importedTasks.length > 0) {
      setTasks((prevTasks) => {
        const map = new Map<string, TaskRecord>();
        for (const t of prevTasks) {
          map.set(`${t.project_id}_${t.task_id}`, t);
        }
        for (const t of importedTasks) {
          map.set(`${t.project_id}_${t.task_id}`, t);
        }
        return Array.from(map.values());
      });
    }

    setLastReport(report);
    return report;
  };

  const loadSyntheticSample = async () => {
    try {
      const res = await fetch('/fixtures/synthetic_edge_cases.json');
      if (res.ok) {
        const text = await res.text();
        stageImport(text, 'synthetic_edge_cases.json');
      } else {
        const sampleData = `[
          {"id":1,"project":42,"data":{"audio":"/data/task1.wav","duration_seconds":60,"collector_id":"member_a","speaker_id":"spk_1","topic":"Directions"},"annotations":[]},
          {"id":2,"project":42,"data":{"audio":"/data/task2.wav","duration_seconds":90,"collector_id":"member_a","speaker_id":"spk_2","topic":"Food"},"annotations":[{"id":201,"completed_by":"member_a","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["តោះទៅញ៉ាំ lunch នៅឯណា?"]}}]}]},
          {"id":3,"project":42,"data":{"audio":"/data/task3.wav","duration_seconds":45,"collector_id":"member_b","speaker_id":"spk_3","topic":"Study"},"annotations":[{"id":301,"completed_by":"member_b","was_cancelled":true,"result":[]}]},
          {"id":4,"project":42,"data":{"audio":"/data/task4.wav","duration_seconds":120,"collector_id":"member_b","speaker_id":"spk_4","topic":"Presentation"},"annotations":[{"id":401,"completed_by":"member_a","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["Multiple annotations test"]}}]},{"id":402,"completed_by":"member_b","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["Project ហ្នឹង deadline ថ្ងៃអាទិត្យ ត្រូវ prepare slides."]}}]}]},
          {"id":5,"project":42,"data":{"audio":"/data/task5.wav","speaker_id":"spk_5","topic":"Career"},"annotations":[{"id":501,"completed_by":"member_c","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["Software engineering is a great field."]}}]}]}
        ]`;
        stageImport(sampleData, 'synthetic_edge_cases.json');
      }
    } catch {
      // ignore
    }
  };

  const clearData = () => {
    setTasks([]);
    setLastReport(null);
    try {
      localStorage.removeItem('cs_tasks');
      localStorage.removeItem('cs_last_report');
      setSaveFeedback({
        status: 'saved',
        message: 'Workspace data cleared.',
        lastSavedAt: new Date().toLocaleTimeString()
      });
    } catch {}
  };

  const metrics = calculateDatasetMetrics(tasks);

  return (
    <DatasetContext.Provider
      value={{
        tasks,
        metrics,
        members,
        targets,
        lastReport,
        creditBasis,
        setCreditBasis,
        isLoading,
        saveFeedback,
        dismissFeedback,
        retrySave,
        stagedImport,
        stageImport,
        confirmImport,
        cancelImport,
        importJsonContent,
        loadSyntheticSample,
        clearData
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error('useDataset must be used within a DatasetProvider');
  }
  return context;
}
