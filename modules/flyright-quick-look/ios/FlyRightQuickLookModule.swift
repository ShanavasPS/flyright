import ExpoModulesCore
import QuickLook

/// Shows one local file in Quick Look — the system viewer for PDFs and
/// pictures, with its own Done and Share buttons. The share sheet alone
/// (expo-sharing) offers to send a booking elsewhere but never to read it.
public final class FlyRightQuickLookModule: Module {
  /// Held while the viewer is up: QLPreviewController keeps its data source
  /// and delegate weakly.
  private var session: PreviewSession?

  public func definition() -> ModuleDefinition {
    Name("FlyRightQuickLook")

    /// Resolves true once the viewer closes, false when the file cannot be
    /// previewed (the caller falls back to the share sheet).
    AsyncFunction("preview") { (url: URL, title: String?, promise: Promise) in
      guard url.isFileURL, FileManager.default.isReadableFile(atPath: url.path) else {
        promise.resolve(false)
        return
      }
      let item = PreviewItem(url: url, title: title)
      guard QLPreviewController.canPreview(item) else {
        promise.resolve(false)
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(false)
        return
      }
      let session = PreviewSession(item: item) { [weak self] in
        self?.session = nil
        promise.resolve(true)
      }
      self.session = session
      let controller = QLPreviewController()
      controller.dataSource = session
      controller.delegate = session
      presenter.present(controller, animated: true)
    }
    .runOnQueue(.main)
  }
}

private final class PreviewItem: NSObject, QLPreviewItem {
  let previewItemURL: URL?
  let previewItemTitle: String?

  init(url: URL, title: String?) {
    previewItemURL = url
    previewItemTitle = title
  }
}

private final class PreviewSession: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private let item: PreviewItem
  private let onDismiss: () -> Void

  init(item: PreviewItem, onDismiss: @escaping () -> Void) {
    self.item = item
    self.onDismiss = onDismiss
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { item }

  func previewControllerDidDismiss(_ controller: QLPreviewController) { onDismiss() }
}
