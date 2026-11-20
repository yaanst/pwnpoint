import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Severity } from '../cvss/cvss31';
import { ImageImportError, processLogo } from '../evidence/image';
import { trackSave } from '../findings/pendingSaves';
import type { Vault } from '../storage/vault';
import { contrastRatio } from '../util/contrast';
import { createDebouncer } from '../ui/debounce';
import { emit } from '../ui/events';
import { buildFindingSlide } from './layout';
import { canvasMeasure } from './measure';
import { SAMPLE_FINDING } from './sample';
import { SlideSvg } from './SlideSvg';
import { DEFAULT_THEME, LABELS, safeFontName, type SlideTheme } from './theme';
import { exportTheme, importTheme, loadTheme, saveTheme } from './themeStore';
import { useSlideImages } from './useSlideImages';

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'None'];
const FONT_SUGGESTIONS = [
  'Calibri',
  'Arial',
  'Segoe UI',
  'Helvetica',
  'Aptos',
  'Verdana',
  'Georgia',
  'Consolas',
  'Courier New',
];

export function SlideThemeSettings({ vault }: { vault: Vault }) {
  const [theme, setTheme] = useState<SlideTheme | null>(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const latest = useRef<SlideTheme | null>(null);
  latest.current = theme;
  const importInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const saver = useMemo(
    () =>
      createDebouncer(() => {
        const t = latest.current;
        if (!t) return;
        void trackSave(saveTheme(vault, t)).then(() => {
          setMessage('Theme saved.');
          emit('theme-changed');
        });
      }, 400),
    [vault],
  );
  useEffect(() => {
    void loadTheme(vault).then(setTheme);
    return () => saver.flush();
  }, [vault, saver]);

  const urls = useSlideImages(vault, [], theme);
  const slide = useMemo(
    () => (theme ? buildFindingSlide(SAMPLE_FINDING, [], theme, canvasMeasure) : null),
    [theme],
  );
  if (!theme || !slide) return <p aria-busy="true">Loading…</p>;

  const update = (next: SlideTheme, now = false) => {
    setTheme(next);
    setMessage('');
    saver.schedule();
    if (now) saver.flush();
  };

  const lowContrast = [
    ...SEVERITIES.filter(
      (s) => contrastRatio(theme.severity[s].bg, theme.severity[s].fg) < 4.5,
    ).map((s) => `${LABELS.en.severity[s]} badge`),
    ...(contrastRatio(theme.colors.background, theme.colors.text) < 4.5
      ? ['Text on background']
      : []),
  ];

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportTheme(theme)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.name.replace(/[^\p{L}\p{N}-]+/gu, '-') || 'theme'}.pwnpoint-theme.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section class="panel" aria-labelledby="theme-title">
      <h2 id="theme-title">Slide theme</h2>
      <p class="muted">
        Match your company or client template. Only fonts installed on this computer are used.
      </p>
      <div class="theme-grid">
        <div class="stack">
          <label for="theme-language">Slide language</label>
          <select
            id="theme-language"
            value={theme.language}
            onChange={(e) =>
              update({ ...theme, language: e.currentTarget.value === 'fr' ? 'fr' : 'en' })
            }
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>

          {(
            [
              ['headingFont', 'Heading font'],
              ['bodyFont', 'Body font'],
              ['monoFont', 'Monospace font (code)'],
            ] as const
          ).map(([key, label]) => (
            <>
              <label for={`theme-${key}`}>{label}</label>
              <input
                id={`theme-${key}`}
                type="text"
                list="font-suggestions"
                value={theme[key]}
                onInput={(e) =>
                  update({
                    ...theme,
                    [key]: safeFontName(e.currentTarget.value, DEFAULT_THEME[key]),
                  })
                }
              />
            </>
          ))}
          <datalist id="font-suggestions">
            {FONT_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>

          <label for="theme-footer">Footer text</label>
          <input
            id="theme-footer"
            type="text"
            value={theme.footerText}
            maxLength={200}
            onInput={(e) => update({ ...theme, footerText: e.currentTarget.value })}
          />

          <label for="theme-minfont">Smallest font size (pt)</label>
          <input
            id="theme-minfont"
            type="number"
            min={6}
            max={24}
            value={theme.minFontPt}
            onInput={(e) => {
              const v = Number(e.currentTarget.value);
              if (v >= 6 && v <= 24) update({ ...theme, minFontPt: v });
            }}
          />

          <fieldset class="colors">
            <legend>Colours</legend>
            {(
              [
                ['background', 'Background'],
                ['text', 'Text'],
                ['muted', 'Secondary text'],
                ['accent', 'Accent'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} class="color-field">
                <input
                  type="color"
                  value={theme.colors[key]}
                  onInput={(e) =>
                    update({ ...theme, colors: { ...theme.colors, [key]: e.currentTarget.value } })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset class="colors">
            <legend>Severity badges</legend>
            <p class="muted small-text severity-head" aria-hidden="true">
              Background · Text
            </p>
            {SEVERITIES.map((s) => (
              <div key={s} class="row severity-row">
                <label class="color-field">
                  <input
                    type="color"
                    aria-label={`${s} badge background`}
                    value={theme.severity[s].bg}
                    onInput={(e) =>
                      update({
                        ...theme,
                        severity: {
                          ...theme.severity,
                          [s]: { ...theme.severity[s], bg: e.currentTarget.value },
                        },
                      })
                    }
                  />
                </label>
                <label class="color-field">
                  <input
                    type="color"
                    aria-label={`${s} badge text`}
                    value={theme.severity[s].fg}
                    onInput={(e) =>
                      update({
                        ...theme,
                        severity: {
                          ...theme.severity,
                          [s]: { ...theme.severity[s], fg: e.currentTarget.value },
                        },
                      })
                    }
                  />
                </label>
                <span
                  class="badge"
                  data-severity={s}
                  style={{ background: theme.severity[s].bg, color: theme.severity[s].fg }}
                >
                  {s}
                </span>
              </div>
            ))}
          </fieldset>
          {lowContrast.length > 0 && (
            <p class="warning" role="status" data-testid="contrast-warning">
              Low contrast (below WCAG AA 4.5:1): {lowContrast.join(', ')}.
            </p>
          )}

          <span class="field-label">Logo</span>
          <p class="row">
            <button type="button" class="small" onClick={() => logoInput.current?.click()}>
              {theme.logo ? 'Replace logo…' : 'Add logo…'}
            </button>
            {theme.logo && (
              <button
                type="button"
                class="small"
                onClick={() => {
                  const { logo: _logo, ...rest } = theme;
                  update(rest, true);
                }}
              >
                Remove logo
              </button>
            )}
          </p>
          <input
            ref={logoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            data-testid="logo-file"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              try {
                const img = await processLogo(file);
                update(
                  { ...theme, logo: { bytes: img.bytes, width: img.width, height: img.height } },
                  true,
                );
                setErrors([]);
              } catch (err) {
                setErrors([
                  err instanceof ImageImportError ? err.message : 'The logo could not be read.',
                ]);
              }
            }}
          />

          <span class="field-label">Share this theme</span>
          <p class="row">
            <button type="button" class="small" onClick={download}>
              Export theme…
            </button>
            <button type="button" class="small" onClick={() => importInput.current?.click()}>
              Import theme…
            </button>
            <button type="button" class="small" onClick={() => update({ ...DEFAULT_THEME }, true)}>
              Reset to default
            </button>
          </p>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="theme-file"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              const result = file.size > 5 * 1024 * 1024 ? null : importTheme(await file.text());
              if (!result) setErrors(['This file is too large to be a theme.']);
              else if (!result.ok) setErrors(result.errors);
              else {
                setErrors([]);
                update(result.theme, true);
                setMessage('Theme imported.');
              }
            }}
          />
          <ul class="errors" role="alert">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
          <p role="status" class="muted">
            {message}
          </p>
        </div>
        <div>
          <span class="field-label">Sample slide</span>
          <div class="slide-frame">
            <SlideSvg
              slide={slide}
              images={urls}
              label="Sample slide with this theme"
              showOverflow={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
