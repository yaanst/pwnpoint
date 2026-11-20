import { useRef, useState } from 'preact/hooks';
import { isEnabled } from '../flags';
import { nextRadioIndex } from '../ui/roving';
import {
  BASE_METRICS,
  type BaseMetrics,
  calculateBaseScore,
  METRIC_ORDER,
  type MetricKey,
  parseVector,
  toVector,
} from './cvss31';
import { METRIC_INFO } from './definitions';

interface Props {
  value: BaseMetrics;
  onChange: (value: BaseMetrics) => void;
}

/** CVSS 3.1 base metrics editor: one segmented radio group per metric, live score, vector paste. */
export function CvssCalculator({ value, onChange }: Props) {
  const result = calculateBaseScore(value);
  const vector = toVector(value);
  return (
    <section class="cvss" aria-labelledby="cvss-title">
      <h2 id="cvss-title">CVSS 3.1 base score</h2>
      <div class="cvss-groups">
        {METRIC_ORDER.map((key) => (
          <MetricGroup
            key={key}
            metric={key}
            selected={value[key]}
            // v always comes from BASE_METRICS[key], so the result is a valid BaseMetrics.
            onSelect={(v) => onChange({ ...value, [key]: v } as BaseMetrics)}
          />
        ))}
      </div>
      <output class="cvss-result" aria-live="polite">
        <span class="cvss-score" data-testid="cvss-score">
          {result.score.toFixed(1)}
        </span>
        <span class={`badge sev-${result.severity.toLowerCase()}`} data-testid="cvss-severity">
          {result.severity}
        </span>
        <code class="cvss-vector" data-testid="cvss-vector">
          {vector}
        </code>
      </output>
      <VectorPaste onApply={onChange} />
      {isEnabled('cvssAdvanced') && (
        <details class="cvss-advanced">
          <summary>Advanced: temporal and environmental metrics</summary>
          <p>Not available yet.</p>
        </details>
      )}
    </section>
  );
}

function MetricGroup(props: {
  metric: MetricKey;
  selected: string;
  onSelect: (v: string) => void;
}) {
  const { metric, selected, onSelect } = props;
  const info = METRIC_INFO[metric];
  const values: readonly string[] = BASE_METRICS[metric];
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
        {info.name} <abbr>({metric})</abbr>
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
          const value = info.values[v];
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

function VectorPaste({ onApply }: { onApply: (value: BaseMetrics) => void }) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const apply = (event: Event) => {
    event.preventDefault();
    const result = parseVector(text);
    if (result.ok) {
      onApply(result.metrics);
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
