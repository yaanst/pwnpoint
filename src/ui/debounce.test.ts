import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncer } from './debounce';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createDebouncer', () => {
  it('runs once after the last call', () => {
    const task = vi.fn();
    const d = createDebouncer(task, 500);
    d.schedule();
    vi.advanceTimersByTime(400);
    d.schedule();
    vi.advanceTimersByTime(400);
    expect(task).not.toHaveBeenCalled();
    expect(d.pending).toBe(true);
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(1);
    expect(d.pending).toBe(false);
  });

  it('flush runs a pending task now, and only once', () => {
    const task = vi.fn();
    const d = createDebouncer(task, 500);
    d.flush();
    expect(task).not.toHaveBeenCalled();
    d.schedule();
    d.flush();
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a pending task', () => {
    const task = vi.fn();
    const d = createDebouncer(task, 500);
    d.schedule();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();
  });
});
