/**
 * Tracks saves still in flight, so a screen that reads data (e.g. the findings list right after
 * leaving the editor) can wait for them instead of showing stale content.
 */
const inFlight = new Set<Promise<unknown>>();

export function trackSave<T>(save: Promise<T>): Promise<T> {
  inFlight.add(save);
  const done = () => inFlight.delete(save);
  save.then(done, done);
  return save;
}

/** Resolves once every tracked save has settled (successfully or not). */
export async function whenSaved(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

export function hasPendingSaves(): boolean {
  return inFlight.size > 0;
}

/** Asks the browser to confirm leaving while any save is still being written. */
export function guardUnloadWhileSaving(): () => void {
  const warn = (e: BeforeUnloadEvent) => {
    if (hasPendingSaves()) e.preventDefault();
  };
  addEventListener('beforeunload', warn);
  return () => removeEventListener('beforeunload', warn);
}
