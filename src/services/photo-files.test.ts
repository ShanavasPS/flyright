import { fetch } from 'expo/fetch';
import { MAX_PHOTO_BYTES } from '../../convex/uploadShared';
import { resolvePhotoUri, uploadPhotoFile } from './photo-files';

const mockFiles = new Map<string, { bytes: Uint8Array; size?: number; error?: Error }>();
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///current-container/Documents/' } },
  File: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(part => typeof part === 'string' ? part : part.uri)
        .map((part, index) => index < parts.length - 1 ? part.replace(/\/$/, '') : part).join('/');
    }
    get exists() { return mockFiles.has(this.uri); }
    get size() { const file = mockFiles.get(this.uri); return file?.size ?? file?.bytes.length ?? 0; }
    async bytes() {
      const file = mockFiles.get(this.uri);
      if (!file || file.error) throw file?.error ?? new Error('Cannot read file');
      return file.bytes;
    }
  },
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const oldUri = 'file:///var/mobile/Containers/Data/Application/old-container/Documents/trip-photos/mttoe2ek-fzs04vdh.jpg';
const currentUri = 'file:///current-container/Documents/trip-photos/mttoe2ek-fzs04vdh.jpg';
const uploadUrl = 'https://example.convex.site/photo-upload?ticket=test';
const bytes = new Uint8Array([255, 216, 255, 217]);

beforeEach(() => {
  mockFiles.clear();
  jest.resetAllMocks();
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ storageId: 'stored-photo' }) } as Awaited<ReturnType<typeof fetch>>);
});

it('recovers a saved photo path after an iOS container move and uploads the current file', async () => {
  mockFiles.set(currentUri, { bytes });
  expect(resolvePhotoUri(oldUri)).toBe(currentUri);
  expect(resolvePhotoUri(currentUri)).toBe(currentUri);
  await expect(uploadPhotoFile(oldUri, uploadUrl)).resolves.toBe('stored-photo');
  expect(fetch).toHaveBeenCalledWith(uploadUrl, {
    method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: bytes,
  });
});

it.each([
  'https://example.com/trip-photos/a.jpg',
  'file:///old/Documents/Inbox/a.jpg',
  'file:///old/Documents/trip-photos/../private.jpg',
  'file:///old/Documents/trip-photos/%2e%2e%2fprivate.jpg',
  'file://elsewhere/trip-photos/a.jpg',
])('does not rebase a remote, unrelated or ambiguous file: %s', uri => {
  expect(resolvePhotoUri(uri)).toBe(uri);
});

it('rejects a missing photo before any upload starts, leaving the rest of sync able to continue', async () => {
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('unavailable');
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects unreadable files, including a file removed after its existence check', async () => {
  mockFiles.set(currentUri, { bytes, error: new Error('Cannot read file') });
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('Cannot read file');
  expect(fetch).not.toHaveBeenCalled();
});

it('does not send empty, oversized or remote photos to the uploader', async () => {
  mockFiles.set(currentUri, { bytes: new Uint8Array() });
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('unavailable');
  mockFiles.set(currentUri, { bytes, size: MAX_PHOTO_BYTES + 1 });
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('10 MB');
  await expect(uploadPhotoFile('https://example.com/a.jpg', uploadUrl)).rejects.toThrow('not stored');
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps failed uploads retryable instead of treating them as synced', async () => {
  mockFiles.set(currentUri, { bytes });
  jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Awaited<ReturnType<typeof fetch>>);
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('503');
  jest.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('Offline');
  jest.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Awaited<ReturnType<typeof fetch>>);
  await expect(uploadPhotoFile(oldUri, uploadUrl)).rejects.toThrow('storage ID');
});
