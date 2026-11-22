import { useState } from 'preact/hooks';
import { type Finding, findingRef } from '../findings/model';
import { canvasMeasure } from '../slides/measure';
import type { SlideTheme } from '../slides/theme';
import type { Vault } from '../storage/vault';
import { canvasToPng, decodeImages, renderSlideToCanvas } from './canvas';
import {
  copyPng,
  copyText,
  downloadBlob,
  findingBundle,
  langTag,
  PPTX_TYPE,
  safeFileName,
} from './collect';
import { findingMarkdown } from './markdown';
import { buildPptx } from './pptx';

type Action = 'pptx' | 'png' | 'copy-png' | 'markdown';

/** Export buttons for one finding: PPTX, PNG (download or copy) and Markdown. */
export function FindingExport({
  vault,
  finding,
  theme,
}: {
  vault: Vault;
  finding: Finding;
  theme: SlideTheme;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [status, setStatus] = useState('');
  const baseName = safeFileName(`${findingRef(finding)}-${finding.title}`, findingRef(finding));

  const run = async (action: Action) => {
    setBusy(action);
    setStatus('');
    try {
      const bundle = await findingBundle(vault, finding, theme, canvasMeasure);
      const [slide] = bundle.slides;
      if (!slide) throw new Error('Nothing to export.');
      const note = slide.warnings.length ? ' Some text does not fit: see the warnings above.' : '';
      if (action === 'pptx') {
        const bytes = buildPptx(bundle.slides, bundle.images, {
          title: `${findingRef(finding)} ${finding.title}`.trim(),
          lang: langTag(theme),
          headingFont: theme.headingFont,
          bodyFont: theme.bodyFont,
          created: new Date(),
        });
        downloadBlob(new Blob([bytes], { type: PPTX_TYPE }), `${baseName}.pptx`);
        setStatus(`PowerPoint file downloaded.${note}`);
      } else if (action === 'markdown') {
        await copyText(
          findingMarkdown(finding, bundle.captions.get(finding.id) ?? [], theme.language),
        );
        setStatus('Markdown copied to the clipboard.');
      } else {
        const canvas = renderSlideToCanvas(slide, await decodeImages(bundle.images));
        const png = await canvasToPng(canvas);
        if (action === 'png') {
          downloadBlob(png, `${baseName}.png`);
          setStatus(`PNG downloaded.${note}`);
        } else {
          await copyPng(png);
          setStatus(`Slide image copied to the clipboard.${note}`);
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
      disabled={busy !== null}
      aria-busy={busy === action}
      onClick={() => void run(action)}
    >
      {label}
    </button>
  );

  return (
    <div class="export-bar" role="group" aria-label="Export this slide">
      <div class="row">
        {button('pptx', 'Download .pptx')}
        {button('png', 'Download PNG')}
        {button('copy-png', 'Copy PNG')}
        {button('markdown', 'Copy Markdown')}
      </div>
      <p class="muted small-text" role="status" data-testid="export-status">
        {status}
      </p>
    </div>
  );
}
