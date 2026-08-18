import type { JourneyRow } from './journeys';
import { isDirty, planSync, toRemoteJourney, type RemoteJourney } from './sync-merge';

let seq = 0;
function row(overrides: Partial<JourneyRow>): JourneyRow {
  return {
    id: `row-${seq++}`,
    userId: 'user_1',
    mode: 'flight',
    carrier: 'Finnair',
    carrierCountry: 'FI',
    number: 'AY123',
    fromCode: 'HEL',
    fromCountry: 'FI',
    toCode: 'FRA',
    toCountry: 'DE',
    distanceKm: 1539,
    scheduledDeparture: '2026-08-20T08:00:00Z',
    scheduledArrival: '2026-08-20T10:35:00Z',
    ticketPriceAmount: null,
    ticketPriceCurrency: null,
    source: 'lookup',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    deletedAt: null,
    syncedAt: null,
    ...overrides,
  };
}

function remote(overrides: Partial<RemoteJourney>): RemoteJourney {
  return { ...toRemoteJourney(row({})), ...overrides };
}

describe('isDirty', () => {
  it('is dirty when never synced', () => {
    expect(isDirty({ updatedAt: '2026-08-01T00:00:00Z', syncedAt: null })).toBe(true);
  });

  it('is clean when syncedAt matches updatedAt', () => {
    const t = '2026-08-01T00:00:00Z';
    expect(isDirty({ updatedAt: t, syncedAt: t })).toBe(false);
  });

  it('is dirty when edited after the last sync', () => {
    expect(
      isDirty({ updatedAt: '2026-08-02T00:00:00Z', syncedAt: '2026-08-01T00:00:00Z' }),
    ).toBe(true);
  });

  it('treats legacy empty updatedAt as dirty when unsynced', () => {
    expect(isDirty({ updatedAt: '', syncedAt: null })).toBe(true);
  });
});

describe('toRemoteJourney', () => {
  it('maps id to naturalKey and strips userId/syncedAt', () => {
    const wire = toRemoteJourney(
      row({ id: 'AY123-2026-08-20', userId: 'user_1', syncedAt: '2026-08-01T00:00:00Z' }),
    );
    expect(wire.naturalKey).toBe('AY123-2026-08-20');
    expect('userId' in wire).toBe(false);
    expect('syncedAt' in wire).toBe(false);
    expect('id' in wire).toBe(false);
  });
});

describe('planSync', () => {
  it('pushes dirty local-only rows', () => {
    const dirty = row({ syncedAt: null });
    const plan = planSync([dirty], []);
    expect(plan.pushRows).toEqual([dirty]);
    expect(plan.applyLocally).toEqual([]);
  });

  it('skips clean local-only rows', () => {
    const clean = row({ updatedAt: '2026-08-01T00:00:00Z', syncedAt: '2026-08-01T00:00:00Z' });
    expect(planSync([clean], [])).toEqual({ pushRows: [], applyLocally: [] });
  });

  it('applies remote-only rows', () => {
    const incoming = remote({ naturalKey: 'other-device-trip' });
    const plan = planSync([], [incoming]);
    expect(plan.applyLocally).toEqual([incoming]);
    expect(plan.pushRows).toEqual([]);
  });

  it('does nothing on equal updatedAt (the loop fixpoint)', () => {
    const t = '2026-08-05T00:00:00Z';
    const localRow = row({ id: 'k', updatedAt: t, syncedAt: null });
    const remoteRow = remote({ naturalKey: 'k', updatedAt: t });
    expect(planSync([localRow], [remoteRow])).toEqual({ pushRows: [], applyLocally: [] });
  });

  it('applies the remote side when it is newer, even if local is dirty', () => {
    const localRow = row({ id: 'k', updatedAt: '2026-08-01T00:00:00Z', syncedAt: null });
    const remoteRow = remote({ naturalKey: 'k', updatedAt: '2026-08-02T00:00:00Z' });
    const plan = planSync([localRow], [remoteRow]);
    expect(plan.applyLocally).toEqual([remoteRow]);
    expect(plan.pushRows).toEqual([]);
  });

  it('pushes the local side when it is newer and dirty', () => {
    const localRow = row({
      id: 'k',
      updatedAt: '2026-08-03T00:00:00Z',
      syncedAt: '2026-08-01T00:00:00Z',
    });
    const remoteRow = remote({ naturalKey: 'k', updatedAt: '2026-08-01T00:00:00Z' });
    const plan = planSync([localRow], [remoteRow]);
    expect(plan.pushRows).toEqual([localRow]);
    expect(plan.applyLocally).toEqual([]);
  });

  it('lets any remote row beat a legacy empty local updatedAt', () => {
    const legacy = row({ id: 'k', updatedAt: '', syncedAt: null });
    const remoteRow = remote({ naturalKey: 'k', updatedAt: '2020-01-01T00:00:00Z' });
    expect(planSync([legacy], [remoteRow]).applyLocally).toEqual([remoteRow]);
  });

  it('applies a newer remote tombstone (delete propagates in)', () => {
    const localRow = row({ id: 'k', updatedAt: '2026-08-01T00:00:00Z', syncedAt: '2026-08-01T00:00:00Z' });
    const tombstone = remote({
      naturalKey: 'k',
      updatedAt: '2026-08-02T00:00:00Z',
      deletedAt: '2026-08-02T00:00:00Z',
    });
    expect(planSync([localRow], [tombstone]).applyLocally).toEqual([tombstone]);
  });

  it('pushes a dirty local tombstone (delete propagates out)', () => {
    const deleted = row({
      id: 'k',
      updatedAt: '2026-08-02T00:00:00Z',
      deletedAt: '2026-08-02T00:00:00Z',
      syncedAt: '2026-08-01T00:00:00Z',
    });
    const plan = planSync([deleted], [remote({ naturalKey: 'k', updatedAt: '2026-08-01T00:00:00Z' })]);
    expect(plan.pushRows).toEqual([deleted]);
    expect(plan.pushRows[0]!.deletedAt).toBe('2026-08-02T00:00:00Z');
  });

  it('handles mixed sets independently', () => {
    const pushMe = row({ id: 'a', syncedAt: null });
    const fetchMe = remote({ naturalKey: 'b' });
    const t = '2026-08-05T00:00:00Z';
    const settled = row({ id: 'c', updatedAt: t, syncedAt: t });
    const settledRemote = remote({ naturalKey: 'c', updatedAt: t });
    const plan = planSync([pushMe, settled], [fetchMe, settledRemote]);
    expect(plan.pushRows.map((r) => r.id)).toEqual(['a']);
    expect(plan.applyLocally.map((r) => r.naturalKey)).toEqual(['b']);
  });
});
