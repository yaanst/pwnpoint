import { describe, expect, it } from 'vitest';
import { trackSave, whenSaved } from './pendingSaves';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('pendingSaves', () => {
  it('resolves immediately when nothing is in flight', async () => {
    await expect(whenSaved()).resolves.toBeUndefined();
  });

  it('waits for every in-flight save, including failed ones and ones added meanwhile', async () => {
    const a = deferred();
    const b = deferred();
    const c = deferred();
    trackSave(a.promise);
    trackSave(b.promise).catch(() => {});
    let done = false;
    const waiting = whenSaved().then(() => (done = true));

    a.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    trackSave(c.promise);
    b.reject(new Error('disk full'));
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);
    c.resolve();
    await waiting;
    expect(done).toBe(true);
  });
});
