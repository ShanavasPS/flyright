import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useRef } from 'react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { db } from '@/db/client';
import { tripPhotos } from '@/db/schema';
import {
  applyRemotePhoto,
  markPhotoUploaded,
  markPhotosSynced,
  planPhotoSync,
  toRemotePhoto,
  uploadPhoto,
} from '@/services/photos';

/** Keeps trip photos converged with Convex for the signed-in user: uploads
 * the bytes of photos imported here, pushes rows and tombstones, and pulls
 * photos other devices added. Same shape and termination argument as
 * JourneySync; sits next to it inside CloudSync. */
export function PhotoSync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const remote = useQuery(api.photos.list, isAuthenticated ? {} : 'skip');
  const push = useMutation(api.photos.push);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const { data: local } = useLiveQuery(db.select().from(tripPhotos));
  const busy = useRef(false);

  useEffect(() => {
    if (!userId || !isAuthenticated || remote === undefined || !local) return;
    if (busy.current) return;

    const mine = local.filter((row) => row.userId === userId);
    const plan = planPhotoSync(mine, remote);
    if (!plan.upload.length && !plan.push.length && !plan.apply.length) return;

    busy.current = true;
    void (async () => {
      try {
        const outbound = [...plan.push];
        for (const row of plan.upload) {
          try {
            const storageId = await uploadPhoto(row, await generateUploadUrl());
            await markPhotoUploaded(row.id, storageId);
            outbound.push({ ...row, storageId });
          } catch {
            // Missing file or bad network: leave it dirty for the next pass.
          }
        }
        if (outbound.length) {
          await push({
            rows: outbound.map((row) => ({
              ...toRemotePhoto(row),
              // SQLite stores the id as text; the validator wants the branded type.
              storageId: row.storageId as Id<'_storage'> | null,
            })),
          });
          await markPhotosSynced(outbound);
        }
        for (const row of plan.apply) await applyRemotePhoto(row, userId);
      } catch {
        // Rows stay dirty; the next remote/local change retries the plan.
      } finally {
        busy.current = false;
      }
    })();
  }, [userId, isAuthenticated, remote, local, push, generateUploadUrl]);

  return null;
}
