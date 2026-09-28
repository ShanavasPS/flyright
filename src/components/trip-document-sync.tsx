import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { db } from '@/db/client';
import { tripDocuments } from '@/db/schema';
import { useLiveRows } from '@/services/live-rows';
import {
  applyRemoteDocument,
  clearDocumentUploads,
  markDocumentUploaded,
  markDocumentsSynced,
  planDocumentSync,
  toRemoteDocument,
  uploadTripDocument,
} from '@/services/trip-documents';

/** Keeps the signed-in traveller's kept booking documents converged with
 * Convex: PhotoSync's loop for a PDF. Uploads the bytes of documents kept
 * here, pushes rows and tombstones, and pulls documents other devices kept. */
export function TripDocumentSync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const remote = useQuery(api.tripDocuments.list, isAuthenticated ? {} : 'skip');
  const push = useMutation(api.tripDocuments.push);
  const generateUploadUrl = useMutation(api.tripDocuments.generateUploadUrl);
  const { data: local } = useLiveRows(db.select().from(tripDocuments));
  const busy = useRef(false);

  useEffect(() => {
    if (!userId || !isAuthenticated || remote === undefined || !local) return;
    if (busy.current) return;

    const mine = local.filter((row) => row.userId === userId);
    const plan = planDocumentSync(mine, remote);
    if (!plan.upload.length && !plan.push.length && !plan.apply.length) return;

    busy.current = true;
    void (async () => {
      try {
        const outbound = [...plan.push];
        for (const row of plan.upload) {
          try {
            const storageId = await uploadTripDocument(row, await generateUploadUrl());
            await markDocumentUploaded(row.id, storageId, row.updatedAt);
            outbound.push({ ...row, storageId });
          } catch {
            // Missing file or bad network: left dirty for the next pass.
          }
        }
        for (let offset = 0; offset < outbound.length; offset += 100) {
          const chunk = outbound.slice(offset, offset + 100);
          const result = await push({
            rows: chunk.map((row) => ({
              ...toRemoteDocument(row),
              // SQLite stores the id as text; the validator wants the branded type.
              storageId: row.storageId as Id<'_storage'> | null,
            })),
          });
          const rejected = new Set(result?.rejected ?? []);
          if (rejected.size) await clearDocumentUploads([...rejected]);
          await markDocumentsSynced(chunk.filter((row) => !rejected.has(row.id)));
        }
        for (const row of plan.apply) await applyRemoteDocument(row, userId);
      } catch {
        // Rows stay dirty; the next remote/local change retries the plan.
      } finally {
        busy.current = false;
      }
    })();
  }, [userId, isAuthenticated, remote, local, push, generateUploadUrl]);

  return null;
}
