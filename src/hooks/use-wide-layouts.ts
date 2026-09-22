import { useMemo } from 'react';

import { resolveLayoutSwitches, type WideLayoutSwitches } from '@/constants/wide-layouts';
import { useAppVersion } from '@/hooks/use-app-version';

/** The wide-layout switches in force: the binary's defaults with the
 * server's overrides on top (validated — see constants/wide-layouts). Rides
 * the app-version query, so it costs no request of its own and starts from
 * the cached answer on a cold launch. */
export function useWideLayouts(): WideLayoutSwitches {
  const { layouts } = useAppVersion();
  return useMemo(() => resolveLayoutSwitches(layouts), [layouts]);
}
