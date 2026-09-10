import { Host } from '@expo/ui/jetpack-compose';
import type { ComponentProps } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** `Host` from @expo/ui with the app's theme fed to Material: the scheme the
 * JS renders (not the system's — Settings can override it) and the tint as
 * the seed, so Compose dialogs and menus paint their surfaces from the same
 * blue family as the cards instead of the device's dynamic wallpaper colours
 * or the Material baseline grey. Only the .android files import it. */
export function ComposeHost(props: ComponentProps<typeof Host>) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <Host colorScheme={scheme === 'dark' ? 'dark' : 'light'} seedColor={theme.tint} {...props} />
  );
}
