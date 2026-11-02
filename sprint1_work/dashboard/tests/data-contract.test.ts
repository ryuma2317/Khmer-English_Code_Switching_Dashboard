import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLabelStudioExport, calculateDatasetMetrics, calculateMemberProgress } from '../src/lib/parser';
import { validateLabelStudioTask, validateSpeechPlatformExport, validateSpeechAsrManifestRecord } from '../src/lib/validation';
import type { LabelStudioAnnotation, LabelStudioExportTask } from '../src/types/dataset';

const result = (text: string, type = 'textarea') => ({ from_name: 'transcript', to_name: 'audio', type, value: { text: [text] } });
const annotation = (id: number, text: string, updated_at = '2026-10-30T12:00:00Z'): LabelStudioAnnotation => ({
  id, completed_by: 0, was_cancelled: false, updated_at, result: [result(text)],
});
const task = (changes: Partial<LabelStudioExportTask> = {}): LabelStudioExportTask => ({
  id: 1, project: 42, data: { audio: 'demo.wav', duration_seconds: 60, collector_id: 'member_a' }, ...changes,
});
const parse = (rows: unknown[]) => parseLabelStudioExport(JSON.stringify(rows));

test('corrupt JSON and wrong roots fail safely', () => {
  for (const input of ['{bad', '{}', 'null', '42', '"text"']) {
    const parsed = parseLabelStudioExport(input);
    assert.equal(parsed.report.status, 'failed');
    assert.deepEqual(parsed.tasks, []);
    assert.ok(parsed.report.issues.length);
  }
});

test('empty arrays are safe and do not invent data', () => {
  const parsed = parse([]);
  assert.equal(parsed.report.total_source_rows, 0);
  assert.equal(parsed.report.project_id, null);
  assert.equal(parsed.tasks.length, 0);
});

test('malformed IDs, containers, timestamps and nested results reject rows without throwing', () => {
  const invalid: unknown[] = [null, [], 'row', 3, {}, task({ id: null as unknown as number }),
    task({ id: '1' as unknown as number }), task({ id: true as unknown as number }),
    task({ id: -1 }), task({ id: 1.5 }), task({ id: Number.MAX_SAFE_INTEGER + 1 }),
    task({ project: null as unknown as number }), task({ data: [] as unknown as LabelStudioExportTask['data'] }),
    task({ annotations: [null] as unknown as LabelStudioAnnotation[] }),
    task({ annotations: {} as unknown as LabelStudioAnnotation[] }),
    task({ annotations: [{ ...annotation(1, 'text'), result: [{ ...result('text'), value: { text: [5] } }] }] as unknown as LabelStudioAnnotation[] }),
    task({ annotations: [{ ...annotation(1, 'text'), was_cancelled: 'false' }] as unknown as LabelStudioAnnotation[] }),
    task({ updated_at: 'yesterday' }),
    task({ annotations: [{ ...annotation(1, 'text'), result: [null] }] as unknown as LabelStudioAnnotation[] }),
  ];
  const parsed = parse(invalid);
  assert.equal(parsed.report.rejected_count, invalid.length);
  assert.equal(parsed.report.status, 'failed');
  assert.equal(parsed.tasks.length, 0);
  assert.ok(parsed.report.issues.every(issue => issue.includes('Row ')));
});

test('invalid durations never become known audio seconds', () => {
  for (const duration of [-1, '60', true, Infinity, NaN]) {
    const raw = task({ data: { audio: 'a.wav', duration_seconds: duration as number } });
    assert.equal(validateLabelStudioTask(raw).success, false);
  }
});

test('missing and null duration remain unknown; explicit zero stays known; lead_time is effort', () => {
  const rows = [task({ id: 1, data: {} }), task({ id: 2, data: { duration_seconds: null } }),
    task({ id: 3, data: { duration_seconds: 0 }, annotations: [{ ...annotation(1, 'ខ្មែរ English'), lead_time: 36000 }] })];
  const parsed = parse(rows);
  assert.deepEqual(parsed.tasks.map(t => t.duration_seconds), [null, null, 0]);
  assert.equal(parsed.report.missing_duration_count, 2);
  const metrics = calculateDatasetMetrics(parsed.tasks);
  assert.equal(metrics.total_known_seconds, 0);
  assert.equal(metrics.missing_duration_tasks_count, 2);
  assert.equal(metrics.completed_tasks_count, 1);
});

