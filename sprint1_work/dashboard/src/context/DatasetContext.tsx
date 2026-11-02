'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  TaskRecord,
  DatasetMetrics,
  ImportBatchReport,
  Member,
  Target
} from '../types/dataset';
import {
  parseLabelStudioExport,
  calculateDatasetMetrics,
  calculateMemberProgress
} from '../lib/parser';

interface DatasetContextType {
  tasks: TaskRecord[];
  metrics: DatasetMetrics;
  members: Member[];
  targets: Target[];
  lastReport: ImportBatchReport | null;
  creditBasis: 'collector' | 'annotator';
  setCreditBasis: (basis: 'collector' | 'annotator') => void;
  importJsonContent: (content: string, filename?: string) => ImportBatchReport;
  loadSyntheticSample: () => void;
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from LocalStorage
  useEffect(() => {
    try {
      const storedTasks = localStorage.getItem('cs_tasks');
      const storedReport = localStorage.getItem('cs_last_report');
      if (storedTasks) {
        setTasks(JSON.parse(storedTasks));
      }
      if (storedReport) {
        setLastReport(JSON.parse(storedReport));
      }
    } catch {
      // Local storage not available or corrupted
    }
    setIsInitialized(true);
  }, []);

  // Save to LocalStorage on updates
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem('cs_tasks', JSON.stringify(tasks));
      if (lastReport) {
        localStorage.setItem('cs_last_report', JSON.stringify(lastReport));
      }
    } catch {
      // Storage limit or blocked
    }
  }, [tasks, lastReport, isInitialized]);

  const importJsonContent = (content: string, filename: string = 'export.json'): ImportBatchReport => {
    const { report, tasks: importedTasks } = parseLabelStudioExport(content, filename, 42);

    if (report.status === 'completed' && importedTasks.length > 0) {
      // Deduplicate against existing tasks: newer imported record replaces older
      setTasks((prevTasks) => {
        const map = new Map<string, TaskRecord>();
        // Preserve prior tasks
        for (const t of prevTasks) {
          map.set(`${t.project_id}_${t.task_id}`, t);
        }
        // Apply new/updated tasks
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
        importJsonContent(text, 'synthetic_edge_cases.json');
      } else {
        // Fallback hardcoded synthetic edge cases
        const sampleData = `[
          {"id":1,"project":42,"data":{"audio":"/data/task1.wav","duration_seconds":60,"collector_id":"member_a","speaker_id":"spk_1","topic":"Directions"},"annotations":[]},
          {"id":2,"project":42,"data":{"audio":"/data/task2.wav","duration_seconds":90,"collector_id":"member_a","speaker_id":"spk_2","topic":"Food"},"annotations":[{"id":201,"completed_by":"member_a","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["តោះទៅញ៉ាំ lunch នៅឯណា?"]}}]}]},
          {"id":3,"project":42,"data":{"audio":"/data/task3.wav","duration_seconds":45,"collector_id":"member_b","speaker_id":"spk_3","topic":"Study"},"annotations":[{"id":301,"completed_by":"member_b","was_cancelled":true,"result":[]}]},
          {"id":4,"project":42,"data":{"audio":"/data/task4.wav","duration_seconds":120,"collector_id":"member_b","speaker_id":"spk_4","topic":"Presentation"},"annotations":[{"id":401,"completed_by":"member_a","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["Multiple annotations test"]}}]},{"id":402,"completed_by":"member_b","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["Project ហ្នឹង deadline ថ្ងៃអាទិត្យ ត្រូវ prepare slides."]}}]}]},
          {"id":5,"project":42,"data":{"audio":"/data/task5.wav","speaker_id":"spk_5","topic":"Career"},"annotations":[{"id":501,"completed_by":"member_c","was_cancelled":false,"result":[{"from_name":"transcript","to_name":"audio","type":"textarea","value":{"text":["Software engineering is a great field."]}}]}]}
        ]`;
        importJsonContent(sampleData, 'synthetic_edge_cases.json');
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
