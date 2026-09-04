// Web build: no SQLite and no picker — the same API surface with static
// fallbacks, like journeys.web.ts.

import type { PickedImage, RemotePhoto, TripPhotoRow } from './photos';

export type { PickedImage, RemotePhoto, TripPhotoRow };

export class PhotoPermissionError extends Error {
  constructor(public readonly source: 'camera' | 'library') {
    super('Photos are not supported on web yet.');
  }
}

export function usePhotos(_journeyId: string): TripPhotoRow[] {
  return [];
}

export function usePhoto(_id: string): TripPhotoRow | undefined {
  return undefined;
}

export async function pickImages(_source: 'camera' | 'library'): Promise<PickedImage[]> {
  throw new Error('Photos are not supported on web yet.');
}

export async function importPhotos(
  _journeyId: string,
  _userId: string | null | undefined,
  _picked: PickedImage[],
): Promise<void> {
  throw new Error('Photos are not supported on web yet.');
}

export async function deletePhoto(_id: string): Promise<void> {
  throw new Error('Photos are not supported on web yet.');
}