test('project identity must be explicit and invalid selected project is rejected', () => {
  const raw = task(); delete raw.project;
  assert.equal(parse([raw]).report.rejected_count, 1);
  assert.equal(parseLabelStudioExport(JSON.stringify([raw]), 'demo.json', 7).tasks[0].project_id, 7);
  assert.equal(parseLabelStudioExport('[]', 'demo.json', -1).report.status, 'failed');
});

test('valid rows survive beside malformed rows with reconciling counts', () => {
  const parsed = parse([null, task(), { id: 2 }]);
  assert.equal(parsed.report.status, 'completed');
  assert.equal(parsed.report.accepted_count, 1);
  assert.equal(parsed.report.rejected_count, 2);
  assert.equal(parsed.report.total_source_rows, 3);
});

test('latest valid transcript uses timestamps, ignores blank/cancelled/non-textarea results', () => {
  const raw = task({ annotations: [
    annotation(4, 'Newest valid ខ្មែរ English', '2026-11-01T10:00:00Z'),
    { ...annotation(5, 'Cancelled', '2026-11-01T12:00:00Z'), was_cancelled: true },
    annotation(6, '   ', '2026-11-01T13:00:00Z'),
    { ...annotation(7, 'wrong control', '2026-11-01T14:00:00Z'), result: [result('not a transcript', 'choices')] },
    annotation(3, 'Older valid', '2026-10-30T12:00:00Z'),
  ] });
  const selected = parse([raw]).tasks[0];
  assert.equal(selected.selected_annotation_id, 4);
  assert.equal(selected.selected_transcript, 'Newest valid ខ្មែរ English');
  assert.equal(selected.annotation_author_id, '0');
  assert.equal(selected.annotations.length, 5);
  assert.deepEqual(selected.original_source_json, raw);
});

test('annotation ID deterministically breaks equal timestamp ties', () => {
  const parsed = parse([task({ annotations: [annotation(4, 'four'), annotation(8, 'eight')] })]);
  assert.equal(parsed.tasks[0].selected_annotation_id, 8);
});

test('predictions alone do not establish human transcription', () => {
  const raw = { ...task(), predictions: [{ result: [result('AI draft')] }] };
  assert.equal(parse([raw]).tasks[0].is_annotated, false);
});

test('cancelled-only tasks remain distinct from completed tasks', () => {
  const parsed = parse([task({ annotations: [{ ...annotation(1, 'cancelled text'), was_cancelled: true }] })]);
  assert.equal(parsed.tasks[0].was_cancelled, true);
  assert.equal(parsed.tasks[0].is_annotated, false);
  assert.equal(calculateDatasetMetrics(parsed.tasks).cancelled_tasks_count, 1);
});

test('newer duplicate wins in either order and missing summaries count unique tasks', () => {
  const old = task({ updated_at: '2026-10-30T12:00:00Z', data: {} });
  const newer = task({ updated_at: '2026-11-01T12:00:00Z' });
  for (const rows of [[old, newer], [newer, old]]) {
    const parsed = parse(rows);
    assert.equal(parsed.report.total_source_rows, 2);
    assert.equal(parsed.report.unique_tasks_count, 1);
    assert.equal(parsed.report.repeated_rows_count, 1);
    assert.equal(parsed.report.missing_duration_count, 0);
    assert.equal(parsed.tasks[0].duration_seconds, 60);
  }
});

test('duplicate ties keep first evidence; source timestamps are not invented', () => {
  const parsed = parse([task(), task({ data: { duration_seconds: 120 } })]);
  assert.equal(parsed.tasks[0].duration_seconds, 60);
  assert.equal(parsed.tasks[0].source_updated_at, '');
  assert.equal(parsed.tasks[0].source_created_at, '');
});

test('same task ID in different projects remains distinct', () => {
  const parsed = parse([task(), task({ project: 43 })]);
  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.report.repeated_rows_count, 0);
  assert.equal(parsed.report.project_id, null);
});

