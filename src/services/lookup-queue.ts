/**
 * One provider call at a time, with a breath between them.
 *
 * The flight-data plan allows a handful of requests per second, and a
 * multi-leg receipt used to ask for every leg in the same instant; the calls
 * the provider refused were quietly saved as journal entries with no live
 * tracking. Every live lookup now goes through this queue, so a burst from
 * one screen — the import, the flight watch, add-flight — arrives at the
 * provider spaced out, whoever triggered it. Failures release the queue like
 * successes: one leg's error never holds the next leg up.
 */
export function createSerialQueue(gapMs: number) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastFinishedAt = 0;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    const turn = tail.then(async () => {
      const wait = lastFinishedAt + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        lastFinishedAt = Date.now();
      }
    });
    // The chain must survive a rejected task, or every later call would fail
    // with the first one's error.
    tail = turn.catch(() => undefined);
    return turn;
  };
}

/** How long the queue waits between two provider calls. Well inside the
 * plan's per-second allowance even with the poller's own traffic alongside. */
export const LOOKUP_GAP_MS = 350;
