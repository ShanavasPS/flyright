import type { ReleaseNote } from '../constants/release-notes';

/** Compare dotted numeric versions; negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const isVersion = (s: string) => /^\d+(\.\d+)*$/.test(s);

/** The store's newest version for a platform, when the server could ask. */
export interface LatestRelease {
  version: string;
  /** ISO timestamp when known (the App Store says; Play does not). */
  releasedAt: string | null;
}

/** What /api/app-version answers. `valid` is the force-update gate and is
 * the only field a client may act on by blocking; the rest is advisory. */
export interface AppVersionResponse {
  valid: boolean;
  minVersion: string;
  storeUrl?: string;
  latest?: LatestRelease | null;
  /** Newest first: every release newer than the caller's and no newer than
   * `latest`, so a phone sees exactly what an update would bring. */
  notes?: ReleaseNote[];
}

/** The release notes an update from `installed` to `latest` would bring. */
export function notesBetween(all: ReleaseNote[], installed: string, latest: string): ReleaseNote[] {
  return all
    .filter(
      (note) =>
        isVersion(note.version) &&
        compareVersions(note.version, installed) > 0 &&
        compareVersions(note.version, latest) <= 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}