test('supplied fixture matches independently specified expected totals', () => {
  const source = readFileSync('fixtures/synthetic_edge_cases.json', 'utf8');
  const parsed = parseLabelStudioExport(source);
  assert.equal(parsed.report.total_source_rows, 6);
  assert.equal(parsed.report.unique_tasks_count, 5);
  assert.equal(parsed.report.repeated_rows_count, 1);
  assert.equal(parsed.report.rejected_count, 0);
  const taskFour = parsed.tasks.find(t => t.task_id === 4)!;
  assert.equal(taskFour.annotations.length, 2);
  assert.equal(taskFour.source_snapshots.length, 2);
  assert.equal(taskFour.has_multiple_annotations, true);
  assert.equal(taskFour.selected_annotation_id, 402);
  const metrics = calculateDatasetMetrics(parsed.tasks);
  assert.equal(metrics.total_known_seconds, 315);
  assert.equal(metrics.total_known_hours, 0.0875);
  assert.equal(metrics.completed_tasks_count, 3);
  assert.equal(metrics.completed_known_seconds, 210);
  assert.equal(metrics.completed_known_hours, 0.0583);
  assert.equal(metrics.completed_missing_duration_count, 1);
  assert.equal(metrics.unannotated_tasks_count, 1);
  assert.equal(metrics.cancelled_tasks_count, 1);
  assert.equal(metrics.unattributed_tasks_count, 1);
  assert.equal(metrics.missing_duration_tasks_count, 1);
});

test('selected project context does not mislabel a mixed-project batch', () => {
  const parsed = parseLabelStudioExport(JSON.stringify([task(), task({ project: 43 })]), 'mixed.json', 42);
  assert.equal(parsed.report.project_id, null);
});

test('unset and zero targets do not generate percentages; target basis stays separate', () => {
  const tasks = parse([task()]).tasks;
  const members = [{ member_id: 'member_a', display_alias: 'Member A' }];
  for (const seconds of [null, 0]) {
    const output = calculateMemberProgress(tasks, members, [{ project_id: 42, member_id: 'member_a', basis: 'collected_hours', target_seconds: seconds }]);
    assert.equal(output.memberSummaries[0].percentage, null);
    assert.equal(output.memberSummaries[0].target_hours, seconds === null ? null : 0);
  }
  assert.equal(calculateMemberProgress(tasks, members, [{ project_id: 42, member_id: 'member_a', basis: 'annotated_hours', target_seconds: 36000 }], 'collector').memberSummaries[0].target_hours, null);
});

const nativeExport = () => ({ job_id: 'job-a', filename: 'recording.wav', template_id: 'custom',
  modules: [{ id: 'asr', enabled: true }],
  annotation: { segments: [{ start: 0, end: 5, text: 'សួស្តី hello', language: 'km', speaker: 'Speaker 1' }] },
});

test('native per-task source shape preserves string IDs and mixed-language segments', () => {
  const validated = validateSpeechPlatformExport(nativeExport());
  assert.equal(validated.success, true);
  if (validated.success) assert.equal(validated.data.annotation.segments[0].text, 'សួស្តី hello');
  assert.equal(validateLabelStudioTask(nativeExport()).success, false);
});

test('native malformed segment times, text, modules, confidence and IDs fail with paths', () => {
  const examples = [
    { ...nativeExport(), job_id: 1 },
    { ...nativeExport(), modules: [null] },
    { ...nativeExport(), annotation: null },
    ...[{ start: 4, end: 2, text: 'bad' }, { start: -1, end: 2, text: 'bad' },
      { start: 0, end: Infinity, text: 'bad' }, { start: 0, end: 1, text: null },
      { start: 0, end: 1, text: 'bad', confidence: 2 }].map(segment => ({ ...nativeExport(), annotation: { segments: [segment] } })),
  ];
  for (const raw of examples) {
    const checked = validateSpeechPlatformExport(raw);
    assert.equal(checked.success, false);
    assert.ok(checked.issues.every(issue => issue.path.startsWith('export')));
  }
});

test('native ASR manifest treats segments as one recording and does not invent duration', () => {
  const row = { recording_id: 'uuid-recording', audio_filepath: '../audio/a/audio.wav', domain: 'General', speaker_gender: '', annotations: nativeExport().annotation.segments };
  const checked = validateSpeechAsrManifestRecord(row);
  assert.equal(checked.success, true);
  if (checked.success) assert.equal('duration_seconds' in checked.data, false);
  assert.equal(validateSpeechAsrManifestRecord({ ...row, recording_id: '' }).success, false);
});
