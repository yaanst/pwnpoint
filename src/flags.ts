/**
 * Feature flags. Unfinished features are merged behind a flag set to `false`
 * instead of living on long-lived branches. Flip a flag in one small PR once
 * the feature is complete.
 */
export const flags = {
  /** CVSS 3.1 temporal and environmental metrics (milestone 7). */
  cvssAdvanced: false,
  /** Branching attack scenarios, i.e. small DAGs (milestone 7). */
  scenarioBranches: false,
} as const satisfies Record<string, boolean>;

export type Flag = keyof typeof flags;

export function isEnabled(flag: Flag): boolean {
  return flags[flag];
}
