/** Native release regression probe. Uses only its own temporary files and a
 * loopback test server; it never uploads to Convex or edits the journey DB. */
import { Directory, File, Paths } from 'expo-file-system';
import { resolvePhotoUri } from '@/services/photo-files';
import { uploadPhoto, type TripPhotoRow } from '@/services/photos';

export async function checkNativePhotoUpgrade(): Promise<void> {
  if (!__DEV__) throw new Error('Development builds only');
  const name = `release-check-${Date.now()}.jpg`;
  const directory = new Directory(Paths.document, 'trip-photos');
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, name);
  const oldUri = `file:///var/mobile/Containers/Data/Application/old-release-container/Documents/trip-photos/${name}`;
  const endpoint = 'http://127.0.0.1:18765';
  const bytes = new Uint8Array([255, 216, 255, 217]);
  const row: TripPhotoRow = {
    id: name, journeyId: 'release-check', userId: null, uri: oldUri,
    width: 1, height: 1, storageId: null, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), deletedAt: null, syncedAt: null,
  };
  const expectFailure = async (uri: string, path: string, message: string) => {
    try { await uploadPhoto({ ...row, uri }, `${endpoint}/${path}`); }
    catch (error) {
      if (error instanceof Error && error.message.includes(message)) return;
      throw error;
    }
    throw new Error(`Expected rejection: ${message}`);
  };
  try {
    file.create();
    file.write(bytes);
    if (resolvePhotoUri(oldUri) !== file.uri) throw new Error('Photo path was not rebased after upgrade');
    if (await uploadPhoto(row, `${endpoint}/upload`) !== 'release-check-photo') throw new Error('Native upload failed');
    await expectFailure(oldUri, 'unavailable', '503');
    file.write(new Uint8Array());
    await expectFailure(oldUri, 'must-not-upload', 'unavailable');
    file.delete();
    await expectFailure(oldUri, 'must-not-upload', 'unavailable');
    // A failed file must not prevent the next healthy file from uploading.
    file.create();
    file.write(bytes);
    if (await uploadPhoto(row, `${endpoint}/upload`) !== 'release-check-photo') throw new Error('Upload did not recover');
  } finally {
    if (file.exists) file.delete();
  }
}
