import {
  getPhotoUploadState,
  markUploadDone,
  markUploading,
  retryUploads,
  uploadSummary,
} from './photo-upload-state';

describe('photo upload state', () => {
  it('tracks one photo from sending to failed to retried', () => {
    markUploading('a');
    expect(getPhotoUploadState().uploading.has('a')).toBe(true);
    markUploadDone('a', false);
    expect(getPhotoUploadState().uploading.has('a')).toBe(false);
    expect(getPhotoUploadState().failed.has('a')).toBe(true);
    const before = getPhotoUploadState().nonce;
    retryUploads();
    expect(getPhotoUploadState().failed.size).toBe(0);
    expect(getPhotoUploadState().nonce).toBe(before + 1);
  });

  it('clears an old failure once the photo goes out', () => {
    markUploadDone('b', false);
    markUploading('b');
    expect(getPhotoUploadState().failed.has('b')).toBe(false);
    markUploadDone('b', true);
    expect(getPhotoUploadState().failed.has('b')).toBe(false);
  });
});

describe('uploadSummary', () => {
  const none = new Set<string>();

  it('says nothing with nothing pending or nothing tried', () => {
    expect(uploadSummary([], { uploading: none, failed: none })).toBeNull();
    expect(uploadSummary(['a'], { uploading: none, failed: none })).toBeNull();
  });

  it('counts from the photo on the wire', () => {
    expect(uploadSummary(['a', 'b'], { uploading: new Set(['a']), failed: none })).toEqual({
      kind: 'uploading',
      current: 1,
      total: 2,
    });
  });

  it('reports the failed ones once nothing is sending', () => {
    expect(uploadSummary(['a', 'b'], { uploading: none, failed: new Set(['a', 'b']) })).toEqual({
      kind: 'waiting',
      count: 2,
      reason: 'offline',
    });
  });

  it('speaks of the failure the traveller has to act on, not a connection', () => {
    const reasons = new Map([['a', 'offline' as const], ['b', 'rejected' as const]]);
    expect(uploadSummary(['a', 'b'], { uploading: none, failed: new Set(['a', 'b']), reasons })).toMatchObject({
      reason: 'rejected',
    });
    reasons.set('a', 'limit' as never);
    expect(uploadSummary(['a', 'b'], { uploading: none, failed: new Set(['a', 'b']), reasons })).toMatchObject({
      reason: 'limit',
    });
  });

  it('forgets a reason once the photo goes out or the traveller retries', () => {
    markUploadDone('c', false, 'rejected');
    expect(getPhotoUploadState().reasons.get('c')).toBe('rejected');
    markUploadDone('c', true);
    expect(getPhotoUploadState().reasons.has('c')).toBe(false);
    markUploadDone('d', false, 'limit');
    retryUploads();
    expect(getPhotoUploadState().reasons.size).toBe(0);
  });
});
