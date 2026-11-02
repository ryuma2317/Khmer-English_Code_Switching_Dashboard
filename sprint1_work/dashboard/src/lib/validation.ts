import type {
  LabelStudioExportTask,
  SpeechPlatformExport,
  SpeechAsrManifestRecord,
  ValidationIssue,
  ValidationResult,
} from '../types/dataset';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function checkOptional(
  obj: Record<string, unknown>, key: string, path: string,
  check: (value: unknown) => boolean, expected: string, issues: ValidationIssue[],
): void {
  if (obj[key] !== undefined && !check(obj[key])) {
    issues.push({ path: `${path}.${key}`, message: `Expected ${expected}.` });
  }
}

const timestamp = (v: unknown): boolean => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(v)
  && Number.isFinite(Date.parse(v));
const actor = (v: unknown): boolean => v === null
  || (typeof v === 'string' && v.trim().length > 0) || validId(v);
const textArray = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === 'string');

/** Validate unknown input before treating it as typed data; no coercion of IDs or seconds. */
export function validateLabelStudioTask(value: unknown): ValidationResult<LabelStudioExportTask> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: 'task', message: 'Expected an object.' }] };
  if (!validId(value.id)) issues.push({ path: 'task.id', message: 'Expected a non-negative safe integer task ID.' });
  checkOptional(value, 'project', 'task', validId, 'a non-negative safe integer project ID', issues);
  for (const key of ['created_at', 'updated_at']) {
    checkOptional(value, key, 'task', timestamp, 'an ISO timestamp with timezone', issues);
  }
  if (!isRecord(value.data)) {
    issues.push({ path: 'task.data', message: 'Expected a metadata object.' });
  } else {
    checkOptional(value.data, 'audio', 'task.data', v => typeof v === 'string', 'an audio path string', issues);
    checkOptional(value.data, 'duration_seconds', 'task.data', v => v === null || validSeconds(v), 'finite non-negative seconds or null', issues);
    for (const key of ['collector_id', 'speaker_id']) {
      checkOptional(value.data, key, 'task.data', actor, 'a nonblank string, integer ID, or null', issues);
    }
    checkOptional(value.data, 'topic', 'task.data', v => v === null || typeof v === 'string', 'a string or null', issues);
  }
  if (value.annotations !== undefined) {
    if (!Array.isArray(value.annotations)) issues.push({ path: 'task.annotations', message: 'Expected an array.' });
    else value.annotations.forEach((annotation, index) => {
      const path = `task.annotations[${index}]`;
      if (!isRecord(annotation)) { issues.push({ path, message: 'Expected an annotation object.' }); return; }
      if (!validId(annotation.id)) issues.push({ path: `${path}.id`, message: 'Expected a non-negative safe integer annotation ID.' });
      checkOptional(annotation, 'completed_by', path, actor, 'an author ID or null', issues);
      for (const key of ['was_cancelled', 'ground_truth']) checkOptional(annotation, key, path, v => typeof v === 'boolean', 'a boolean', issues);
      for (const key of ['created_at', 'updated_at']) checkOptional(annotation, key, path, timestamp, 'an ISO timestamp with timezone', issues);
      checkOptional(annotation, 'lead_time', path, validSeconds, 'finite non-negative effort seconds', issues);
      if (annotation.result !== undefined) {
        if (!Array.isArray(annotation.result)) issues.push({ path: `${path}.result`, message: 'Expected an array.' });
        else annotation.result.forEach((item, resultIndex) => {
          const resultPath = `${path}.result[${resultIndex}]`;
          if (!isRecord(item)) { issues.push({ path: resultPath, message: 'Expected a result object.' }); return; }
          for (const key of ['from_name', 'to_name', 'type']) {
            if (typeof item[key] !== 'string' || !item[key].trim()) issues.push({ path: `${resultPath}.${key}`, message: 'Expected a nonblank string.' });
          }
          if (!isRecord(item.value)) issues.push({ path: `${resultPath}.value`, message: 'Expected a result value object.' });
          else for (const key of ['text', 'choices']) checkOptional(item.value, key, `${resultPath}.value`, textArray, 'an array of strings', issues);
        });
      }
    });
  }
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as LabelStudioExportTask, issues: [] };
}

function validateSegments(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) { issues.push({ path, message: 'Expected a segment array.' }); return; }
  value.forEach((segment, index) => {
    const location = `${path}[${index}]`;
    if (!isRecord(segment)) { issues.push({ path: location, message: 'Expected a segment object.' }); return; }
    if (!validSeconds(segment.start) || !validSeconds(segment.end)
      || segment.end <= segment.start) issues.push({ path: location, message: 'Expected finite segment times with 0 <= start < end.' });
    if (typeof segment.text !== 'string') issues.push({ path: `${location}.text`, message: 'Expected transcript text.' });
    for (const key of ['id', 'speaker', 'language']) checkOptional(segment, key, location, v => typeof v === 'string', 'a string', issues);
    checkOptional(segment, 'channel', location, validId, 'a non-negative integer channel', issues);
    checkOptional(segment, 'confidence', location, v => v === null || (validSeconds(v) && v <= 1), 'a probability from 0 to 1 or null', issues);
  });
}

/** Validates shape only; an export file does not itself prove reviewer approval. */
export function validateSpeechPlatformExport(value: unknown): ValidationResult<SpeechPlatformExport> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: 'export', message: 'Expected an object.' }] };
  if (typeof value.job_id !== 'string' || !value.job_id.trim()) issues.push({ path: 'export.job_id', message: 'Expected a nonblank string job ID.' });
  for (const key of ['filename', 'template_id']) {
    if (value[key] !== null && typeof value[key] !== 'string') issues.push({ path: `export.${key}`, message: 'Expected a string or null.' });
  }
  if (!Array.isArray(value.modules)) issues.push({ path: 'export.modules', message: 'Expected an array.' });
  else value.modules.forEach((module, index) => {
    if (!isRecord(module) || typeof module.id !== 'string' || !module.id.trim()) issues.push({ path: `export.modules[${index}]`, message: 'Expected a module with a string ID.' });
    else checkOptional(module, 'enabled', `export.modules[${index}]`, v => typeof v === 'boolean', 'a boolean', issues);
  });
  if (!isRecord(value.annotation)) issues.push({ path: 'export.annotation', message: 'Expected an annotation document.' });
  else validateSegments(value.annotation.segments, 'export.annotation.segments', issues);
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as SpeechPlatformExport, issues: [] };
}

export function validateSpeechAsrManifestRecord(value: unknown): ValidationResult<SpeechAsrManifestRecord> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: 'record', message: 'Expected an object.' }] };
  for (const key of ['recording_id', 'audio_filepath', 'domain', 'speaker_gender']) {
    if (typeof value[key] !== 'string' || (['recording_id', 'audio_filepath'].includes(key) && !value[key].trim())) issues.push({ path: `record.${key}`, message: 'Expected a string (identity and audio path must be nonblank).' });
  }
  validateSegments(value.annotations, 'record.annotations', issues);
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as SpeechAsrManifestRecord, issues: [] };
}
