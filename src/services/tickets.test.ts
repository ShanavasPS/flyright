/**
 * Every ticket in tickets/ — one per airline layout the import has met —
 * read the way each platform's reader hands its text to the parser, and
 * checked against tickets/expected.json. Jest can't run the native
 * readers, so tickets/text/ holds the text they produce (see
 * scripts/ticket-text.sh), personal data scrubbed; the OCR text of a
 * picture is captured from the app itself. Both platforms must read the
 * same legs.
 */

import expected from '../../tickets/expected.json';

import { extractItinerary, type ImportedSegment } from '@/services/itinerary';

// Node's fs, without pulling its types into an app tsconfig (see theme.test.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readdirSync, readFileSync } = require('node:fs') as {
  readdirSync: (dir: string) => string[];
  readFileSync: (file: string, encoding: 'utf8') => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('node:path') as { join: (...parts: string[]) => string };

const TICKETS = join(__dirname, '../../tickets');
const TEXT = join(TICKETS, 'text');
// Pinned: a leg printed without a year is dated from the ticket's issue
// date, and only failing that from "today".
const TODAY = new Date(2026, 8, 11, 12);

type ExpectedLeg = {
  flight: string | null;
  date: string | null;
  from: string;
  to: string;
  dep: string | null;
  arr: string | null;
  arrivalDate?: string;
  seat: string | null;
  pnr: string | null;
  operatedBy?: string;
};

const shape = (s: ImportedSegment): ExpectedLeg => ({
  flight: s.flight,
  date: s.date,
  from: s.fromCode ?? '',
  to: s.toCode ?? '',
  dep: s.depTime,
  arr: s.arrTime,
  ...(s.arrivalDate && s.arrivalDate !== s.date ? { arrivalDate: s.arrivalDate } : {}),
  seat: s.seat,
  pnr: s.pnr,
  ...(s.operatedBy?.code ? { operatedBy: s.operatedBy.code } : {}),
});

const pagesOf = (raw: string) =>
  raw
    .split(/=== PAGE \d+ ===\n/)
    .filter((t) => t.trim())
    .map((text) => ({ text, barcodes: [] as string[] }));

const sidecars = readdirSync(TEXT).filter((s) => s.endsWith('.txt'));
// One document per stem: "Foo.ios.txt" and "Foo.android.txt" are both "Foo".
const documents = [...new Set(sidecars.map((s) => s.replace(/\.(ios|android)\.txt$/, '')))].sort();

describe('tickets/', () => {
  it('has an expectation for every document, and a document for every expectation', () => {
    expect(documents).toEqual(Object.keys(expected).sort());
  });

  for (const file of documents) {
    const texts = sidecars.filter((s) => s.startsWith(`${file}.`));
    for (const text of texts) {
      const platform = text.slice(file.length + 1, -'.txt'.length);
      it(`${file} reads right on ${platform}`, () => {
        const { segments } = extractItinerary(pagesOf(readFileSync(join(TEXT, text), 'utf8')), TODAY);
        expect(segments.map(shape)).toEqual((expected as Record<string, ExpectedLeg[]>)[file]);
      });
    }
  }
});
