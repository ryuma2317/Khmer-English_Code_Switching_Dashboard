import type {
  LabelStudioAnnotation,
  TaskRecord,
  ImportBatchReport,
  DatasetMetrics,
  MemberProgressSummary,
  Member,
  Target
} from '../types/dataset';
import { validateLabelStudioTask } from './validation';

function transcriptOf(annotation: LabelStudioAnnotation): string | null {
  const text = (annotation.result ?? [])
    .filter(item => item.type === 'textarea')
    .flatMap(item => item.value.text ?? [])
    .join('\n');
  return text.trim() ? text : null;
}

function annotationTime(annotation: { updated_at?: string; created_at?: string }): number {
  return Date.parse(annotation.updated_at ?? annotation.created_at ?? '') || 0;
}

/**
 * Parses and validates Label Studio JSON export string.
 * Enforces CS-02 / CS-05 / CS-06 data contract & deduplication rules.
 */
export function parseLabelStudioExport(
  rawJsonString: string,
  filename: string = 'export.json',
  fallbackProjectId?: number
): { report: ImportBatchReport; tasks: TaskRecord[] } {
  const issues: string[] = [];
  let parsed: unknown;

  try {
    if (fallbackProjectId !== undefined && (!Number.isSafeInteger(fallbackProjectId) || fallbackProjectId < 0)) {
      throw new Error('Selected project ID must be a non-negative safe integer.');
    }
    parsed = JSON.parse(rawJsonString);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid JSON format';
    return {
      report: {
        batch_id: `batch_${Date.now()}`,
        project_id: fallbackProjectId ?? null,
        filename,
        imported_at: new Date().toISOString(),
        total_source_rows: 0,
        unique_tasks_count: 0,
        repeated_rows_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        missing_duration_count: 0,
        unattributed_count: 0,
        status: 'failed',
        issues: [`Failed to parse JSON: ${errorMsg}`]
      },
      tasks: []
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      report: {
        batch_id: `batch_${Date.now()}`,
        project_id: fallbackProjectId ?? null,
        filename,
        imported_at: new Date().toISOString(),
        total_source_rows: 0,
        unique_tasks_count: 0,
        repeated_rows_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        missing_duration_count: 0,
        unattributed_count: 0,
        status: 'failed',
        issues: ['Export root must be a JSON array of tasks.']
      },
      tasks: []
    };
  }

  const rawTasks: unknown[] = parsed;
  const batchId = `batch_${Date.now()}`;
  const seenTaskKeys = new Set<string>();
  const taskMap = new Map<string, TaskRecord>();

  let repeatedCount = 0;
  let rejectedCount = 0;
  let missingDurationCount = 0;
  let unattributedCount = 0;

  rawTasks.forEach((row, index) => {
    const validation = validateLabelStudioTask(row);
    if (!validation.success) {
      rejectedCount++;
      for (const issue of validation.issues) issues.push(`Row ${index + 1}: ${issue.path}: ${issue.message} Record skipped.`);
      return;
    }
    const raw = validation.data;
    const projectId = raw.project ?? fallbackProjectId;
    if (projectId === undefined) {
      rejectedCount++;
      issues.push(`Row ${index + 1}: Missing project identity. Select a project explicitly. Record skipped.`);
      return;
    }
    const taskKey = `${projectId}_${raw.id}`;

    if (seenTaskKeys.has(taskKey)) {
      repeatedCount++;
      issues.push(`Repeated task ID: Task ${raw.id} in project ${projectId}. Reconciled by source timestamp; ties keep the first row.`);
    } else {
      seenTaskKeys.add(taskKey);
    }

    // Extract audio ref
    const audioRef = raw.data?.audio || '';
    if (!audioRef) {
      issues.push(`Task ${raw.id}: Missing audio reference path.`);
    }

    // Extract duration (null if missing)
    const durationSeconds = typeof raw.data?.duration_seconds === 'number' && !isNaN(raw.data.duration_seconds)
      ? raw.data.duration_seconds
      : null;

    if (durationSeconds === null) {
      missingDurationCount++;
      issues.push(`Missing duration: Task ${raw.id}`);
    }

    // Collector attribution
    const collectorId = raw.data.collector_id != null ? String(raw.data.collector_id) : null;
    if (!collectorId) {
      unattributedCount++;
      issues.push(`Unattributed owner: Task ${raw.id}`);
    }

    // Annotation inspection (handle multiple annotations & cancellations)
    const annotations = Array.isArray(raw.annotations) ? raw.annotations : [];
    let isAnnotated = false;
    let selectedTranscript: string | null = null;
    let annotationAuthorId: string | null = null;
    let wasCancelled = false;
    let selectedAnnotationId: number | null = null;

    if (annotations.length > 0) {
      // Find latest valid non-cancelled annotation
      const validAnnotations = annotations.filter((a) => !a.was_cancelled && transcriptOf(a) !== null);
      const cancelledAnnotations = annotations.filter((a) => a.was_cancelled);

      if (validAnnotations.length > 0) {
        const latest = [...validAnnotations].sort((a, b) => annotationTime(b) - annotationTime(a) || b.id - a.id)[0];
        annotationAuthorId = latest.completed_by != null ? String(latest.completed_by) : null;
        selectedTranscript = transcriptOf(latest);
        selectedAnnotationId = latest.id;
        isAnnotated = true;
      } else if (cancelledAnnotations.length === annotations.length) {
        wasCancelled = true;
      }
    }

    const taskRecord: TaskRecord = {
      project_id: projectId,
      task_id: raw.id,
      audio_ref: audioRef,
      duration_seconds: durationSeconds,
      collector_source_id: collectorId,
      speaker_id: raw.data.speaker_id != null ? String(raw.data.speaker_id) : null,
      topic: raw.data?.topic ? String(raw.data.topic) : null,
      source_created_at: raw.created_at || '',
      source_updated_at: raw.updated_at || raw.created_at || '',
      last_import_batch_id: batchId,
      is_annotated: isAnnotated,
      selected_transcript: selectedTranscript,
      annotation_author_id: annotationAuthorId,
      has_multiple_annotations: annotations.length > 1,
      was_cancelled: wasCancelled,
      selected_annotation_id: selectedAnnotationId,
      annotations: annotations.map(a => ({
        project_id: projectId,
        task_id: raw.id,
        annotation_id: a.id,
        source_author_id: a.completed_by != null ? String(a.completed_by) : null,
        was_cancelled: a.was_cancelled ?? false,
        source_created_at: a.created_at ?? null,
        source_updated_at: a.updated_at ?? null,
        original_result_json: a.result ?? [],
      })),
      original_source_json: raw,
      source_snapshots: [raw],
    };

    // Store or update in taskMap (latest replaces older while preserving unique key)
    const previous = taskMap.get(taskKey);
    const selectedTask = !previous || annotationTime(raw) > annotationTime(previous.original_source_json)
      ? taskRecord : previous;
    const annotationEvidence = new Map((previous?.annotations ?? []).map(a => [a.annotation_id, a]));
    for (const incoming of taskRecord.annotations) {
      const existing = annotationEvidence.get(incoming.annotation_id);
      if (!existing || (Date.parse(incoming.source_updated_at ?? incoming.source_created_at ?? '') || 0)
        > (Date.parse(existing.source_updated_at ?? existing.source_created_at ?? '') || 0)) {
        annotationEvidence.set(incoming.annotation_id, incoming);
      }
    }
    taskMap.set(taskKey, {
      ...selectedTask,
      annotations: Array.from(annotationEvidence.values()),
      has_multiple_annotations: annotationEvidence.size > 1,
      source_snapshots: [...(previous?.source_snapshots ?? []), raw],
    });
  });

  const uniqueTasks = Array.from(taskMap.values());
  // Warnings describe source rows; these summary counts describe deduplicated tasks.
  missingDurationCount = uniqueTasks.filter(task => task.duration_seconds === null).length;
  unattributedCount = uniqueTasks.filter(task => task.collector_source_id === null).length;

  const report: ImportBatchReport = {
    batch_id: batchId,
    project_id: uniqueTasks.length === 0 ? fallbackProjectId ?? null
      : new Set(uniqueTasks.map(task => task.project_id)).size === 1 ? uniqueTasks[0].project_id : null,
    filename,
    imported_at: new Date().toISOString(),
    total_source_rows: rawTasks.length,
    unique_tasks_count: uniqueTasks.length,
    repeated_rows_count: repeatedCount,
    accepted_count: uniqueTasks.length,
    rejected_count: rejectedCount,
    missing_duration_count: missingDurationCount,
    unattributed_count: unattributedCount,
    status: uniqueTasks.length === 0 && rejectedCount > 0 ? 'failed' : 'completed',
    issues
  };

  return { report, tasks: uniqueTasks };
}

