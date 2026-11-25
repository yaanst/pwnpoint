/**
 * Feature flags. Unfinished features are merged behind a flag set to `false`
 * instead of living on long-lived branches. Flip a flag in one small PR once
 * the feature is complete.
 */
export const flags = {
  /** CVSS 3.1 environmental metrics and score (on since v0.2.0). */
  cvssAdvanced: true,
  /** Branching attack scenarios: alternative paths (on since v0.2.0). */
  scenarioBranches: true,
  /** Full report deck in the report template layout (on since v0.4.0). */
  reportDeck: true,
} as const satisfies Record<string, boolean>;

export type Flag = keyof typeof flags;

export function isEnabled(flag: Flag): boolean {
  return flags[flag];
}
