import { arrowHead, LINE_HEIGHT, ptToIn, type Slide, type TextElement } from '../slides/layout';

/** Pixels per inch for PNG export: 13.333 in × 144 = 1920 px wide (full HD). */
export const PNG_PPI = 144;

/** Decodes PNG bytes for drawing on a canvas (never taints it: the source is a local blob). */
export async function decodeImages(
  images: Record<string, Uint8Array<ArrayBuffer>>,
): Promise<Record<string, ImageBitmap>> {
  const out: Record<string, ImageBitmap> = {};
  for (const [key, bytes] of Object.entries(images)) {
    out[key] = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  }
  return out;
}

/** Draws the slide model on a canvas: the same lines and positions as the SVG preview. */
export function renderSlideToCanvas(
  slide: Slide,
  images: Record<string, ImageBitmap>,
  ppi = PNG_PPI,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(slide.width * ppi);
  canvas.height = Math.round(slide.height * ppi);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw on a canvas.');
  ctx.fillStyle = slide.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const e of slide.elements) {
    switch (e.kind) {
      case 'rect':
        ctx.fillStyle = e.fill;
        ctx.beginPath();
        ctx.roundRect(e.x * ppi, e.y * ppi, e.w * ppi, e.h * ppi, (e.radius ?? 0) * ppi);
        ctx.fill();
        if (e.stroke) {
          ctx.strokeStyle = e.stroke;
          ctx.lineWidth = ((e.strokePt ?? 1) * ppi) / 72;
          ctx.setLineDash(e.dashed ? [6 * (ppi / 96), 4 * (ppi / 96)] : []);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      case 'line':
        ctx.strokeStyle = e.color;
        ctx.lineWidth = (e.widthPt * ppi) / 72;
        {
          const head = e.arrowEnd ? arrowHead(e) : null;
          ctx.beginPath();
          ctx.moveTo(e.x1 * ppi, e.y1 * ppi);
          ctx.lineTo((head?.baseX ?? e.x2) * ppi, (head?.baseY ?? e.y2) * ppi);
          ctx.stroke();
          if (head) {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            head.points.forEach(([x, y], i) =>
              i ? ctx.lineTo(x * ppi, y * ppi) : ctx.moveTo(x * ppi, y * ppi),
            );
            ctx.closePath();
            ctx.fill();
          }
        }
        break;
      case 'image': {
        const img = images[e.source];
        if (img) {
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, e.x * ppi, e.y * ppi, e.w * ppi, e.h * ppi);
        } else {
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(e.x * ppi, e.y * ppi, e.w * ppi, e.h * ppi);
        }
        break;
      }
      case 'text':
        drawText(ctx, e, ppi);
    }
  }
  return canvas;
}

function drawText(ctx: CanvasRenderingContext2D, e: TextElement, ppi: number) {
  const sizePx = (e.sizePt * ppi) / 72;
  const lineH = ptToIn(e.sizePt) * LINE_HEIGHT * ppi;
  const blockH = e.lines.length * lineH;
  const top = e.y * ppi + (e.valign === 'middle' ? (e.h * ppi - blockH) / 2 : 0);
  const font = (bold: boolean, mono: boolean) =>
    `${bold ? 'bold ' : ''}${sizePx}px "${mono ? e.monoFamily : e.family}", ${mono ? 'monospace' : 'sans-serif'}`;
  ctx.fillStyle = e.color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  e.lines.forEach(({ line, indent, bullet }, i) => {
    const y = top + i * lineH + (lineH - sizePx) / 2 + sizePx * 0.8;
    const widths = line.map((r) => {
      ctx.font = font(!!(r.bold || e.bold), !!r.mono);
      return ctx.measureText(r.text).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let x =
      e.align === 'right'
        ? (e.x + e.w) * ppi - total
        : e.align === 'center'
          ? (e.x + e.w / 2) * ppi - total / 2
          : (e.x + indent) * ppi;
    if (bullet) {
      ctx.font = font(false, false);
      ctx.fillText('•', e.x * ppi, y);
    }
    line.forEach((r, j) => {
      ctx.font = font(!!(r.bold || e.bold), !!r.mono);
      ctx.fillText(r.text, x, y);
      x += widths[j] ?? 0;
    });
  });
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the PNG.'))),
      'image/png',
    ),
  );
}
