import type { PostcardDraft } from './postcard-draft';
import type { PickedImage } from './photos';

export type { PostcardDraft };

// Web has no journal photo picker. Preserve text without importing native
// SQLite or filesystem modules into the website's bundle.
const key = (userId: string | null | undefined, trip: string) => `postcard-draft:${userId ?? 'guest'}:${trip}`;
export function readPostcardDraft(userId: string | null | undefined, trip: string): PostcardDraft {
  try {
    const raw = localStorage.getItem(key(userId, trip));
    const saved = raw ? JSON.parse(raw) : null;
    return { text: typeof saved?.text === 'string' ? saved.text : '', picked: null };
  } catch { return { text: '', picked: null }; }
}
export function savePostcardDraft(userId: string | null | undefined, trip: string, draft: PostcardDraft) {
  try { localStorage.setItem(key(userId, trip), JSON.stringify({ text: draft.text, picked: null })); } catch { /* unavailable during server rendering or in private browsing */ }
}
export function clearPostcardDraft(userId: string | null | undefined, trip: string) {
  try { localStorage.removeItem(key(userId, trip)); } catch { /* unavailable storage */ }
}
export function keepDraftPhoto(_picked: PickedImage): PickedImage {
  throw new Error('Photo drafts are available in the mobile app.');
}
export function removeDraftPhoto(_picked: PickedImage) {}
