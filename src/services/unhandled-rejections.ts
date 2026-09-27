import { Observe } from 'expo-observe';

/** A session's worth of reports: a rejection in a loop (a poll, a retry)
 * would otherwise repeat the same error until the app closes. */
const MAX_REPORTS = 20;

type Tracker = {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
};

/**
 * Reports promises nobody caught to EAS Observe. expo-app-metrics already
 * catches thrown errors (ErrorUtils) and native crashes, but a rejection is
 * neither: React Native tracks them only in __DEV__ (as LogBox warnings), so
 * in a release build a failed fire-and-forget — a sync, a flight watch, a
 * Live Activity update — vanished without a trace.
 *
 * Release builds only, so development keeps React Native's own tracker.
 */
export function reportUnhandledRejections(
  hermes: Tracker | undefined = (globalThis as { HermesInternal?: Tracker }).HermesInternal,
  isDev: boolean = __DEV__,
) {
  if (isDev) return;
  const seen = new Set<string>();
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      const key = rejection instanceof Error ? `${rejection.name}: ${rejection.message}` : String(rejection);
      if (seen.has(key) || seen.size >= MAX_REPORTS) return;
      seen.add(key);
      Observe.reportError(rejection instanceof Error ? rejection : new Error(`Unhandled rejection: ${key}`));
    },
    onHandled: () => {},
  });
}
