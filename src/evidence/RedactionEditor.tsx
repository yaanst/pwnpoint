import { useEffect, useRef, useState } from 'preact/hooks';
import type { Vault } from '../storage/vault';
import {
  applyEdits,
  clampRect,
  isEmpty,
  type Pixels,
  type Rect,
  type Redaction,
  rectFromPoints,
} from './edits';
import { pixelsToPng, pngToPixels } from './image';
import { type Evidence, getEvidenceBytes, replaceEvidenceImage } from './repository';

type Tool = 'box' | 'pixelate' | 'crop';
const TOOL_LABEL: Record<Tool, string> = { box: 'Black box', pixelate: 'Pixelate', crop: 'Crop' };

interface Props {
  vault: Vault;
  evidence: Evidence;
  onSaved: (updated: Evidence) => void;
  onClose: () => void;
}

/**
 * Redact (black boxes, pixelation) and crop an evidence image. Edits are previewed live; "Apply"
 * flattens them into a new image shown for review, and the stored original is only replaced
 * once the user confirms.
 */
export function RedactionEditor({ vault, evidence, onSaved, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<Pixels | null>(null);
  const [tool, setTool] = useState<Tool>('box');
  const [redactions, setRedactions] = useState<Redaction[]>([]);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [result, setResult] = useState<Pixels | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
    void getEvidenceBytes(vault, evidence.id).then(async (bytes) => {
      if (bytes) setSource(await pngToPixels(bytes));
    });
  }, [vault, evidence.id]);

  // Draw: the review result, or the source with redactions applied plus overlays.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !source) return;
    const shown = result ?? applyEdits(source, redactions);
    c.width = shown.width;
    c.height = shown.height;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(shown.data), shown.width, shown.height),
      0,
      0,
    );
    if (result) return;
    const line = Math.max(2, Math.round(shown.width / 400));
    if (cropRect) {
      ctx.fillStyle = 'rgb(0 0 0 / 45%)';
      const { x, y, w, h } = cropRect;
      ctx.fillRect(0, 0, shown.width, y);
      ctx.fillRect(0, y + h, shown.width, shown.height - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, shown.width - x - w, h);
      ctx.setLineDash([line * 4, line * 3]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = line;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    if (drag) {
      const r = rectFromPoints(drag.from, drag.to, shown.width, shown.height);
      ctx.strokeStyle = '#e8590c';
      ctx.lineWidth = line;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }, [source, redactions, cropRect, drag, result]);

  const toImage = (e: PointerEvent) => {
    const c = canvas.current;
    if (!c) return { x: 0, y: 0 };
    const box = c.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) * c.width) / box.width,
      y: ((e.clientY - box.top) * c.height) / box.height,
    };
  };

  const addRect = (rect: Rect) => {
    if (!source) return;
    const r = clampRect(rect, source.width, source.height);
    if (isEmpty(r)) return;
    if (tool === 'crop') setCropRect(r);
    else setRedactions((list) => [...list, { kind: tool, rect: r }]);
  };

  const replace = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const png = await pixelsToPng(result);
      onSaved(await replaceEvidenceImage(vault, evidence, png));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be saved.');
      setSaving(false);
    }
  };

  const nothingToApply = redactions.length === 0 && !cropRect;

  return (
    <dialog
      ref={dialog}
      class="dialog redaction"
      aria-labelledby="redact-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="redact-title">{result ? 'Review the redacted image' : 'Redact and crop'}</h2>

      {!result && (
        <>
          <fieldset class="row tools">
            <legend class="visually-hidden">Tool</legend>
            {(Object.keys(TOOL_LABEL) as Tool[]).map((t) => (
              <label key={t} class="checkbox">
                <input
                  type="radio"
                  name="redact-tool"
                  value={t}
                  checked={tool === t}
                  onChange={() => setTool(t)}
                />
                {TOOL_LABEL[t]}
              </label>
            ))}
          </fieldset>
          <p class="hint">
            Drag on the image to draw a {TOOL_LABEL[tool].toLowerCase()} area, or enter it in pixels
            below.{' '}
            {tool === 'pixelate' && (
              <strong class="warning-text">
                Pixelated text can sometimes be reconstructed: use black boxes for passwords, tokens
                and keys.
              </strong>
            )}
          </p>
        </>
      )}

      <div class="redact-canvas-wrap">
        {source ? (
          <canvas
            ref={canvas}
            data-testid="redact-canvas"
            class={result ? '' : 'drawing'}
            role="img"
            aria-label={
              result ? 'Redacted result' : `Image ${source.width} × ${source.height} px with edits`
            }
            onPointerDown={(e) => {
              if (result) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = toImage(e);
              setDrag({ from: p, to: p });
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, to: toImage(e) })}
            onPointerUp={(e) => {
              if (!drag || !source) return;
              addRect(rectFromPoints(drag.from, toImage(e), source.width, source.height));
              setDrag(null);
            }}
          />
        ) : (
          <p aria-busy="true">Loading image…</p>
        )}
      </div>

      {!result && source && (
        <>
          <RectForm
            label={TOOL_LABEL[tool]}
            width={source.width}
            height={source.height}
            onAdd={addRect}
          />
          <ul class="regions" aria-label="Edits">
            {redactions.map((r, i) => (
              <li key={i}>
                {r.kind === 'box' ? 'Black box' : 'Pixelate'} at {r.rect.x},{r.rect.y} ({r.rect.w} ×{' '}
                {r.rect.h} px){' '}
                <button
                  type="button"
                  class="small"
                  aria-label={`Remove edit ${i + 1}`}
                  onClick={() => setRedactions(redactions.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
            {cropRect && (
              <li>
                Crop to {cropRect.w} × {cropRect.h} px from {cropRect.x},{cropRect.y}{' '}
                <button
                  type="button"
                  class="small"
                  aria-label="Remove crop"
                  onClick={() => setCropRect(null)}
                >
                  ✕
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      {result && (
        <p>
          The result is {result.width} × {result.height} px.{' '}
          <strong>Replacing the original is permanent:</strong> the hidden pixels cannot be
          recovered afterwards. Until you confirm, the original is kept.
        </p>
      )}
      <p class="errors" role="alert">
        {error}
      </p>

      <div class="dialog-actions">
        {result ? (
          <>
            <button type="button" onClick={() => setResult(null)} disabled={saving}>
              Back to editing
            </button>
            <button type="button" class="primary" onClick={() => void replace()} disabled={saving}>
              {saving ? 'Saving…' : 'Replace original'}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              class="primary"
              disabled={!source || nothingToApply}
              onClick={() =>
                source && setResult(applyEdits(source, redactions, cropRect ?? undefined))
              }
            >
              Apply…
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}

/** Keyboard alternative to drawing: enter an area in image pixels. */
function RectForm(props: {
  label: string;
  width: number;
  height: number;
  onAdd: (r: Rect) => void;
}) {
  const [v, setV] = useState({ x: 0, y: 0, w: 100, h: 40 });
  const field = (k: keyof typeof v, label: string, max: number) => (
    <label class="num">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={v[k]}
        onInput={(e) => setV({ ...v, [k]: Number(e.currentTarget.value) || 0 })}
      />
    </label>
  );
  return (
    <form
      class="row rect-form"
      onSubmit={(e) => {
        e.preventDefault();
        props.onAdd(v);
      }}
    >
      {field('x', 'X', props.width)}
      {field('y', 'Y', props.height)}
      {field('w', 'Width', props.width)}
      {field('h', 'Height', props.height)}
      <button type="submit" class="small">
        Add {props.label.toLowerCase()}
      </button>
    </form>
  );
}
