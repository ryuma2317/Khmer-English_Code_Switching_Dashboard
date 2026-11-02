# Data contract and validation (PM-14)

Version 1, 1 November 2026. Technical contract derived from the client review pack, existing synthetic Label Studio fixture, and supplied speech-platform source. Real client sample and business-rule confirmation are still pending under PM-11 and PM-13.

## Source formats

1. Label Studio compatibility: JSON array of numeric task IDs, optional numeric project, data metadata and annotations. `parseLabelStudioExport` validates unknown rows before normalization. It does not accept the native platform's differently shaped exports.
2. Native Speech Annotation Platform per-task JSON: string job_id, filename, template_id, modules and annotation.segments. `validateSpeechPlatformExport` validates this shape independently.
3. Native ASR manifest: one JSON object per recording with recording_id, audio_filepath, domain, speaker_gender and annotations (segments). `validateSpeechAsrManifestRecord` validates one already-decoded row. File/JSONL ingestion and a native-to-dashboard adapter are outside this interface/validator task.
4. Native API: typed job and annotation-response interfaces describe the observed source. Runtime validation helpers cover the two export shapes above, not arbitrary live API responses. Native IDs and Label Studio IDs remain separate.

## Normalized Label Studio records

| Record | Key | Rules |
| --- | --- | --- |
| Project | project_id | Display name, contract version and complete/partial/unknown coverage. |
| Task / TaskRecord | (project_id, task_id) | Audio reference, nullable duration_seconds, separate collector, speaker/topic, source timestamps, import batch and preserved source JSON. |
| Annotation | (project_id, task_id, annotation_id) | Author, cancellation, source timestamps and full result JSON. Selected annotation is derived; it does not replace history. |
| Member | member_id | Anonymized display alias. |
| MemberMapping | (project_id, credit_basis, source_actor_id) | Collector and annotator mappings are separate. |
| Target | (project_id, member_id, basis) | target_seconds null or no record means unset. Zero is explicit and has no percentage. Client confirmation reference remains optional until known. |
| ImportBatch / ImportBatchReport | batch_id | Source rows, accepted unique tasks, rejected rows, duplicates, issues and outcome. project_id is null when unknown or multiple projects are present. |

## Validation and counting

- IDs are non-negative safe integers for Label Studio; no string/boolean/null coercion. Missing project identity requires an explicitly supplied selected project. Native job IDs remain nonblank strings.
- Metadata and annotation/result containers must have the documented shapes. Null annotations/results and mixed nonstring text arrays reject that source row with a row/path-specific error.
- Audio duration is finite, non-negative seconds or null/missing. Negative, infinite and string durations reject the row. Zero is a known explicit duration, distinct from unknown. No duration is inferred from lead_time, which measures effort.
- Missing audio, duration or collector remains a visible warning where the record is otherwise structurally valid. Null duration stays null in storage and is excluded from known-hour sums. Hours equal seconds / 3600.
- Corrupt JSON and an incorrect root fail without returning tasks. A fully rejected nonempty array fails. Partial valid arrays return supported tasks plus rejection details; callers must preview before saving. An empty array yields zero tasks.
- An eligible transcript comes from noncancelled textarea results with nonblank text. Predictions do not count. Select the latest eligible annotation by source updated_at (then created_at), with annotation ID as a stable tie-break. A later blank/cancelled annotation cannot hide earlier valid evidence. This provisional technical rule still needs client confirmation.
- Duplicate task rows compare task source timestamps; newer replaces older. Equal or unavailable timestamps keep the first row and report the duplicate. All validated source snapshots and annotation evidence from duplicate rows are retained; current task fields come from the selected snapshot. Source timestamps are never fabricated from import time. Missing-data summary counts use final unique tasks.
- Parser validation and deduplication are in-memory only. This task does not claim a database, a complete multi-batch import workflow, or the four UI screens. Full fixture/reimport integration belongs to the corresponding import backlog work.

## Native source limitations

Native training exports contain approved tasks only. Native JSON exports omit project identity, measured audio duration, contributor attribution and approval audit. Segment time bounds are not recording duration. A valid schema alone does not prove human completion, approval, full coverage or contribution credit. Do not reuse the Label Studio demo project 42 for native string IDs.

## Verification

From `sprint1_work/dashboard`, run `npm test` for malformed-input, fixture, annotation-selection, unknown-duration, duplicate and native-export checks. Run `npm run typecheck` to check the app consumers. See the [repository README](../README.md) for setup and verification commands and [PM-14](https://soksambath2317.atlassian.net/browse/PM-14) for the published review evidence.
