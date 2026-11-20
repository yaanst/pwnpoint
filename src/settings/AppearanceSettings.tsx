import { useState } from 'preact/hooks';
import {
  type ColorScheme,
  dismissOnboarding,
  loadColorScheme,
  onboardingDismissed,
  saveColorScheme,
} from '../ui/prefs';

const LABELS: Record<ColorScheme, string> = {
  system: 'Same as the system',
  light: 'Light',
  dark: 'Dark',
};

/** Light / dark mode for the app (slides keep their own theme colours). */
export function AppearanceSettings() {
  const [scheme, setScheme] = useState<ColorScheme>(loadColorScheme());
  const [tipHidden, setTipHidden] = useState(onboardingDismissed());
  return (
    <section class="panel" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Appearance</h2>
      <fieldset class="choices">
        <legend>Colour mode</legend>
        {(Object.keys(LABELS) as ColorScheme[]).map((s) => (
          <label key={s} class="checkbox">
            <input
              type="radio"
              name="color-scheme"
              checked={scheme === s}
              onChange={() => {
                setScheme(s);
                saveColorScheme(s);
              }}
            />
            {LABELS[s]}
          </label>
        ))}
      </fieldset>
      <p class="muted">Slides always use the slide theme's colours, whatever the mode.</p>
      <p class="row">
        <button
          type="button"
          disabled={!tipHidden}
          onClick={() => {
            dismissOnboarding(false);
            setTipHidden(false);
          }}
        >
          Show the welcome tip again
        </button>
        <span role="status" class="muted">
          {tipHidden ? '' : 'The tip is shown on the Findings page.'}
        </span>
      </p>
    </section>
  );
}
