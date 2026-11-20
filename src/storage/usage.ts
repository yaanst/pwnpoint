export interface StorageUsage {
  usage: number;
  quota: number;
}

/** Warn above 1 GB used or 80% of the quota the browser grants. */
export const WARN_BYTES = 1024 ** 3;
export const WARN_RATIO = 0.8;

export function storageWarning(u: StorageUsage | null): string | null {
  if (!u) return null;
  const nearQuota = u.quota > 0 && u.usage / u.quota >= WARN_RATIO;
  if (u.usage < WARN_BYTES && !nearQuota) return null;
  const pct =
    u.quota > 0 ? ` (${Math.round((u.usage / u.quota) * 100)}% of what the browser allows)` : '';
  return `PwnPoint uses ${formatBytes(u.usage)} of browser storage${pct}. Save a mission file and remove old projects or large screenshots to stay safe.`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export async function storageUsage(): Promise<StorageUsage | null> {
  try {
    const e = await globalThis.navigator?.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
