import { useRef } from 'preact/hooks';
import { ImageImportError, processImage } from '../evidence/image';
import { contrastRatio } from '../util/contrast';
import { DEFAULT_REPORT_STYLE, type ReportStyle, type SlideTheme } from './theme';

const COLOURS: [keyof Omit<ReportStyle, 'cover' | 'coverLogo'>, string][] = [
  ['primary', 'Primary (titles, table headers)'],
  ['dark', 'Dark (table titles, cover)'],
  ['accent', 'Accent (agenda, highlights)'],
  ['light', 'Light (table cells)'],
  ['onPrimary', 'Text on primary and dark'],
];

/** Settings for the full report deck: colours, cover background and cover logo. */
export function ReportStyleFields(props: {
  theme: SlideTheme;
  onChange: (theme: SlideTheme) => void;
  onError: (message: string | null) => void;
}) {
  const { theme } = props;
  const style = theme.report ?? DEFAULT_REPORT_STYLE;
  const coverInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ReportStyle>) =>
    props.onChange({ ...theme, report: { ...style, ...patch } });
  const drop = (key: 'cover' | 'coverLogo') => {
    const { [key]: _gone, ...rest } = style;
    props.onChange({ ...theme, report: rest });
  };
  const lowContrast =
    contrastRatio(style.primary, style.onPrimary) < 4.5 ||
    contrastRatio(style.dark, style.onPrimary) < 4.5;

  const imageField = (key: 'cover' | 'coverLogo', label: string, ref: typeof coverInput) => (
    <>
      <span class="field-label">{label}</span>
      <p class="row">
        <button type="button" class="small" onClick={() => ref.current?.click()}>
          {style[key] ? `Replace ${label.toLowerCase()}…` : `Add ${label.toLowerCase()}…`}
        </button>
        {style[key] && (
          <button type="button" class="small" onClick={() => drop(key)}>
            Remove {label.toLowerCase()}
          </button>
        )}
      </p>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        data-testid={`${key}-file`}
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          try {
            const img = await processImage(file);
            set({ [key]: { bytes: img.bytes, width: img.width, height: img.height } });
            props.onError(null);
          } catch (err) {
            props.onError(
              err instanceof ImageImportError ? err.message : 'The image could not be read.',
            );
          }
        }}
      />
    </>
  );

  return (
    <fieldset class="field">
      <legend>Report deck</legend>
      <p class="hint">
        Colours and images of the full report. Images are re-encoded (metadata removed) and stay in
        this browser and in the theme file you export.
      </p>
      {COLOURS.map(([key, label]) => (
        <div class="row" key={key}>
          <input
            id={`report-${key}`}
            type="color"
            value={style[key]}
            onInput={(e) => set({ [key]: e.currentTarget.value })}
          />
          <label for={`report-${key}`}>{label}</label>
        </div>
      ))}
      {lowContrast && (
        <p class="warning" role="status">
          Low contrast between the text colour and the primary or dark colour.
        </p>
      )}
      {imageField('cover', 'Cover background', coverInput)}
      {imageField('coverLogo', 'Cover logo', logoInput)}
    </fieldset>
  );
}
