# Supplied Speech Annotation Platform review

Reviewed 1 November 2026 from `speech_annotation-main.zip`. Static source review only; the platform was not installed, started, or connected to model services. Source is not an anonymized client dataset or an interview.

## What the tool does

The ZIP contains a standalone FastAPI backend, React/Vite frontend, PostgreSQL production storage, SQLite development/test support, and Docker Compose setup. The README describes access groups and super-admin, project-owner, annotator, reviewer, and developer workspaces. It is not a Label Studio plugin.

Projects support ASR, diarization, classification, SLU, keyword spotting and event joining. Owners upload recordings or collect clips from links, assign annotators and reviewers, and inspect work progress. ASR can use demo/manual or configured model services. Model output is a draft; human corrections and approval are separate.

Code-switching configuration is project-specific. `app/task_contracts.py:completion_errors` requires text for every ASR segment, and a configured language for every segment when code switching is enabled. Diarization and other enabled modules have their own completion rules.

## Integration findings

| Topic | Source evidence | Consequence for this dashboard |
| --- | --- | --- |
| Stable identity | `app/api/jobs.py` creates UUID string job IDs; `app/storage.py` stores string project IDs | Native IDs must not be coerced to Label Studio numeric IDs. |
| Human state | `app/api/annotations.py:update_annotation_status` uses draft, submitted, approved, rejected | Keep these separate from queued/processing/imported machine states and from progress labels. |
| Approval evidence | The status endpoint records actor, role, timestamp and action in `annotation_audit` | Do not infer approval from assigned reviewer or `review_status=completed` alone; that progress field has a separate endpoint. |
| Canonical annotation | `app/services/annotations.py:annotation_document` merges saved corrections over baseline | Use saved annotation documents, not generated baseline segments as completed human work. |
| Per-task export | `app/api/annotations.py:export_annotation` returns job_id, filename, template_id, modules and annotation | Different from Label Studio's task array. Project ID, measured duration and approval audit are absent. |
| Project export | `app/services/exports.py` writes dataset.json, audio-map.jsonl, ASR manifest, full annotation JSONL and RTTM | One ASR manifest line is one recording; its annotations array contains segments, not independent recordings. |
| Export population | `prepare_export_records` selects only annotation_status=approved; API export also filters approved | Training exports cannot establish total imported recordings or pending work. A full snapshot/API source is needed for those metrics. |
| Duration | `app/services/audio.py:waveform_summary` yields task.data.audio_duration in seconds | This field can be absent on probe failure. ASR manifest has no full-recording duration. Neither max(segment.end) nor sum(end-start) proves audio length. |
| Contributor identity | Jobs retain annotator/reviewer assignment IDs; collections have submitted_by_user_id | Assignment is not authorship; collection submitter is not the video's source uploader. Client must approve the credit mapping. |
| Collection duration | `collection_jobs.duration_seconds` describes source media | Do not repeat source-video duration for every generated clip. |
| Pagination | `GET /api/projects/{id}` returns jobs and jobs_page; `GET /api/jobs` uses limit/offset | Retrieve all permitted pages before claiming complete coverage. Defaults are not a full dataset. |
| Existing analytics | `app/storage.py:annotator_statistics`, task lists, review filters and frontend statistics | Validate the remaining reporting gap before committing to a separate dashboard. |

## Recommended first integration

Keep annotation, audio collection, AI drafts and review inside the supplied platform. The dashboard remains a progress/reporting product. Use a client-approved offline snapshot containing all recording jobs, measured durations, canonical annotation responses, and role/collection evidence, or implement an authenticated read-only connector in a later integration task. Never embed credentials or media tokens in demonstration data.

PM-14 now defines and validates the native per-task JSON and ASR manifest row shapes. These helpers do not implement a live connector, parse ZIP archives, import JSONL files into the app, or prove an export's provenance. The existing app parser remains the Label Studio compatibility path. Those integration features need separately scoped implementation and a real sample.

## Decisions still requiring the client

Confirm the deployed version, whether this replaces Label Studio, the reporting gap, a sample format with unfinished tasks, the ten-hour quantity/stage/population, collector versus annotator credit, real duration access, code-switching languages and demonstration access. The client questionnaire is published on [PM-32](https://soksambath2317.atlassian.net/browse/PM-32).

Earlier documents describe Label Studio and conflict about whether the ten-hour target is already confirmed. The source ZIP verifies tool capabilities, not the advisor's requirement. No client approval has been inferred.
