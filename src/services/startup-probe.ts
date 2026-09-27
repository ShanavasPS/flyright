/**
 * Cold-start measurements for profiling builds (scripts/perf/README.md).
 * Off unless the build was made with EXPO_PUBLIC_STARTUP_PROBE=1 — the check
 * is inlined at build time, so store builds carry only a dead branch.
 *
 * A few seconds after launch it prints one logcat line (ReactNativeJS):
 * EAS Observe's own startup metrics for this launch (the numbers the
 * dashboard shows) and, in FLYRIGHT_MODULE_TIMING builds, the modules whose
 * top-level code cost the most while the bundle loaded.
 */
const marks: [string, number][] = [];

/** A timestamp on the startup path, printed by the probe. Free in store builds. */
export function probeMark(label: string) {
  if (process.env.EXPO_PUBLIC_STARTUP_PROBE !== '1') return;
  marks.push([label, Math.round(performance.now())]);
}

export function runStartupProbe() {
  if (process.env.EXPO_PUBLIC_STARTUP_PROBE !== '1') return;
  setTimeout(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AppMetrics = require('expo-app-metrics').default;
    const metrics: { name: string; value: number; routeName?: string | null }[] =
      await AppMetrics.getMainSession().getMetrics();
    const startup = Object.fromEntries(
      metrics.map((m) => [m.routeName ? `${m.name}@${m.routeName}` : m.name, Math.round(m.value * 1000)]),
    );
    const times: [string, number][] = (globalThis as { __mtimes?: [string, number][] }).__mtimes ?? [];
    const byPackage = new Map<string, number>();
    for (const [file, ms] of times) {
      const pkg = file.startsWith('node_modules/')
        ? file.split('/').slice(1, file.split('/')[1].startsWith('@') ? 3 : 2).join('/')
        : file.split('/').slice(0, 3).join('/');
      byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + ms);
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    // One logcat line holds ~4 KB, so each part goes on its own line.
    const parts = {
      startup,
      marks,
      modules: { count: times.length, selfMs: round(times.reduce((sum, [, ms]) => sum + ms, 0)) },
      topPackages: [...byPackage].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([p, ms]) => [p, round(ms)]),
      topModules: [...times].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, ms]) => [f.slice(-90), round(ms)]),
    };
    for (const [key, value] of Object.entries(parts)) {
      console.log(`[startup-probe] ${key} ${JSON.stringify(value)}`);
    }
    console.log('[startup-probe] end');
  }, 8000);
}
