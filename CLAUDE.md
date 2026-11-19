# PwnPoint: conventions for contributors and agents

PwnPoint turns pentest findings (CVSS 3.1 + screenshot evidence) into client-ready slides
and chains them into attack scenarios. It ships as **one standalone HTML file** opened
from disk (`file://`). Supported browsers: Chrome, Edge, Firefox (all first-class).

## Local-only rules (non-negotiable, checked in CI)

- No runtime network access: no backend, API, analytics, telemetry, error reporting, CDN,
  web fonts, remote images or update checks. Everything is inlined into the HTML file.
- CSP (hash-based, injected at build): `default-src 'none'`, scripts and styles allowed only
  by SHA-256 hash, `img-src blob: data:`, `connect-src 'none'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'none'`. No inline event handlers, no `eval`, no
  `new Function`, no `innerHTML` with user data.
- Data lives in the browser (IndexedDB, encrypted at rest by default) and in mission
  files (`.pwnp`) the user saves to disk. `localStorage` is for UI preferences only.
- Every imported image is re-encoded through a canvas to strip metadata.
- References/URLs typed by the user are stored as text and never fetched.

## Supply chain

- Keep dependencies minimal; prefer a small in-house utility over a package.
  Justify every new dependency in the PR description.
- `.npmrc` sets `ignore-scripts=true` and `save-exact=true`. Commit `package-lock.json`.
  Install with `npm ci`.
- Pin GitHub Actions by full commit SHA (tag in a comment). Give workflows least-privilege
  `permissions:`. Dependabot updates npm and actions weekly.

## Workflow (trunk-based)

- `main` is always releasable and protected (PR + green `ci` check, linear history).
- Short-lived branches (< 1 day): `feat/…`, `fix/…`, `chore/…`. PRs ideally < 400 changed
  lines (lock file excluded). Squash-merge, delete the branch.
- Conventional Commits for commit messages and PR titles (`feat:`, `fix:`, `chore:`, …).
- Unfinished features are merged behind flags in `src/flags.ts`, never on long-lived branches.
- PR description: what changed, how it was tested, screenshots for UI changes.
- The maintainer reviews and merges every PR. Start the next slice from an up-to-date `main`.

## Definition of done (per PR)

CI green; new logic has tests; no new network calls; dependencies justified; README updated
when behaviour changes.

## Commands

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm ci`            | Install exactly what the lock file pins   |
| `npm run dev`       | Dev server (no CSP, for development only) |
| `npm run lint`      | ESLint + Prettier check                   |
| `npm run format`    | Prettier write                            |
| `npm run typecheck` | `tsc --noEmit` (strict)                   |
| `npm test`          | Vitest unit tests                         |
| `npm run build`     | Production build into `dist/`             |

## Layout

- `src/flags.ts`: feature flags.
- `src/cvss/`: pure CVSS 3.1 module (milestone 1).
- Pure logic lives in plain `.ts` modules with colocated `*.test.ts` files; UI in `.tsx`.
