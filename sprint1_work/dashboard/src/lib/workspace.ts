import { parseLabelStudioExport } from './parser';
import { parseNativeSpeechExport } from './nativeAdapter';
import { isRecord, validateSpeechPlatformExport, validateSpeechAsrManifestRecord } from './validation';

export type Source = 'label-studio' | 'speech-platform';
export type CreditBasis = 'collector' | 'annotator';
export type TargetBasis = 'collected' | 'completed' | 'approved';
export const APPROVED_TARGET_SECONDS = 10 * 3600;
export const APPROVAL_POLICY = 'Only explicitly approved annotations count toward the per-member 10-hour target.';
export type Coverage = 'complete' | 'partial' | 'unknown' | 'approved-only';
export interface ProjectInfo { key: string; id: string; source: Source; name: string; coverage: Coverage; lastImport: string | null }
export interface Recording {
  key: string; projectKey: string; taskId: string; source: Source; audio: string;
  seconds: number | null; collector: string | null; annotator: string | null; assignedAnnotator: string | null;
  transcript: string; state: string; completed: boolean; approved: boolean;
  topic: string; speaker: string; updatedAt: string | null; annotations: unknown[]; raw: unknown;
  issues: string[]; history: unknown[];
}
export interface MemberInfo { id: string; name: string }
export interface Mapping { projectKey: string; role: CreditBasis; actor: string; memberId: string }
export interface MemberTarget { projectKey: string; memberId: string; basis: TargetBasis; seconds: number | null; confirmed: boolean }
export interface ImportBatch {
  id: string; filename: string; at: string; sourceRows: number; unique: number; duplicates: number;
  rejected: number; added: number; updated: number; unchanged: number; stale: number; conflicts: number;
  projectKeys: string[]; issues: string[]; checksum: string;
}
export interface Workspace {
  version: 1; revision: number; projects: ProjectInfo[]; recordings: Recording[]; members: MemberInfo[];
  mappings: Mapping[]; targets: MemberTarget[]; batches: ImportBatch[]; selectedProject: string;
}
export interface ImportOptions { filename: string; projectId: string; projectName: string; coverage: Coverage; source: Source; checksum?: string }
export interface Preview { ok: boolean; records: Recording[]; projects: ProjectInfo[]; batch: ImportBatch; errors: string[] }
export const EMPTY: Workspace = { version: 1, revision: 0, projects: [], recordings: [], members: [], mappings: [], targets: [], batches: [], selectedProject: '' };
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const string = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const id = (v: unknown): string | null => string(v).trim() || null;
const seconds = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const iso = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const input = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v) ? v.replace(' ', 'T') + 'Z' : v;
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};
export const canonical = (v: unknown): string => JSON.stringify(v, (_key, value: unknown) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return value;
});
const projectKey = (source: Source, project: string) => JSON.stringify([source, project]);
const recordKey = (source: Source, project: string, task: string) => JSON.stringify([source, project, task]);

/** Retain useful source evidence without storing credentials or bearer URLs. */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(media_token|api_key|access_token|password|authorization)$/i.test(key)).map(([key, v]) => [key, clean(v)]));
  if (typeof value === 'string' && /[?&](token|access_token|api_key)=/i.test(value)) {
    try { const url = new URL(value, 'http://local.invalid'); ['token', 'access_token', 'api_key'].forEach(key => url.searchParams.delete(key)); return value.startsWith('http') ? url.toString() : url.pathname + url.search; } catch { return value.split('?')[0]; }
  }
  return value;
}

function fromLabel(row: unknown, options: ImportOptions): Recording {
  const selected = options.projectId.trim() ? Number(options.projectId) : undefined;
  if (selected !== undefined && (!Number.isSafeInteger(selected) || selected < 0)) throw new Error('Selected Label Studio project must be a non-negative integer.');
  const result = parseLabelStudioExport(JSON.stringify([row]), options.filename, selected);
  const task = result.tasks[0];
  if (!task) throw new Error(result.report.issues.join(' ') || 'Unsupported Label Studio row.');
  const project = String(task.project_id);
  return {
    key: recordKey('label-studio', project, String(task.task_id)), projectKey: projectKey('label-studio', project), taskId: String(task.task_id), source: 'label-studio',
    audio: string(clean(task.audio_ref)), seconds: task.duration_seconds, collector: task.collector_source_id, annotator: task.annotation_author_id, assignedAnnotator: null,
    transcript: task.selected_transcript ?? '', state: task.is_annotated ? 'completed' : task.was_cancelled ? 'cancelled' : 'unannotated', completed: task.is_annotated, approved: false,
    topic: task.topic ?? '', speaker: task.speaker_id ?? '', updatedAt: iso(task.source_updated_at), annotations: clean(task.annotations) as unknown[], raw: clean(row), issues: [], history: [],
  };
}

