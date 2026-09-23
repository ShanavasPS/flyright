import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import type { PickedImage } from '@/services/photos';

export interface PostcardDraft { text: string; picked: PickedImage | null }
const key = (userId: string | null | undefined, trip: string) => `postcard-draft:${userId ?? 'guest'}:${trip}`;
const directory = () => new Directory(Paths.document, 'postcard-drafts');
function ownFile(uri: string) {
  const name = /\/postcard-drafts\/([a-z0-9-]+\.jpg)$/.exec(uri)?.[1];
  return name ? new File(directory(), name) : null;
}
export function keepDraftPhoto(picked: PickedImage): PickedImage {
  const dir = directory();
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`);
  new File(picked.uri).copy(target);
  return { ...picked, uri: target.uri };
}
export function readPostcardDraft(userId: string | null | undefined, trip: string): PostcardDraft {
  try {
    const raw = Storage.getItemSync(key(userId, trip));
    const saved = raw ? JSON.parse(raw) as PostcardDraft : null;
    const photo = saved?.picked?.uri ? ownFile(saved.picked.uri) : null;
    return { text: typeof saved?.text === 'string' ? saved.text : '', picked: photo?.exists && saved?.picked ? { ...saved.picked, uri: photo.uri } : null };
  } catch { return { text: '', picked: null }; }
}
export function savePostcardDraft(userId: string | null | undefined, trip: string, draft: PostcardDraft) {
  Storage.setItemSync(key(userId, trip), JSON.stringify(draft));
}
export function clearPostcardDraft(userId: string | null | undefined, trip: string) {
  const { picked } = readPostcardDraft(userId, trip);
  Storage.removeItemSync(key(userId, trip));
  if (picked) removeDraftPhoto(picked);
}
export function removeDraftPhoto(photo: PickedImage) {
  try { const file = ownFile(photo.uri); if (file?.exists) file.delete(); } catch { /* best effort */ }
}
