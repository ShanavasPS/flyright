// The iOS document reader's text order, for scripts/ticket-text.sh: a copy of
// rowOrderedText in modules/flyright-document-import/ios/FlyRightDocumentImportModule.swift
// (keep the two in step). Usage: swiftc -O scripts/pdf-row-text.swift -o pdfrows && ./pdfrows <file.pdf>

import Foundation
import PDFKit

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
  var glyphs: [(row: Int, minX: CGFloat, maxX: CGFloat, text: String, isColumnBreak: Bool)] = []
  for index in 0..<ns.length {
    let box = boxes[index]
    if box.isNull || box.isInfinite { continue }
    let character = ns.substring(with: NSRange(location: index, length: 1))
    if character == "\n" || character == "\r" { continue }
    let blank = character.trimmingCharacters(in: .whitespaces).isEmpty
    let row = Int(((top - box.midY) / band).rounded(.down))
    glyphs.append((row, box.minX, box.maxX, character, blank && box.width > columnGap))
  }
  guard !glyphs.isEmpty else { return raw }
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
