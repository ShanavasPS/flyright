#!/usr/bin/env bash
# Produces <dir>/text/<name>.ios.txt and .android.txt for every PDF in a
# folder — the text each platform's document reader hands the itinerary
# parser, so src/services/tickets.test.ts checks the parser against what
# the app really sees. The PDFs themselves are not committed (the repo is
# public); scrub names, booking references and ticket numbers from the
# text before copying it into tickets/text.
#
#   iOS:     scripts/pdf-row-text.swift mirrors the module's rowOrderedText
#            (glyphs placed by their bounds, banded into rows). PDFKit's
#            plain page string is NOT what the app reads — don't use it.
#   Android: PDFBox's sorted extraction, the same call the Kotlin reader
#            makes. Needs Java; fetches the pdfbox-app jar once.
#
# Pictures (.jpeg/.png) go through the platform OCR and can't be produced
# here: capture the app's own reading (dump `contents.pages` from
# src/screens/import-document.tsx on a simulator) into <name>.ios.txt.
#
# Usage: scripts/ticket-text.sh <dir-with-pdfs>
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=${1:?directory with the PDFs}
TOOLS=${TMPDIR:-/tmp}/flyright-ticket-text
mkdir -p "$TOOLS" "$DIR/text"

if [ ! -x "$TOOLS/pdfrows" ]; then
  swiftc -O scripts/pdf-row-text.swift -o "$TOOLS/pdfrows"
fi
PDFBOX="$TOOLS/pdfbox-app.jar"
if [ ! -f "$PDFBOX" ]; then
  curl -sL -o "$PDFBOX" https://repo1.maven.org/maven2/org/apache/pdfbox/pdfbox-app/3.0.3/pdfbox-app-3.0.3.jar
fi

for f in "$DIR"/*.pdf; do
  b=$(basename "$f" .pdf)
  "$TOOLS/pdfrows" "$f" > "$DIR/text/$b.ios.txt"
  java -jar "$PDFBOX" export:text -sort -console -i "$f" 2>/dev/null \
    | grep -v '^The encoding parameter' > "$DIR/text/$b.android.txt"
  echo "$b"
done
