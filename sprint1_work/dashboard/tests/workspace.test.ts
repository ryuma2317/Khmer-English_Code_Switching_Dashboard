import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPreview, canonical, EMPTY, metrics, previewImport, recordIssues, type ImportOptions, type Workspace } from '../src/lib/workspace';

const ls: ImportOptions = { filename: 'tasks.json', source: 'label-studio', projectId: '', projectName: 'Demo', coverage: 'unknown' };
const native: ImportOptions = { filename: 'tasks.json', source: 'speech-platform', projectId: 'native-project', projectName: 'Native', coverage: 'unknown' };
const empty = (): Workspace => structuredClone(EMPTY);
const rawTask = (id = 1, duration = 60, updated_at = '2026-11-01T09:00:00Z') => ({ id, project: 42, data: { audio: `audio-${id}.wav`, duration_seconds: duration, collector_id: 'collector-a' }, annotations: [], updated_at });
const fixture = () => readFileSync('fixtures/synthetic_edge_cases.json', 'utf8');
const importLS = (source: unknown[], workspace = empty()) => applyPreview(workspace, previewImport(JSON.stringify(source), ls, workspace));
const nativeResponse = () => ({
  job: { id: 'recording-a', project_id: 'native-project', annotation_status: 'submitted', review_status: 'ready_for_review', annotator_user_id: 'assigned-person', updated_at: '2026-11-01T10:00:00Z', metadata: { domain: 'Education', media_token: 'PRIVATE' }, annotation_audit: [{ to_status: 'submitted', actor_id: 'actual-author', timestamp: '2026-11-01T09:00:00Z' }] },
  task: { data: { audio_url: '/audio/a.wav?token=PRIVATE', audio_duration: 12.5, asr_config: { code_switching: true, languages: ['km', 'en'] } } },
  annotation: { segments: [{ start: 0, end: 5, text: 'សួស្តី hello', language: 'km', speaker: 'Speaker 1' }] }, speakers: [],
});

test('confirmed fixture reconciles counts, hours, cancellation and unknown duration', () => {
  const data = applyPreview(empty(), previewImport(fixture(), ls, empty()));
  const result = metrics(data.recordings);
  assert.deepEqual(result, { count: 5, seconds: 315, completed: 3, completedSeconds: 210, approved: 0, approvedSeconds: 0, missingDuration: 1, completedUnknown: 1, needsTranscript: 2, affected: 3 });
  assert.ok(data.recordings.find(record => record.taskId === '4')!.history.length > 0);
  assert.ok(data.recordings.find(record => record.taskId === '4')!.annotations.length >= 2);
});

test('identical repeated file adds no tasks or seconds; confirmation is idempotent', () => {
  const first = previewImport(fixture(), ls, empty());
  const initial = applyPreview(empty(), first);
  assert.deepEqual(applyPreview(initial, first), initial);
  const again = previewImport(fixture(), ls, initial);
  assert.equal(again.batch.added, 0); assert.equal(again.batch.updated, 0); assert.equal(again.batch.unchanged, 5);
  const second = applyPreview(initial, again);
  assert.equal(second.recordings.length, 5); assert.equal(metrics(second.recordings).seconds, 315); assert.equal(second.batches.length, 2);
});

test('newer update replaces only that recording and preserves source evidence', () => {
  const initial = importLS([rawTask(), rawTask(2)]);
  const next = rawTask(1, 90, '2026-11-02T09:00:00Z');
  const preview = previewImport(JSON.stringify([next]), ls, initial);
  assert.equal(preview.batch.updated, 1);
  const final = applyPreview(initial, preview);
  assert.equal(final.recordings.length, 2); assert.equal(metrics(final.recordings).seconds, 150);
  assert.equal(final.recordings.find(record => record.taskId === '1')!.history.length, 1);
});

test('stale, same-timestamp conflict, and missing revision never overwrite stored evidence', () => {
  const initial = importLS([rawTask()]);
  for (const [row, field] of [[rawTask(1, 999, '2026-10-31T09:00:00Z'), 'stale'], [rawTask(1, 999), 'conflicts'], [{ ...rawTask(1, 999), updated_at: undefined }, 'conflicts']] as const) {
    const preview = previewImport(JSON.stringify([row]), ls, initial);
    assert.equal(preview.batch[field], 1);
    assert.equal(applyPreview(initial, preview).recordings[0].seconds, 60);
  }
});

test('malformed JSON, wrong roots and fully rejected rows cannot be confirmed', () => {
  for (const content of ['{broken', '{}', '[]', '[null, {"id":true}]']) {
    const preview = previewImport(content, ls, empty()); assert.equal(preview.ok, false);
    assert.throws(() => applyPreview(empty(), preview));
  }
});

test('partial valid import reports each rejected source position', () => {
  const preview = previewImport(JSON.stringify([null, rawTask(), { id: 2, data: [] }]), ls, empty());
  assert.equal(preview.ok, true); assert.equal(preview.batch.rejected, 2); assert.equal(preview.batch.sourceRows, 3);
  assert.equal(preview.batch.unique + preview.batch.duplicates + preview.batch.rejected, preview.batch.sourceRows);
  assert.ok(preview.batch.issues.some(issue => issue.startsWith('Row 1:')));
});

