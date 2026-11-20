import { useState } from 'preact/hooks';
import { dismissOnboarding, onboardingDismissed } from './prefs';

/** First-run overview of the workflow. Hidden once dismissed; Settings can show it again. */
export function OnboardingTip() {
  const [hidden, setHidden] = useState(onboardingDismissed());
  if (hidden) return null;
  return (
    <aside class="tip" aria-labelledby="tip-title">
      <h2 id="tip-title">How PwnPoint works</h2>
      <ol>
        <li>Create one project per mission.</li>
        <li>
          Add findings: score them with CVSS 3.1, paste screenshots with Ctrl/Cmd+V (metadata is
          removed) and redact what the client should not see.
        </li>
        <li>Chain findings into attack scenarios to show how an attacker gets in.</li>
        <li>Export slides as PowerPoint, PNG or Markdown.</li>
        <li>
          Save a mission file (<code>.pwnp</code>) regularly: browser storage is not a backup.
        </li>
      </ol>
      <p class="muted">Everything stays on this computer. Nothing is sent anywhere.</p>
      <button
        type="button"
        onClick={() => {
          dismissOnboarding();
          setHidden(true);
        }}
      >
        Got it, hide this
      </button>
    </aside>
  );
}
