import { documentLabel, isMeaninglessName, readableDocumentName } from '@/services/document-name';

const booking = { carrier: 'American Airlines', flight: 'AA79', pnr: 'ANSXYZ', date: '2026-10-04' };

describe('document names', () => {
  it.each(['FEE9FDFA-F789-4C8F-98B3-97F33CFEF471.pdf', 'fee9fdfaf7894c8f98b397f33cfef471.pdf', '', '   ', '.pdf'])(
    'treats %p as a machine name',
    (name) => expect(isMeaninglessName(name)).toBe(true),
  );

  it.each(['AA-booking-ANSXYZ.pdf', 'Boarding pass.pdf', 'IMG_1234.jpg', 'e-ticket 2026.pdf'])('keeps %p', (name) => {
    expect(isMeaninglessName(name)).toBe(false);
    expect(readableDocumentName(name, booking, 'pdf')).toBe(name);
  });

  it('names a shared temporary copy from the booking it holds', () => {
    expect(readableDocumentName('FEE9FDFA-F789-4C8F-98B3-97F33CFEF471.pdf', booking, 'pdf')).toBe(
      'American Airlines booking ANSXYZ.pdf',
    );
  });

  it('falls back to the flight and day, then to a plain name', () => {
    expect(readableDocumentName(null, { ...booking, carrier: null, pnr: null }, 'pdf')).toBe('AA79 booking 4 Oct.pdf');
    expect(readableDocumentName(null, { carrier: null, flight: null, pnr: null, date: null }, 'jpg')).toBe(
      'Booking document.jpg',
    );
  });

  it('gives the import screen no label for a machine name', () => {
    expect(documentLabel('FEE9FDFA-F789-4C8F-98B3-97F33CFEF471.pdf')).toBeNull();
    expect(documentLabel('AA-booking-ANSXYZ.pdf')).toBe('AA-booking-ANSXYZ.pdf');
  });
});
