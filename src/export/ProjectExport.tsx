import { useState } from 'preact/hooks';
import type { Finding, Project } from '../findings/model';
import { canvasMeasure } from '../slides/measure';
import { listScenarios } from '../scenarios/repository';
import { loadTheme } from '../slides/themeStore';
import type { Vault } from '../storage/vault';
import {
  copyText,
  downloadBlob,
  langTag,
  PPTX_TYPE,
  projectBundle,
  safeFileName,
  slidesWithWarnings,
} from './collect';
import { projectMarkdown } from './markdown';
import { buildPptx } from './pptx';

type Action = 'pptx' | 'md-copy' | 'md-download';

/** Whole-project exports: a PowerPoint deck (cover + one slide per finding) and Markdown. */
export function ProjectExport({
  vault,
  project,
  findings,
}: {
  vault: Vault;
  project: Project;
  findings: Finding[];
}) {
  const [validatedOnly, setValidatedOnly] = useState(true);
  const [withScenarios, setWithScenarios] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);
  const [status, setStatus] = useState('');
  const selected = validatedOnly ? findings.filter((f) => f.status === 'validated') : findings;
  const fileBase = safeFileName(project.name, 'pwnpoint-project');

  const run = async (action: Action) => {
    setBusy(action);
    setStatus('');
    try {
      const theme = await loadTheme(vault);
      const now = new Date();
      const date = new Intl.DateTimeFormat(langTag(theme), { dateStyle: 'long' }).format(now);
      const scenarios = withScenarios ? await listScenarios(vault, project.id) : [];
      const bundle = await projectBundle(
        vault,
        project,
        selected,
        theme,
        canvasMeasure,
        date,
        scenarios,
        findings,
      );
      const skipped = bundle.skipped.length
        ? ` Left out (too long for 2 slides): ${bundle.skipped.join(', ')}.`
        : '';
      if (action === 'pptx') {
        const bytes = buildPptx(bundle.slides, bundle.images, {
          title: project.name,
          lang: langTag(theme),
          headingFont: theme.headingFont,
          bodyFont: theme.bodyFont,
          created: now,
        });
        downloadBlob(new Blob([bytes], { type: PPTX_TYPE }), `${fileBase}.pptx`);
        const flagged = slidesWithWarnings(bundle.slides);
        setStatus(
          `Deck downloaded: ${bundle.slides.length} slides.` +
            (flagged.length
              ? ` Check the warnings on slide${flagged.length > 1 ? 's' : ''} ${flagged.join(', ')} in the editor.`
              : '') +
            skipped,
        );
      } else {
        const md = projectMarkdown(
          project.name,
          bundle.ordered.map((finding) => ({
            finding,
            captions: bundle.captions.get(finding.id) ?? [],
            recommendations: bundle.recommendations.get(finding.id) ?? [],
          })),
          theme.language,
          scenarios,
          new Map(findings.map((f) => [f.id, f])),
          bundle.recs,
        );
        if (action === 'md-copy') {
          await copyText(md);
          setStatus('Markdown copied to the clipboard.');
        } else {
          downloadBlob(new Blob([md], { type: 'text/markdown' }), `${fileBase}.md`);
          setStatus('Markdown downloaded.');
        }
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  const button = (action: Action, label: string) => (
    <button
      type="button"
      class="small"
      disabled={busy !== null || !selected.length}
      aria-busy={busy === action}
      onClick={() => void run(action)}
    >
      {label}
    </button>
  );

  return (
    <details class="project-export">
      <summary>Export project</summary>
      <div class="stack">
        <label class="checkbox">
          <input
            type="checkbox"
            checked={validatedOnly}
            onChange={(e) => setValidatedOnly(e.currentTarget.checked)}
          />{' '}
          Validated findings only
        </label>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={withScenarios}
            onChange={(e) => setWithScenarios(e.currentTarget.checked)}
          />{' '}
          Include attack scenarios
        </label>
        <p class="muted small-text">
          {selected.length} of {findings.length} finding{findings.length === 1 ? '' : 's'} will be
          exported, ordered by severity.
        </p>
        <div class="row">
          {button('pptx', 'Download deck (.pptx)')}
          {button('md-copy', 'Copy Markdown')}
          {button('md-download', 'Download Markdown')}
        </div>
        <p class="muted small-text" role="status" data-testid="project-export-status">
          {status}
        </p>
      </div>
    </details>
  );
}
