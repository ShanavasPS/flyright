import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { nativeApplicationVersion } from 'expo-application';
import { Platform } from 'react-native';

import type { ReleaseNote } from '@/constants/release-notes';
import { compareVersions, isVersion, notesBetween, type AppVersionResponse } from '@/services/app-version';
import { cachedAppVersion, cacheAppVersion } from '@/services/app-version-cache';

const SIX_HOURS_MS = 6 * 60 * 60_000;

/** A newer build on the store than the one running. */
export interface AvailableUpdate {
  installed: string;
  latest: string;
  releasedAt: string | null;
  storeUrl: string | null;
  /** Newest first — every release the update would bring. */
  notes: ReleaseNote[];
}

/** The version this binary reports.
 *
 * Read the installed binary, so a Metro reload cannot pretend that the
 * traveller has installed a newer app.
 *
 * Dev builds can pretend to be older with EXPO_PUBLIC_PRETEND_APP_VERSION in
 * the shell that starts Metro, to see the update surfaces without a store
 * release ahead of the working copy. */
export function installedVersion(): string | undefined {
  if (__DEV__ && process.env.EXPO_PUBLIC_PRETEND_APP_VERSION) {
    return process.env.EXPO_PUBLIC_PRETEND_APP_VERSION;
  }
  return nativeApplicationVersion ?? Constants.expoConfig?.version;
}

/**
 * One question to the server about this binary — may it still run, and is
 * there something newer — shared by the launch gate, the Settings row and
 * the What's new sheet through the query cache.
 *
 * Fails open by design: offline, timeout, server error, or unparseable
 * response all mean "not blocked, nothing to announce" — a force-update gate
 * must never lock someone out at an airport gate because of a network hiccup.
 */
export function useAppVersion(): {
  blocked: boolean;
  storeUrl: string | null;
  update: AvailableUpdate | null;
  ready: boolean;
} {
  const version = installedVersion();

  const { data } = useQuery({
    queryKey: ['app-version', version],
    enabled: Platform.OS !== 'web' && !!version,
    initialData: cachedAppVersion,
    initialDataUpdatedAt: 0,
    // Re-asked twice a day while the app stays alive: a release lands while
    // people keep the app open for weeks.
    staleTime: SIX_HOURS_MS,
    refetchInterval: SIX_HOURS_MS,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(
        `/api/app-version?platform=${Platform.OS}&version=${encodeURIComponent(version!)}`,
      );
      if (!res.ok) throw new Error(`app-version check failed: ${res.status}`);
      const result = (await res.json()) as AppVersionResponse;
      if (result.latest && !isVersion(result.latest.version)) throw new Error('Invalid store version');
      // A transient store lookup failure is not evidence that an update
      // disappeared. Preserve the last confirmed release and its badge.
      const previous = cachedAppVersion();
      const answer = result.latest ? result : { ...result, latest: previous?.latest, notes: previous?.notes };
      cacheAppVersion(answer);
      return answer;
    },
  });

  const latest = data?.latest ?? null;
  const update: AvailableUpdate | null =
    version && latest && compareVersions(latest.version, version) > 0
      ? {
          installed: version,
          latest: latest.version,
          releasedAt: latest.releasedAt,
          storeUrl: data?.storeUrl ?? null,
          notes: notesBetween(data?.notes ?? [], version, latest.version),
        }
      : null;

  return {
    ready: Platform.OS === 'web' || !!data?.latest,
    blocked: data?.valid === false,
    storeUrl: data?.storeUrl ?? null,
    update,
  };
}
