# PwnPoint

Turn a pentest finding (CVSS 3.1 score + screenshot evidence) into a client-ready slide, and
chain findings into full compromise scenarios shown as a flow on one slide.

> **Status:** early development (milestone 0, scaffold). Not usable yet.

## Privacy model

PwnPoint is built for confidential client data:

- It is a **single HTML file** that runs entirely in your browser, opened from disk.
- It makes **no network requests**. A strict Content Security Policy blocks them, and CI
  checks it.
- Your data stays on your device: in browser storage (encrypted by default) and in mission
  files you save yourself.

Supported browsers: Chrome, Edge and Firefox (desktop).

## Development

Requires Node.js 22 or later.

```bash
npm ci            # install pinned dependencies
npm run dev       # start the dev server
npm run lint      # ESLint + Prettier
npm run typecheck # strict TypeScript
npm test          # unit tests
npm run build     # build into dist/
```

See [CLAUDE.md](CLAUDE.md) for conventions, the local-only rules and the workflow.
