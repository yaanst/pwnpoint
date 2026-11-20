# PwnPoint

Turn a pentest finding (CVSS 3.1 score + screenshot evidence) into a client-ready slide, and
chain findings into full compromise scenarios shown as a flow on one slide.

> **Status:** early development (milestone 0, scaffold). Not usable yet.

## Privacy model

PwnPoint is built for confidential client data:

- It is a **single HTML file** that runs entirely in your browser, opened from disk.
- It makes **no network requests**. A strict Content Security Policy blocks them, and CI
  checks it.
- Your data stays on your device: in browser storage and in mission files you save yourself.
- **Encrypted at rest by default.** On first run PwnPoint asks for a passphrase and encrypts
  everything it stores with AES-GCM 256 (key derived with PBKDF2-SHA256, 600,000 iterations).
  You enter the passphrase each time you open PwnPoint. There is no recovery if you forget it.
- You can turn encryption off in Settings after acknowledging the risk: browsers share storage
  between all local HTML files, so any other file you open from disk could read clear data.

Supported browsers: Chrome, Edge and Firefox (desktop).

## Running it

1. Download `pwnpoint-vX.Y.Z.html` from the [latest release](https://github.com/yaanst/pwnpoint/releases/latest),
   or build it yourself (below).
2. Open the file in Chrome, Edge or Firefox (double-click it, or drag it into the browser).

That's it: no server, no install. The file contains all of the app's code and styles.
To update, download the newer file.

A copy is also hosted on [GitHub Pages](https://yaanst.github.io/pwnpoint/). Pages only
serves the static file: the app makes no requests and keeps data in your browser. For
client work, prefer the downloaded file.

### Verify a download

Each release includes a `SHA256SUMS` file and a signed build provenance attestation that
ties the file to the workflow run that built it:

```bash
sha256sum -c SHA256SUMS
gh attestation verify pwnpoint-vX.Y.Z.html --repo yaanst/pwnpoint
```

## Development

Requires Node.js 22 or later.

```bash
npm ci            # install pinned dependencies
npm run dev       # start the dev server
npm run lint      # ESLint + Prettier
npm run typecheck # strict TypeScript
npm test          # unit tests
npm run build     # build the single file dist/index.html
npm run check:urls # fail on unexpected http(s) URLs in dist/
npm run test:e2e  # Playwright on the built file (file://), Chromium + Firefox
```

Run `npx playwright install chromium firefox` once before the end-to-end tests.

See [CLAUDE.md](CLAUDE.md) for conventions, the local-only rules and the workflow.
