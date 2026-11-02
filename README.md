# Khmer-English Speech Dataset Progress Dashboard

Sprint 1 foundation for a dashboard supporting the Khmer-English code-switching research team. The supplied Speech Annotation Platform remains responsible for recording, annotation and human review.

## Run the Sprint 1 website

With Node.js and npm installed, run these commands from the repository root:

```powershell
cd sprint1_work/dashboard
npm ci
npm run dev
```

Open the Local URL printed by Next.js, normally http://localhost:3000. If that port is occupied, Next.js selects another available port. Keep the terminal open; press Ctrl+C to stop the server.

The website source, dependency lockfile, synthetic fixture and checks are self-contained in [sprint1_work/dashboard](sprint1_work/dashboard/README.md).

## Delivered in Sprint 1

- A Next.js App Router application using TypeScript and Tailwind CSS.
- Responsive navigation across Overview, Import, Members and Recordings.
- An overview explaining the foundation, plus three explicit feature placeholders.
- Typed data records, runtime validation, a Label Studio compatibility parser and separate native export-shape validators.
- Twenty automated contract tests using synthetic data; a route verification script covers desktop and mobile navigation.
- [Data-contract documentation](docs/DATA_CONTRACT.md) and a [review of the supplied annotation tool](docs/SPEECH_TOOL_REVIEW.md).

File uploading, functional dashboard metrics, member-progress screens, recording search, persistent dataset workflows and native import integration remain later work. The research target and attribution rules still require client confirmation, and a real anonymized export has not yet been verified. The synthetic fixture is demonstration data, not a client dataset.

## Verify

From `sprint1_work/dashboard`:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

With the development server running and Google Chrome installed, use a second terminal in the same folder:

```powershell
npm run verify:routes
```

If the server selected a different port, set its URL before running the route checks:

```powershell
$env:BASE_URL = "http://localhost:3002"
npm run verify:routes
```

Generated route screenshots and results are written to `sprint1_work/evidence` and excluded from Git. Production builds can be served using `npm run start` after `npm run build`.

The Jira project is [Project Management_G4](https://soksambath2317.atlassian.net/jira/software/projects/PM/boards/38). Jira access and a publicly deployed website are separate from publishing this repository.
