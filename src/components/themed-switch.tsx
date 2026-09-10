import { Platform, Switch, type SwitchProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** The app's Switch: tint track when on, white thumb on both platforms.
 * Android's stock thumb is Material's teal accent (unless the native theme
 * overrides colorAccent — plugins/with-android-theme.js does), and its off
 * track a grey that vanishes on the dark surfaces; iOS already looks like
 * this, so the props only pin what Android would otherwise invent. */
export function ThemedSwitch(props: SwitchProps) {
  const theme = useTheme();
  return (
    <Switch
      thumbColor="#FFFFFF"
      trackColor={{ true: theme.tint, false: Platform.OS === 'android' ? theme.textSecondary : undefined }}
      {...props}
    />
  );
}
