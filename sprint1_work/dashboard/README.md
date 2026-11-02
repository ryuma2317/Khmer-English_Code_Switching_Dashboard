# Sprint 1 dashboard foundation

Next.js/TypeScript/Tailwind project with responsive top navigation and four routes. Overview describes the foundation. Import, Members and Recordings are route placeholders reserved for future sprints.

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Open the Local URL printed by Next.js, normally http://localhost:3000. If that port is occupied, Next.js selects another available port. With the server running, `npm run verify:routes` checks the route/navigation foundation on desktop and a 390px mobile viewport using installed Chrome. If necessary, set `$env:BASE_URL = "http://localhost:3002"` to match the server before running the checks. It captures evidence to the ignored `../evidence` folder. The inherited 20 contract tests use the unchanged synthetic fixture.

No operational uploader, analytics, target editor, recording search, persistent dataset UI or automatic demo loading is exposed by this Sprint 1 app. The existing contract/parser files remain the previously completed Sprint 1 foundation. Future feature work is outside this publication. Technical documentation is in the repository's `docs` folder.
