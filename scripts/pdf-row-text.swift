// The iOS document reader's text order, for scripts/ticket-text.sh: a copy of
// rowOrderedText in modules/flyright-document-import/ios/FlyRightDocumentImportModule.swift
// (keep the two in step). Usage: swiftc -O scripts/pdf-row-text.swift -o pdfrows && ./pdfrows <file.pdf>

import Foundation
import PDFKit

struct RowGlyph {
  var row: Int
  let minX: CGFloat
  let maxX: CGFloat
  let depth: CGFloat
  let text: String
  let isBlank: Bool
  let isColumnBreak: Bool
}

let maxLinesPerBand = 8

// Lines that share horizontal space can't be one row of text: a band whose
// lines overlap gets one row per line (see splitInterleavedRows in the module).
func splitInterleavedRows(_ glyphs: inout [RowGlyph], band: CGFloat) {
  var byRow: [Int: [Int]] = [:]
  for index in glyphs.indices { byRow[glyphs[index].row, default: []].append(index) }
  for (row, members) in byRow where members.count > 1 {
    var lines: [[Int]] = []
    var anchor = -CGFloat.infinity
    for index in members.sorted(by: { glyphs[$0].depth < glyphs[$1].depth }) {
      if glyphs[index].depth - anchor > band / 2 {
        lines.append([])
        anchor = glyphs[index].depth
      }
      lines[lines.count - 1].append(index)
    }
    guard lines.count > 1, lines.count <= maxLinesPerBand, linesOverlap(lines, in: glyphs) else { continue }
    for (offset, line) in lines.enumerated() {
      for index in line { glyphs[index].row = row + offset }
    }
  }
}

func linesOverlap(_ lines: [[Int]], in glyphs: [RowGlyph]) -> Bool {
  for a in 0..<lines.count {
    for b in (a + 1)..<lines.count {
      for i in lines[a] where !glyphs[i].isBlank {
        for j in lines[b] where !glyphs[j].isBlank {
          if glyphs[i].minX < glyphs[j].maxX - 0.5 && glyphs[j].minX < glyphs[i].maxX - 0.5 { return true }
        }
      }
    }
  }
  return false
}

func rowOrderedText(on page: PDFPage) -> String {
  let raw = page.string ?? ""
  let ns = raw as NSString
  guard ns.length > 0 else { return raw }
  var boxes: [CGRect] = []
  for index in 0..<ns.length {
    let bounds = page.selection(for: NSRange(location: index, length: 1))?.bounds(for: page)
    boxes.append(bounds ?? .null)
  }
  let heights = boxes.filter { !$0.isNull && $0.height > 0 }.map(\.height).sorted()
  guard !heights.isEmpty, let top = boxes.filter({ !$0.isNull }).map(\.maxY).max() else { return raw }
  let band = max(heights[heights.count / 2], 1)
  let columnGap = band * 0.8
  var glyphs: [RowGlyph] = []
  for index in 0..<ns.length {
    let box = boxes[index]
    if box.isNull || box.isInfinite { continue }
    let character = ns.substring(with: NSRange(location: index, length: 1))
    if character == "\n" || character == "\r" { continue }
    let blank = character.trimmingCharacters(in: .whitespaces).isEmpty
    let depth = top - box.midY
    let row = Int((depth / band).rounded(.down)) * maxLinesPerBand
    glyphs.append(RowGlyph(row: row, minX: box.minX, maxX: box.maxX, depth: depth, text: character,
                           isBlank: blank, isColumnBreak: blank && box.width > columnGap))
  }
  guard !glyphs.isEmpty else { return raw }
  splitInterleavedRows(&glyphs, band: band)
  glyphs.sort { $0.row != $1.row ? $0.row < $1.row : $0.minX < $1.minX }
  var lines: [String] = []
  var line = ""
  var row = glyphs[0].row
  var previousMaxX: CGFloat?
  for glyph in glyphs {
    if glyph.row != row { lines.append(line); line = ""; row = glyph.row; previousMaxX = nil }
    let gapped = previousMaxX.map { glyph.minX - $0 > columnGap } ?? false
    if (glyph.isColumnBreak || gapped) && !line.isEmpty && !line.hasSuffix("  ") { line += "  " }
    if !glyph.isColumnBreak { line += glyph.text }
    previousMaxX = glyph.maxX
  }
  lines.append(line)
  return lines.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: "\n")
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let doc = PDFDocument(url: url) else { print("no doc"); exit(1) }
for i in 0..<doc.pageCount {
  print("=== PAGE \(i + 1) ===")
  print(rowOrderedText(on: doc.page(at: i)!))
}
