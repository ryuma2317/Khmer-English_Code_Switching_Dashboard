import type {
  SpeechPlatformExport,
  SpeechAsrManifestRecord,
  SpeechSegment,
  ImportBatchReport,
  TaskRecord
} from '../types/dataset';
import {
  validateSpeechPlatformExport,
  validateSpeechAsrManifestRecord,
  isRecord
} from './validation';
import { parseLabelStudioExport } from './parser';

/**
 * Normalized native task record conforming to PM-54 specification.
 * Preserves native string IDs (e.g. UUIDs), unknown metadata, and tracks approved-only coverage.
 */
export interface NativeTaskRecord {
  project_id: string | number | null;
  task_id: string; // Native IDs must remain strings (PM-54 acceptance criteria)
  audio_ref: string | null;
  duration_seconds: number | null; // Strict: null = unknown, never inferred from segment bounds
  collector_source_id: string | null;
  speaker_id: string | null;
  topic: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  last_import_batch_id: string;

  is_annotated: boolean;
  selected_transcript: string | null;
  annotation_author_id: string | null;
  has_multiple_annotations: boolean;
  was_cancelled: boolean;
  selected_annotation_id: string | null;
  segments: SpeechSegment[];
  source_format: 'speech_platform_task' | 'speech_platform_manifest';
  coverage_status: 'approved-only' | 'partial' | 'complete' | 'unknown';
  original_source_json: SpeechPlatformExport | SpeechAsrManifestRecord;
}

/**
 * Extended batch report for native platform imports.
 */
export interface NativeImportBatchReport extends Omit<ImportBatchReport, 'project_id'> {
  project_id: string | number | null;
  source_format: 'speech_platform_task' | 'speech_platform_manifest' | 'label_studio';
  coverage_status: 'approved-only' | 'partial' | 'complete' | 'unknown';
}

export type SupportedSourceFormat = 'speech_platform' | 'label_studio';

/**
 * Extracts combined transcript from speech segments.
 */
