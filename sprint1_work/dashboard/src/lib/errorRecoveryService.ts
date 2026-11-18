import type {
  TaskRecord
} from '../types/dataset';
import {
  parseSelectedExport,
  type NativeTaskRecord,
  type SupportedSourceFormat
} from './nativeAdapter';
import { isRecord } from './validation';

/**
 * Detailed error and warning issue structure conforming to PM-58.
 * Provides explicit row/line source locations and understandable failure reasons.
 */
export interface DetailedValidationIssue {
  location: string; // e.g. "Root", "Line 4", "Row 12"
  rowNumber?: number;
  fieldPath?: string; // e.g. "duration_seconds", "annotation.segments[0].start"
  severity: 'error' | 'warning';
  reason: string;
  sourceSnippet?: string;
}

/**
 * High-level preview planning object conforming to PM-24 / PM-58.
 * Decides whether a candidate import can be confirmed and keeps failed candidates isolated.
 */
export interface ImportValidationPreview<T = TaskRecord | NativeTaskRecord> {
  batch_id: string;
  filename: string;
  source_format: SupportedSourceFormat | 'unknown';
  total_source_rows: number;
  accepted_count: number;
  rejected_count: number;
  repeated_count: number;
  missing_duration_count: number;
  status: 'clean' | 'partial' | 'failed';
  can_confirm: boolean; // Strict: FALSE if accepted_count === 0
  requires_reconciliation_acknowledgement: boolean; // TRUE if rejected_count > 0
  issues: DetailedValidationIssue[];
  candidate_tasks: T[];
}

/**
 * PM-58: Inspects and normalizes raw error strings into structured, readable issue objects.
 */
export function categorizeValidationIssue(rawMsg: string, defaultRow?: number): DetailedValidationIssue {
  const isWarning = rawMsg.toLowerCase().includes('unknown') ||
                    rawMsg.toLowerCase().includes('missing measured') ||
                    rawMsg.toLowerCase().includes('missing duration');

  let location = 'General';
  let rowNumber = defaultRow;
  let fieldPath: string | undefined;

  const rowMatch = rawMsg.match(/^(?:Row|Line)\s+(\d+)/i);
  if (rowMatch) {
    rowNumber = parseInt(rowMatch[1], 10);
    location = `${rawMsg.toLowerCase().startsWith('line') ? 'Line' : 'Row'} ${rowNumber}`;
  } else if (rawMsg.toLowerCase().includes('root') || rawMsg.toLowerCase().includes('empty')) {
    location = 'Root';
  }

  const fieldMatch = rawMsg.match(/(?:field|property|path|at)\s+([a-zA-Z0-9_.[\]]+)/i);
  if (fieldMatch) {
    fieldPath = fieldMatch[1];
  }

  return {
    location,
    rowNumber,
    fieldPath,
    severity: isWarning ? 'warning' : 'error',
    reason: rawMsg
  };
}

/**
 * PM-58: Core validation and error recovery pipeline.
 * Evaluates raw file content, produces granular line/row diagnostics,
 * enforces confirmation guards, and guarantees isolation from saved data.
 */
