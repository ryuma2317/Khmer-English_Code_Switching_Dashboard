# Malformed-input fixtures: expected outcomes

These fixtures are kept apart from the existing fixture `../synthetic_edge_cases.json`, which is unchanged. No parser or validation code was modified. All data is synthetic and anonymized. Label Studio cases use projects `900` and `901`, not the demo project `42`. Native cases use `job-synth-*` and `rec-synth-*` IDs. Contributors are `member_*` and `annotator_*` aliases.

**Source of truth:** [`docs/DATA_CONTRACT.md`](../../../../docs/DATA_CONTRACT.md) v1, dated 1 Nov 2026. Expected outcomes come from the contract. They do not come from running the parser. `SAMPLE_PREPARATION.md` does not exist in the repo, so nothing here is based on it. When the contract does not settle a case, the outcome is **NEEDS DECISION** instead of a guess.

## Supported input shapes (from the contract)

| Shape tag | Contract source format | Root | Identity |
| --- | --- | --- | --- |
| **LS** | 1. Label Studio compatibility export | JSON **array** of tasks | Numeric `id` (non-negative safe integer), optional numeric `project` |
| **Native** | 2. Native Speech Annotation Platform per-task JSON | One JSON **object** with `job_id`, `filename`, `template_id`, `modules`, `annotation.segments` | `job_id`, a nonblank string |
| **Manifest** | 3. Native ASR manifest, one JSON object per recording | One record per line (JSONL) | `recording_id`, a native string ID |

The contract does not define these shapes:
- **CSV, TXT or any other format.** Only the formats above are supported.
- **Duration in native exports.** The contract says they omit measured duration, so the bad-duration cases apply to **LS only**.
- **Segments in Label Studio data.** The LS shape has textarea results, not time segments, so the bad-segment cases apply to **Native only**.

## Conventions

- **Reject file**: the import fails and returns 0 tasks or records.
- **Accepted / rejected counts**: valid rows are returned and invalid rows are skipped with a reason. A partial result must be previewed before saving.
- **Error reference**: LS rows are 1-based array positions (`row 2`). JSONL lines are 1-based line numbers (`line 3`). Native errors are field paths (`export.annotation.segments[1]`). Syntax errors give a 1-based `line:column`.

## Expected outcomes

