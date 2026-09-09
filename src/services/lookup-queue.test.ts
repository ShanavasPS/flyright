import { createSerialQueue } from './lookup-queue';

describe('createSerialQueue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs tasks one at a time with the gap between them', async () => {
    const run = createSerialQueue(300);
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`start ${name} @${Date.now()}`);
      await new Promise<void>((r) => setTimeout(r, 100));
      log.push(`end ${name}`);
      return name;
    };
    const t0 = Date.now();
    const all = Promise.all([run(task('a')), run(task('b')), run(task('c'))]);
    await jest.advanceTimersByTimeAsync(2000);
    expect(await all).toEqual(['a', 'b', 'c']);
    expect(log).toEqual([
      `start a @${t0}`,
      'end a',
      `start b @${t0 + 100 + 300}`,
      'end b',
      `start c @${t0 + 2 * (100 + 300)}`,
      'end c',
    ]);
  });

  it('keeps going after a task fails, and hands the failure to its caller alone', async () => {
    const run = createSerialQueue(0);
    // The expectation is attached before the clock moves, so the rejection is
    // never unhandled in between.
    const failing = expect(
      run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const next = run(async () => 'ok');
    await jest.advanceTimersByTimeAsync(10);
    await failing;
    expect(await next).toBe('ok');
  });
});