function fromNative(row: unknown, options: ImportOptions, rootProject: string): Recording {
  const wrapper = object(row);
  if (Object.keys(wrapper).length === 0) throw new Error('Expected a recording object.');
  if (Object.prototype.hasOwnProperty.call(wrapper, 'job_id')) {
    const checked = validateSpeechPlatformExport(wrapper);
    if (!checked.success) throw new Error(checked.issues.map(issue => `${issue.path}: ${issue.message}`).join(' '));
  }
  if (Object.prototype.hasOwnProperty.call(wrapper, 'recording_id')) {
    const checked = validateSpeechAsrManifestRecord(wrapper);
    if (!checked.success) throw new Error(checked.issues.map(issue => `${issue.path}: ${issue.message}`).join(' '));
  }
  if (wrapper.job !== undefined && !isRecord(wrapper.job)) throw new Error('job must be an object.');
  const job = Object.keys(object(wrapper.job)).length ? object(wrapper.job) : wrapper;
  const task = object(wrapper.task);
  if (job.metadata !== undefined && !isRecord(job.metadata)) throw new Error('metadata must be an object.');
  if (wrapper.annotation !== undefined && !isRecord(wrapper.annotation)) throw new Error('annotation must be an object.');
  if (job.annotation_status !== undefined && typeof job.annotation_status !== 'string') throw new Error('annotation_status must be a string.');
  const metadata = object(job.metadata);
  const taskData = object(task.data);
  const project = id(job.project_id) ?? id(rootProject) ?? id(options.projectId);
  const taskId = id(job.id) ?? id(job.job_id) ?? id(job.recording_id) ?? id(job.task_id);
  if (!project || !taskId) throw new Error('Native records require a string project context and recording/job ID.');
  if (typeof (job.id ?? job.job_id ?? job.recording_id ?? job.task_id) !== 'string') throw new Error('Native recording IDs must be strings, not numeric Label Studio IDs.');
  const nativeExport = wrapper.job_id || wrapper.recording_id ? parseNativeSpeechExport(JSON.stringify(wrapper), 'native.json', project).tasks[0] : null;
  const doc = object(wrapper.annotation ?? job.annotation);
  const segmentsValue = doc.segments ?? (job.recording_id ? job.annotations : undefined);
  if (segmentsValue !== undefined && !Array.isArray(segmentsValue)) throw new Error('annotation.segments must be an array.');
  const segments = array(segmentsValue).map((segment, index) => {
    const value = object(segment);
    if (seconds(value.start) === null || seconds(value.end) === null || Number(value.end) <= Number(value.start) || typeof value.text !== 'string') throw new Error(`Segment ${index + 1} requires finite start/end seconds and transcript text.`);
    if (value.language !== undefined && typeof value.language !== 'string') throw new Error(`Segment ${index + 1} language must be a string.`);
    return value;
  });
  const config = object(taskData.asr_config);
  const allowed = array(config.languages).map(v => string(v).toLowerCase());
  const badLanguage = config.code_switching === true && segments.some(s => !string(s.language).trim() || (allowed.length > 0 && !allowed.includes(string(s.language).toLowerCase())));
  const usable = segments.length > 0 && segments.every(s => string(s.text).trim()) && !badLanguage;
  const nativeState = typeof job.annotation_status === 'string' ? job.annotation_status : 'unknown';
  if (!['draft', 'submitted', 'approved', 'rejected', 'unknown'].includes(nativeState)) throw new Error('Unsupported native annotation_status.');
  const durationValue = taskData.audio_duration ?? metadata.duration_seconds;
  if (durationValue != null && seconds(durationValue) === null) throw new Error('Measured audio duration must be finite non-negative seconds.');
  const audit = array(job.annotation_audit).map(object).sort((a, b) => (Date.parse(string(b.timestamp)) || 0) - (Date.parse(string(a.timestamp)) || 0));
  const author = audit.find(event => event.to_status === 'submitted' && id(event.actor_id));
  const completed = usable && ['submitted', 'approved'].includes(nativeState);
  const issues: string[] = [];
  if (badLanguage) issues.push('Code-switching language missing or outside the configured languages');
  if (['submitted', 'approved'].includes(nativeState) && !usable) issues.push('Declared annotation state has no complete usable transcript');
  if (nativeState === 'unknown') issues.push('Human completion and approval state unavailable in this export');
  return {
    key: recordKey('speech-platform', project, taskId), projectKey: projectKey('speech-platform', project), taskId, source: 'speech-platform',
    audio: string(clean(taskData.audio_url ?? job.audio_filepath ?? job.filename ?? job.original_filename)), seconds: seconds(durationValue),
    collector: id(metadata.collector_id), annotator: author ? id(author.actor_id) : null, assignedAnnotator: id(job.annotator_user_id),
    transcript: nativeExport ? nativeExport.selected_transcript ?? '' : segments.map(s => string(s.text)).join('\n'), state: nativeState, completed, approved: completed && nativeState === 'approved',
    topic: string(metadata.domain ?? job.domain), speaker: [...new Set(segments.map(s => string(s.speaker)).filter(Boolean))].join(', '),
    updatedAt: iso(job.annotation_modified_at ?? job.updated_at), annotations: clean(audit) as unknown[], raw: clean(row), issues, history: [],
  };
}

