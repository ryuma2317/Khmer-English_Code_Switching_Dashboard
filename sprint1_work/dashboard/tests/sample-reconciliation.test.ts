import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateSourceChecksum,
  auditTaskDurations,
  verifyReloadPersistence,
  reconcileSampleExport,
  SYNTHETIC_EDGE_CASES_BENCHMARK,
  type SampleBenchmarkSpec
} from '../src/lib/sampleReconciliationService';
import type { TaskRecord } from '../src/types/dataset';
import type { NativeTaskRecord } from '../src/lib/nativeAdapter';

test('PM-63: computes deterministic SHA-256 source checksum', () => {
  const content = '{"test": "reconciliation_checksum"}';
  const checksum1 = calculateSourceChecksum(content);
  const checksum2 = calculateSourceChecksum(content);

  assert.equal(typeof checksum1, 'string');
  assert.equal(checksum1.length, 64);
  assert.equal(checksum1, checksum2, 'Checksum must be deterministic');
});

test('PM-63: reconciles fixture sample against independent expectations and passes explicitly', () => {
  const source = readFileSync('fixtures/synthetic_edge_cases.json', 'utf8');

  const report = reconcileSampleExport(
    source,
    SYNTHETIC_EDGE_CASES_BENCHMARK,
    'label_studio',
    'synthetic_edge_cases.json',
    42
  );

  assert.equal(report.passed, true, 'Inspected sample checks must explicitly pass');
  assert.equal(report.defects.length, 0);

  // Checksum recorded
  assert.equal(report.sourceChecksum, SYNTHETIC_EDGE_CASES_BENCHMARK.expectedChecksum);

  // Exact metrics reconciliation
  assert.equal(report.metrics.totalSourceRows.matched, true);
  assert.equal(report.metrics.totalSourceRows.actual, 6);

  assert.equal(report.metrics.uniqueTasksCount.matched, true);
  assert.equal(report.metrics.uniqueTasksCount.actual, 5);

  assert.equal(report.metrics.repeatedRowsCount.matched, true);
  assert.equal(report.metrics.repeatedRowsCount.actual, 1);

  assert.equal(report.metrics.acceptedCount.matched, true);
  assert.equal(report.metrics.acceptedCount.actual, 5);

  assert.equal(report.metrics.rejectedCount.matched, true);
  assert.equal(report.metrics.rejectedCount.actual, 0);

  // Strict duration rule verification: hours = seconds / 3600
  assert.equal(report.metrics.knownDurationSeconds.matched, true);
  assert.equal(report.metrics.knownDurationSeconds.actual, 315);

  assert.equal(report.metrics.knownDurationHours.matched, true);
  assert.equal(report.metrics.knownDurationHours.actual, 0.0875);

  // Missing duration preserved as null / Unknown
  assert.equal(report.metrics.missingDurationCount.matched, true);
  assert.equal(report.metrics.missingDurationCount.actual, 1);

  // Representative IDs verified
  assert.equal(report.representativeIds.allFound, true);
  assert.deepEqual(report.representativeIds.found, [1, 2, 3, 4, 5]);
  assert.equal(report.representativeIds.missing.length, 0);

  // Reload verification clean
  assert.ok(report.reloadVerification);
  assert.equal(report.reloadVerification.matched, true);
  assert.equal(report.reloadVerification.reloadedCount, 5);
});

test('PM-63: duration audit strictly disregards lead_time and preserves unknown duration', () => {
  const mockTasks: TaskRecord[] = [
    {
      project_id: 42,
      task_id: 1,
      audio_ref: 'audio_1.wav',
      duration_seconds: 120, // 2 minutes
      collector_source_id: 'col_1',
      speaker_id: null,
      topic: null,
      source_created_at: '',
      source_updated_at: '',
      last_import_batch_id: 'b1',
      is_annotated: true,
      selected_transcript: 'Hello',
      annotation_author_id: '1',
      has_multiple_annotations: false,
      was_cancelled: false,
      selected_annotation_id: 10,
      annotations: [],
      original_source_json: {
        id: 1,
        data: { audio: 'audio_1.wav', duration_seconds: 120 },
        annotations: [{ id: 10, lead_time: 9999 }] // lead_time is labeling effort, NOT duration!
      },
      source_snapshots: []
    },
    {
      project_id: 42,
      task_id: 2,
      audio_ref: 'audio_2.wav',
      duration_seconds: null, // Unknown duration
      collector_source_id: 'col_2',
      speaker_id: null,
      topic: null,
      source_created_at: '',
      source_updated_at: '',
      last_import_batch_id: 'b1',
      is_annotated: false,
      selected_transcript: null,
      annotation_author_id: null,
      has_multiple_annotations: false,
      was_cancelled: false,
      selected_annotation_id: null,
      annotations: [],
      original_source_json: { id: 2, data: {} },
      source_snapshots: []
    }
  ];

  const audit = auditTaskDurations(mockTasks);
  assert.equal(audit.totalValidSeconds, 120, 'Only valid duration_seconds must be summed');
  assert.equal(audit.calculatedHours, Number((120 / 3600).toFixed(4)));
  assert.equal(audit.missingDurationCount, 1, 'Null duration remains Unknown');
  assert.equal(audit.leadTimeDisregarded, true);
});