export function validateAndPlanImport(
  rawContent: string,
  selectedFormat: SupportedSourceFormat,
  filename: string = 'import.json',
  projectContext?: number | string
): ImportValidationPreview {
  const batchId = `preview_${Date.now()}`;
  const detailedIssues: DetailedValidationIssue[] = [];

  // 1. Guard against empty / whitespace input
  if (!rawContent || !rawContent.trim()) {
    detailedIssues.push({
      location: 'Root',
      severity: 'error',
      reason: 'The uploaded file is empty. Please select a valid JSON or JSONL export.'
    });

    return {
      batch_id: batchId,
      filename,
      source_format: selectedFormat,
      total_source_rows: 0,
      accepted_count: 0,
      rejected_count: 0,
      repeated_count: 0,
      missing_duration_count: 0,
      status: 'failed',
      can_confirm: false,
      requires_reconciliation_acknowledgement: false,
      issues: detailedIssues,
      candidate_tasks: []
    };
  }

  // 2. Syntax pre-check: verify JSON/JSONL readability without unhandled exceptions
  const trimmed = rawContent.trim();
  let preCheckFailed = false;

  if (!filename.toLowerCase().endsWith('.jsonl')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (selectedFormat === 'label_studio' && !Array.isArray(parsed)) {
        preCheckFailed = true;
        detailedIssues.push({
          location: 'Root',
          fieldPath: 'root',
          severity: 'error',
          reason: 'Label Studio export must be a top-level JSON array of tasks (e.g. `[{...}]`), received an object.'
        });
      }
    } catch (syntaxErr) {
      preCheckFailed = true;
      const msg = syntaxErr instanceof Error ? syntaxErr.message : 'Invalid JSON syntax';
      detailedIssues.push({
        location: 'Root',
        severity: 'error',
        reason: `Malformed JSON syntax: ${msg}. Check for trailing commas or unclosed braces.`
      });
    }
  } else {
    // Check JSONL lines
    const lines = rawContent.split(/\r?\n/);
    let invalidLineCount = 0;
    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      try {
        JSON.parse(line);
      } catch {
        invalidLineCount++;
        detailedIssues.push({
          location: `Line ${idx + 1}`,
          rowNumber: idx + 1,
          severity: 'error',
          reason: `Line ${idx + 1}: Malformed JSON syntax in manifest line.`
        });
      }
    });

    if (invalidLineCount === lines.filter(line => line.trim()).length) {
      preCheckFailed = true;
    }
  }

  // If root syntax parsing failed completely, block confirmation immediately
  if (preCheckFailed && detailedIssues.some(i => i.severity === 'error' && i.location === 'Root')) {
    return {
      batch_id: batchId,
      filename,
      source_format: selectedFormat,
      total_source_rows: 0,
      accepted_count: 0,
      rejected_count: detailedIssues.filter(i => i.severity === 'error').length,
      repeated_count: 0,
      missing_duration_count: 0,
      status: 'failed',
      can_confirm: false,
      requires_reconciliation_acknowledgement: false,
      issues: detailedIssues,
      candidate_tasks: []
    };
  }

  // 3. Delegate to format-isolated adapter
  const { report, tasks } = parseSelectedExport(rawContent, selectedFormat, filename, projectContext);

  // 4. Transform issues into structured DetailedValidationIssue descriptors
  for (const rawIssue of report.issues) {
    detailedIssues.push(categorizeValidationIssue(rawIssue));
  }

  // 5. Enforce PM-58 Acceptance Criteria:
  // - If accepted_count === 0 -> can_confirm MUST BE FALSE (cannot confirm empty/fully invalid imports)
  // - If partially valid (accepted > 0 && rejected > 0) -> requires explicit user acknowledgment
  const acceptedCount = tasks.length;
  const rejectedCount = report.rejected_count;
  const canConfirm = acceptedCount > 0;

  let status: 'clean' | 'partial' | 'failed' = 'clean';
  if (acceptedCount === 0) {
    status = 'failed';
  } else if (rejectedCount > 0) {
    status = 'partial';
  }

  return {
    batch_id: report.batch_id,
    filename: report.filename,
    source_format: selectedFormat,
    total_source_rows: report.total_source_rows,
    accepted_count: acceptedCount,
    rejected_count: rejectedCount,
    repeated_count: report.repeated_rows_count,
    missing_duration_count: report.missing_duration_count,
    status,
    can_confirm: canConfirm,
    requires_reconciliation_acknowledgement: rejectedCount > 0,
    issues: detailedIssues,
    candidate_tasks: tasks
  };
}

/**
 * PM-58 Data Isolation Guard:
 * Guarantees that a failed or cancelled preview leaves the existing saved workspace completely untouched.
 */
export function safelyResolveWorkspace<T = unknown, C = unknown>(
  existingWorkspaceTasks: T[],
  preview: ImportValidationPreview<C>,
  userAction: 'confirm' | 'cancel' | 'retry'
): { updatedTasks: (T | C)[]; wasSaved: boolean; statusMessage: string } {
  if (userAction === 'cancel' || userAction === 'retry') {
    return {
      updatedTasks: existingWorkspaceTasks,
      wasSaved: false,
      statusMessage: 'Import cancelled. Existing saved workspace remained completely unchanged.'
    };
  }

  if (userAction === 'confirm') {
    if (!preview.can_confirm) {
      return {
        updatedTasks: existingWorkspaceTasks,
        wasSaved: false,
        statusMessage: 'Confirmation blocked: Fully invalid imports cannot be saved.'
      };
    }

    return {
      updatedTasks: preview.candidate_tasks,
      wasSaved: false,
      statusMessage: `Prepared ${preview.accepted_count} valid tasks. Persistence must complete before reporting a save.`
    };
  }

  return {
    updatedTasks: existingWorkspaceTasks,
    wasSaved: false,
    statusMessage: 'No action taken.'
  };
}
