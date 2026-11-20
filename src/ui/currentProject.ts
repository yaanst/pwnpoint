const CURRENT_PROJECT_KEY = 'pwnpoint.currentProject';

/** The project last opened (a UI preference: an opaque id), shared by Findings and Scenarios. */
export function rememberedProject(): string | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function rememberProject(id: string): void {
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, id);
  } catch {
    // Storage blocked: the choice is simply not remembered.
  }
}
