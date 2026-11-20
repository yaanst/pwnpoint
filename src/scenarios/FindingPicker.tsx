import { useState } from 'preact/hooks';
import { effectiveSeverity, type Finding, findingRef } from '../findings/model';
import { searchFindings } from './model';

/** Searchable combobox to add a finding as a step (type to filter, arrows, Enter). */
export function FindingPicker({
  findings,
  onPick,
}: {
  findings: Finding[];
  onPick: (f: Finding) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = searchFindings(findings, query);
  const pick = (f: Finding | undefined) => {
    if (!f) return;
    onPick(f);
    setQuery('');
    setOpen(false);
    setActive(0);
  };
  const optionId = (i: number) => `picker-option-${i}`;

  return (
    <div class="picker">
      <label for="finding-picker">Add a finding</label>
      <input
        id="finding-picker"
        type="text"
        role="combobox"
        autocomplete="off"
        placeholder="Search VLN.03 or a title…"
        aria-expanded={open}
        aria-controls="finding-picker-list"
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length ? optionId(active) : undefined}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) pick(matches[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id="finding-picker-list" role="listbox" aria-label="Findings" class="picker-list">
          {matches.length === 0 ? (
            <li class="muted" role="presentation">
              {findings.length ? 'No finding matches.' : 'This project has no findings yet.'}
            </li>
          ) : (
            matches.map((f, i) => (
              <li
                key={f.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                class={i === active ? 'active' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  pick(f);
                }}
              >
                <span class="ref">{findingRef(f.number)}</span> {f.title || 'Untitled finding'}{' '}
                <span class={`badge sev-${effectiveSeverity(f).toLowerCase()}`}>
                  {effectiveSeverity(f)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
