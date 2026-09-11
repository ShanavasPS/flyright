import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { useLiveRow, useLiveRows } from './live-rows';

// drizzle's hook, replaced with a controllable stand-in: the test decides
// when each "read" lands and what it returns, exactly as expo-sqlite would.
type Live = { data: unknown[]; error: undefined; updatedAt: Date | undefined };
let mockLive: Live = { data: [], error: undefined, updatedAt: undefined };
jest.mock('drizzle-orm/expo-sqlite', () => ({ useLiveQuery: () => mockLive }));

const query = {} as Parameters<typeof useLiveRows>[0];

function mount(deps: () => unknown[]) {
  let latest: ReturnType<typeof useLiveRows>;
  function Probe() {
    latest = useLiveRows(query, deps());
    return null;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(createElement(Probe));
  });
  return {
    rerender: () => act(() => root.update(createElement(Probe))),
    get data() {
      return latest.data;
    },
  };
}

beforeEach(() => {
  mockLive = { data: [], error: undefined, updatedAt: undefined };
});

describe('useLiveRows', () => {
  it('hides the seed [] until the first read lands', () => {
    const probe = mount(() => ['u1']);
    expect(probe.data).toBeUndefined();

    mockLive = { data: [{ id: 'a' }], error: undefined, updatedAt: new Date() };
    probe.rerender();
    expect(probe.data).toEqual([{ id: 'a' }]);
  });

  it('goes back to loading when deps change, until a newer read lands', () => {
    // Cold start: Clerk hasn't restored the session, so the viewer is null
    // and the anonymous read honestly finds nothing.
    let userId: string | null = null;
    const probe = mount(() => [userId ?? '']);
    const anonymousRead = new Date(1);
    mockLive = { data: [], error: undefined, updatedAt: anonymousRead };
    probe.rerender();
    expect(probe.data).toEqual([]);

    // The session lands; drizzle still holds the anonymous answer while the
    // user-scoped query re-runs. That must read as "loading", not "empty".
    userId = 'u1';
    probe.rerender();
    expect(probe.data).toBeUndefined();
    probe.rerender(); // still nothing new from the store
    expect(probe.data).toBeUndefined();

    mockLive = { data: [{ id: 'trip' }], error: undefined, updatedAt: new Date(2) };
    probe.rerender();
    expect(probe.data).toEqual([{ id: 'trip' }]);
  });

  it('keeps showing rows across re-renders with unchanged deps', () => {
    const probe = mount(() => ['u1']);
    mockLive = { data: [{ id: 'a' }], error: undefined, updatedAt: new Date() };
    probe.rerender();
    probe.rerender();
    expect(probe.data).toEqual([{ id: 'a' }]);
  });
});

describe('useLiveRow', () => {
  it('reports loaded only for the current deps', () => {
    let id = 'one';
    let latest!: ReturnType<typeof useLiveRow>;
    function Probe() {
      latest = useLiveRow(query, [id]);
      return null;
    }
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(createElement(Probe));
    });
    expect(latest.loaded).toBe(false);

    mockLive = { data: [{ id: 'one' }], error: undefined, updatedAt: new Date(1) };
    act(() => root.update(createElement(Probe)));
    expect(latest.loaded).toBe(true);
    expect(latest.row).toEqual({ id: 'one' });

    id = 'two';
    act(() => root.update(createElement(Probe)));
    expect(latest.loaded).toBe(false);
    expect(latest.row).toBeUndefined();

    mockLive = { data: [], error: undefined, updatedAt: new Date(2) };
    act(() => root.update(createElement(Probe)));
    expect(latest.loaded).toBe(true);
    expect(latest.row).toBeUndefined();
  });
});
