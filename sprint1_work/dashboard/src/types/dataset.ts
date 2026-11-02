/**
 * Data contract and types for Khmer-English Speech Dataset Progress Dashboard
 * Based on CS-02 & CS-03 specifications.
 */

// --- Raw Label Studio Export Formats ---

export interface LabelStudioResultItem {
  from_name: string;
  to_name: string;
  type: string;
  value: {
    text?: string[];
    choices?: string[];
    [key: string]: unknown;
  };
}

export interface LabelStudioAnnotation {
  id: number;
  completed_by?: number | string | null;
  was_cancelled?: boolean;
  ground_truth?: boolean;
  created_at?: string;
  updated_at?: string;
  lead_time?: number; // In seconds - labeling effort, NOT audio length!
  result?: LabelStudioResultItem[];
}

export interface LabelStudioTaskData {
  audio?: string;
  duration_seconds?: number | null; // Missing/null means unknown, never zero.
  collector_id?: string | number | null;
  speaker_id?: string | number | null;
  topic?: string | null;
  [key: string]: unknown;
}

export interface LabelStudioExportTask {
  id: number;
  project?: number;
  data: LabelStudioTaskData;
  annotations?: LabelStudioAnnotation[];
  created_at?: string;
  updated_at?: string;
}

// --- Normalized Application Storage Model ---

export interface Project {
  project_id: number;
  display_name: string;
  contract_version: string;
  coverage_status: 'complete' | 'partial' | 'unknown';
}

export interface TaskRecord {
  project_id: number;
  task_id: number;
  audio_ref: string;
  duration_seconds: number | null; // Authoritative duration in seconds. null = unknown!
  collector_source_id: string | null;
  speaker_id: string | null;
  topic: string | null;
  source_created_at: string;
  source_updated_at: string;
  last_import_batch_id: string;

  // Derived annotation completion state
  is_annotated: boolean;
  selected_transcript: string | null;
  annotation_author_id: string | null;
  has_multiple_annotations: boolean;
  was_cancelled: boolean;
  selected_annotation_id: number | null;
  annotations: Annotation[];
  original_source_json: LabelStudioExportTask;
  source_snapshots: LabelStudioExportTask[]; // Retain duplicate-row evidence too.
}

/** Full annotation evidence; derived task fields never replace this history. */
export interface Annotation {
  project_id: number;
  task_id: number;
  annotation_id: number;
  source_author_id: string | null;
  was_cancelled: boolean;
  source_created_at: string | null;
  source_updated_at: string | null;
  original_result_json: LabelStudioResultItem[];
}

export type Task = TaskRecord;

export interface Member {
  member_id: string;
  display_alias: string;
}

export interface MemberMapping {
  project_id: number;
  credit_basis: 'collector' | 'annotator';
  source_actor_id: string;
  member_id: string;
}

export interface Target {
  project_id: number;
  member_id: string;
  basis: 'collected_hours' | 'annotated_hours';
  target_seconds: number | null; // null = not configured; zero is an explicit target.
  confirmation_reference?: string;
}

export interface ImportBatchReport {
  batch_id: string;
  project_id: number | null; // null when no project is known or a file spans projects.
  filename: string;
  imported_at: string;
  total_source_rows: number;
  unique_tasks_count: number;
  repeated_rows_count: number;
  accepted_count: number;
  rejected_count: number;
  missing_duration_count: number;
  unattributed_count: number;
  status: 'preview' | 'completed' | 'failed';
  issues: string[];
}

export type ImportBatch = ImportBatchReport;

/** Native Speech Annotation Platform exports use string job IDs, not LS task IDs. */
export interface SpeechSegment {
  id?: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  language?: string;
  channel?: number;
  confidence?: number | null;
}

export interface SpeechAnnotationDocument {
  segments: SpeechSegment[];
  [key: string]: unknown;
}

/** GET /api/jobs/{job_id}/export?format=json; project and duration are absent. */
export interface SpeechPlatformExport {
  job_id: string;
  filename: string | null;
  template_id: string | null;
  modules: { id: string; enabled?: boolean; [key: string]: unknown }[];
  annotation: SpeechAnnotationDocument;
}

/** ASR manifest.jsonl or asr/<recording>/annotation.json, one row per recording. */
export interface SpeechAsrManifestRecord {
  recording_id: string;
  audio_filepath: string;
  domain: string;
  speaker_gender: string;
  annotations: SpeechSegment[];
}

export interface SpeechPlatformJob {
  id: string;
  project_id: string;
  status: string; // Machine pipeline state, not human approval.
  annotation_status: 'draft' | 'submitted' | 'approved' | 'rejected';
  review_status: string;
  annotator_user_id: string | null; // Assignment is not authorship or collection credit.
  reviewer_user_id: string | null;
  annotation_modified_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  annotation: Record<string, unknown>;
}

export interface SpeechPlatformAnnotationResponse {
  job: SpeechPlatformJob;
  task: {
    data: {
      audio_url: string;
      audio_duration?: number; // Audio probe result in seconds; may be unavailable.
      asr_config?: { code_switching: boolean; languages: string[] };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  annotation: SpeechAnnotationDocument;
  speakers: Record<string, unknown>[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T; issues: [] }
  | { success: false; issues: ValidationIssue[] };

// --- Summary & Overview Metrics ---

export interface DatasetMetrics {
  total_tasks: number;
  total_known_seconds: number;
  total_known_hours: number;
  missing_duration_tasks_count: number;

  completed_tasks_count: number;
  completed_known_seconds: number;
  completed_known_hours: number;
  completed_missing_duration_count: number;

  unannotated_tasks_count: number;
  cancelled_tasks_count: number;
  unattributed_tasks_count: number;
}

export interface MemberProgressSummary {
  member_id: string;
  display_alias: string;
  owned_tasks_count: number;
  known_seconds: number;
  known_hours: number;
  target_hours: number | null;
  percentage: number | null;
}
