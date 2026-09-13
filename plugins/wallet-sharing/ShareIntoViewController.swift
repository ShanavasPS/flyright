import UIKit
import UniformTypeIdentifiers

/// App Group and SharePayload come from Expo Sharing's generated target.
/// File URLs are supplied by NSItemProvider, never by a deep-link parameter.
class ShareIntoViewController: UIViewController {
  private let maxBytes = 20 * 1024 * 1024
  private var started = false
  private let status = UILabel()
  private var appGroupId: String { Bundle.main.object(forInfoDictionaryKey: "AppGroupId") as? String ?? "" }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    status.text = "Opening your pass in FlyRight…"
    status.textAlignment = .center
    status.numberOfLines = 0
    status.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(status)
    NSLayoutConstraint.activate([
      status.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      status.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      status.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true
    Task {
      var payloads: [SharePayload] = []
      let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
      guard !providers.isEmpty, providers.count <= 8 else {
        showError("Share up to eight passes at a time.")
        return
      }
      for provider in providers {
        guard let payload = await read(provider) else {
          showError("This pass could not be read. Share its pass file, PDF or a screenshot showing the barcode.")
          return
        }
        payloads.append(payload)
      }
      guard let data = try? JSONEncoder().encode(payloads), let defaults = UserDefaults(suiteName: appGroupId) else {
        showError("Could not save this pass. Please try again.")
        return
      }
      defaults.set(data, forKey: SHARE_INTO_DEFAULTS_KEY)
      // Flush before attempting to foreground the containing app. If iOS
      // declines that handoff, the app also consumes this on its next launch.
      defaults.synchronize()
      openApp()
    }
  }

  private func showError(_ message: String) {
    let alert = UIAlertController(title: "Share to FlyRight", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "Done", style: .default) { _ in
      self.extensionContext?.completeRequest(returningItems: nil)
    })
    present(alert, animated: true)
  }

  private func read(_ provider: NSItemProvider) async -> SharePayload? {
    let types = ["com.apple.pkpass", "com.apple.pkpasses", UTType.pdf.identifier, UTType.image.identifier, UTType.fileURL.identifier]
    if let identifier = types.first(where: provider.hasItemConformingToTypeIdentifier) {
      return await withCheckedContinuation { continuation in
        provider.loadItem(forTypeIdentifier: identifier, options: nil) { item, _ in
          let ext = identifier == "com.apple.pkpasses" ? "pkpasses" : identifier == "com.apple.pkpass" ? "pkpass" : nil
          var data: Data?
          var name = ext.map { "pass.\($0)" } ?? "document"
          if let url = item as? URL, url.isFileURL {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 0, size <= self.maxBytes {
              data = try? Data(contentsOf: url, options: .mappedIfSafe)
              name = url.lastPathComponent
            }
          } else if let bytes = item as? Data {
            data = bytes
          } else if let image = item as? UIImage {
            data = image.pngData()
            name = "pass.png"
          }
          guard let data, !data.isEmpty, data.count <= self.maxBytes,
            let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupId) else {
            continuation.resume(returning: nil)
            return
          }
          let suffix = ext ?? (name as NSString).pathExtension
          let destination = root.appendingPathComponent("wallet-imports", isDirectory: true)
          let file = destination.appendingPathComponent(UUID().uuidString).appendingPathExtension(suffix)
          do {
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            // Only our import folder; remove abandoned shares after an hour.
            for old in (try? FileManager.default.contentsOfDirectory(at: destination, includingPropertiesForKeys: [.contentModificationDateKey])) ?? [] {
              if let date = try? old.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
                date < Date().addingTimeInterval(-3600) { try? FileManager.default.removeItem(at: old) }
            }
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            let mime = suffix == "pkpass" ? "application/vnd.apple.pkpass" : suffix == "pkpasses" ? "application/vnd.apple.pkpasses" : UTType(filenameExtension: suffix)?.preferredMIMEType ?? "application/octet-stream"
            continuation.resume(returning: SharePayload(type: .file, value: file.absoluteString, mimeType: mime, metadata: ShareMetadata(originalName: name, size: data.count)))
          } catch { continuation.resume(returning: nil) }
        }
      }
    }
    let identifier = provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) ? UTType.url.identifier : UTType.plainText.identifier
    guard provider.hasItemConformingToTypeIdentifier(identifier) else { return nil }
    return await withCheckedContinuation { continuation in
      provider.loadItem(forTypeIdentifier: identifier, options: nil) { item, _ in
        let value = (item as? URL)?.absoluteString ?? item as? String
        guard let value, value.utf8.count <= 512 * 1024 else { continuation.resume(returning: nil); return }
        continuation.resume(returning: SharePayload(type: .text, value: value, mimeType: "text/plain", metadata: nil))
      }
    }
  }

  private func openApp() {
    guard let scheme = Bundle.main.object(forInfoDictionaryKey: "MainTargetUrlScheme") as? String,
      let url = URL(string: "\(scheme)://expo-sharing") else { return }
    // Same handoff used by Expo Sharing 57. The saved payload also survives
    // when an OS version declines to open the containing app from an extension.
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:]) { opened in
          if opened { self.extensionContext?.completeRequest(returningItems: nil) }
          else { self.showError("Your pass is ready. Open FlyRight to finish adding it.") }
        }
        return
      }
      responder = current.next
    }
    showError("Your pass is ready. Open FlyRight to finish adding it.")
  }
}
