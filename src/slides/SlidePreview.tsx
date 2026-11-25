import { useEffect, useMemo, useState } from 'preact/hooks';
import { type Evidence, listEvidence } from '../evidence/repository';
import { FindingExport } from '../export/FindingExport';
import type { Finding } from '../findings/model';
import type { Vault } from '../storage/vault';
import { on } from '../ui/events';
import { listProjects } from '../findings/repository';
import { type RecommendationRow, recommendationRows } from '../recommendations/model';
import { listRecommendations } from '../recommendations/repository';
import { buildFindingSlides } from './layout';
import { canvasMeasure } from './measure';
import { SlideSvg } from './SlideSvg';
import type { SlideTheme } from './theme';
import { loadTheme } from './themeStore';
import { useSlideImages } from './useSlideImages';

/** Live 16:9 preview of a finding's slide, with overflow warnings. */
export function SlidePreview({ vault, finding }: { vault: Vault; finding: Finding }) {
  const [theme, setTheme] = useState<SlideTheme | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [recs, setRecs] = useState<RecommendationRow[]>([]);

  useEffect(() => {
    const loadEvidence = () => void listEvidence(vault, finding.id).then(setEvidence);
    const reloadTheme = () => void loadTheme(vault).then(setTheme);
    const loadRecs = () =>
      void Promise.all([listProjects(vault), listRecommendations(vault, finding.projectId)]).then(
        ([projects, list]) =>
          setRecs(
            recommendationRows(
              finding.id,
              list,
              projects.find((p) => p.id === finding.projectId),
            ),
          ),
      );
    loadEvidence();
    reloadTheme();
    loadRecs();
    const offs = [
      on('evidence-changed', loadEvidence),
      on('theme-changed', reloadTheme),
      on('recommendations-changed', loadRecs),
    ];
    return () => offs.forEach((off) => off());
  }, [vault, finding.id, finding.projectId]);

  const urls = useSlideImages(vault, evidence.slice(0, 2), theme);
  const slides = useMemo(
    () => (theme ? buildFindingSlides(finding, evidence, theme, canvasMeasure, recs) : null),
    [finding, evidence, theme, recs],
  );
  const slide = slides?.[0];

  return (
    <section class="slide-preview" aria-labelledby="slide-preview-title">
      <h3 id="slide-preview-title">Slide preview</h3>
      {slide && theme ? (
        <>
          {slides?.map((s, i) => (
            <div class="slide-frame" key={i}>
              <SlideSvg
                slide={s}
                images={urls}
                label={
                  i === 0
                    ? `Slide preview of ${finding.title || 'this finding'}`
                    : `Continuation slide ${i + 1} of ${finding.title || 'this finding'}`
                }
              />
            </div>
          ))}
          {slides && slides.length > 1 && (
            <p class="muted small-text">
              The recommendations that do not fit continue on {slides.length - 1} more slide
              {slides.length > 2 ? 's' : ''}, highest priority first.
            </p>
          )}
          {slide.warnings.length > 0 ? (
            <div role="status" data-testid="slide-warnings">
              <ul class="errors slide-warnings">
                {slide.warnings.map((w) => (
                  <li key={w}>⚠️ {w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p class="muted small-text" role="status" data-testid="slide-warnings">
              Everything fits on the slide.
            </p>
          )}
          <FindingExport vault={vault} finding={finding} theme={theme} />
        </>
      ) : (
        <p aria-busy="true">Loading…</p>
      )}
    </section>
  );
}
