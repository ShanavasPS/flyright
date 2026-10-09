import { documentType, heifSize, imageType } from '../../convex/uploadShared';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('documentType', () => {
  it('takes a PDF by its header, whatever the file was called', () => {
    expect(documentType(ascii('%PDF-1.7\n%âãÏÓ'))).toBe('application/pdf');
  });

  it('never takes markup, which would be served from our storage domain', () => {
    expect(documentType(ascii('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(documentType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('does not take a truncated or empty file', () => {
    expect(documentType(ascii('%PD'))).toBeNull();
    expect(documentType(bytes())).toBeNull();
  });
});

/** A minimal HEIC the way an iPhone lays it out: ftyp, then a meta box whose
 * item properties declare a 512 px tile and the whole picture, then mdat. */
function heic({ brand = 'heic', compatible = ['mif1', 'MiHE'], width = 4032, height = 3024, mdat = new Uint8Array(32) } = {}) {
  const box = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(ascii(type), 4);
    out.set(body, 8);
    return out;
  };
  const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };
  const ispe = (w: number, h: number) => {
    const body = new Uint8Array(12);
    const view = new DataView(body.buffer);
    view.setUint32(4, w);
    view.setUint32(8, h);
    return box('ispe', body);
  };
  const ftyp = box('ftyp', concat(ascii(brand), new Uint8Array(4), ...compatible.map(ascii)));
  const meta = box('meta', concat(new Uint8Array(4), box('iprp', box('ipco', concat(ispe(512, 512), ispe(width, height))))));
  return concat(ftyp, meta, box('mdat', mdat));
}

describe('imageType for HEIC', () => {
  it('takes an iPhone HEIC photo and reads the whole picture, not a tile', () => {
    expect(heifSize(heic())).toEqual({ width: 4032, height: 3024 });
    expect(imageType(heic())).toBe('image/heic');
  });

  it('takes the generic HEIF brand too', () => {
    expect(imageType(heic({ brand: 'mif1' }))).toBe('image/heic');
  });

  it('keeps the 40 megapixel cap for HEIC', () => {
    expect(imageType(heic({ width: 8064, height: 6048 }))).toBeNull();
  });

  it('never reads a size out of the pixel data', () => {
    const decoy = new Uint8Array(32);
    decoy.set([0, 0, 0, 20], 0);
    decoy.set(ascii('ispe'), 4);
    decoy.set([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], 8);
    expect(heifSize(heic({ mdat: decoy }))).toEqual({ width: 4032, height: 3024 });
  });

  it('refuses other ISO media files and broken boxes', () => {
    expect(imageType(heic({ brand: 'isom', compatible: ['iso2', 'mp41'] }))).toBeNull(); // an MP4
    const truncated = heic().slice(0, 40);
    expect(imageType(truncated)).toBeNull();
  });
});
