/**
 * Finding categories: an optional code inserted in the reference (VLN.NET.01). Each category has
 * its own counter, and findings without a category keep VLN.01, VLN.02…
 * Pure module: no DOM, no I/O.
 */

export interface Category {
  /** 2 to 6 capital letters or digits, starting with a letter: NET, PHY, WIFI2… */
  code: string;
  name: string;
}

/** Built into every project. Projects can add their own (Project.categories). */
export const DEFAULT_CATEGORIES: readonly Category[] = [
  { code: 'PHY', name: 'Physical' },
  { code: 'NET', name: 'Network (LAN, WAN, Wi-Fi)' },
  { code: 'WEB', name: 'Web applications and websites' },
  { code: 'APP', name: 'Applications' },
  { code: 'AD', name: 'Active Directory' },
  { code: 'SYS', name: 'Systems and services' },
  { code: 'WIN', name: 'Windows' },
  { code: 'LIN', name: 'Linux' },
];

export const CATEGORY_CODE = /^[A-Z][A-Z0-9]{1,5}$/;
export const MAX_CATEGORY_NAME = 100;
/** Codes that would make a reference ambiguous. */
const RESERVED = new Set(['VLN', 'SCN']);

/** Built-in categories first, then the project's own, in the order they were added. */
export function allCategories(custom: readonly Category[] | undefined): Category[] {
  return [...DEFAULT_CATEGORIES, ...(custom ?? [])];
}

/** Why a new category cannot be added, phrased for the user; null when it can. */
export function categoryProblem(
  code: string,
  name: string,
  custom: readonly Category[] | undefined,
): string | null {
  if (!CATEGORY_CODE.test(code)) {
    return 'The code must be 2 to 6 capital letters or digits, starting with a letter (e.g. CLOUD).';
  }
  if (RESERVED.has(code)) return `${code} is reserved: choose another code.`;
  if (allCategories(custom).some((c) => c.code === code)) return `${code} already exists.`;
  if (!name.trim()) return 'Give the category a name.';
  if (name.trim().length > MAX_CATEGORY_NAME) {
    return `The name must be at most ${MAX_CATEGORY_NAME} characters.`;
  }
  return null;
}