/**
 * Calculates high-level dataset metrics from stored tasks.
 */
export function calculateDatasetMetrics(tasks: TaskRecord[]): DatasetMetrics {
  let totalKnownSeconds = 0;
  let missingDurationCount = 0;
  let completedCount = 0;
  let completedKnownSeconds = 0;
  let completedMissingDuration = 0;
  let unannotatedCount = 0;
  let cancelledCount = 0;
  let unattributedCount = 0;

  for (const task of tasks) {
    if (task.duration_seconds !== null) {
      totalKnownSeconds += task.duration_seconds;
    } else {
      missingDurationCount++;
    }

    if (!task.collector_source_id) {
      unattributedCount++;
    }

    if (task.is_annotated) {
      completedCount++;
      if (task.duration_seconds !== null) {
        completedKnownSeconds += task.duration_seconds;
      } else {
        completedMissingDuration++;
      }
    } else if (task.was_cancelled) {
      cancelledCount++;
    } else {
      unannotatedCount++;
    }
  }

  return {
    total_tasks: tasks.length,
    total_known_seconds: totalKnownSeconds,
    total_known_hours: Number((totalKnownSeconds / 3600).toFixed(4)),
    missing_duration_tasks_count: missingDurationCount,

    completed_tasks_count: completedCount,
    completed_known_seconds: completedKnownSeconds,
    completed_known_hours: Number((completedKnownSeconds / 3600).toFixed(4)),
    completed_missing_duration_count: completedMissingDuration,

    unannotated_tasks_count: unannotatedCount,
    cancelled_tasks_count: cancelledCount,
    unattributed_tasks_count: unattributedCount
  };
}

