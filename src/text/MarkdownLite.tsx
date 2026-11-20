import type { ComponentChildren } from 'preact';
import { type Inline, parseMarkdownLite } from './markdownLite';

/**
 * Renders Markdown-lite text. Only fixed elements (p, br, ul, li, strong, code) and text nodes
 * are created; user text is never interpreted as HTML.
 */
export function MarkdownLite({ text, class: className }: { text: string; class?: string }) {
  const blocks = parseMarkdownLite(text);
  return (
    <div class={className ? `md-lite ${className}` : 'md-lite'}>
      {blocks.map((block, b) =>
        block.type === 'list' ? (
          <ul key={b}>
            {block.items.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={b}>
            {block.lines.map((line, l) => (
              <>
                {l > 0 && <br />}
                {renderInline(line)}
              </>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

function renderInline(nodes: Inline[]): ComponentChildren {
  return nodes.map((node, i) => {
    if (node.type === 'bold') return <strong key={i}>{renderInline(node.children)}</strong>;
    if (node.type === 'code') return <code key={i}>{node.text}</code>;
    return node.text;
  });
}
