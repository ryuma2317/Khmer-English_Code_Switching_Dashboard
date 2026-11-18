import { createHash } from 'node:crypto';
import type { TaskRecord, ImportBatchReport } from '../types/dataset';
import { parseLabelStudioExport, calculateDatasetMetrics } from './parser';
import {
  parseSelectedExport,
  type NativeTaskRecord,
  type SupportedSourceFormat
} from './nativeAdapter';

/**
 * Benchmark specifications independently recorded for a sample export.
 * Conforms to PM-63 acceptance criteria.
 */
export interface SampleBenchmarkSpec {
  expectedChecksum?: string;
  expectedTotalRows: number;
  expectedUniqueTasks: number;
  expectedRepeatedRows: number;
  expectedRejectedRows: number;
  expectedAcceptedCount: number;
  expectedKnownDurationSeconds: number;
  expectedKnownDurationHours: number;
  expectedMissingDurationCount: number;
  expectedCompletedTasks?: number;
  representativeRowIds: (string | number)[];
}

/**
 * Actionable defect report when actual counts/durations deviate from expectation.
 */
export interface ReconciliationDefect {
  id: string;
  category: 'checksum' | 'count' | 'duration' | 'identity' | 'reload';
  field: string;
  expected: unknown;
  actual: unknown;
  severity: 'blocker' | 'critical' | 'major' | 'minor';
  description: string;
}

export interface MetricComparison {
  expected: number;
  actual: number;
  matched: boolean;
}

export interface ReconciliationReport {
  reconciliationId: string;
  filename: string;
  sourceChecksum: string;
  sourceFormat: SupportedSourceFormat;
  reconciledAt: string;
  passed: boolean;
  metrics: {
    totalSourceRows: MetricComparison;
    uniqueTasksCount: MetricComparison;
    repeatedRowsCount: MetricComparison;
    acceptedCount: MetricComparison;
    rejectedCount: MetricComparison;
    knownDurationSeconds: MetricComparison;
    knownDurationHours: MetricComparison;
    missingDurationCount: MetricComparison;
  };
  representativeIds: {
    expected: (string | number)[];
    found: (string | number)[];
    missing: (string | number)[];
    allFound: boolean;
  };
  durationAudit: {
    totalValidSeconds: number;
    calculatedHours: number;
    missingDurationCount: number;
    leadTimeDisregarded: boolean;
  };
  reloadVerification?: {
    reloadedCount: number;
    matched: boolean;
    issues: string[];
  };
  defects: ReconciliationDefect[];
}

/**
 * Computes deterministic SHA-256 digest of raw source content.
 */
export function calculateSourceChecksum(rawContent: string): string {
  return createHash('sha256').update(rawContent, 'utf8').digest('hex');
}

/**
 * Audits task list strictly adhering to duration rules:
 * - audio duration is sum(valid seconds) / 3600
 * - missing/null duration is preserved as null ("Unknown")
 * - lead_time is NEVER counted as audio duration
 */
export function auditTaskDurations(tasks: (TaskRecord | NativeTaskRecord)[]): {
  totalValidSeconds: number;
  calculatedHours: number;
  missingDurationCount: number;
  leadTimeDisregarded: boolean;
} {
  let totalValidSeconds = 0;
  let missingDurationCount = 0;
  let hasAnnotationLeadTime = false;

  for (const t of tasks) {
    if (t.duration_seconds === null || t.duration_seconds === undefined) {
      missingDurationCount++;
    } else if (typeof t.duration_seconds === 'number' && Number.isFinite(t.duration_seconds) && t.duration_seconds >= 0) {
      totalValidSeconds += t.duration_seconds;
    }

    if ('original_source_json' in t && t.original_source_json && 'annotations' in t.original_source_json) {
      const annotations = (t.original_source_json as { annotations?: Array<{ lead_time?: number }> }).annotations;
      if (Array.isArray(annotations) && annotations.some(a => typeof a.lead_time === 'number' && a.lead_time > 0)) {
        hasAnnotationLeadTime = true;
      }
    }
  }

  const calculatedHours = Number((totalValidSeconds / 3600).toFixed(4));

  return {
    totalValidSeconds,
    calculatedHours,
    missingDurationCount,
    leadTimeDisregarded: hasAnnotationLeadTime || true
  };
}

/**
 * Simulates reload / persistence round-trip (e.g. JSON storage cycle)
 * to verify data integrity, strict null duration preservation, and ID stability.
 */
export function verifyReloadPersistence<T extends TaskRecord | NativeTaskRecord>(
  tasks: T[]
): { reloadedTasks: T[]; matched: boolean; issues: string[] } {
  const serialized = JSON.stringify(tasks);
  const reloaded: T[] = JSON.parse(serialized);
  const issues: string[] = [];

  if (reloaded.length !== tasks.length) {
    issues.push(`Task count mismatch after reload: expected ${tasks.length}, got ${reloaded.length}`);
  }

  for (let i = 0; i < tasks.length; i++) {
    const orig = tasks[i];
    const rel = reloaded[i];

    if (String(orig.task_id) !== String(rel.task_id)) {
      issues.push(`Task ID mismatch at position ${i}: expected "${orig.task_id}", found "${rel.task_id}"`);
    }

    if (orig.duration_seconds === null && rel.duration_seconds !== null) {
      issues.push(`Task "${orig.task_id}": null duration mutated to ${rel.duration_seconds} on reload`);
    } else if (orig.duration_seconds !== rel.duration_seconds) {
      issues.push(`Task "${orig.task_id}": duration altered from ${orig.duration_seconds} to ${rel.duration_seconds}`);
    }
  }

  return {
    reloadedTasks: reloaded,
    matched: issues.length === 0,
    issues
  };
}

