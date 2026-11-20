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
- Short-lived branches (< 1 day): `feat/…`, `fix/…`, `chore/…`. Each PR delivers a whole, usable
  feature (maintainer's choice); size is secondary. Split only parts that stand on their own.
  Squash-merge, delete the branch.
- Conventional Commits for commit messages and PR titles (`feat:`, `fix:`, `chore:`, …).
- Unfinished features are merged behind flags in `src/flags.ts`, never on long-lived branches.
- PR description: what changed, how it was tested, screenshots for UI changes.
- The maintainer reviews and merges every PR. Start the next slice from an up-to-date `main`.

## Delivery

- Merges to `main` deploy `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).
- Release: bump `version` in `package.json` in a PR and merge it. Then either push tag `vX.Y.Z`
  on `main`, or run the Release workflow manually on `main` (Actions → Release → Run workflow),
  which creates the tag itself. `.github/workflows/release.yml` checks the version, runs every
  check and publishes `pwnpoint-vX.Y.Z.html`, `SHA256SUMS` and a build provenance attestation.

## Definition of done (per PR)

CI green; new logic has tests; no new network calls; dependencies justified; README updated
when behaviour changes.

## Commands

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `npm ci`             | Install exactly what the lock file pins                          |
| `npm run dev`        | Dev server (no CSP, for development only)                        |
| `npm run lint`       | ESLint + Prettier check                                          |
| `npm run format`     | Prettier write                                                   |
| `npm run typecheck`  | `tsc --noEmit` (strict)                                          |
| `npm test`           | Vitest unit tests                                                |
| `npm run build`      | Build the single file `dist/index.html`                          |
| `npm run check:urls` | Fail on URLs in `dist/` not in `scripts/url-allowlist.json`      |
| `npm run test:e2e`   | Playwright on the built file over `file://` (Chromium + Firefox) |

## Layout

- `src/flags.ts`: feature flags.
- `tools/single-file.ts`: build plugin that inlines all JS/CSS and injects the hash-based CSP.
- `tests/e2e/fixtures.ts`: the local-only guard. Every e2e test fails if a request leaves the
  device, a CSP violation fires or a page error occurs. Always import `test` from there.
- Node-side code (tools, tests, scripts, configs) is typechecked with `tsconfig.node.json`;
  app code in `src/` with `tsconfig.json` (no Node types).
- `src/cvss/`: pure CVSS 3.1 module (`cvss31.ts`), FIRST definitions and the calculator UI.
- `src/ui/`: shared UI helpers (e.g. radio-group keyboard model).
- `src/storage/crypto.ts`: encryption at rest (PBKDF2 → wrapped AES-GCM data key, per-record AAD).
- `src/storage/schema.ts`: IndexedDB schema. `MIGRATIONS[n]` upgrades version n → n+1; never edit a
  released migration, append one.
- `src/storage/vault.ts`: the only way to read/write user data (setup / locked / ready, seals records).
- `src/storage/VaultGate.tsx`: first-run setup, unlock screen; renders the app only when ready.
  e2e tests start with `openWithNewVault(page)` from the fixtures.
- `src/text/markdownLite.ts`: the only free-text formatting (bold, code, bullets) → a tree, never
  HTML. Render it with `<MarkdownLite>`. ESLint bans `dangerouslySetInnerHTML`, `innerHTML` & co.
- `src/findings/`: finding model (`VLN.NN` refs, effective severity, filters) and repository on
  the vault. Finding numbers come from a per-project counter and are never reused.
- `src/findings/FindingsPage.tsx`, `FindingEditor.tsx`: project picker, list, editor (autosave via
  `useAutosave`). Shared form fields live in `src/ui/fields.tsx`.
- `src/evidence/`: screenshot import (`image.ts`: canvas re-encode, 2560 px cap), `png.ts` chunk
  whitelist (no metadata ever stored), repository (images are sealed vault bytes, metadata separate),
  `EvidencePanel.tsx`. Use `vault.put(…, bytes)` / `vault.getBytes` for binary content.
  Redaction/crop: pure pixel ops in `edits.ts`, UI in `RedactionEditor.tsx` (apply → review →
  replace; the original is kept until the user confirms).
- `src/findings/pendingSaves.ts`: wrap every async save in `trackSave()`; readers call `whenSaved()`.
- `src/settings/`: Settings panels. `src/ui/router.ts`: hash router (`matchRoute`: `#/findings`,
  `#/findings/<id>`, `#/cvss`, `#/settings`).
- Pure logic lives in plain `.ts` modules with colocated `*.test.ts` files; UI in `.tsx`.
