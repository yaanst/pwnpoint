import { useEffect, useState } from 'preact/hooks';
import { type Evidence, getEvidenceBytes } from '../evidence/repository';
import type { Vault } from '../storage/vault';
import type { SlideTheme } from './theme';

/** Object URLs for the evidence images shown on a slide and the theme logo. Revoked on change. */
export function useSlideImages(vault: Vault, evidence: Evidence[], theme: SlideTheme | null) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key =
    evidence.map((e) => `${e.id}:${e.byteLength}`).join() +
    `|${theme?.logo?.bytes.byteLength ?? 0}`;
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const make = (bytes: Uint8Array<ArrayBuffer>) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      created.push(url);
      return url;
    };
    void (async () => {
      const next: Record<string, string> = {};
      for (const e of evidence) {
        const bytes = await getEvidenceBytes(vault, e.id);
        if (bytes) next[e.id] = make(bytes);
      }
      if (theme?.logo) next.logo = make(theme.logo.bytes);
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [vault, key]);
  return urls;
}