test('native annotation response uses measured duration and actual submitter evidence', () => {
  const preview = previewImport(JSON.stringify([nativeResponse()]), native, empty());
  assert.equal(preview.ok, true); const record = preview.records[0];
  assert.equal(record.seconds, 12.5); assert.equal(record.annotator, 'actual-author'); assert.equal(record.assignedAnnotator, 'assigned-person');
  assert.equal(record.collector, null); assert.equal(record.completed, true); assert.equal(record.approved, false);
  assert.equal(record.audio, '/audio/a.wav'); assert.equal(JSON.stringify(record.raw).includes('PRIVATE'), false);
});

test('native draft and progress labels do not establish completed or approved audio', () => {
  const response = nativeResponse(); response.job.annotation_status = 'draft'; response.job.review_status = 'completed';
  const record = previewImport(JSON.stringify([response]), native, empty()).records[0];
  assert.equal(record.completed, false); assert.equal(record.approved, false);
});

test('native approval is distinct from submitted state', () => {
  const response = nativeResponse(); response.job.annotation_status = 'approved';
  const record = previewImport(JSON.stringify([response]), native, empty()).records[0];
  assert.equal(record.completed, true); assert.equal(record.approved, true);
});

test('native code switching requires nonblank text and configured segment language', () => {
  for (const language of ['', 'fr']) {
    const response = nativeResponse(); response.annotation.segments[0].language = language;
    const record = previewImport(JSON.stringify([response]), native, empty()).records[0];
    assert.equal(record.completed, false); assert.ok(record.issues.some(issue => issue.includes('language')));
  }
});

test('native baseline prediction alone never establishes a human transcript', () => {
  const response = nativeResponse(); response.annotation.segments = [];
  const record = previewImport(JSON.stringify([{ ...response, prediction: { segments: [{ start: 0, end: 10, text: 'AI' }] } }]), native, empty()).records[0];
  assert.equal(record.completed, false); assert.equal(record.transcript, '');
});

test('native manifest does not invent project, duration, author or approval', () => {
  const row = { recording_id: 'recording-a', audio_filepath: '../audio/a.wav', domain: 'Education', speaker_gender: '', annotations: [{ start: 0, end: 8, text: 'Hello' }] };
  assert.equal(previewImport(JSON.stringify([row]), { ...native, projectId: '' }, empty()).ok, false);
  const preview = previewImport(JSON.stringify([row]), { ...native, coverage: 'complete' }, empty());
  assert.equal(preview.ok, true); assert.equal(preview.projects[0].coverage, 'approved-only');
  assert.equal(preview.records[0].seconds, null); assert.equal(preview.records[0].completed, false); assert.equal(preview.records[0].annotator, null);
});

test('native per-task export shape validates independently of legacy data', () => {
  const row = { job_id: 'task-a', filename: 'a.wav', template_id: 'asr', modules: [{ id: 'asr' }], annotation: { segments: [{ start: 0, end: 8, text: 'ខ្មែរ English', language: 'km' }] } };
  assert.equal(previewImport(JSON.stringify(row), native, empty()).ok, true);
  assert.equal(previewImport(JSON.stringify({ ...row, modules: [null] }), native, empty()).ok, false);
  assert.equal(previewImport(JSON.stringify([{ ...nativeResponse(), annotation: null }]), native, empty()).ok, false);
});

test('paginated native project coverage is inferred from full page metadata only', () => {
  const job = { ...nativeResponse().job, annotation: nativeResponse().annotation };
  const partial = { id: 'native-project', title: 'Real format', jobs: [job], jobs_page: { offset: 0, total: 2 } };
  assert.equal(previewImport(JSON.stringify(partial), { ...native, coverage: 'complete' }, empty()).projects[0].coverage, 'partial');
  const complete = { ...partial, jobs_page: { offset: 0, total: 1 } };
  assert.equal(previewImport(JSON.stringify(complete), native, empty()).projects[0].coverage, 'complete');
});

test('JSONL parsing reports a malformed line and handles valid native rows', () => {
  const row = { recording_id: 'r', audio_filepath: 'a.wav', domain: '', speaker_gender: '', annotations: [] };
  assert.equal(previewImport(JSON.stringify(row)+'\n', { ...native, filename: 'asr.jsonl' }, empty()).records.length, 1);
  const invalid = previewImport(JSON.stringify(row)+'\n{bad', { ...native, filename: 'asr.jsonl' }, empty());
  assert.equal(invalid.ok, true); assert.equal(invalid.batch.rejected, 1); assert.ok(invalid.batch.issues[0].includes('Line 2'));
});

test('native string IDs and numeric Label Studio IDs cannot collide', () => {
  const initial = importLS([rawTask()]); const response = nativeResponse(); response.job.id = '1'; response.job.project_id = '42';
  const final = applyPreview(initial, previewImport(JSON.stringify([response]), native, initial));
  assert.equal(final.recordings.length, 2); assert.equal(final.projects.length, 2);
});
