import { documentType } from '../../convex/uploadShared';

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
