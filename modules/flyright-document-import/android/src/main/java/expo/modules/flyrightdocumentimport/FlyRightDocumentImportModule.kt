package expo.modules.flyrightdocumentimport

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.multi.GenericMultipleBarcodeReader
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

/** Android half of the shared-document reader — see ../index.ts for the
 * contract.
 *
 * Intake: "Share → FlyRight" on a PDF starts (or re-enters, launchMode
 * singleTask) MainActivity with an ACTION_SEND intent whose EXTRA_STREAM is a
 * content:// URI the sender granted us to read only while this activity
 * lives. Neither React Native's Linking nor expo-router see that intent, so
 * the module copies the stream into the cache dir the moment it arrives and
 * passes the private file:// path to JS — as an event when the app is already
 * running (OnNewIntent), or held as `pending` for JS to collect after a cold
 * start. The launch intent is neutralised after collection so a reload of
 * the JS bundle does not import the same file twice.
 *
 * Reading: PdfBox-Android for the text of each page (sorted by position, so
 * table rows come out as lines), Android's PdfRenderer to rasterise pages,
 * and ML Kit to decode every barcode on them.
 *
 * `readImage` is the same job for a picture instead of a PDF — a screenshot
 * of a mobile pass, a photo of a paper one — so an in-app upload lands in the
 * same import screen. The barcode pass is identical once the bitmap exists;
 * ML Kit's text recogniser stands in for PDFBox when the image carries no
 * barcode (a screenshot of a confirmation email). */
class FlyRightDocumentImportModule : Module() {
  private var pending: Map<String, Any?>? = null

