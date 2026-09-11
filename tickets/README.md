# Tickets

The text of real travel documents, one per layout the document import has
met, and what the app must read from each. `src/services/tickets.test.ts`
runs every one through the itinerary parser in the text order each
platform's reader produces and checks it against `expected.json` — both
platforms have to read the same legs.

The documents themselves stay out of the repository (it is public; they
carry names and booking references). What is here is the text the readers
produce from them, with passengers, booking references, ticket and loyalty
numbers replaced by placeholders of the same shape — which is all the
parser ever sees.

- `text/<name>.ios.txt` — the iOS reader's text: glyphs placed by their
  bounds and banded into rows (`scripts/pdf-row-text.swift` mirrors it).
  A picture's text is the app's own OCR reading, captured on a simulator.
- `text/<name>.android.txt` — PDFBox's sorted extraction, as on Android.
- `expected.json` — the legs each document yields: flight, date, route,
  printed clocks, arrival day when it differs, seat, booking reference,
  operating carrier when the page names one.

To add a document: run `scripts/ticket-text.sh <dir-with-the-pdf>` to
produce its two text files, scrub the personal data, copy them into
`text/`, and add the legs to `expected.json`. When the reading is wrong,
fix the parser, not the expectation.
