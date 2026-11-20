import { useRef, useState } from 'preact/hooks';
import { isEnabled } from '../flags';
import { nextRadioIndex } from '../ui/roving';
import { BASE_METRICS, type BaseMetrics, METRIC_ORDER, parseVector } from './cvss31';
import { METRIC_INFO } from './definitions';
import { ENV_INFO } from './envDefinitions';
import {
  cvssResult,
  ENV_METRICS,
  ENV_ORDER,
  type EnvMetrics,
  hasEnvironmental,
  parseFullVector,
} from './environmental';

interface Props {
  value: BaseMetrics;
  onChange: (value: BaseMetrics) => void;
  /** Environmental metrics (shown only with the cvssAdvanced feature). */
  env?: EnvMetrics | undefined;
  onEnvChange?: (env: EnvMetrics) => void;
}

/**
 * CVSS 3.1 editor: one segmented radio group per metric, live score, vector paste. With the
 * cvssAdvanced feature, an Environmental section whose score, once any metric is set, replaces
 * the base score.
 */
export function CvssCalculator({ value, onChange, env, onEnvChange }: Props) {
  const advanced = isEnabled('cvssAdvanced') && !!onEnvChange;
  const result = cvssResult(value, advanced ? env : undefined);
  const environmental = result.kind === 'environmental';
  return (
    <section class="cvss" aria-labelledby="cvss-title">
      <h2 id="cvss-title">CVSS 3.1 base score</h2>
      <div class="cvss-groups">
        {METRIC_ORDER.map((key) => (
          <MetricGroup
            key={key}
            metric={key}
            name={METRIC_INFO[key].name}
            values={BASE_METRICS[key]}
            info={METRIC_INFO[key].values}
            selected={value[key]}
            // v always comes from BASE_METRICS[key], so the result is a valid BaseMetrics.
            onSelect={(v) => onChange({ ...value, [key]: v } as BaseMetrics)}
          />
        ))}
      </div>
      {advanced && onEnvChange && <EnvironmentalSection env={env ?? {}} onChange={onEnvChange} />}
      <output class="cvss-result" aria-live="polite">
        {environmental && <span class="muted">Environmental score</span>}
        <span class="cvss-score" data-testid="cvss-score">
          {result.score.toFixed(1)}
        </span>
        <span class={`badge sev-${result.severity.toLowerCase()}`} data-testid="cvss-severity">
          {result.severity}
        </span>
        {environmental && (
          <span class="muted" data-testid="cvss-base-score">
            (base {result.baseScore.toFixed(1)})
          </span>
        )}
        <code class="cvss-vector" data-testid="cvss-vector">
          {result.vector}
        </code>
      </output>
      <VectorPaste
        advanced={advanced}
        onApply={(metrics, nextEnv) => {
          onChange(metrics);
          if (advanced && onEnvChange) onEnvChange(nextEnv);
        }}
      />
    </section>
  );
}

function EnvironmentalSection(p: { env: EnvMetrics; onChange: (env: EnvMetrics) => void }) {
  const set = hasEnvironmental(p.env);
  return (
    <details class="cvss-advanced" open={set}>
      <summary>Environmental metrics (this client's context)</summary>
      <p class="muted">
        Leave everything on <em>Not defined</em> to use the base score. Once one metric is set, the
        environmental score replaces the base score for the severity, sorting and slides.
      </p>
      <div class="cvss-groups">
        {ENV_ORDER.map((key) => (
          <MetricGroup
            key={key}
            metric={key}
            name={ENV_INFO[key].name}
            values={['X', ...ENV_METRICS[key]]}
            info={ENV_INFO[key].values}
            selected={p.env[key] ?? 'X'}
            onSelect={(v) => {
              // Not defined (X) is never stored; v otherwise comes from ENV_METRICS[key].
              const merged: Record<string, string> = { ...p.env, [key]: v };
              const next = Object.fromEntries(
                Object.entries(merged).filter(([, value]) => value !== 'X'),
              );
              p.onChange(next as EnvMetrics);
            }}
          />
        ))}
      </div>
      {set && (
        <button type="button" class="small" onClick={() => p.onChange({})}>
          Clear environmental metrics
        </button>
      )}
    </details>
  );
}

function MetricGroup(props: {
  metric: string;
  name: string;
  values: readonly string[];
  info: Record<string, { label: string; definition: string }>;
  selected: string;
  onSelect: (v: string) => void;
}) {
  const { metric, name, values, info, selected, onSelect } = props;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [tipsHidden, setTipsHidden] = useState(false);
  const labelId = `cvss-${metric}-label`;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setTipsHidden(true);
      return;
    }
    const next = nextRadioIndex(event.key, values.indexOf(selected), values.length);
    if (next === null) return;
    event.preventDefault();
    const nextValue = values[next];
    if (nextValue) onSelect(nextValue);
    buttons.current[next]?.focus();
  };

  return (
    <div class="metric">
      <span class="metric-label" id={labelId}>
        {name} <abbr>({metric})</abbr>
      </span>
      <div
        class={`segmented${tipsHidden ? ' tips-hidden' : ''}`}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        onFocusOut={() => setTipsHidden(false)}
        onMouseLeave={() => setTipsHidden(false)}
      >
        {values.map((v, i) => {
          const value = info[v];
          const checked = v === selected;
          const tipId = `cvss-${metric}-${v}-tip`;
          return (
            <span class="segment" key={v}>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                aria-describedby={tipId}
                tabIndex={checked ? 0 : -1}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                onClick={() => onSelect(v)}
              >
                {value?.label} <span class="segment-code">({v})</span>
              </button>
              <span class="tooltip" role="tooltip" id={tipId}>
                {value?.definition}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function VectorPaste({
  advanced,
  onApply,
}: {
  advanced: boolean;
  onApply: (value: BaseMetrics, env: EnvMetrics) => void;
}) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const apply = (event: Event) => {
    event.preventDefault();
    const result = advanced
      ? parseFullVector(text)
      : ((r) => (r.ok ? { ...r, env: {} } : r))(parseVector(text));
    if (result.ok) {
      onApply(result.metrics, result.env);
      setErrors([]);
      setText('');
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <form class="vector-paste" onSubmit={apply} noValidate>
      <label for="cvss-paste">Set from a vector string</label>
      <div class="vector-paste-row">
        <input
          id="cvss-paste"
          type="text"
          spellcheck={false}
          autocomplete="off"
          placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
          value={text}
          aria-invalid={errors.length > 0}
          aria-describedby="cvss-paste-errors"
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit">Apply</button>
      </div>
      <ul id="cvss-paste-errors" class="errors" role="alert">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </form>
  );
}