  override fun definition() = ModuleDefinition {
    Name("FlyRightDocumentImport")

    Events("onDocumentShared")

    OnNewIntent { intent ->
      capture(intent)?.let { doc ->
        pending = doc
        sendEvent("onDocumentShared", doc)
      }
    }

    Function("consumePendingDocument") {
      val activity = appContext.currentActivity
      val fromLaunch = activity?.let { act ->
        capture(act.intent)?.also { neutralise(act) }
      }
      val result = pending ?: fromLaunch
      pending = null
      result
    }

    // Off the JS thread by construction (AsyncFunction); Tasks.await below
    // must not run on main.
    AsyncFunction("readPdf") { uri: String, maxPages: Int ->
      readPdf(uri, maxPages)
    }

    AsyncFunction("readImage") { uri: String ->
      readImage(uri)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  // -- intake ---------------------------------------------------------------

  private fun capture(intent: Intent?): Map<String, Any?>? {
    if (intent == null) return null
    val uri: Uri = when (intent.action) {
      Intent.ACTION_SEND ->
        if (Build.VERSION.SDK_INT >= 33) {
          intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }
      Intent.ACTION_VIEW -> intent.data
      else -> null
    } ?: return null

    val resolver = context.contentResolver
    val name = displayName(uri)
    val type = intent.type ?: resolver.getType(uri)
    val isPdf = type == "application/pdf" || (name?.lowercase()?.endsWith(".pdf") == true)
    if (!isPdf) return null

    val dir = File(context.cacheDir, "shared-documents").apply { mkdirs() }
    val copy = File(dir, "${UUID.randomUUID()}.pdf")
    try {
      resolver.openInputStream(uri)?.use { input -> copy.outputStream().use { input.copyTo(it) } }
        ?: return null
    } catch (e: Exception) {
      copy.delete()
      return null
    }
    return mapOf("uri" to Uri.fromFile(copy).toString(), "name" to name)
  }

  private fun displayName(uri: Uri): String? {
    if (uri.scheme == "file") return uri.lastPathSegment
    return try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (e: Exception) {
      null
    }
  }

  /** The share has been collected: make the launch intent look like a plain
   * launcher start so a JS reload doesn't re-import the same document. */
  private fun neutralise(activity: Activity) {
    val intent = Intent(activity.intent)
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(Intent.EXTRA_STREAM)
    intent.data = null
    intent.type = null
    activity.intent = intent
  }

  // -- reading --------------------------------------------------------------

  /** 4x the PDF points (288 dpi): ML Kit needs more than Vision does to
   * resolve the narrow bars of a small PDF417 stripe (at 3x it read only one
   * of an Amadeus receipt's two). ~2450x3170 ARGB for a Letter page, ~30 MB,
   * one page at a time. */
  private val renderScale = 4f

  /** Second pass for a page that came back empty — a stripe printed small
   * (a Finnair e-ticket's is 1.4 inches wide) is only a few pixels per
   * module at 4x. Only runs when the cheap pass found nothing. */
  private val retryRenderScale = 8f

  private fun readPdf(uri: String, maxPages: Int): Map<String, Any> {
    val path = Uri.parse(uri).path ?: throw DocumentUnreadableException(uri)
    val file = File(path)
    if (!file.exists()) throw DocumentUnreadableException(uri)

    PDFBoxResourceLoader.init(context)
    val texts = mutableListOf<String>()
    val pageCount: Int
    try {
      PDDocument.load(file).use { doc ->
        if (doc.isEncrypted) throw DocumentLockedException()
        pageCount = doc.numberOfPages
        val stripper = PDFTextStripper().apply { sortByPosition = true }
        for (i in 0 until minOf(pageCount, maxOf(maxPages, 1))) {
          stripper.startPage = i + 1
          stripper.endPage = i + 1
          texts.add(stripper.getText(doc))
        }
      }
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw DocumentUnreadableException(uri)
    }

    val barcodes = decodeBarcodes(file, texts.size)
    val pages = texts.mapIndexed { i, text -> mapOf("text" to text, "barcodes" to barcodes[i]) }
    return mapOf("pageCount" to pageCount, "pages" to pages)
  }

  /** The symbologies travel documents actually carry: PDF417 on printed
   * passes and e-ticket receipts, Aztec/QR on mobile ones. */
  private fun newBarcodeScanner(): BarcodeScanner = BarcodeScanning.getClient(
    BarcodeScannerOptions.Builder()
      .setBarcodeFormats(
        Barcode.FORMAT_PDF417,
        Barcode.FORMAT_QR_CODE,
        Barcode.FORMAT_AZTEC,
        Barcode.FORMAT_DATA_MATRIX,
      )
      .build(),
  )

  private fun decodeBarcodes(file: File, pages: Int): List<List<String>> {
    val scanner = newBarcodeScanner()
    val result = MutableList<List<String>>(pages) { emptyList() }
    try {
      ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
        val renderer = PdfRenderer(pfd)
        try {
          for (i in 0 until minOf(pages, renderer.pageCount)) {
            for (scale in listOf(renderScale, retryRenderScale)) {
              val bitmap = renderer.openPage(i).use { page ->
                Bitmap.createBitmap(
                  (page.width * scale).toInt(),
                  (page.height * scale).toInt(),
                  Bitmap.Config.ARGB_8888,
                ).also {
                  it.eraseColor(Color.WHITE)
                  page.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                }
              }
              try {
                result[i] = payloads(scanner, bitmap)
              } finally {
                bitmap.recycle()
              }
              if (result[i].isNotEmpty()) break
            }
          }
        } finally {
          renderer.close()
        }
      }
    } catch (e: Exception) {
      // Rasterising failed (corrupt page tree, etc.): text alone still imports.
    } finally {
      scanner.close()
    }
    return result
  }

  /** Both decoders over one bitmap: ML Kit first, then ZXing for the small
   * PDF417 stripes it skips. Either failing only costs its own findings. */
  private fun payloads(scanner: BarcodeScanner, bitmap: Bitmap): List<String> {
    val found = LinkedHashSet<String>()
    try {
      // rawValue keeps BCBP's whitespace-significant layout intact;
      // displayValue would "clean" it.
      Tasks.await(scanner.process(InputImage.fromBitmap(bitmap, 0)))
        .mapNotNullTo(found) { it.rawValue?.takeIf(String::isNotEmpty) }
    } catch (e: Exception) {
      // ML Kit failing only means ZXing gets the whole job.
    }
    try {
      found.addAll(zxingDecode(bitmap))
    } catch (e: Exception) {
      // Same: an image that fails to scan simply contributes no barcodes.
    }
    return found.toList()
  }

  // -- images ---------------------------------------------------------------

  /** One "page" out, so the pure extractor downstream needs no notion of
   * images at all. */
  private fun readImage(uri: String): Map<String, Any> {
    val path = Uri.parse(uri).path ?: throw ImageUnreadableException(uri)
    val file = File(path)
    if (!file.exists()) throw ImageUnreadableException(uri)
    val bitmap = loadBitmap(file) ?: throw ImageUnreadableException(uri)
    return try {
      val scanner = newBarcodeScanner()
      val codes = try {
        payloads(scanner, bitmap)
      } finally {
        scanner.close()
      }
      mapOf(
        "pageCount" to 1,
        "pages" to listOf(mapOf("text" to imageText(bitmap), "barcodes" to codes)),
      )
    } finally {
      bitmap.recycle()
    }
  }

  /** A 12-megapixel camera photo is more pixels than either detector needs
   * and enough to matter for peak memory (ARGB, a 24 MP one would be ~96 MB),
   * so the longest edge is capped here — still denser than the ~2450 px the
   * PDF path rasterises and reads PDF417 off reliably. A phone photo's EXIF
   * rotation is applied too: ZXing reads raw pixels and would otherwise see
   * the pass sideways. */
  private val maxImageEdge = 3200

  private fun loadBitmap(file: File): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxImageEdge) sample *= 2
    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val bitmap = BitmapFactory.decodeFile(file.path, options) ?: return null
    val degrees = try {
      when (ExifInterface(file).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
    } catch (e: Exception) {
      0f
    }
    if (degrees == 0f) return bitmap
    val rotated = Bitmap.createBitmap(
      bitmap, 0, 0, bitmap.width, bitmap.height,
      Matrix().apply { postRotate(degrees) }, true,
    )
    if (rotated != bitmap) bitmap.recycle()
    return rotated
  }

