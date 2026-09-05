import { documentKind } from './index';

/** Which reader a picked file gets: the pickers' mime type wins, the name
 * decides when they gave none, and PDF is the fallback (every share is one). */
describe('documentKind', () => {
  it('trusts the picker mime type', () => {
    expect(documentKind('receipt.pdf', 'image/jpeg')).toBe('image');
    expect(documentKind('IMG_0042.HEIC', 'application/pdf')).toBe('pdf');
    // The photo picker can only promise "some image".
    expect(documentKind('', 'image/*')).toBe('image');
  });

  it('falls back to the file name, images by extension', () => {
    expect(documentKind('boarding-pass.png')).toBe('image');
    expect(documentKind('pass.JPG')).toBe('image');
    expect(documentKind('IMG_0042.heic', null)).toBe('image');
    expect(documentKind('file:///tmp/eticket.pdf')).toBe('pdf');
  });

  it('reads an unknown or query-suffixed name as a PDF', () => {
    // An iOS library asset arrives as an id with no extension at all.
    expect(documentKind('file:///tmp/A1B2C3')).toBe('pdf');
    expect(documentKind('itinerary.pdf?download=1')).toBe('pdf');
    // …and a query string doesn't hide the extension either.
    expect(documentKind('pass.jpg?v=2')).toBe('image');
  });
});