/**
 * PM-63: Core reconciliation engine.
 * Compares an imported file's actual values and source checksum against independent expectations.
 * Records reproducible defects for discrepancies or passes cleanly.
 */
export function reconcileSampleExport(
  rawContent: string,
  benchmark: SampleBenchmarkSpec,
  format: SupportedSourceFormat,
  filename: string = 'export.json',
  fallbackProjectId?: number | string
): ReconciliationReport {
  const reconciliationId = `recon_${Date.now()}`;
  const checksum = calculateSourceChecksum(rawContent);
  const defects: ReconciliationDefect[] = [];

  // Checksum comparison
  if (benchmark.expectedChecksum && benchmark.expectedChecksum.toLowerCase() !== checksum.toLowerCase()) {
    defects.push({
      id: 'DEFECT-CHECKSUM-MISMATCH',
      category: 'checksum',
      field: 'sourceChecksum',
      expected: benchmark.expectedChecksum,
      actual: checksum,
      severity: 'blocker',
      description: `Source checksum ${checksum} did not match expected ${benchmark.expectedChecksum}. File may be modified.`
    });
  }

  // Parse export through format-isolated adapter
  const { report, tasks } = parseSelectedExport(rawContent, format, filename, fallbackProjectId);

  // Duration audit
  const durationAudit = auditTaskDurations(tasks);

  // Representative ID inspection
  const taskIds = new Set(tasks.map(t => String(t.task_id)));
  const foundIds: (string | number)[] = [];
  const missingIds: (string | number)[] = [];

  for (const expId of benchmark.representativeRowIds) {
    if (taskIds.has(String(expId))) {
      foundIds.push(expId);
    } else {
      missingIds.push(expId);
      defects.push({
        id: `DEFECT-MISSING-ROW-${expId}`,
        category: 'identity',
        field: 'representativeRowIds',
        expected: expId,
        actual: null,
        severity: 'critical',
        description: `Representative row ID "${expId}" was missing from parsed records.`
      });
    }
  }

  // Field-by-field verification helper
  function checkMetric(
    field: string,
    expected: number,
    actual: number,
    category: ReconciliationDefect['category'],
    severity: ReconciliationDefect['severity'] = 'critical'
  ): MetricComparison {
    const matched = expected === actual;
    if (!matched) {
      defects.push({
        id: `DEFECT-${field.toUpperCase()}`,
        category,
        field,
        expected,
        actual,
        severity,
        description: `Mismatch in ${field}: expected ${expected}, got ${actual}.`
      });
    }
    return { expected, actual, matched };
  }

  const metrics = {
    totalSourceRows: checkMetric('totalSourceRows', benchmark.expectedTotalRows, report.total_source_rows, 'count'),
    uniqueTasksCount: checkMetric('uniqueTasksCount', benchmark.expectedUniqueTasks, report.unique_tasks_count, 'count'),
    repeatedRowsCount: checkMetric('repeatedRowsCount', benchmark.expectedRepeatedRows, report.repeated_rows_count, 'count'),
    acceptedCount: checkMetric('acceptedCount', benchmark.expectedAcceptedCount, report.accepted_count, 'count'),
    rejectedCount: checkMetric('rejectedCount', benchmark.expectedRejectedRows, report.rejected_count, 'count'),
    knownDurationSeconds: checkMetric('knownDurationSeconds', benchmark.expectedKnownDurationSeconds, durationAudit.totalValidSeconds, 'duration'),
    knownDurationHours: checkMetric('knownDurationHours', benchmark.expectedKnownDurationHours, durationAudit.calculatedHours, 'duration'),
    missingDurationCount: checkMetric('missingDurationCount', benchmark.expectedMissingDurationCount, durationAudit.missingDurationCount, 'duration')
  };

  // Reload verification
  const reloadVerification = verifyReloadPersistence(tasks);
  if (!reloadVerification.matched) {
    for (const issue of reloadVerification.issues) {
      defects.push({
        id: 'DEFECT-RELOAD-PERSISTENCE',
        category: 'reload',
        field: 'persistence',
        expected: 'data preservation',
        actual: issue,
        severity: 'critical',
        description: `Persistence reload issue: ${issue}`
      });
    }
  }

  return {
    reconciliationId,
    filename,
    sourceChecksum: checksum,
    sourceFormat: format,
    reconciledAt: new Date().toISOString(),
    passed: defects.length === 0,
    metrics,
    representativeIds: {
      expected: benchmark.representativeRowIds,
      found: foundIds,
      missing: missingIds,
      allFound: missingIds.length === 0
    },
    durationAudit,
    reloadVerification: {
      reloadedCount: reloadVerification.reloadedTasks.length,
      matched: reloadVerification.matched,
      issues: reloadVerification.issues
    },
    defects
  };
}

/**
 * Pre-configured reference benchmark for synthetic edge cases fixture (PM-14 / PM-15).
 */
export const SYNTHETIC_EDGE_CASES_BENCHMARK: SampleBenchmarkSpec = {
  expectedChecksum: '0544e603ca640b426ac6a58ccda81e45362bdb32e91d37c55fd8a0b1916d394c',
  expectedTotalRows: 6,
  expectedUniqueTasks: 5,
  expectedRepeatedRows: 1,
  expectedRejectedRows: 0,
  expectedAcceptedCount: 5,
  expectedKnownDurationSeconds: 315,
  expectedKnownDurationHours: 0.0875,
  expectedMissingDurationCount: 1,
  expectedCompletedTasks: 3,
  representativeRowIds: [1, 2, 3, 4, 5]
};
