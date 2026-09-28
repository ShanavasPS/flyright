/** Names for a kept booking document. A file shared from another app often
 * arrives as the sharer's temporary copy — Preview and AirDrop hand over
 * "FEE9FDFA-F789-4C8F-98B3-97F33CFEF471.pdf" — and that name then labels the
 * trip's document row. Such a name says nothing, so the document is named
 * from what it holds instead. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{16,}$/i;

/** Whether a file name is a machine's, not a person's: empty, a UUID, or a
 * long run of hex. */
export function isMeaninglessName(name: string | null | undefined): boolean {
  const stem = (name ?? '').trim().replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return !stem || UUID.test(stem) || HEX.test(stem);
}

/** The name to keep: the file's own when it means something, else one built
 * from the booking — "American Airlines booking ANSXYZ.pdf", "AA79 booking
 * 4 Oct.pdf" — or plainly "Booking document". */
export function readableDocumentName(
  name: string | null | undefined,
  booking: { carrier: string | null; flight: string | null; pnr: string | null; date: string | null },
  extension: string,
): string {
  if (!isMeaninglessName(name)) return name!.trim();
  const who = booking.carrier ?? booking.flight;
  const which = booking.pnr ?? (booking.date ? shortDate(booking.date) : null);
  const stem = who && which ? `${who} booking ${which}` : who ? `${who} booking` : 'Booking document';
  return `${stem}.${extension}`;
}

/** What the import screen calls a document it is reading. */
export function documentLabel(name: string | null | undefined): string | null {
  return isMeaninglessName(name) ? null : name!.trim();
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m ?? 1) - 1];
  return `${d} ${month}`;
}
