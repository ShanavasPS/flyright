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
  }

  /// Pages render at 3x their PDF points (216 dpi): dense enough for Vision to
  /// resolve the narrow bars of a PDF417 stripe, small enough (~1800x2400 for
  /// Letter) to stay well inside memory on every supported iPhone.
  private static let renderScale: CGFloat = 3

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

    let request = VNDetectBarcodesRequest()
    request.symbologies = [.pdf417, .qr, .aztec, .dataMatrix]
    #if targetEnvironment(simulator)
    // The simulator has no inference context for Vision's ML detector
    // ("Could not create inference context"). The classic revision runs
    // there and reads the larger stripes (1 of the receipt's 2), enough for
    // development builds to exercise the barcode path. Devices keep the
    // default revision, which decodes everything (verified with the same
    // PDFKit + Vision calls on macOS).
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
}

private final class DocumentUnreadableException: GenericException<String> {
  override var reason: String {
    "'\(param)' could not be opened as a PDF."
  }
}

private final class DocumentLockedException: Exception {
  override var reason: String {
    "This PDF is password-protected."
  }
}
