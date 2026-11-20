/** Tiny app-wide notifications between independent screens (e.g. evidence → slide preview). */
export type AppEvent = 'evidence-changed' | 'theme-changed';

export function emit(event: AppEvent): void {
  dispatchEvent(new Event(`pwnpoint:${event}`));
}

export function on(event: AppEvent, handler: () => void): () => void {
  const name = `pwnpoint:${event}`;
  addEventListener(name, handler);
  return () => removeEventListener(name, handler);
}