export function recordIssues(record: Recording): string[] {
  return [
    ...record.issues,
    ...(record.seconds === null ? ['Missing duration'] : []),
    ...(!record.audio ? ['Missing audio reference'] : []),
    ...(!record.collector ? ['Missing collector'] : []),
    ...(!record.completed ? ['Needs a completed transcript'] : []),
  ];
}

function compare(incoming: Recording, stored: Recording): 'unchanged' | 'updated' | 'stale' | 'conflict' {
  if (canonical(incoming.raw) === canonical(stored.raw)) return 'unchanged';
  const next = incoming.updatedAt ? Date.parse(incoming.updatedAt) : null;
  const previous = stored.updatedAt ? Date.parse(stored.updatedAt) : null;
  if (next !== null && previous !== null) return next > previous ? 'updated' : next < previous ? 'stale' : 'conflict';
  return 'conflict';
}

function retainEvidence(incoming: Recording, previous: Recording): Recording {
  return {
    ...incoming,
    history: [...new Map([...previous.history, previous.raw, ...incoming.history].map(raw => [canonical(raw), raw])).values()],
    annotations: [...new Map([...previous.annotations, ...incoming.annotations].map(annotation => [canonical(annotation), annotation])).values()],
  };
}

export function previewImport(content: string, options: ImportOptions, workspace: Workspace): Preview {
  const errors: string[] = [];
  const batch: ImportBatch = { id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, filename: options.filename, at: new Date().toISOString(), sourceRows: 0, unique: 0, duplicates: 0, rejected: 0, added: 0, updated: 0, unchanged: 0, stale: 0, conflicts: 0, projectKeys: [], issues: [], checksum: options.checksum ?? '' };
  const fail = (message: string): Preview => ({ ok: false, records: [], projects: [], batch, errors: [message] });
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) return fail('File exceeds the 20 MB local import limit.');
  if (!/\.(json|jsonl)$/i.test(options.filename)) return fail('Unsupported format. Select a .json or .jsonl file.');
  if (options.source === 'label-studio' && options.filename.toLowerCase().endsWith('.jsonl')) return fail('Label Studio compatibility requires a JSON array in a .json file.');
  if (!content.trim()) return fail('The file is empty. Select a JSON or JSONL export.');
  let root: unknown;
  let sourceLines: number[] = [];
  const malformedLines = new Map<number, string>();
  try {
    if (options.filename.toLowerCase().endsWith('.jsonl')) {
      const values: unknown[] = [];
      content.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        sourceLines.push(index + 1);
        try { values.push(JSON.parse(line) as unknown); }
        catch { malformedLines.set(values.length, `Line ${index + 1}: malformed JSON syntax.`); values.push(null); }
      });
      root = values;
    } else root = JSON.parse(content) as unknown;
  } catch (error) { return fail(error instanceof Error ? `Malformed JSON: ${error.message}` : 'Malformed JSON.'); }
  const wrapper = object(root);
  let rows: unknown[];
  let rootId = '';
  let inferredCoverage: Coverage = options.coverage;
  if (Array.isArray(root)) rows = root;
  else if (options.source === 'speech-platform' && Array.isArray(wrapper.jobs)) {
    rows = wrapper.jobs; rootId = string(wrapper.id);
    const page = object(wrapper.jobs_page);
    inferredCoverage = page.offset === 0 && page.total === rows.length ? 'complete' : 'partial';
  } else if (options.source === 'speech-platform' && (wrapper.job_id || wrapper.recording_id || wrapper.job)) rows = [wrapper];
  else return fail(options.source === 'label-studio' ? 'Label Studio exports must be an array of tasks.' : 'Use a project jobs snapshot, annotation response, per-task JSON export or ASR JSONL manifest.');
  batch.sourceRows = rows.length;
  if (!rows.length) return fail('The export contains no recordings. Nothing has been saved.');
  if (options.source === 'speech-platform' && rows.some(row => { const value = object(row); return !value.job && (value.job_id || value.recording_id); })) inferredCoverage = 'approved-only';
  const unique = new Map<string, Recording>();
  for (let index = 0; index < rows.length; index++) {
    try {
      if (malformedLines.has(index)) throw new Error('malformed JSON syntax.');
      const record = options.source === 'label-studio' ? fromLabel(rows[index], options) : fromNative(rows[index], options, rootId);
      const previous = unique.get(record.key);
      if (previous) {
        batch.duplicates++;
        const choice = compare(record, previous);
        batch.issues.push(`Row ${index + 1}, task ${record.taskId}: duplicate; ${choice === 'updated' ? 'newer source selected' : 'first source retained (' + choice + ')'}.`);
        if (choice === 'updated') unique.set(record.key, retainEvidence(record, previous));
      } else unique.set(record.key, record);
    } catch (error) {
      batch.rejected++;
      batch.issues.push(`${sourceLines.length ? 'Line ' + sourceLines[index] : 'Row ' + (index + 1)}: ${error instanceof Error ? error.message : 'Invalid row.'}`);
    }
  }
  const records = Array.from(unique.values());
  const projects = [...new Set(records.map(r => r.projectKey))].map(key => {
    const [, projectId] = JSON.parse(key) as [Source, string];
    return { key, id: projectId, source: options.source, name: options.projectName.trim() || string(wrapper.title) || `Project ${projectId}`, coverage: inferredCoverage, lastImport: null } as ProjectInfo;
  });
  batch.unique = records.length; batch.projectKeys = projects.map(project => project.key);
  const existing = new Map(workspace.recordings.map(record => [record.key, record]));
  for (const record of records) {
    const previous = existing.get(record.key);
    if (!previous) batch.added++;
    else { const choice = compare(record, previous); if (choice === 'conflict') batch.conflicts++; else batch[choice]++; if (choice === 'stale' || choice === 'conflict') batch.issues.push(`Task ${record.taskId}: ${choice}; stored evidence retained. ${choice === 'conflict' ? 'A verified newer source timestamp is required.' : ''}`); }
  }
  if (!records.length) errors.push('No supported rows. Fix the reported issues before importing.');
  return { ok: errors.length === 0, records, projects, batch, errors };
}

