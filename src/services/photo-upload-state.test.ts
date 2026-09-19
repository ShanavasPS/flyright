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
    });
  });
});
