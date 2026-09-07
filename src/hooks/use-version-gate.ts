import { useAppVersion } from '@/hooks/use-app-version';

/**
 * Asks the server whether this binary version may still run. The same query
 * as the update notice (see useAppVersion), read for its one hard answer.
 *
 * Fails open by design: offline, timeout, server error, or unparseable
 * response all mean "not blocked" — a force-update gate must never lock
 * someone out at an airport gate because of a network hiccup.
 */
export function useVersionGate(): { blocked: boolean; storeUrl: string | null } {
  const { blocked, storeUrl } = useAppVersion();
  return { blocked, storeUrl };
}
