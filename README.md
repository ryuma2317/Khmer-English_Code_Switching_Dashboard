# Khmer-English Speech Dataset Progress Dashboard

Sprint 2 delivers native JSON/JSONL and explicit Label Studio compatibility imports, preview/confirm/cancel, validation recovery and atomic browser-local persistence. The Speech Annotation Platform remains responsible for collection, annotation and human approval. The member target is 10 hours of **approved annotated audio**; unknown duration or approval never establishes eligible hours.

## Run

```powershell
cd sprint1_work/dashboard
npm ci
npm run dev -- --port 3132
```

Open http://localhost:3132/import. The native example is synthetic. Review the preview and confirm before anything is stored. Imports are browser-local; another browser/device/origin has a separate workspace. Keep original exports for recovery.

## Verify

```powershell
npm test
npm run typecheck
npm run build
# With the development server and Chrome available:
node scripts/verify-sprint2.cjs
```

See [integration scope, observed tests and remaining acceptance](docs/SPRINT2_INTEGRATION_AND_VERIFICATION.md). Members, recording search, theme filtering and progress screens remain future work. Representative real-export reconciliation and actual client review are still pending. Teammate ceremony documents are retained with explicit evidence qualifications.

The integration branch targets dev. Jira: [Project Management_G4](https://soksambath2317.atlassian.net/jira/software/projects/PM/boards/38).
