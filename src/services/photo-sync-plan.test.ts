import { isPhotoDirty, planPhotoSync, toRemotePhoto, type RemotePhoto, type TripPhotoRow } from './photo-sync-plan';

let seq = 0;
function row(overrides: Partial<TripPhotoRow>): TripPhotoRow {
  return {
    id: `photo-${seq++}`,
    journeyId: 'AY123-2026-08-20',
    userId: 'user_1',
    uri: 'file:///docs/trip-photos/a.jpg',
    width: 3000,
    height: 4000,
    storageId: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    deletedAt: null,
    syncedAt: null,
    ...overrides,
  };
}
function remote(overrides: Partial<RemotePhoto>): RemotePhoto {
  return {
    photoId: 'remote-photo',
    journeyKey: 'AY123-2026-08-20',
    storageId: 'kg2abc',
    width: 3000,
    height: 4000,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    deletedAt: null,
    url: 'https://x.convex.cloud/api/storage/abc',
    ...overrides,
  };
}

describe('isPhotoDirty', () => {
  it('is dirty until synced, and again after a later edit', () => {
    expect(isPhotoDirty(row({}))).toBe(true);
    expect(isPhotoDirty(row({ syncedAt: '2026-08-01T00:00:00Z' }))).toBe(false);
    expect(isPhotoDirty(row({ updatedAt: '2026-08-02T00:00:00Z', syncedAt: '2026-08-01T00:00:00Z' }))).toBe(true);
  });
});

describe('toRemotePhoto', () => {
  it('maps the local id to photoId and drops uri/userId/syncedAt', () => {
    const wire = toRemotePhoto(row({ id: 'p1', storageId: 'kg1' }));
    expect(wire).toEqual({
      photoId: 'p1',
      journeyKey: 'AY123-2026-08-20',
      storageId: 'kg1',
      width: 3000,
      height: 4000,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      deletedAt: null,
    });
    expect(wire).not.toHaveProperty('uri');
  });
});

describe('planPhotoSync', () => {
  it('uploads a fresh local photo and pushes one that already has bytes on the server', () => {
    const fresh = row({});
    const uploaded = row({ storageId: 'kg1' });
    const plan = planPhotoSync([fresh, uploaded], []);
    expect(plan.upload).toEqual([fresh]);
    expect(plan.push).toEqual([uploaded]);
    expect(plan.apply).toEqual([]);
  });

  it('pushes a tombstone without trying to upload it', () => {
    const gone = row({ deletedAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z' });
    const plan = planPhotoSync([gone], []);
    expect(plan.push).toEqual([gone]);
    expect(plan.upload).toEqual([]);
  });

  it('applies remote photos this device has never seen, but not remote tombstones', () => {
    const incoming = remote({ photoId: 'new' });
    const deadElsewhere = remote({ photoId: 'gone', deletedAt: '2026-08-02T00:00:00Z', storageId: null, url: null });
    const plan = planPhotoSync([], [incoming, deadElsewhere]);
    expect(plan.apply).toEqual([incoming]);
  });

  it('treats an equal stamp as in sync — the loop-breaking fixpoint', () => {
    const t = '2026-08-01T00:00:00Z';
    const local = row({ id: 'k', storageId: 'kg1', updatedAt: t, syncedAt: t });
    expect(planPhotoSync([local], [remote({ photoId: 'k', updatedAt: t })])).toEqual({
      upload: [],
      push: [],
      apply: [],
    });
  });

  it('lets the newer side win in both directions', () => {
    const local = row({ id: 'k', storageId: 'kg1', updatedAt: '2026-08-01T00:00:00Z', syncedAt: '2026-08-01T00:00:00Z' });
    const newerRemote = remote({ photoId: 'k', updatedAt: '2026-08-03T00:00:00Z', deletedAt: '2026-08-03T00:00:00Z' });
    expect(planPhotoSync([local], [newerRemote]).apply).toEqual([newerRemote]);

    const edited = row({ id: 'k', storageId: 'kg1', deletedAt: '2026-08-04T00:00:00Z', updatedAt: '2026-08-04T00:00:00Z', syncedAt: '2026-08-01T00:00:00Z' });
    const plan = planPhotoSync([edited], [remote({ photoId: 'k', updatedAt: '2026-08-02T00:00:00Z' })]);
    expect(plan.push).toEqual([edited]);
    expect(plan.apply).toEqual([]);
  });
});
