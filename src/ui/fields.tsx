import { useState } from 'preact/hooks';
import { MarkdownLite } from '../text/MarkdownLite';

/** Lines of a textarea → list entries (trimmed, empty lines dropped). */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

interface TextProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}

/** Markdown-lite text area with an Edit / Preview switch. */
export function RichTextField({ id, label, value, onChange, hint, rows = 5 }: TextProps) {
  const [preview, setPreview] = useState(false);
  return (
    <div class="field">
      <div class="field-head">
        <label for={id}>{label}</label>
        <button
          type="button"
          class="link small"
          aria-pressed={preview}
          aria-controls={id}
          onClick={() => setPreview(!preview)}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <div class="preview" id={id} data-testid={`${id}-preview`}>
          {value.trim() ? <MarkdownLite text={value} /> : <p class="muted">Nothing yet.</p>}
        </div>
      ) : (
        <textarea
          id={id}
          rows={rows}
          value={value}
          aria-describedby={`${id}-hint`}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      )}
      <p class="hint" id={`${id}-hint`}>
        {hint ?? 'Formatting: **bold**, `code`, lines starting with "- " for bullets.'}
      </p>
    </div>
  );
}

/** One entry per line (assets, references). Keeps the raw text while typing. */
export function LinesField(props: {
  id: string;
  label: string;
  hint: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [text, setText] = useState(props.value.join('\n'));
  return (
    <div class="field">
      <label for={props.id}>{props.label}</label>
      <textarea
        id={props.id}
        rows={3}
        value={text}
        spellcheck={false}
        aria-describedby={`${props.id}-hint`}
        onInput={(e) => {
          setText(e.currentTarget.value);
          props.onChange(parseLines(e.currentTarget.value));
        }}
      />
      <p class="hint" id={`${props.id}-hint`}>
        {props.hint}
      </p>
    </div>
  );
}

/** Ordered list of Markdown-lite items with add, remove and keyboard-friendly reordering. */
export function StepsField(props: { value: string[]; onChange: (value: string[]) => void }) {
  const steps = props.value;
  const set = (next: string[]) => props.onChange(next);
  const move = (from: number, to: number) => {
    const next = [...steps];
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    set(next);
  };
  return (
    <fieldset class="field">
      <legend>Steps to reproduce</legend>
      <ol class="steps">
        {steps.map((step, i) => (
          <li key={i}>
            <textarea
              rows={2}
              aria-label={`Step ${i + 1}`}
              value={step}
              onInput={(e) => set(steps.map((s, j) => (j === i ? e.currentTarget.value : s)))}
            />
            <span class="row">
              <button
                type="button"
                class="small"
                aria-label={`Move step ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="small"
                aria-label={`Move step ${i + 1} down`}
                disabled={i === steps.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                class="small"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => set(steps.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" class="small" onClick={() => set([...steps, ''])}>
        + Add step
      </button>
    </fieldset>
  );
}