function extractTranscriptFromSegments(segments: SpeechSegment[]): string | null {
  const parts = segments
    .map(s => (typeof s.text === 'string' ? s.text.trim() : ''))
    .filter(t => t.length > 0);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * PM-54: Parses Native Speech Annotation Platform exports.
 * Supports:
 *   1. Per-task JSON (single object or array of objects)
 *   2. ASR Manifest JSON or JSONL (one JSON object per line)
 *
 * Enforces:
 *   - Native IDs remain nonblank strings.
 *   - Duration is null when absent (never inferred from segment timestamps).
 *   - Coverage is flagged as 'approved-only' (native exports only output approved tasks).
 *   - Duplicate IDs are reconciled and reported.
 */
export function parseNativeSpeechExport(
  rawContent: string,
  filename: string = 'native_export.json',
  fallbackProjectId: string | number | null = null
): { report: NativeImportBatchReport; tasks: NativeTaskRecord[] } {
  const batchId = `batch_native_${Date.now()}`;
  const issues: string[] = [];
  const tasks: NativeTaskRecord[] = [];

  const trimmed = rawContent.trim();
  if (!trimmed) {
    return {
      report: {
        batch_id: batchId,
        project_id: fallbackProjectId,
        filename,
        imported_at: new Date().toISOString(),
        source_format: 'speech_platform_task',
        coverage_status: 'unknown',
        total_source_rows: 0,
        unique_tasks_count: 0,
        repeated_rows_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        missing_duration_count: 0,
        unattributed_count: 0,
        status: 'failed',
        issues: ['Source file is empty.']
      },
      tasks: []
    };
  }

  // Parse candidate objects from JSON array, single JSON object, or JSONL lines
  let parsedRows: { rowNum: number; raw: unknown }[] = [];
  let detectedSubFormat: 'speech_platform_task' | 'speech_platform_manifest' = 'speech_platform_task';

  try {
    if (filename.toLowerCase().endsWith('.jsonl')) {
      detectedSubFormat = 'speech_platform_manifest';
      parsedRows = rawContent.split(/\r?\n/).flatMap((line, index) => {
        if (!line.trim()) return [];
        try { return [{ rowNum: index + 1, raw: JSON.parse(line) as unknown }]; }
        catch (error) {
          issues.push(`Line ${index + 1}: Malformed JSON syntax (${error instanceof Error ? error.message : 'Invalid JSON'}).`);
          return [{ rowNum: index + 1, raw: null }];
        }
      });
    } else {
      const parsed: unknown = JSON.parse(trimmed);
      parsedRows = Array.isArray(parsed)
        ? parsed.map((raw, index) => ({ rowNum: index + 1, raw }))
        : [{ rowNum: 1, raw: parsed }];
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid JSON syntax';
    return {
      report: {
        batch_id: batchId,
        project_id: fallbackProjectId,
        filename,
        imported_at: new Date().toISOString(),
        source_format: detectedSubFormat,
        coverage_status: 'unknown',
        total_source_rows: 0,
        unique_tasks_count: 0,
        repeated_rows_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        missing_duration_count: 0,
        unattributed_count: 0,
        status: 'failed',
        issues: [`Failed to parse input: ${errorMsg}`]
      },
      tasks: []
    };
  }

  const seenIds = new Map<string, number>(); // task_id -> first row index
  let repeatedCount = 0;
  let missingDurationCount = 0;
  let unattributedCount = 0;
  let rejectedCount = 0;

  for (const { rowNum, raw } of parsedRows) {
    if (raw === null || !isRecord(raw)) {
      rejectedCount++;
      if (!issues.some(i => i.startsWith(`Line ${rowNum}:`))) {
        issues.push(`Row ${rowNum}: Expected a valid JSON object.`);
      }
      continue;
    }

    // Attempt 1: Per-task Speech Annotation Platform export
    const taskValidation = validateSpeechPlatformExport(raw);
    if (taskValidation.success) {
      detectedSubFormat = 'speech_platform_task';
      const data = taskValidation.data;
      const jobId = String(data.job_id).trim();

      if (seenIds.has(jobId)) {
        repeatedCount++;
        issues.push(`Row ${rowNum}: Duplicate job_id "${jobId}" (previously seen on row ${seenIds.get(jobId)}). Row ignored.`);
        continue;
      }
      seenIds.set(jobId, rowNum);

      // In native exports, duration is not part of this export shape -> must remain null
      missingDurationCount++;
      issues.push(`Row ${rowNum} [Job "${jobId}"]: Missing measured audio duration. Preserved as Unknown.`);

      const segments = data.annotation?.segments || [];
      const transcript = extractTranscriptFromSegments(segments);

      // Attribution: native export assignment is not verified authorship -> stays null
      unattributedCount++;

      tasks.push({
        project_id: fallbackProjectId,
        task_id: jobId,
        audio_ref: data.filename || null,
        duration_seconds: null,
        collector_source_id: null,
        speaker_id: segments[0]?.speaker || null,
        topic: null,
        source_created_at: null,
        source_updated_at: null,
        last_import_batch_id: batchId,
        is_annotated: false, // A transcript alone does not prove human approval/completion.
        selected_transcript: transcript,
        annotation_author_id: null,
        has_multiple_annotations: false,
        was_cancelled: false,
        selected_annotation_id: null,
        segments,
        source_format: 'speech_platform_task',
        coverage_status: 'approved-only',
        original_source_json: data
      });
      continue;
    }

    // Attempt 2: Native ASR Manifest record
    const manifestValidation = validateSpeechAsrManifestRecord(raw);
    if (manifestValidation.success) {
      detectedSubFormat = 'speech_platform_manifest';
      const data = manifestValidation.data;
      const recId = String(data.recording_id).trim();

      if (seenIds.has(recId)) {
        repeatedCount++;
        issues.push(`Row ${rowNum}: Duplicate recording_id "${recId}" (previously seen on row ${seenIds.get(recId)}). Row ignored.`);
        continue;
      }
      seenIds.set(recId, rowNum);

      // Manifest record does not contain whole-recording duration
      missingDurationCount++;
      issues.push(`Row ${rowNum} [Recording "${recId}"]: Manifest does not contain audio duration. Preserved as Unknown.`);

      const segments = data.annotations || [];
      const transcript = extractTranscriptFromSegments(segments);
      unattributedCount++;

      tasks.push({
        project_id: fallbackProjectId,
        task_id: recId,
        audio_ref: data.audio_filepath,
        duration_seconds: null,
        collector_source_id: null,
        speaker_id: null,
        topic: data.domain || null,
        source_created_at: null,
        source_updated_at: null,
        last_import_batch_id: batchId,
        is_annotated: false, // A transcript alone does not prove human approval/completion.
        selected_transcript: transcript,
        annotation_author_id: null,
        has_multiple_annotations: false,
        was_cancelled: false,
        selected_annotation_id: null,
        segments,
        source_format: 'speech_platform_manifest',
        coverage_status: 'approved-only',
        original_source_json: data
      });
      continue;
    }

    // Row does not match either native export shape
    rejectedCount++;
    const firstIssue = taskValidation.issues[0]?.message || 'Does not match Speech Annotation Platform shape.';
    issues.push(`Row ${rowNum}: Rejected (${firstIssue}).`);
  }

  const finalStatus = tasks.length > 0 ? (rejectedCount === 0 ? 'completed' : 'preview') : 'failed';

  return {
    report: {
      batch_id: batchId,
      project_id: fallbackProjectId,
      filename,
      imported_at: new Date().toISOString(),
      source_format: detectedSubFormat,
      coverage_status: tasks.length > 0 ? 'approved-only' : 'unknown',
      total_source_rows: parsedRows.length,
      unique_tasks_count: tasks.length,
      repeated_rows_count: repeatedCount,
      accepted_count: tasks.length,
      rejected_count: rejectedCount,
      missing_duration_count: missingDurationCount,
      unattributed_count: unattributedCount,
      status: finalStatus,
      issues
    },
    tasks
  };
}

/**
 * Format-isolated adapter dispatcher conforming to PM-54 Acceptance Criteria 2:
 * "Compatibility rows remain supported only under their explicitly selected source format."
 */
export function parseSelectedExport(
  rawContent: string,
  selectedFormat: SupportedSourceFormat,
  filename: string = 'export.json',
  fallbackProjectId?: number | string
): {
  report: NativeImportBatchReport;
  tasks: (TaskRecord | NativeTaskRecord)[];
} {
  if (selectedFormat === 'speech_platform') {
    return parseNativeSpeechExport(rawContent, filename, fallbackProjectId ?? null);
  }

  if (selectedFormat === 'label_studio') {
    const numericProject = typeof fallbackProjectId === 'number' && Number.isSafeInteger(fallbackProjectId)
      ? fallbackProjectId
      : undefined;
    const lsResult = parseLabelStudioExport(rawContent, filename, numericProject);
    return {
      report: {
        ...lsResult.report,
        source_format: 'label_studio',
        coverage_status: lsResult.tasks.length > 0 ? 'partial' : 'unknown'
      },
      tasks: lsResult.tasks
    };
  }

  throw new Error(`Unsupported source format "${selectedFormat}".`);
}
