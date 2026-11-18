import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNativeSpeechExport,
  parseSelectedExport,
  type NativeTaskRecord
} from '../src/lib/nativeAdapter';

const sampleNativeTask = (changes: Record<string, unknown> = {}) => ({
  job_id: 'd9b3a4c2-8411-4b1a-963a-e9fa658a5c31',
  filename: 'interview_01.wav',
  template_id: 'asr_template_v1',
  modules: [{ id: 'asr', enabled: true }],
  annotation: {
    segments: [
      { start: 0.0, end: 3.5, text: 'សួស្តី Hello', language: 'km', speaker: 'Speaker 1' },
      { start: 3.5, end: 6.2, text: 'nice to meet you', language: 'en', speaker: 'Speaker 2' }
    ]
  },
  ...changes
});

const sampleManifestLine = (id = 'rec-uuid-101', text = 'តេស្តសំឡេង Audio test') => JSON.stringify({
  recording_id: id,
  audio_filepath: `/data/recordings/${id}.wav`,
  domain: 'Conversational',
  speaker_gender: 'Female',
  annotations: [
    { start: 0.0, end: 4.0, text, language: 'km', speaker: 'Speaker 1' }
  ]
});

test('PM-54: representative native per-task JSON parses with string identity and unknown duration preserved', () => {
  const raw = JSON.stringify([sampleNativeTask()]);
  const { report, tasks } = parseNativeSpeechExport(raw, 'speech_task.json', 'proj_alpha');

  assert.equal(report.status, 'completed');
  assert.equal(report.coverage_status, 'approved-only');
  assert.equal(report.total_source_rows, 1);
  assert.equal(report.unique_tasks_count, 1);
  assert.equal(report.accepted_count, 1);
  assert.equal(report.rejected_count, 0);
  assert.equal(report.missing_duration_count, 1, 'Duration must be reported as missing warning');

  const record = tasks[0];
  assert.equal(typeof record.task_id, 'string');
  assert.equal(record.task_id, 'd9b3a4c2-8411-4b1a-963a-e9fa658a5c31');
  assert.equal(record.duration_seconds, null, 'Must not infer duration from segments or lead_time');
  assert.equal(record.selected_transcript, 'សួស្តី Hello nice to meet you');
  assert.equal(record.coverage_status, 'approved-only');
  assert.equal(record.project_id, 'proj_alpha');
});

test('PM-54: representative native ASR manifest JSONL parses row-by-row with string IDs', () => {
  const jsonl = [
    sampleManifestLine('uuid-manifest-1', 'Phrase one'),
    sampleManifestLine('uuid-manifest-2', 'Phrase two')
  ].join('\n');

  const { report, tasks } = parseNativeSpeechExport(jsonl, 'manifest.jsonl');

  assert.equal(report.total_source_rows, 2);
  assert.equal(report.unique_tasks_count, 2);
  assert.equal(report.accepted_count, 2);
  assert.equal(report.missing_duration_count, 2);

  assert.equal(tasks[0].task_id, 'uuid-manifest-1');
  assert.equal(tasks[0].selected_transcript, 'Phrase one');
  assert.equal(tasks[0].duration_seconds, null);

  assert.equal(tasks[1].task_id, 'uuid-manifest-2');
  assert.equal(tasks[1].selected_transcript, 'Phrase two');
});

test('PM-54: duplicate native rows within a batch are detected and ignored without crash', () => {
  const raw = JSON.stringify([
    sampleNativeTask({ job_id: 'duplicate-uuid' }),
    sampleNativeTask({ job_id: 'duplicate-uuid' })
  ]);

  const { report, tasks } = parseNativeSpeechExport(raw, 'batch.json');

  assert.equal(report.total_source_rows, 2);
  assert.equal(report.unique_tasks_count, 1);
  assert.equal(report.repeated_rows_count, 1);
  assert.equal(tasks.length, 1);
  assert.ok(report.issues.some(i => i.includes('Duplicate job_id')));
});

test('PM-54: malformed native rows report row-referenced issues and do not abort valid siblings', () => {
  const raw = JSON.stringify([
    sampleNativeTask({ job_id: 'good-task-1' }),
    { job_id: 12345 }, // invalid numeric job_id
    { job_id: 'good-task-2', modules: [], annotation: null } // invalid annotation
  ]);

  const { report, tasks } = parseNativeSpeechExport(raw, 'mixed.json');

  assert.equal(report.total_source_rows, 3);
  assert.equal(report.accepted_count, 1);
  assert.equal(report.rejected_count, 2);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].task_id, 'good-task-1');
  assert.ok(report.issues.some(i => i.startsWith('Row 2:')));
  assert.ok(report.issues.some(i => i.startsWith('Row 3:')));
});

test('PM-54: empty source and corrupt syntax fail safely without throwing', () => {
  const emptyResult = parseNativeSpeechExport('   ');
  assert.equal(emptyResult.report.status, 'failed');
  assert.equal(emptyResult.tasks.length, 0);

  const corruptResult = parseNativeSpeechExport('{ invalid json syntax');
  assert.equal(corruptResult.report.status, 'failed');
  assert.equal(corruptResult.tasks.length, 0);
  assert.ok(corruptResult.report.issues.length > 0);
});

test('PM-54 Acceptance Criteria 2: format isolation enforces explicit source format', () => {
  const labelStudioPayload = JSON.stringify([
    {
      id: 4201,
      project: 42,
      data: { audio: 'sample.wav', duration_seconds: 45, collector_id: 'member_a' },
      annotations: [
        {
          id: 1,
          completed_by: 10,
          was_cancelled: false,
          result: [{ from_name: 't', to_name: 'a', type: 'textarea', value: { text: ['LS text'] } }]
        }
      ]
    }
  ]);

  const nativePayload = JSON.stringify([sampleNativeTask()]);

  // 1. Parsing Label Studio payload under 'speech_platform' format rejects it
  const nativeAttemptOnLS = parseSelectedExport(labelStudioPayload, 'speech_platform');
  assert.equal(nativeAttemptOnLS.report.accepted_count, 0);
  assert.equal(nativeAttemptOnLS.report.rejected_count, 1);

  // 2. Parsing Native payload under 'label_studio' format rejects it
  const lsAttemptOnNative = parseSelectedExport(nativePayload, 'label_studio');
  assert.equal(lsAttemptOnNative.report.accepted_count, 0);
  assert.equal(lsAttemptOnNative.report.rejected_count, 1);

  // 3. Proper format selection succeeds
  const properLS = parseSelectedExport(labelStudioPayload, 'label_studio');
  assert.equal(properLS.report.accepted_count, 1);
  assert.equal((properLS.tasks[0] as { task_id: number }).task_id, 4201);

  const properNative = parseSelectedExport(nativePayload, 'speech_platform');
  assert.equal(properNative.report.accepted_count, 1);
  assert.equal((properNative.tasks[0] as NativeTaskRecord).task_id, 'd9b3a4c2-8411-4b1a-963a-e9fa658a5c31');
});
