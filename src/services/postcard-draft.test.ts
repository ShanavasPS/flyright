import { clearPostcardDraft, keepDraftPhoto, readPostcardDraft, savePostcardDraft } from './postcard-draft';
import type { PickedImage } from './photos';

const mockStorage = new Map<string, string>();
const mockFiles = new Set<string>();
let mockDocument = 'file:///container-a/Documents';
jest.mock('expo-sqlite/kv-store', () => ({
  getItemSync: (key: string) => mockStorage.get(key) ?? null,
  setItemSync: (key: string, value: string) => mockStorage.set(key, value),
  removeItemSync: (key: string) => mockStorage.delete(key),
}));
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    copy(target: File) { if (!this.exists) throw new Error('Missing file'); mockFiles.add(target.uri); }
    delete() { mockFiles.delete(this.uri); }
    create() { mockFiles.add(this.uri); }
  }
  return { File, Directory: File, Paths: { get document() { return mockDocument; } } };
});
beforeEach(() => { mockStorage.clear(); mockFiles.clear(); mockDocument = 'file:///container-a/Documents'; });

it('retains caption and photo independently for each account and trip', () => {
  mockFiles.add('file:///picker/photo.jpg');
  const picked = keepDraftPhoto({ uri: 'file:///picker/photo.jpg', width: 600, height: 400 } as PickedImage);
  savePostcardDraft('traveller', 'trip-a', { text: 'For my family', picked });
  expect(readPostcardDraft('traveller', 'trip-a')).toEqual({ text: 'For my family', picked });
  expect(readPostcardDraft('another-account', 'trip-a')).toEqual({ text: '', picked: null });
  expect(readPostcardDraft('traveller', 'trip-b')).toEqual({ text: '', picked: null });
  expect(mockFiles.has('file:///picker/photo.jpg')).toBe(true);
});

it('restores the photo after an app update moves the document container', () => {
  mockFiles.add('file:///picker/photo.jpg');
  const picked = keepDraftPhoto({ uri: 'file:///picker/photo.jpg' } as PickedImage);
  savePostcardDraft('traveller', 'trip-a', { text: 'Still here', picked });
  mockDocument = 'file:///container-b/Documents';
  mockFiles.delete(picked.uri);
  const movedUri = picked.uri.replace('container-a', 'container-b');
  mockFiles.add(movedUri);
  expect(readPostcardDraft('traveller', 'trip-a')).toEqual({ text: 'Still here', picked: { ...picked, uri: movedUri } });
  clearPostcardDraft('traveller', 'trip-a');
  expect(mockFiles.has(movedUri)).toBe(false);
  expect(mockFiles.has('file:///picker/photo.jpg')).toBe(true);
});

it('keeps the caption when its photo is unavailable and never deletes unrelated files', () => {
  const uri = 'file:///container-a/Documents/private-journal/photo.jpg';
  mockFiles.add(uri);
  savePostcardDraft('traveller', 'trip-a', { text: 'Keep my words', picked: { uri } as PickedImage });
  expect(readPostcardDraft('traveller', 'trip-a')).toEqual({ text: 'Keep my words', picked: null });
  clearPostcardDraft('traveller', 'trip-a');
  expect(mockFiles.has(uri)).toBe(true);
});
