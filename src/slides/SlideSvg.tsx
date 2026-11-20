import { LINE_HEIGHT, ptToIn, type Slide, type TextElement } from './layout';

const PX = 96; // SVG user units per inch

/** Renders the slide model as SVG: the same lines and positions the PNG export draws. */
export function SlideSvg({
  slide,
  images,
  showOverflow = true,
  label,
}: {
  slide: Slide;
  /** Object URLs for evidence ids and 'logo'. */
  images: Record<string, string>;
  showOverflow?: boolean;
  label: string;
}) {
  return (
    <svg
      class="slide-svg"
      viewBox={`0 0 ${slide.width * PX} ${slide.height * PX}`}
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x={0}
        y={0}
        width={slide.width * PX}
        height={slide.height * PX}
        fill={slide.background}
      />
      {slide.elements.map((e, i) => {
        switch (e.kind) {
          case 'rect':
            return (
              <rect
                key={i}
                x={e.x * PX}
                y={e.y * PX}
                width={e.w * PX}
                height={e.h * PX}
                rx={(e.radius ?? 0) * PX}
                fill={e.fill}
              />
            );
          case 'line':
            return (
              <line
                key={i}
                x1={e.x1 * PX}
                y1={e.y1 * PX}
                x2={e.x2 * PX}
                y2={e.y2 * PX}
                stroke={e.color}
                stroke-width={(e.widthPt * PX) / 72}
              />
            );
          case 'image': {
            const url = images[e.source];
            return url ? (
              <image
                key={i}
                href={url}
                x={e.x * PX}
                y={e.y * PX}
                width={e.w * PX}
                height={e.h * PX}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : (
              <rect
                key={i}
                x={e.x * PX}
                y={e.y * PX}
                width={e.w * PX}
                height={e.h * PX}
                fill="#e5e7eb"
              />
            );
          }
          case 'text':
            return <TextSvg key={i} e={e} showOverflow={showOverflow} />;
        }
      })}
    </svg>
  );
}

function TextSvg({ e, showOverflow }: { e: TextElement; showOverflow: boolean }) {
  const sizePx = (e.sizePt * PX) / 72;
  const lineH = ptToIn(e.sizePt) * LINE_HEIGHT * PX;
  const blockH = e.lines.length * lineH;
  const top = e.y * PX + (e.valign === 'middle' ? (e.h * PX - blockH) / 2 : 0);
  const anchor = e.align === 'right' ? 'end' : e.align === 'center' ? 'middle' : 'start';
  const x0 =
    e.align === 'right' ? (e.x + e.w) * PX : e.align === 'center' ? (e.x + e.w / 2) * PX : e.x * PX;
  return (
    <g>
      {e.lines.map(({ line, indent }, i) => {
        // Baseline at ~80% of the line box, which matches common sans-serif ascents.
        const y = top + i * lineH + (lineH - sizePx) / 2 + sizePx * 0.8;
        return (
          <text
            key={i}
            x={x0 + indent * PX}
            y={y}
            font-family={`${e.family}, sans-serif`}
            font-size={sizePx}
            font-weight={e.bold ? 'bold' : 'normal'}
            fill={e.color}
            text-anchor={anchor}
            xml:space="preserve"
          >
            {line.map((r, j) => (
              <tspan
                key={j}
                font-weight={r.bold || e.bold ? 'bold' : 'normal'}
                font-family={r.mono ? `${e.monoFamily}, monospace` : undefined}
              >
                {r.text}
              </tspan>
            ))}
          </text>
        );
      })}
      {e.lines
        .filter((l) => l.bullet)
        .map((l, i) => {
          const index = e.lines.indexOf(l);
          const y = top + index * lineH + (lineH - sizePx) / 2 + sizePx * 0.8;
          return (
            <text
              key={`b${i}`}
              x={e.x * PX}
              y={y}
              font-size={sizePx}
              fill={e.color}
              font-family={`${e.family}, sans-serif`}
            >
              •
            </text>
          );
        })}
      {showOverflow && e.hiddenLines > 0 && (
        <rect
          class="overflow-mark"
          x={e.x * PX - 4}
          y={e.y * PX - 2}
          width={e.w * PX + 8}
          height={Math.max(e.h, ptToIn(e.sizePt) * LINE_HEIGHT) * PX + 4}
          fill="none"
          stroke="#d00000"
          stroke-width={3}
          stroke-dasharray="10 6"
        />
      )}
    </g>
  );
}
