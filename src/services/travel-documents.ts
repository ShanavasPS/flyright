/** Picking a travel document inside the app — the counterpart to "Share →
 * FlyRight" (modules/flyright-document-import).
 *
 * Two places hold a ticket: Files/iCloud/Drive for the PDF an airline
 * emailed, and the photo library for the screenshot of a mobile pass or the
 * snap of a paper one. They need different system pickers, so the traveler
 * is asked which — natively, so the choice looks like the OS and not like us.
 *
 * Everything here returns the same shape the import screen reads, and both
 * pickers hand back a copy in the app's cache: the import screen deletes it
 * once it has been read, so an uploaded ticket never lingers on the device.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface PickedDocument {
  uri: string;
  /** The file's own name when the picker knows one — shown while reading. */
  name: string | null;
  /** Null when the picker didn't say; the reader falls back to the extension. */
  mimeType: string | null;
}

/** Thrown when the traveler declined the photo library permission. */
export class LibraryPermissionError extends Error {
  constructor() {
    super('Photo library access was declined');
  }
}

export type DocumentSource = 'files' | 'photos';

/** A PDF or an image from Files, iCloud Drive, Google Drive — wherever the
 * system picker can reach. Null when the traveler backs out. */
async function pickFromFiles(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Images too: a pass saved to Files is as likely as one in the library.
    type: ['application/pdf', 'image/*'],
    multiple: false,
    // The picked original may live in another app's container or in iCloud;
    // the cache copy is ours to read and to delete.
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name ?? null, mimeType: asset.mimeType ?? null };
}

/** A screenshot or photo from the library. Null when the traveler backs out. */
async function pickFromPhotos(): Promise<PickedDocument | null> {
  // iOS runs the picker out of process (PHPicker), so it needs no permission
  // and asking for one would put a dialog in front of a file the traveler is
  // about to hand over anyway. Android's older gallery intent does need the
  // storage read the plugin declares up to API 32.
  if (Platform.OS !== 'ios') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new LibraryPermissionError();
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    // Full quality on purpose, unlike trip photos: re-encoding softens the
    // narrow bars of a PDF417 stripe, which is the whole point of the upload.
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? null,
    mimeType: asset.mimeType ?? 'image/*',
  };
}

export async function pickTravelDocument(source: DocumentSource): Promise<PickedDocument | null> {
  return source === 'photos' ? pickFromPhotos() : pickFromFiles();
}

/** Native "where is it?" sheet, then that picker. Null when the traveler
 * dismisses either one. */
export function promptForTravelDocument(): Promise<PickedDocument | null> {
  return chooseSource().then((source) => (source ? pickTravelDocument(source) : null));
}

const TITLE = 'Upload a ticket or boarding pass';
const PHOTOS = 'Photo library';
const FILES = 'Files';

function chooseSource(): Promise<DocumentSource | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      const options = [PHOTOS, FILES, 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: TITLE, options, cancelButtonIndex: 2 },
        (index) => resolve(index === 0 ? 'photos' : index === 1 ? 'files' : null),
      );
      return;
    }
    Alert.alert(
      TITLE,
      undefined,
      [
        { text: PHOTOS, onPress: () => resolve('photos') },
        { text: FILES, onPress: () => resolve('files') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      // Dismissing with the back gesture answers nothing at all.
      { onDismiss: () => resolve(null) },
    );
  });
}