  /** Text as printed, in reading order. `Text.text` would hand back ML Kit's
   * own blocks, which group an itinerary table by COLUMN — every departure
   * airport in one run, far from the flight number it belongs to — and the
   * extractor reads proximity inside the string, so the legs fall apart.
   * Sorting the lines by position instead gives the same top-to-bottom,
   * left-to-right order as PDFBox's sortByPosition and Vision's reader. */
  private fun imageText(bitmap: Bitmap): String {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    return try {
      val lines = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)))
        .textBlocks
        .flatMap { it.lines }
        .mapNotNull { line -> line.boundingBox?.let { line.text to it } }
      // Rows are banded by a typical line height so two cells of the same
      // table row stay together instead of sorting by a few stray pixels.
      val band = (lines.map { it.second.height() }.sorted().getOrNull(lines.size / 2) ?: 1)
        .coerceAtLeast(1)
      lines
        .sortedWith(compareBy({ it.second.centerY() / band }, { it.second.left }))
        .joinToString("\n") { it.first }
    } catch (e: Exception) {
      // No OCR (an unavailable model, an unsupported image): the barcode
      // path still imports.
      ""
    } finally {
      recognizer.close()
    }
  }
}

/** ZXing over the whole page, all codes at once. TRY_HARDER makes the
 * PDF417 detector sweep the image instead of sampling its centre. */
private fun zxingDecode(bitmap: Bitmap): List<String> {
  val pixels = IntArray(bitmap.width * bitmap.height)
  bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
  val source = RGBLuminanceSource(bitmap.width, bitmap.height, pixels)
  val hints = mapOf(
    DecodeHintType.TRY_HARDER to true,
    DecodeHintType.POSSIBLE_FORMATS to listOf(
      BarcodeFormat.PDF_417,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.AZTEC,
      BarcodeFormat.DATA_MATRIX,
    ),
  )
  val reader = GenericMultipleBarcodeReader(MultiFormatReader())
  return try {
    reader.decodeMultiple(BinaryBitmap(HybridBinarizer(source)), hints)
      .mapNotNull { it.text?.takeIf(String::isNotEmpty) }
  } catch (e: com.google.zxing.NotFoundException) {
    emptyList()
  }
}

private class DocumentUnreadableException(uri: String) :
  CodedException("ERR_DOCUMENT_UNREADABLE", "'$uri' could not be opened as a PDF.", null)

private class ImageUnreadableException(uri: String) :
  CodedException("ERR_IMAGE_UNREADABLE", "'$uri' could not be opened as an image.", null)

private class DocumentLockedException :
  CodedException("ERR_DOCUMENT_LOCKED", "This PDF is password-protected.", null)
