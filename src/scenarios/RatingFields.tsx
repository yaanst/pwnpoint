import type { Finding } from '../findings/model';
import { LABELS } from '../slides/theme';
import type { Scenario } from './model';
import {
  isRating,
  type Rating,
  RATINGS,
  scenarioSeverity,
  SEVERITY_COLOURS,
  suggestRating,
} from './rating';

const S = LABELS.en.scenario;

/**
 * Exploitability and impact (5 levels each, with a rationale), the severity they give, and the
 * rating suggested from the scenario's findings, which the auditor applies or ignores.
 */
export function RatingFields(props: {
  scenario: Scenario;
  findings: Map<string, Finding>;
  onChange: (patch: Partial<Scenario>) => void;
}) {
  const { scenario: s, onChange } = props;
  const suggestion = suggestRating(s.steps, props.findings);
  const severity =
    s.exploitability && s.impact ? scenarioSeverity(s.exploitability, s.impact) : null;
  const matches =
    suggestion && suggestion.exploitability === s.exploitability && suggestion.impact === s.impact;

  const select = (key: 'exploitability' | 'impact', label: string) => (
    <div class="field">
      <label for={`s-${key}`}>{label}</label>
      <select
        id={`s-${key}`}
        value={s[key] ?? ''}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (isRating(v)) onChange({ [key]: v });
          else onChange({ [key]: undefined });
        }}
      >
        <option value="">{S.notRated}</option>
        {[...RATINGS].reverse().map((r) => (
          <option key={r} value={r}>
            {r} – {S.levels[key][r]}
          </option>
        ))}
      </select>
    </div>
  );
  const rationale = (key: 'exploitabilityRationale' | 'impactRationale', label: string) => (
    <div class="field">
      <label for={`s-${key}`}>{label}</label>
      <textarea
        id={`s-${key}`}
        rows={2}
        value={s[key]}
        onInput={(e) => onChange({ [key]: e.currentTarget.value })}
      />
    </div>
  );
  const describe = (r: { exploitability: Rating; impact: Rating }) =>
    `${S.levels.exploitability[r.exploitability]} × ${S.levels.impact[r.impact]} → ` +
    S.levels.severity[scenarioSeverity(r.exploitability, r.impact)];

  return (
    <fieldset class="field">
      <legend>Rating</legend>
      <p class="hint">
        Severity comes from the exploitability × impact matrix (appendix scale). Along a path the
        hardest step limits exploitability; impact is the highest of the findings.
      </p>
      {suggestion && !matches && (
        <p class="row" data-testid="rating-suggestion">
          <span>
            Suggested from the findings: <strong>{describe(suggestion)}</strong>
          </span>
          <button
            type="button"
            class="small"
            onClick={() =>
              onChange({ exploitability: suggestion.exploitability, impact: suggestion.impact })
            }
          >
            Use the suggestion
          </button>
        </p>
      )}
      <div class="row">
        {select('exploitability', 'Exploitability')}
        {select('impact', 'Impact')}
        <p>
          Severity:{' '}
          {severity ? (
            <span
              class={`badge sev-${SEVERITY_COLOURS[severity].toLowerCase()}`}
              data-testid="scenario-severity"
            >
              {S.levels.severity[severity]}
            </span>
          ) : (
            <span class="muted" data-testid="scenario-severity">
              {S.notRated}
            </span>
          )}
        </p>
      </div>
      {rationale('exploitabilityRationale', 'Exploitability rationale')}
      {rationale('impactRationale', 'Impact rationale')}
    </fieldset>
  );
}