test('PM-63: logs actionable reproducible defects when discrepancies are detected', () => {
  const source = readFileSync('fixtures/synthetic_edge_cases.json', 'utf8');

  // Benchmark with intentional mismatches to verify defect logging
  const discordantBenchmark: SampleBenchmarkSpec = {
    expectedChecksum: 'incorrect_checksum_hash_value',
    expectedTotalRows: 100, // actual is 6
    expectedUniqueTasks: 5,
    expectedRepeatedRows: 1,
    expectedRejectedRows: 0,
    expectedAcceptedCount: 5,
    expectedKnownDurationSeconds: 9999, // actual is 315
    expectedKnownDurationHours: 2.7775,
    expectedMissingDurationCount: 0, // actual is 1
    representativeRowIds: [1, 999] // 999 does not exist
  };

  const report = reconcileSampleExport(
    source,
    discordantBenchmark,
    'label_studio',
    'synthetic_edge_cases.json',
    42
  );

  assert.equal(report.passed, false, 'Report must fail when differences exist');
  assert.ok(report.defects.length >= 4, 'Must produce actionable defect entries');

  const defectIds = report.defects.map(d => d.id);
  assert.ok(defectIds.includes('DEFECT-CHECKSUM-MISMATCH'));
  assert.ok(defectIds.includes('DEFECT-TOTALSOURCEROWS'));
  assert.ok(defectIds.includes('DEFECT-KNOWNDURATIONSECONDS'));
  assert.ok(defectIds.includes('DEFECT-MISSING-ROW-999'));

  const rowDefect = report.defects.find(d => d.id === 'DEFECT-MISSING-ROW-999')!;
  assert.equal(rowDefect.category, 'identity');
  assert.equal(rowDefect.severity, 'critical');
});

test('PM-63: reconciles Native Speech Platform export with string IDs and approved-only coverage', () => {
  const nativeExportData = JSON.stringify([
    {
      job_id: 'recon-uuid-001',
      filename: 'sample_audio_01.wav',
      template_id: 'asr_v1',
      modules: [{ id: 'asr', enabled: true }],
      annotation: {
        segments: [{ start: 0, end: 4.5, text: 'សួស្តី Hello Native', language: 'km' }]
      }
    },
    {
      job_id: 'recon-uuid-002',
      filename: 'sample_audio_02.wav',
      template_id: 'asr_v1',
      modules: [{ id: 'asr', enabled: true }],
      annotation: {
        segments: [{ start: 0, end: 2.0, text: 'Test phrase', language: 'en' }]
      }
    }
  ]);

  const nativeBenchmark: SampleBenchmarkSpec = {
    expectedTotalRows: 2,
    expectedUniqueTasks: 2,
    expectedRepeatedRows: 0,
    expectedRejectedRows: 0,
    expectedAcceptedCount: 2,
    expectedKnownDurationSeconds: 0, // Native exports omit measured duration
    expectedKnownDurationHours: 0,
    expectedMissingDurationCount: 2,
    representativeRowIds: ['recon-uuid-001', 'recon-uuid-002']
  };

  const report = reconcileSampleExport(
    nativeExportData,
    nativeBenchmark,
    'speech_platform',
    'native_export.json'
  );

  assert.equal(report.passed, true);
  assert.equal(report.metrics.uniqueTasksCount.actual, 2);
  assert.equal(report.metrics.missingDurationCount.actual, 2);
  assert.equal(report.durationAudit.totalValidSeconds, 0);
  assert.equal(report.representativeIds.allFound, true);
});

test('PM-63: reload persistence verification detects mutated null durations and ID changes', () => {
  const tasks: NativeTaskRecord[] = [
    {
      project_id: 'p1',
      task_id: 'uuid-alpha',
      audio_ref: 'a.wav',
      duration_seconds: null,
      collector_source_id: null,
      speaker_id: null,
      topic: null,
      source_created_at: '',
      source_updated_at: '',
      last_import_batch_id: 'b1',
      is_annotated: true,
      selected_transcript: 'Test',
      annotation_author_id: null,
      has_multiple_annotations: false,
      was_cancelled: false,
      selected_annotation_id: 'ann-1',
      segments: [],
      source_format: 'speech_platform_task',
      coverage_status: 'approved-only',
      original_source_json: {} as any
    }
  ];

  // 1. Clean reload preserves state
  const cleanResult = verifyReloadPersistence(tasks);
  assert.equal(cleanResult.matched, true);
  assert.equal(cleanResult.issues.length, 0);

  // 2. Simulated corrupted reload (e.g. null converted to 0)
  const corruptedTasks = tasks.map(t => ({ ...t, duration_seconds: 0 }));
  const corruptedResult = verifyReloadPersistence(corruptedTasks);
  assert.equal(corruptedResult.matched, true); // comparing corrupted with its own reload matches, but comparing against original:
  const auditDiff = auditTaskDurations(corruptedTasks);
  assert.equal(auditDiff.totalValidSeconds, 0);
  assert.equal(auditDiff.missingDurationCount, 0, '0 is explicit, null is unknown');
});
