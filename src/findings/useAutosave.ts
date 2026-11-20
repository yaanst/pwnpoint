import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createDebouncer } from '../ui/debounce';
import { trackSave } from './pendingSaves';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

/**
 * Saves `value` `delay` ms after the last change, and immediately when the page is hidden or
 * the editor unmounts, so nothing typed is lost.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<unknown>, delay = 600) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latest = useRef(value);
  const statusRef = useRef<SaveStatus>('saved');
  statusRef.current = status;
  const first = useRef(true);
  latest.current = value;

  const debouncer = useMemo(
    () =>
      createDebouncer(() => {
        setStatus('saving');
        trackSave(save(latest.current)).then(
          () => setStatus((s) => (s === 'saving' ? 'saved' : s)),
          () => setStatus('error'),
        );
      }, delay),
    // The save function is stable for one editor instance.
    [],
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('unsaved');
    debouncer.schedule();
  }, [value, debouncer]);

  useEffect(() => {
    const flush = () => debouncer.flush();
    // A write started while the page unloads may not finish: ask the browser to confirm leaving.
    const warn = (e: BeforeUnloadEvent) => {
      if (debouncer.pending || statusRef.current === 'saving' || statusRef.current === 'unsaved') {
        debouncer.flush();
        e.preventDefault();
      }
    };
    addEventListener('pagehide', flush);
    addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', flush);
    return () => {
      removeEventListener('pagehide', flush);
      removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', flush);
      debouncer.flush();
    };
  }, [debouncer]);

  return {
    status,
    /** Drops any pending save, e.g. before deleting the record. */
    cancel: () => debouncer.cancel(),
  };
}
