import { planDocumentSync, type RemoteDocument, type TripDocumentRow } from '@/services/trip-document-sync-plan';

const row = (over: Partial<TripDocumentRow> = {}): TripDocumentRow => ({
  id: 'doc-1',
  journeyId: 'AA79-2026-10-04',
  userId: 'user_1',
  uri: 'file:///docs/trip-documents/doc-1.pdf',
  name: 'Booking ANSLKA.pdf',
  mimeType: 'application/pdf',
  size: 120_000,
  storageId: null,
  createdAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
  deletedAt: null,
  syncedAt: null,
  ...over,
});

const remote = (over: Partial<RemoteDocument> = {}): RemoteDocument => ({
  documentId: 'doc-1',
  journeyKey: 'AA79-2026-10-04',
  storageId: 'kg2abc',
  name: 'Booking ANSLKA.pdf',
  mimeType: 'application/pdf',
  size: 120_000,
  createdAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
  deletedAt: null,
  url: 'https://example.convex.cloud/api/storage/kg2abc',
  ...over,
});

describe('planDocumentSync', () => {
  it('uploads a document kept on this phone before pushing it', () => {
    const plan = planDocumentSync([row()], []);
    expect(plan.upload.map((r) => r.id)).toEqual(['doc-1']);
    expect(plan.push).toEqual([]);
  });

  it('pushes a removal without uploading anything', () => {
    const plan = planDocumentSync([row({ deletedAt: '2026-09-28T11:00:00.000Z', updatedAt: '2026-09-28T11:00:00.000Z' })], [remote()]);
    expect(plan.push.map((r) => r.id)).toEqual(['doc-1']);
    expect(plan.upload).toEqual([]);
  });

  it('pulls a document another device kept', () => {
    const plan = planDocumentSync([], [remote()]);
    expect(plan.apply.map((r) => r.documentId)).toEqual(['doc-1']);
  });

  it('ignores a tombstone for a document this phone never had', () => {
    expect(planDocumentSync([], [remote({ deletedAt: '2026-09-28T11:00:00.000Z' })]).apply).toEqual([]);
  });

  it('is at rest once both sides carry the same stamp', () => {
    const synced = row({ storageId: 'kg2abc', syncedAt: '2026-09-28T10:00:00.000Z' });
    expect(planDocumentSync([synced], [remote()])).toEqual({ upload: [], push: [], apply: [] });
  });

  it('sends the bytes again when the server cannot tie its file to this account', () => {
    const plan = planDocumentSync([row({ storageId: 'kg2abc', syncedAt: '2026-09-28T10:00:00.000Z' })], [remote({ needsUpload: true })]);
    expect(plan.upload).toHaveLength(1);
    expect(plan.upload[0]!.storageId).toBeNull();
    expect(plan.upload[0]!.updatedAt > '2026-09-28T10:00:00.000Z').toBe(true);
  });
});