/**
 * Computes individual member progress against configurable targets.
 */
export function calculateMemberProgress(
  tasks: TaskRecord[],
  members: Member[],
  targets: Target[],
  basis: 'collector' | 'annotator' = 'collector'
): { memberSummaries: MemberProgressSummary[]; unattributedSeconds: number; unattributedTasks: number } {
  const memberSecondsMap = new Map<string, number>();
  const memberTasksMap = new Map<string, number>();

  // Initialize all known members
  for (const m of members) {
    memberSecondsMap.set(m.member_id, 0);
    memberTasksMap.set(m.member_id, 0);
  }

  let unattributedSeconds = 0;
  let unattributedTasks = 0;

  for (const task of tasks) {
    const actorId = basis === 'collector' ? task.collector_source_id : task.annotation_author_id;

    if (!actorId) {
      unattributedTasks++;
      if (task.duration_seconds !== null) {
        unattributedSeconds += task.duration_seconds;
      }
      continue;
    }

    // Check if actor maps to a known member
    const matchedMember = members.find(
      (m) => m.member_id.toLowerCase() === actorId.toLowerCase() || m.display_alias.toLowerCase() === actorId.toLowerCase()
    );

    if (matchedMember) {
      const currentSec = memberSecondsMap.get(matchedMember.member_id) || 0;
      const currentTasks = memberTasksMap.get(matchedMember.member_id) || 0;
      const addedSec = task.duration_seconds !== null ? task.duration_seconds : 0;

      memberSecondsMap.set(matchedMember.member_id, currentSec + addedSec);
      memberTasksMap.set(matchedMember.member_id, currentTasks + 1);
    } else {
      unattributedTasks++;
      if (task.duration_seconds !== null) {
        unattributedSeconds += task.duration_seconds;
      }
    }
  }

  const summaries: MemberProgressSummary[] = members.map((member) => {
    const seconds = memberSecondsMap.get(member.member_id) || 0;
    const hours = Number((seconds / 3600).toFixed(4));
    const target = targets.find((t) => t.member_id === member.member_id
      && t.basis === (basis === 'collector' ? 'collected_hours' : 'annotated_hours'));
    const targetHours = target?.target_seconds != null ? Number((target.target_seconds / 3600).toFixed(2)) : null;

    let percentage: number | null = null;
    if (targetHours && targetHours > 0) {
      percentage = Math.min(100, Number(((hours / targetHours) * 100).toFixed(1)));
    }

    return {
      member_id: member.member_id,
      display_alias: member.display_alias,
      owned_tasks_count: memberTasksMap.get(member.member_id) || 0,
      known_seconds: seconds,
      known_hours: hours,
      target_hours: targetHours,
      percentage
    };
  });

  return { memberSummaries: summaries, unattributedSeconds, unattributedTasks };
}
