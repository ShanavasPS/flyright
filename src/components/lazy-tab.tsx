import { useIsFocused } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { ThemedView } from '@/components/themed-view';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';

/**
 * Renders a tab's screen once the tab has been opened, then keeps it.
 *
 * NativeTabs renders every tab's content at launch, so a cold start on
 * Flights also built Updates, Friends, World (the Skia globe and its
 * gestures) and Claims — measured on a Pixel 9a release build, that was most
 * of the first commit (scripts/perf/README.md). Until its first focus a tab
 * is an empty page in the theme's background; after that it stays mounted,
 * so switching back keeps its scroll position and state. It reports the tab
 * interactive to EAS Observe when it first opens, not while hidden at launch.
 */
export function LazyTab({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const [opened, setOpened] = useState(focused);
  if (focused && !opened) setOpened(true);
  useMarkInteractive(opened);
  return opened ? <>{children}</> : <ThemedView style={{ flex: 1 }} />;
}
