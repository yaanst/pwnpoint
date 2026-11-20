/** Characters XML 1.0 forbids (C0 controls except tab, LF, CR; lone surrogates; U+FFFE/F). */
const INVALID = new RegExp(
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.source +
    /|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.source,
  'g',
);

/** Escapes text for XML element content and attribute values, dropping forbidden characters. */
export function xmlEscape(text: string): string {
  return text
    .replace(INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
