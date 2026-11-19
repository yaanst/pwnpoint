import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Build plugin that turns Vite's output into ONE self-contained HTML file:
 * every JS chunk and CSS file is inlined, then a hash-based Content Security
 * Policy is injected as the first element of <head>. No `'self'`, no
 * `'unsafe-inline'`: only the exact inlined code may run.
 */

export function sha256(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** Make JS safe to embed in <script>. `<\/script` means the same in strings, regexes and templates. */
export function escapeInlineScript(js: string): string {
  if (js.includes('<!--')) {
    throw new Error(
      'single-file: "<!--" in a script would break HTML parsing; avoid it in source.',
    );
  }
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

export function escapeInlineStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

export function buildCsp(scriptHashes: string[], styleHashes: string[]): string {
  const list = (hashes: string[]) => (hashes.length ? hashes.join(' ') : "'none'");
  return [
    "default-src 'none'",
    `script-src ${list(scriptHashes)}`,
    `style-src ${list(styleHashes)}`,
    'img-src blob: data:',
    'font-src data:',
    "connect-src 'none'",
    "media-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "manifest-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const SCRIPT_TAG = /<script\b[^>]*\bsrc="(?:\.\/)?([^"]+)"[^>]*><\/script>/g;
const STYLE_TAG = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(?:\.\/)?([^"]+)"[^>]*>/g;

/** Inline assets into the HTML and add the CSP. `read` returns an asset's text or undefined. */
export function inlineHtml(html: string, read: (fileName: string) => string | undefined): string {
  const scriptHashes: string[] = [];
  const styleHashes: string[] = [];
  const missing = (f: string) => new Error(`single-file: cannot inline missing asset ${f}`);

  let out = html.replace(SCRIPT_TAG, (_tag, file: string) => {
    const code = read(file);
    if (code === undefined) throw missing(file);
    const body = escapeInlineScript(code);
    scriptHashes.push(sha256(body));
    return `<script type="module">${body}</script>`;
  });
  out = out.replace(STYLE_TAG, (_tag, file: string) => {
    const css = read(file);
    if (css === undefined) throw missing(file);
    const body = escapeInlineStyle(css);
    styleHashes.push(sha256(body));
    return `<style>${body}</style>`;
  });
  out = out.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');

  if (/\b(?:src|href)="(?!data:|#)[^"]*"/.test(out)) {
    throw new Error('single-file: an external src/href is left in the HTML');
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(scriptHashes, styleHashes)}" />`;
  // Keep <meta charset> first (it must sit in the first 1024 bytes), then the CSP,
  // which must come before any script or style.
  const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(out);
  if (!charset) throw new Error('single-file: index.html needs <meta charset> in <head>');
  const at = charset.index + charset[0].length;
  return `${out.slice(0, at)}\n    ${meta}${out.slice(at)}`;
}

export function singleFile(): Plugin {
  return {
    name: 'pwnpoint-single-file',
    apply: 'build',
    enforce: 'post',
    config: () => ({
      build: {
        assetsInlineLimit: () => true,
        cssCodeSplit: false,
        modulePreload: false,
        rolldownOptions: { output: { codeSplitting: false } },
      },
    }),
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') throw new Error('single-file: index.html not found');
      const inlined = new Set<string>();
      const read = (fileName: string) => {
        const item = bundle[fileName];
        if (!item) return undefined;
        inlined.add(fileName);
        if (item.type === 'chunk') return item.code;
        return typeof item.source === 'string'
          ? item.source
          : new TextDecoder().decode(item.source);
      };
      html.source = inlineHtml(String(html.source), read);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing emitted files is the Rollup API
      for (const fileName of inlined) delete bundle[fileName];
      const leftovers = Object.keys(bundle).filter((f) => f !== 'index.html');
      if (leftovers.length)
        throw new Error(`single-file: unexpected extra files ${leftovers.join(', ')}`);
    },
  };
}