| File | Shape | What's broken | Expected outcome | Expected error reference |
| --- | --- | --- | --- | --- |
| `syntax_missing_comma.json` | LS | JSON syntax error: no comma after `"duration_seconds": 30`. | **Reject file**: corrupt JSON. | line 8, column 7 (the `"collector_id"` key) |
| `syntax_truncated.json` | LS | JSON syntax error: the file stops inside a string in the second task. | **Reject file**: corrupt JSON. Task 1 is not salvaged. | line 18, column 39 (end of input inside an unterminated string) |
| `empty_file.json` | Any | 0-byte file. | **Reject file**: corrupt JSON (empty input). | whole file (line 1, column 1) |
| `empty_array.json` | LS | *(Boundary control)* `[]`. | **Not a failure. Accepted 0, rejected 0.** The contract says "an empty array yields zero tasks". | none |
| `empty_array.json` | Native | `[]` where a per-task object is expected. | **Reject file**: wrong root (an array, not an object). | root |
| `empty_object.json` | LS | `{}` where an array is expected. | **Reject file**: the root must be an array of tasks. | root |
| `empty_object.json` | Native | `{}`: every required field is missing. | **Reject file** (one document): missing fields. | `export.job_id`, `export.modules`, `export.annotation` |
| `root_string.json` | Any | The root is the string `"tasks"`. | **Reject file**: wrong root type. | root |
| `root_number.json` | Any | The root is the number `42`. | **Reject file**: wrong root type. | root |
| `root_object.json` | LS | Wrong object shape: the tasks are wrapped in `{"tasks": [...]}`. | **Reject file**: the root must be an array. The wrapper is not unwrapped. | root |
| `native_root_array.json` | Native | A valid native document wrapped in an array. | **Reject file**: a per-task export is a single object. | root |
| `id_missing.json` | LS | The task has no `id`. | **Reject file**: the one row is rejected, so the nonempty array is fully rejected. Accepted 0, rejected 1. | row 1 `task.id` |
| `id_invalid.json` | LS | Non-numeric or invalid IDs: `"101"`, `-1`, `1.5`, `true`, `null`, `9007199254740992`, and project `"900"`. | **Reject file**: no ID is coerced. Accepted 0, rejected 7. | rows 1–6 `task.id`, row 7 `task.project` |
| `id_duplicate.json` | LS | Duplicate keys: (900,7) twice with the second newer, (900,8) twice with equal timestamps, (900,9) twice with no timestamps, plus (901,7). | **Accepted 4, rejected 0, 3 duplicates reported.** (900,7) keeps row 2 (duration 35). (900,8) keeps row 3 (40). (900,9) keeps row 5 (20). (901,7) is a separate task. All 7 snapshots are kept. Batch `project_id` is `null` because two projects are present. | duplicates at rows 2, 4 and 6 (notices, not errors) |
| `native_id_missing.json` | Native | `job_id` is missing. | **Reject file** (one document). | `export.job_id` |
| `native_id_nonstring.json` | Native | `job_id` is the number `1012`. | **Reject file**: native job IDs must be nonblank strings. The number is not coerced. | `export.job_id` |
| `manifest_id_duplicate.jsonl` | Manifest | `recording_id` `rec-synth-0031` appears on lines 1 and 2. | **NEEDS DECISION**: the contract's duplicate rule covers LS tasks only. Both lines are individually valid. | lines 1 and 2 |
| `project_missing.json` | LS | 2 valid tasks with no `project`. | **If no project is selected: reject file** (accepted 0, rejected 2). **If a project is selected: accepted 2**, both assigned to that project. | rows 1 and 2 (missing project identity) |
| `container_invalid.json` | LS | 10 rows, each with one container in the wrong place or the wrong shape. | **Reject file**: accepted 0, rejected 10. | row 1 `task.data` (array) · row 2 `task.data` (null) · row 3 `task.data` (missing) · row 4 `task.annotations` (object) · row 5 `task.annotations` (null) · row 6 `task.annotations[0]` (null) · row 7 `task.annotations[0].result` (null) · row 8 `task.annotations[0].result` (object) · row 9 `task.annotations[0].result[0].value.text` (mixed array) · row 10 `task.annotations[0].result[0].value` (null) |
| `native_container_invalid.json` | Native | `segments` sits at the root instead of under `annotation`, and `annotation` is `{}`. | **Reject file** (one document). Segments are not read from the wrong location. | `export.annotation.segments` |
| `duration_negative.json` | LS | `duration_seconds: -12.5`. | **Reject file**: accepted 0, rejected 1. The value is not clamped or turned into null. | row 1 `task.data.duration_seconds` |
| `duration_string.json` | LS | `duration_seconds: "60"`. | **Reject file**: accepted 0, rejected 1. The string is not coerced. | row 1 `task.data.duration_seconds` |
| `duration_nan_literal.json` | LS | `duration_seconds: NaN` as a bare token. | **Reject file as corrupt JSON**: strict JSON has no `NaN` token, so this fails before any row is checked. | line 2, column 109 |
| `duration_infinite.json` | LS | `duration_seconds: 1e999` is valid syntax but decodes to Infinity. | **Reject file**: accepted 0, rejected 1. Infinite durations reject the row. | row 1 `task.data.duration_seconds` |
| `native_segment_start_after_end.json` | Native | `segments[1]` has start 4.0 and end 3.0. | **NEEDS DECISION**: the contract states no segment-bound rule. | `export.annotation.segments[1]` |
| `native_segment_overlap.json` | Native | The same speaker has `seg-1` at 0.0–3.0 and `seg-2` at 2.0–4.5. | **NEEDS DECISION**: the contract has no overlap rule. Accept, warn or reject? Does same-speaker overlap differ from cross-speaker overlap? | `export.annotation.segments[0]` and `[1]` |
| `native_segment_empty_list.json` | Native | `annotation.segments` is `[]`. | **NEEDS DECISION**: the contract does not say whether a document with no segments is valid. | `export.annotation.segments` |
| `native_segment_empty_text.json` | Native | `segments[1].text` is `""`. | **NEEDS DECISION**: the contract does not say whether an empty segment transcript is valid. | `export.annotation.segments[1].text` |
| `manifest_one_broken_line.jsonl` | Manifest | 5 lines. Line 3 is missing its closing `}`. | **Line 3 is undecodable and rejected.** Lines 1, 2, 4 and 5 are valid records. **File-level outcome: NEEDS DECISION**, because the contract says "File/JSONL ingestion … outside this interface". It is not defined whether to reject the whole file or accept 4 and reject 1. | line 3 |
| `one_valid_one_invalid.json` | LS | Row 1 is valid. Row 2 has `duration_seconds: -5`. | **Accepted 1, rejected 1.** The partial result needs a preview before saving. Known hours = 30 / 3600. | row 2 `task.data.duration_seconds` |
| `manifest_one_valid_one_invalid.jsonl` | Manifest | Line 1 is valid. Line 2 has `recording_id: 22` (a number). | **Line 2 is rejected**: native IDs are strings. **File-level outcome: NEEDS DECISION**, for the same JSONL-ingestion reason as above. The candidates are accept 1 / reject 1, or reject the whole file. | line 2 `record.recording_id` |
| `unsupported_format.csv` | none | CSV is not a contract source format. | **Reject file: unsupported format.** Columns are not mapped to fields. | whole file |
| `unsupported_format.txt` | none | Plain pipe-separated text, not a contract source format. | **Reject file: unsupported format.** | whole file |

## Contract rules used

From *Validation and counting* in `DATA_CONTRACT.md`:

1. Label Studio IDs are non-negative safe integers, with no string, boolean or null coercion. Native job IDs are nonblank strings. A missing project requires a project the user selects explicitly.
2. Metadata, annotation and result containers must have the documented shape. Null annotations or results, and mixed non-string text arrays, reject that row with a row- and path-specific error.
3. Duration must be finite and non-negative, or null or missing. Negative, infinite and string durations reject the row.
4. Corrupt JSON and an incorrect root fail without returning tasks. A nonempty array where every row is rejected fails. A partial array returns the valid tasks plus rejection details and must be previewed. An empty array yields 0 tasks.
5. For duplicate tasks, the newer source timestamp wins. With equal or missing timestamps, the first row is kept and the duplicate is reported. All snapshots are kept.

From *Source formats*: format 3 validates one already-decoded row. File and JSONL ingestion is out of scope.

## NEEDS DECISION summary

1. **Segment bounds**: should `start >= end` be rejected? What about `start == end` or a negative start? The code currently checks `0 <= start < end`, but the contract text does not say this.
2. **Segment overlap**: should same-speaker overlap and cross-speaker overlap be accepted, warned about or rejected?
3. **Empty segments**: is an empty segment list valid? Is an empty segment `text` valid?
4. **JSONL file policy**: does one bad line reject the whole file, or only that line?
5. **Duplicate native IDs**: how should a repeated `recording_id` or `job_id` be handled?
6. **Format detection**: should format be detected by extension, by content, or both? What message should unsupported files show?

## Note for git

The repo `.gitignore` excludes `*.csv`. To commit `unsupported_format.csv`, run `git add -f` or add a negation rule such as `!fixtures/malformed/*.csv`.
