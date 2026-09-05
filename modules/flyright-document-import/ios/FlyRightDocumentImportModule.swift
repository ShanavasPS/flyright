import ExpoModulesCore
import PDFKit
import Vision

/// iOS half of the shared-document reader — see ../index.ts for the contract.
///
/// Intake needs no native code here: a PDF shared via "Copy to FlyRight" is
/// delivered as a file:// URL to `application(_:open:options:)`, which
/// expo-linking already forwards and src/app/+native-intent.ts rewrites into
/// the import route. This module only reads the file: PDFKit for the text of
/// each page, Vision for every barcode drawn on it (PDF417 on printed passes
/// and Amadeus receipts, Aztec/QR on mobile passes).
///
/// `readImage` is the same job for a picture instead of a PDF — a screenshot
/// of a mobile pass, a photo of a paper one — so an in-app upload lands in
/// the same import screen. Vision reads the barcode; when the image has none
/// (a screenshot of a confirmation email) its text recogniser stands in for
/// PDFKit's page text.
public class FlyRightDocumentImportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlyRightDocumentImport")

    Events("onDocumentShared")

    // Cold-start shares reach JS through the linking URL on iOS; nothing to hand over.
    Function("consumePendingDocument") { () -> [String: Any]? in
      return nil
    }

    AsyncFunction("readPdf") { (uri: URL, maxPages: Int, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try Self.read(url: uri, maxPages: maxPages))
        } catch {
          promise.reject(error)
        }
      }
    }

    AsyncFunction("readImage") { (uri: URL, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try Self.readImage(url: uri))
        } catch {
          promise.reject(error)
        }
      }
    }
  }

  /// Pages render at 3x their PDF points (216 dpi): dense enough for Vision to
  /// resolve the narrow bars of a PDF417 stripe, small enough (~1800x2400 for
  /// Letter) to stay well inside memory on every supported iPhone.
  private static let renderScale: CGFloat = 3

  /// Second pass for a page that came back empty. A stripe printed small (a
  /// Finnair e-ticket's is 1.4 inches wide) or a page scanned at low quality
  /// is a few pixels per module at 216 dpi; twice that reads it. Only ever
  /// runs when the cheap pass found nothing, so the usual document still
  /// costs one render.
  private static let retryRenderScale: CGFloat = 6

  private static func read(url: URL, maxPages: Int) throws -> [String: Any] {
    // No-op for Inbox copies; needed if the file were opened in place.
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }

    guard let document = PDFDocument(url: url) else {
      throw DocumentUnreadableException(url.lastPathComponent)
    }
    if document.isLocked {
      throw DocumentLockedException()
    }

    var pages: [[String: Any]] = []
    for index in 0..<min(document.pageCount, max(maxPages, 1)) {
      guard let page = document.page(at: index) else { continue }
      pages.append([
        "text": page.string ?? "",
        "barcodes": barcodes(on: page),
      ])
    }
    return ["pageCount": document.pageCount, "pages": pages]
  }

  private static func barcodes(on page: PDFPage) -> [String] {
    let found = barcodes(on: page, scale: renderScale)
    if !found.isEmpty { return found }
    return barcodes(on: page, scale: retryRenderScale)
  }

  private static func barcodes(on page: PDFPage, scale renderScale: CGFloat) -> [String] {
    let bounds = page.bounds(for: .mediaBox)
    let size = CGSize(width: bounds.width * renderScale, height: bounds.height * renderScale)
    // Draw the page ourselves at exactly renderScale: PDFPage.thumbnail(of:)
    // multiplies by the screen scale on iOS (a 9x page on a 3x device) and
    // Vision rejects or mis-reads the result.
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      let cg = context.cgContext
      // PDF space is bottom-left origin; flip into UIKit's top-left.
      cg.translateBy(x: 0, y: size.height)
      cg.scaleBy(x: renderScale, y: -renderScale)
      cg.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
      page.draw(with: .mediaBox, to: cg)
    }
    guard let cgImage = image.cgImage else { return [] }
    return barcodes(in: cgImage)
  }

  private static func barcodes(in cgImage: CGImage) -> [String] {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.pdf417, .qr, .aztec, .dataMatrix]
    #if targetEnvironment(simulator)
    // The simulator has no inference context for Vision's ML detector
    // ("Could not create inference context"). The classic revision runs
    // there and reads the larger stripes (1 of the receipt's 2), enough for
    // development builds to exercise the barcode path. Devices keep the
    // default revision, which decodes everything (verified with the same
    // PDFKit + Vision calls on macOS).
    //
    // Some stripes are invisible to the classic detector at any render
    // scale — a Finnair e-ticket's 1.4-inch PDF417 reads on the default
    // revision at 3x and never on revision 1, even at 8x (measured). A
    // document that imports on a phone can therefore be refused on the
    // simulator; that is the simulator, not the reader.
    if VNDetectBarcodesRequest.supportedRevisions.contains(VNDetectBarcodesRequestRevision1) {
      request.revision = VNDetectBarcodesRequestRevision1
    }
    #endif
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      NSLog("[FlyRightDocumentImport] barcode detection failed on %dx%d page: %@", cgImage.width, cgImage.height, error.localizedDescription)
      return []
    }

    var seen = Set<String>()
    var payloads: [String] = []
    for observation in request.results ?? [] {
      guard let payload = observation.payloadStringValue, !payload.isEmpty else { continue }
      if seen.insert(payload).inserted { payloads.append(payload) }
    }
    return payloads
  }

  // -- images ---------------------------------------------------------------

  /// Vision's detectors work on the pixels they are given, so an upload is
  /// read the same way a rendered PDF page is — one "page" out, so the pure
  /// extractor downstream needs no notion of images at all.
  private static func readImage(url: URL) throws -> [String: Any] {
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }

    guard let data = try? Data(contentsOf: url), let image = UIImage(data: data),
      let cgImage = downscaled(image)
    else {
      throw ImageUnreadableException(url.lastPathComponent)
    }
    return [
      "pageCount": 1,
      "pages": [["text": text(in: cgImage), "barcodes": barcodes(in: cgImage)]],
    ]
  }

  /// A 12-megapixel camera photo is more pixels than either detector needs
  /// and enough to matter for peak memory; anything already smaller is left
  /// exactly as it is, since a barcode loses bars to resampling. Redrawing
  /// also normalises the EXIF orientation a phone photo carries, which the
  /// raw CGImage would not.
  private static let maxImageEdge: CGFloat = 3200

  private static func downscaled(_ image: UIImage) -> CGImage? {
    let size = image.size
    guard size.width > 0, size.height > 0 else { return nil }
    let scale = min(1, maxImageEdge / max(size.width, size.height))
    let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let drawn = UIGraphicsImageRenderer(size: target, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: target))
      image.draw(in: CGRect(origin: .zero, size: target))
    }
    return drawn.cgImage
  }

  /// Text as printed, row by row: the extractor reads proximity inside the
  /// string, so an itinerary table has to come out in reading order or a
  /// leg's airports end up far from its flight number. Lines are banded into
  /// rows by a typical line height and ordered left to right within a row —
  /// the same order PDFBox's sortByPosition gives on Android. Language
  /// correction stays off; it "fixes" flight numbers and airport codes into
  /// words.
  private static func text(in cgImage: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      NSLog("[FlyRightDocumentImport] text recognition failed: %@", error.localizedDescription)
      return ""
    }
    let observations = request.results ?? []
    let heights = observations.map { $0.boundingBox.height }.sorted()
    let band = max(heights.isEmpty ? 0.01 : heights[heights.count / 2], 0.001)
    let lines = observations
      .compactMap { observation -> (row: Int, x: CGFloat, text: String)? in
        guard let string = observation.topCandidates(1).first?.string else { return nil }
        let box = observation.boundingBox
        // Vision's origin is bottom-left; flip so the row index grows downward.
        return (Int(((1 - box.midY) / band).rounded(.down)), box.minX, string)
      }
      .sorted { $0.row != $1.row ? $0.row < $1.row : $0.x < $1.x }
      .map(\.text)
    return lines.joined(separator: "\n")
  }
}

private final class DocumentUnreadableException: GenericException<String> {
  override var reason: String {
    "'\(param)' could not be opened as a PDF."
  }
}

private final class ImageUnreadableException: GenericException<String> {
  override var reason: String {
    "'\(param)' could not be opened as an image."
  }
}

private final class DocumentLockedException: Exception {
  override var reason: String {
    "This PDF is password-protected."
  }
}
