# Sprint 2 integration and verification — 18 November 2026

This increment delivers browser-local import, preview, explicit confirmation/cancellation, recovery and persistence. It integrates the original teammate histories from feat/sprint2-mai-sreynuth (1cf2aa89), docs/pm-32-client-questionnaire (91bfdeb5) and test/malformed-fixtures (d48d0f01), with integration corrections. Matching workspace/import code was adapted from the previously prepared archive. Members, recording search, theme filtering and progress dashboard screens remain future work.

## Confirmed owner policy

The target is 10 hours of approved annotated audio for each member. Submitted, draft, rejected, unknown approval and unknown duration do not establish eligible hours. Source coverage marked approved-only does not itself prove per-record approval. The supplied Speech Annotation Platform is primary; Label Studio is an explicitly selected compatibility format. No real audio is uploaded or fetched by this increment. Synthetic examples are labelled as examples.

## Corrections

Native JSON and JSONL share the normalized adapter; blank-line JSONL errors preserve physical line locations. Missing source values stay unknown instead of fabricated IDs/timestamps/audio. Partial imports need acknowledgement; zero supported records cannot be confirmed. Source checksums use canonical LF bytes; reconciliation compares expected completion and does not accept failed-source zero totals. The old pure recovery helper prepares a candidate and cannot report a persisted save.

IndexedDB stores one versioned snapshot transactionally. State publishes after transaction completion. Quota/abort and stale-tab writes preserve the prior/newer snapshot. Corrupt hydration remains visible until reload or explicit reset. Reset uses a revisioned empty snapshot to prevent stale tabs resurrecting cleared records.

## Executed verification

61 unit/contract tests passed. Type checking and the production build passed. Chrome browser checks passed 12/12 with no uncaught page errors. These checks use generated/synthetic fixtures and fault injection, not client data or human approval.

| Browser scenario | Result |
| --- | --- |
| PM-55 keyboard file selection, cancel and row preview | PASS |
| PM-55 drop input and unsupported/oversize file rejection | PASS |
| PM-54 native approval is distinct from submitted/unknown, with persisted records | PASS |
| PM-58/59 invalid candidate is blocked and corrected retry preserves old snapshot | PASS |
| PM-58 partial JSONL requires acknowledgement and reports physical line 3 | PASS |
| PM-60/61 quota failure preserves saved snapshot and candidate supports retry | PASS |
| PM-60 aborted transaction is atomic | PASS |
| PM-60 stale-tab writes cannot replace newer state | PASS |
| PM-61 corrupt hydration stays visible without silent replacement | PASS |
| PM-62 Cancel and Escape preserve data; confirmed reset cannot be undone by a stale tab | PASS |
| PM-62 5000-record import save and reload retain settings with measured timings | PASS |
| PM-55 mobile import layout and controls remain usable | PASS |

The 5,000-record fixture was 620,001 source bytes: preview 416 ms, save 213 ms, reload 1,224 ms in this local development run. These are observed measurements, not service guarantees. Upload limit is 20 MiB. Available browser storage depends on the device/browser; quota failures preserve the previous snapshot. Mobile width 390 px had no horizontal overflow. Settings, selected project and batch history survived reload; reset Cancel/Escape preserved state and Confirm cleared it.

## Remaining acceptance

PM-54 and PM-63 still need a permitted representative native export, its independent expected totals/checksum and an actual import/reload comparison. PM-57 retains unresolved fixture-policy decisions in its original EXPECTED.md. PM-52/PM-64 and other client events need actual attendance/decisions. Technical implementation can be reviewed against the evidence here; no second team member's signature or client approval is invented. Jira technical items are handed to In Review until the prescribed member review is recorded.

## Run and reproduce

From sprint1_work/dashboard, run npm ci, then npm run dev -- --port 3132. Open http://localhost:3132/import. Select Preview native example, inspect approval/duration/coverage, confirm, then reload. Clear only the synthetic workspace before using an actual export.

Run npm test, npm run typecheck and npm run build. With the development server running and Chrome installed, run node scripts/verify-sprint2.cjs (BASE_URL can override http://localhost:3132). That script creates a fresh isolated browser context and does not clear the user's existing browser workspace. Results/screenshots are generated under dashboard/.tmp/sprint2-browser. No authentication secrets or actual research records are required.
