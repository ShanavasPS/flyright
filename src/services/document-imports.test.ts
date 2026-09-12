import { inboxFile, importDocument, registerDocument, registerInboxDocument } from './document-imports';

const mockFiles = new Map<string, { size: number; deleted?: boolean }>();
const mockRead = jest.fn();
let mockNext = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `handle-${++mockNext}` }));
jest.mock('../../modules/flyright-document-import', () => ({
  documentKind: (name: string, type: string) => type?.startsWith('image/') || /\.png$/.test(name) ? 'image' : 'pdf',
  readDocument: (...args: unknown[]) => mockRead(...args),
}));
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, child: string) { this.uri = `${parent.uri}${child}/`; }
    create() {}
    list() { return []; }
  }
  class File {
    uri: string;
    constructor(parent: string | { uri: string }, child?: string) { this.uri = typeof parent === 'string' ? parent : `${parent.uri}${child}`; }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.size ?? 0; }
    copy(to: File) { mockFiles.set(to.uri, { size: this.size }); }
    delete() { const item = mockFiles.get(this.uri); if (item) item.deleted = true; }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///Documents/' } } };
});


describe('document import authority', () => {
  beforeEach(() => { mockFiles.clear(); mockRead.mockReset(); });
  it('never interprets a URL parameter or arbitrary path as a file handle', () => {
    const privateFile = 'file:///Documents/SQLite/flyright.db';
    mockFiles.set(privateFile, { size: 100 });
    expect(importDocument(privateFile)).toBeNull();
    expect(importDocument('guessed-handle')).toBeNull();
    expect(() => registerInboxDocument(privateFile)).toThrow();
    expect(mockFiles.get(privateFile)?.deleted).toBeUndefined();
    expect(mockRead).not.toHaveBeenCalled();
  });
  it.each([
    'file:///Documents/Inbox/../SQLite/flyright.db',
    'file:///Documents/Inbox/%2e%2e/SQLite/flyright.db',
    'file:///Documents/Inbox/%252e%252e%252fsecret',
    'file:///Documents/Inbox/a%2fb.pdf',
    'file://attacker/Documents/Inbox/a.pdf',
    'https://attacker/a.pdf',
    'file:///Documents/Inbox/a.pdf?uri=other',
  ])('rejects ambiguous Inbox URL %s', uri => {
    expect(inboxFile(uri, 'file:///Documents/')).toBe(false);
  });
  it('accepts an actual iOS Inbox document and reads only its dedicated copy once', async () => {
    const source = 'file:///Documents/Inbox/Boarding%20pass.pdf';
    mockFiles.set(source, { size: 100 });
    mockRead.mockResolvedValue({ pageCount: 1, pages: [{ text: 'Ticket', barcodes: [] }] });
    const handle = registerInboxDocument(source);
    const document = importDocument(handle)!;
    const first = document.read();
    expect(importDocument(handle)!.read()).toBe(first);
    await first;
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockRead).toHaveBeenCalledWith(`file:///cache/document-imports/${handle}`, 'pdf');
    expect(mockFiles.get(`file:///cache/document-imports/${handle}`)?.deleted).toBe(true);
  });
  it('cleans up only its copy when readers fail, and bounds input bytes before copying', async () => {
    const source = 'file:///cache/picked.pdf';
    mockFiles.set(source, { size: 100 });
    mockRead.mockRejectedValue(new Error('invalid document'));
    const handle = registerDocument({ uri: source });
    await expect(importDocument(handle)!.read()).rejects.toThrow('invalid document');
    expect(mockFiles.get(source)?.deleted).toBeUndefined();
    expect(mockFiles.get(`file:///cache/document-imports/${handle}`)?.deleted).toBe(true);
    mockFiles.set(source, { size: 21 * 1024 * 1024 });
    expect(() => registerDocument({ uri: source })).toThrow('20 MB');
  });
});
