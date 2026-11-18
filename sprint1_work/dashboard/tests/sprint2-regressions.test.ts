import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNativeSpeechExport } from '../src/lib/nativeAdapter';
import { validateAndPlanImport } from '../src/lib/errorRecoveryService';
import { reconcileSampleExport, SYNTHETIC_EDGE_CASES_BENCHMARK } from '../src/lib/sampleReconciliationService';
import { APPROVED_TARGET_SECONDS, EMPTY, applyPreview, metrics, previewImport, type ImportOptions } from '../src/lib/workspace';
import { isWorkspace, loadWorkspace } from '../src/lib/storage';

const native: ImportOptions = { filename: 'native.json', source: 'speech-platform', projectId: 'test-project', projectName: 'Synthetic', coverage: 'unknown' };
const manifest = (recording_id: string) => ({ recording_id, audio_filepath: 'synthetic.wav', domain: '', speaker_gender: '', annotations: [{ start: 0, end: 2, text: 'Synthetic text' }] });
const task = { job_id: 'native-a', filename: null, template_id: 'asr', modules: [{ id: 'asr' }], annotation: { segments: [{ start: 0, end: 2, text: 'Synthetic text' }] } };

test('PM-54 formatted native JSON retains unknown source metadata instead of fabricating it', () => {
  const parsed = parseNativeSpeechExport(JSON.stringify(task, null, 2), 'pretty.json', 'test-project');
  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.tasks[0].audio_ref, null);
  assert.equal(parsed.tasks[0].source_created_at, null);
  assert.equal(parsed.tasks[0].source_updated_at, null);
  assert.equal(parsed.tasks[0].selected_annotation_id, null);
  assert.equal(parsed.tasks[0].is_annotated, false);
});
test('PM-58 valid JSONL and partial JSONL retain physical line numbers including blank lines', () => {
  const good = JSON.stringify(manifest('a'));
  const helper = validateAndPlanImport(good + '\n' + JSON.stringify(manifest('b')), 'speech_platform', 'asr.jsonl', 'test-project');
  assert.equal(helper.accepted_count, 2);
  assert.equal(helper.can_confirm, true);
  const partial = previewImport(good + '\n\n{broken\n' + JSON.stringify(manifest('b')), { ...native, filename: 'asr.jsonl' }, structuredClone(EMPTY));
  assert.equal(partial.ok, true);
  assert.equal(partial.batch.sourceRows, 3);
  assert.equal(partial.batch.unique, 2);
  assert.equal(partial.batch.rejected, 1);
  assert.ok(partial.batch.issues.some(issue => issue.startsWith('Line 3:')));
});
test('PM-63 a wrong expected completion count is detected even if every other expectation matches', () => {
  const content = readFileSync('fixtures/synthetic_edge_cases.json', 'utf8');
  const result = reconcileSampleExport(content, { ...SYNTHETIC_EDGE_CASES_BENCHMARK, expectedCompletedTasks: 999 }, 'label_studio', 'fixture.json', 42);
  assert.equal(result.passed, false);
  assert.ok(result.defects.some(d => d.field === 'completedTasks' && d.actual === 3));
});
test('approved-only policy counts explicit approved native records and keeps unknown durations separate', () => {
  const content = readFileSync('fixtures/native_review_sample.json', 'utf8');
  const preview = previewImport(content, native, structuredClone(EMPTY));
  assert.equal(preview.records.length, 4);
  const totals = metrics(preview.records);
  assert.equal(totals.approved, 2);
  assert.equal(totals.approvedSeconds, 30);
  assert.equal(totals.seconds, 135);
  assert.equal(APPROVED_TARGET_SECONDS, 36000);
  assert.equal(preview.records.find(r => r.taskId === 'synthetic-submitted')?.approved, false);
  assert.equal(preview.records.find(r => r.taskId === 'synthetic-approved-unknown')?.seconds, null);
});
test('PM-60 nested persisted corruption is rejected before it can be published to the UI', () => {
  assert.equal(isWorkspace(EMPTY), true);
  const preview = previewImport(readFileSync('fixtures/native_review_sample.json', 'utf8'), native, structuredClone(EMPTY));
  const saved = applyPreview(structuredClone(EMPTY), preview);
  assert.equal(isWorkspace(saved), true);
  assert.equal(isWorkspace({ ...saved, recordings: [null] }), false);
  assert.equal(isWorkspace({ ...saved, recordings: [{ ...saved.recordings[0], seconds: -1 }] }), false);
  assert.equal(isWorkspace({ ...saved, selectedProject: 'missing-project' }), false);
  assert.equal(isWorkspace({ ...saved, version: 99 }), false);
});
test('PM-61 unavailable browser storage fails clearly without returning an empty successful snapshot', async () => {
  await assert.rejects(loadWorkspace(), /unavailable/);
});
test('PM-23 source selection and file type are explicit', () => {
  assert.equal(previewImport(JSON.stringify(task), { ...native, filename: 'data.csv' }, structuredClone(EMPTY)).ok, false);
  const compatibility = { ...native, filename: 'data.json', source: 'label-studio' as const, projectId: '42' };
  assert.equal(previewImport(JSON.stringify([task]), compatibility, structuredClone(EMPTY)).ok, false);
});