export function applyPreview(workspace: Workspace, preview: Preview): Workspace {
  if (!preview.ok || !preview.records.length) throw new Error('Only a valid preview can be confirmed.');
  if (workspace.batches.some(batch => batch.id === preview.batch.id)) return workspace;
  const records = new Map(workspace.recordings.map(record => [record.key, record]));
  for (const incoming of preview.records) {
    const previous = records.get(incoming.key);
    if (!previous) records.set(incoming.key, incoming);
    else if (compare(incoming, previous) === 'updated') records.set(incoming.key, retainEvidence(incoming, previous));
  }
  const projects = new Map(workspace.projects.map(project => [project.key, project]));
  for (const project of preview.projects) projects.set(project.key, { ...project, lastImport: preview.batch.at });
  return { ...workspace, recordings: [...records.values()], projects: [...projects.values()], batches: [...workspace.batches, preview.batch], selectedProject: workspace.selectedProject || preview.projects[0].key };
}

export function metrics(records: Recording[]) {
  const sum = (predicate: (record: Recording) => boolean) => records.reduce((total, record) => total + (predicate(record) ? record.seconds ?? 0 : 0), 0);
  return { count: records.length, seconds: sum(() => true), completed: records.filter(r => r.completed).length, completedSeconds: sum(r => r.completed), approved: records.filter(r => r.approved).length, approvedSeconds: sum(r => r.approved), missingDuration: records.filter(r => r.seconds === null).length, completedUnknown: records.filter(r => r.completed && r.seconds === null).length, needsTranscript: records.filter(r => !r.completed).length, affected: records.filter(r => recordIssues(r).length > 0).length };
}

export const hours = (value: number) => (value / 3600).toFixed(4);
