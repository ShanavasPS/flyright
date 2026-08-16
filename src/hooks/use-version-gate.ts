import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Asks the server whether this binary version may still run.
 *
 * Fails open by design: offline, timeout, server error, or unparseable
 * response all mean "not blocked" — a force-update gate must never lock
 * someone out at an airport gate because of a network hiccup.
 *
 * Version source: expoConfig.version tracks the store binary version; the
 * app ships no OTA updates, so it cannot drift from the native binary. If
 * expo-updates is ever adopted, switch to expo-application's
 * nativeApplicationVersion.
 */
export function useVersionGate(): { blocked: boolean; storeUrl: string | null } {
  const version = Constants.expoConfig?.version;

  const { data } = useQuery({
    queryKey: ['app-version', version],
    enabled: Platform.OS !== 'web' && !!version,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(
        `/api/app-version?platform=${Platform.OS}&version=${encodeURIComponent(version!)}`,
      );
      if (!res.ok) throw new Error(`app-version check failed: ${res.status}`);
      return (await res.json()) as { valid: boolean; storeUrl?: string };
    },
  });

  return {
    blocked: data?.valid === false,
    storeUrl: data?.storeUrl ?? null,
  };
}
