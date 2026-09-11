import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols/400Regular';
import { loadAsync } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Whether the icon font every SymbolView draws with on Android is in.
 *
 * On iOS a SymbolView is an SF Symbol and needs nothing; on Android it is a
 * glyph from Material Symbols, which every instance loads for itself in an
 * effect and draws nothing until the load resolves — and, when that load
 * fails (a dev client fetches the font from Metro; a cold start can lose the
 * request), nothing for good: the failure is swallowed and never retried,
 * so a whole screen's icons go missing. Loading the font once here, before
 * the first screen mounts, means every later instance finds it already in
 * and draws on its first frame; a failed load is retried, and the app goes
 * on without the font rather than waiting on it forever. */
export function useSymbolFont(): boolean {
  const [ready, setReady] = useState(Platform.OS !== 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          await loadAsync({ MaterialSymbols_400Regular });
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
