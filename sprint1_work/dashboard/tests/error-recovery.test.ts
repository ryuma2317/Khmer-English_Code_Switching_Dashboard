import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndPlanImport,
  safelyResolveWorkspace,
  categorizeValidationIssue
} from '../src/lib/errorRecoveryService';

test('PM-58: empty inputs produce readable Root error and block confirmation', () => {
  for (const empty of ['', '   ', '\n\t  ']) {
    const preview = validateAndPlanImport(empty, 'label_studio', 'empty.json');
    assert.equal(preview.status, 'failed');
    assert.equal(preview.can_confirm, false, 'Empty files must never be confirmable');
    assert.equal(preview.accepted_count, 0);
    assert.ok(preview.issues.some(i => i.location === 'Root' && i.reason.includes('empty')));
  }
});

test('PM-58: malformed JSON syntax fails safely without uncaught exceptions', () => {
  const badSyntax = '{ "broken": [1, 2, ';
  const preview = validateAndPlanImport(badSyntax, 'speech_platform', 'bad.json');

  assert.equal(preview.status, 'failed');
  assert.equal(preview.can_confirm, false);
  assert.ok(preview.issues.some(i => i.location === 'Root' && i.reason.toLowerCase().includes('syntax')));
});

test('PM-58: wrong root structure for Label Studio identifies root error and blocks confirmation', () => {
  const objectRoot = JSON.stringify({ message: 'I am not an array' });
  const preview = validateAndPlanImport(objectRoot, 'label_studio', 'wrong_root.json');

  assert.equal(preview.status, 'failed');
  assert.equal(preview.can_confirm, false);
  assert.ok(preview.issues.some(i => i.location === 'Root' && i.reason.includes('top-level JSON array')));
});

test('PM-58: fully invalid import (0 accepted) disables confirmation and reports row reasons', () => {
  const fullyInvalid = JSON.stringify([
    { job_id: 9999 }, // bad ID
    { job_id: '', modules: [] } // empty ID
  ]);

  const preview = validateAndPlanImport(fullyInvalid, 'speech_platform', 'all_bad.json');

  assert.equal(preview.status, 'failed');
  assert.equal(preview.accepted_count, 0);
  assert.equal(preview.rejected_count, 2);
  assert.equal(preview.can_confirm, false, 'Fully invalid imports must not be confirmable');
  assert.ok(preview.issues.some(i => i.location.includes('Row 1')));
  assert.ok(preview.issues.some(i => i.location.includes('Row 2')));
});

test('PM-58: partially valid inputs identify offending rows and flag reconciliation requirement', () => {
  const mixedNative = JSON.stringify([
    {
      job_id: 'valid-task-uuid-001',
      filename: 'good.wav',
      template_id: 't1',
      modules: [{ id: 'asr', enabled: true }],
      annotation: { segments: [{ start: 0, end: 3, text: 'Hello' }] }
    },
    {
      job_id: 12345 // invalid row 2
    }
  ]);

  const preview = validateAndPlanImport(mixedNative, 'speech_platform', 'mixed.json');

  assert.equal(preview.status, 'partial');
  assert.equal(preview.accepted_count, 1);
  assert.equal(preview.rejected_count, 1);
  assert.equal(preview.can_confirm, true, 'Partially valid import can be confirmed if acknowledged');
  assert.equal(preview.requires_reconciliation_acknowledgement, true);
  assert.ok(preview.issues.some(i => i.location === 'Row 2' && i.severity === 'error'));
});

test('PM-58 Data Isolation: failed candidate or cancellation preserves existing workspace untouched', () => {
  const existingSavedTasks = [
    { project_id: 1, task_id: 'saved_uuid_100', audio_ref: 'original.wav' }
  ];

  // 1. Trying to confirm a failed candidate does not mutate existing data
  const failedPreview = validateAndPlanImport('{ bad json', 'speech_platform', 'broken.json');
  const attemptResult = safelyResolveWorkspace(existingSavedTasks, failedPreview, 'confirm');

  assert.equal(attemptResult.wasSaved, false);
  assert.deepEqual(attemptResult.updatedTasks, existingSavedTasks, 'Existing tasks must remain untouched');
  assert.ok(attemptResult.statusMessage.includes('Confirmation blocked'));

  // 2. Cancelling an import preserves existing workspace
  const mixedPreview = validateAndPlanImport('[]', 'label_studio', 'empty.json');
  const cancelResult = safelyResolveWorkspace(existingSavedTasks, mixedPreview, 'cancel');

  assert.equal(cancelResult.wasSaved, false);
  assert.deepEqual(cancelResult.updatedTasks, existingSavedTasks);
  assert.ok(cancelResult.statusMessage.includes('remained completely unchanged'));
});
