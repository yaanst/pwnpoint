# PwnPoint

Turn a pentest finding (CVSS 3.1 score + screenshot evidence) into a client-ready slide, and
chain findings into full compromise scenarios shown as a flow on one slide.

> **Status:** v0.3. Projects and findings (editor, list, filters, optional categories such as
> `VLN.NET.01`), CVSS 3.1 base and environmental scoring, evidence screenshots with redaction, a
> live slide preview with a custom theme, export to PowerPoint, PNG and Markdown, attack
> scenarios (straight or branching), encrypted mission files and backups, light and dark mode.

## Finding numbers and categories

Findings are numbered `VLN.01`, `VLN.02`… per project. A finding can also have a **category**,
which adds its code to the reference: `VLN.NET.01`, `VLN.PHY.01`. Each category is numbered on
its own, and findings without a category keep `VLN.NN`. Categories can be mixed in one project.

- Built-in codes: `PHY` physical, `NET` network (LAN, WAN, Wi-Fi), `WEB` web applications and
  websites, `APP` applications, `AD` Active Directory, `SYS` systems and services, `WIN` Windows,
  `LIN` Linux. **Categories…** (Findings page) adds a project's own codes (2 to 6 capital letters
  or digits) and removes unused ones.
- Pick the category before **+ New finding**, or change it in the editor. Changing it gives the
  finding the next number in the new category; switching back before leaving the editor gives
  its old number back.
- Numbers are never reused, even after a delete or a change of category, so references in
  reports already sent stay valid.

## CVSS 3.1

Each finding is scored with the CVSS 3.1 base metrics (or a pasted vector string). The
optional **environmental metrics** describe the client's own context: how much confidentiality,
integrity and availability matter for the asset, and base metrics that differ in their
environment (e.g. a service only reachable internally). By default the base score is used; once
any environmental metric is set, the environmental score replaces it for the severity, the sort
order, the slide (labelled "CVSS 3.1 environmental") and Markdown, with the full vector.
Temporal metrics are not supported.

## Evidence screenshots

Paste a screenshot (Ctrl/Cmd+V) anywhere on a finding, drop image files, or pick them. Every
image is re-encoded through a canvas, which removes EXIF/GPS data, comments and every other
piece of metadata, and only the image data chunks are kept in the stored PNG. Images wider than
2560 px are downscaled. SVG files are refused. Images are stored encrypted like everything else.

To hide secrets, open **Redact / crop** on a screenshot: draw black boxes or pixelated areas
(with the mouse or by entering coordinates) and crop. **Apply** shows the flattened result; the
original is only replaced when you confirm, and the hidden pixels are gone for good. Prefer black
boxes for passwords, tokens and keys: pixelated text can sometimes be reconstructed.

## Slides

Each finding shows a live 16:9 slide preview next to the editor (on wide screens). Text is
never shrunk to fit: when a section overflows, the preview marks it and says by how many lines.
**Settings → Slide theme** sets the language of the slide labels (English or French), system
fonts, colours (with a contrast check), severity badge colours, the footer, the smallest font
size and an optional logo. Themes can be exported and imported as JSON files.

### Export

- **One finding** (under its slide preview): download a `.pptx`, download or copy the slide as
  a PNG (1920 × 1080), or copy it as Markdown.
- **A whole project** (**Export project** under the findings list): a `.pptx` deck with a cover
  slide and one slide per finding, ordered by severity, or the findings as one Markdown file.
  By default only validated findings are exported.

PowerPoint files are written by PwnPoint itself (no third-party library): every title, text
box, badge and line is a native, editable shape, and images carry their caption as alternative
text. The slide image shows the first two screenshots; Markdown lists every caption. Exports
warn when text does not fit on a slide.

## Attack scenarios

**Scenarios** chain findings into the path an attacker follows, shown as a flow on one slide.
A scenario (`SCN.01`, numbered per project) has a title, a starting position, a goal, a
context, an impact and a likelihood, and ordered steps. A step is a finding (pick it by typing
its reference or title) or a free technique with an optional MITRE ATT&CK id. Each step says
what the attacker gains, can carry a note, and can be marked as a **chain breaker**: fixing it
stops the attack. Chain breakers are listed under **Break the chain**, with the step's note or,
if empty, the finding's recommendation.

Reorder steps by dragging their handle, with the ↑/↓ buttons, or with Alt+↑/↓. A finding's
editor shows the scenarios that use it; if a finding is deleted, its steps stay as a visible
"missing finding" placeholder.

The flow is laid out as a snake (left to right, then right to left). When it does not fit, the
step text is reduced down to the theme's minimum font size, then the flow is split at a step
boundary onto a second slide with "continued" markers. A scenario never takes more than two
slides: beyond that, slide exports are blocked until it is shortened. Scenarios export to
`.pptx` (native shapes and arrows), PNG and Markdown, and are added to the project deck.

### Branching scenarios

A step can lead to several later steps (**Leads to**, under each step): use it to show
alternative routes to the same goal, e.g. phishing or an exposed RDP server, both ending in
domain admin. By default each step leads to the next one, and a step that leads nowhere
reaches the goal. Links only go forward, so there are no loops. A branching scenario is drawn
left to right on one slide; PwnPoint warns when a step marked as a chain breaker can be
bypassed by another route.

## Mission files and backups

Browser storage is not a backup. Save your work to `.pwnp` files:

- **Save mission file…** (Findings page) saves the current project: findings, screenshots and
  scenarios. **Back up everything…** (Settings) saves every project and the slide theme.
- Files are **encrypted by default** with a passphrase you choose (AES-GCM 256, key derived
  with PBKDF2-SHA256, 600,000 iterations). Unticking the box saves a plain file, with a warning.
- Chrome and Edge open the native save dialog; Firefox downloads the file.
- **Open mission file…** (Findings) or **Restore from a file…** (Settings) imports a file. You
  see what it contains first. If a project already exists, keep both (the file is imported as a
  copy) or replace it with the file's version.
- Files saved by this version (format 2, with categories) need PwnPoint 0.3 or later; files
  saved by 0.2 still open.
- Import is strict: the file is a plain ZIP (`pwnpoint.json`, `data.json`, `images/*.png`, or
  an encrypted `payload.bin`), every record is validated field by field, nothing in it is ever
  run, and every screenshot is re-encoded through a canvas.

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

## Accessibility and appearance

PwnPoint works with the keyboard alone and with screen readers, and every page is checked in CI
against the WCAG 2.1 A and AA rules of axe-core, in light and dark mode. The app follows the
system's light or dark mode; Settings → Appearance can force one. Slides always keep the slide
theme's colours.

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
