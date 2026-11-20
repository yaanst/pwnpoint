/**
 * Runs `task` once, `delay` ms after the last `schedule()` call. `flush()` runs a pending task
 * immediately (e.g. before leaving the page); `cancel()` drops it.
 */
export function createDebouncer(task: () => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule() {
      clear();
      timer = setTimeout(() => {
        timer = undefined;
        task();
      }, delay);
    },
    flush() {
      if (timer === undefined) return;
      clear();
      task();
    },
    cancel: clear,
    get pending() {
      return timer !== undefined;
    },
  };
}
