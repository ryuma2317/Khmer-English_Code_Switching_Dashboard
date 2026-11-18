# Client discovery questionnaire (PM-32)

Prepared 1 November 2026 for PM-11. Status: prepared for interview; no answers or approvals are claimed.

Purpose: confirm the research team's actual progress-tracking need, target definition, contribution credit, and source data before finalizing dashboard metrics.

Sources: `Client_Review_Tasks_1_3.pdf` pages 2-3 and 8; the supplied `speech_annotation-main.zip`, reviewed in `docs/SPEECH_TOOL_REVIEW.md`.

## Meeting details

Record the date, attendees, representative's name and role, agreed contact channel, advisor involvement, and who can approve requirements. Ask permission before recording the conversation. Use anonymized sample data.

## Questions and evidence to capture

| # | Ask the representative | Record as evidence |
| --- | --- | --- |
| 1 | Who represents the capstone team and can confirm requirements? Who will use the dashboard? | Named representative, role, contact, users, advisor review cadence. |
| 2 | Please show how you track collected, annotated, and approved audio today. Which step takes the most manual work? | Tools, one reporting example, specific difficulty, current workaround. |
| 3 | The supplied Speech Annotation Platform already has task lists, review states, and contributor statistics. What question does it still fail to answer? | A concrete missing decision/report; whether a separate dashboard or a platform extension is useful. |
| 4 | What does the advisor's 10-hour requirement mean: collected audio, submitted transcripts, approved audio, or work time? Is it per person or a shared team goal? | Exact quantity, unit, population, stage, approving person/date. Keep unset until confirmed. |
| 5 | If one student collects a recording and another transcribes it, who gets credit? What about multiple annotators, reassignment, or reused clips? | One credit rule per metric, attribution source, examples that reconcile without double credit. |
| 6 | Are AI drafts eligible? What makes a transcript complete, and does it need reviewer approval? | Required modules, every-segment text/language rules, cancellation/rejection handling. Separate machine processing from human approval. |
| 7 | Which languages and codes will you use for Khmer-English segments? Must every segment have a language and speaker? | Configured language codes, code-switching rules, required versus optional metadata. |
| 8 | Is the supplied platform replacing Label Studio? Which version/deployment and export will we actually receive? | Confirmed tool/version, representative anonymized JSON/JSONL, configuration, sample owner and delivery date. |
| 9 | Can the source include draft, submitted, rejected, and approved recordings? Platform training exports contain approved recordings only; how will we obtain the remaining workload? | Full/partial/unknown coverage, all API pages or agreed offline snapshot, accessible fields and permissions. |
| 10 | Where is each recording's measured audio duration? Can we obtain the task's audio_duration or probe accessible audio? | Duration field/unit and availability. Do not substitute segment endpoints, annotation effort, or collection source-video length. |
| 11 | How can we identify the real collector and annotator? Is the assigned annotator always the person who did the work? | Stable IDs, mapping examples, collection submitter evidence, reassignment policy; unresolved IDs remain unattributed. |
| 12 | How should corrected exports, duplicate IDs, older snapshots, and missing rows be handled? | Stable project/recording keys, revision/conflict policy, partial exports retain absent tasks. |
| 13 | Do the four proposed views meet the need: Import, Overview, Members, Recordings? What is the minimum useful result? | Scope decisions and exclusions: dashboard does not implement recording, annotation editing, ASR, or model training. |
| 14 | Please find total known hours, a member's target, and a recording missing information in the proposed designs. | Observed walkthrough result, confusing labels, requested changes; no invented success rate. |
| 15 | How will the client and teacher access the demonstration? What sample size and laptop/environment should we use? | Local/private access, anonymization, actual limits, responsibilities and dates. |
