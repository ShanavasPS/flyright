import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { ReleaseNote } from '@/constants/release-notes';
import { compareVersions, type AppVersionResponse } from '@/services/app-version';

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
 * `expoConfig.version` tracks the store binary version; the app ships no
 * OTA updates, so it cannot drift from the native binary. If expo-updates is
 * ever adopted, switch to expo-application's nativeApplicationVersion.
 *
 * Dev builds can pretend to be older with EXPO_PUBLIC_PRETEND_APP_VERSION in
 * the shell that starts Metro, to see the update surfaces without a store
 * release ahead of the working copy. */
export function installedVersion(): string | undefined {
  if (__DEV__ && process.env.EXPO_PUBLIC_PRETEND_APP_VERSION) {
    return process.env.EXPO_PUBLIC_PRETEND_APP_VERSION;
  }
  return Constants.expoConfig?.version;
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
} {
  const version = installedVersion();

  const { data } = useQuery({
    queryKey: ['app-version', version],
    enabled: Platform.OS !== 'web' && !!version,
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
      return (await res.json()) as AppVersionResponse;
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
          notes: data?.notes ?? [],
        }
      : null;

  return {
    blocked: data?.valid === false,
    storeUrl: data?.storeUrl ?? null,
    update,
  };
}
