import { View, type ViewProps } from 'react-native';

/** Native: motion here would compete with the navigator's own transitions,
 * so both are plain Views. The web twin (reveal.web.tsx) animates. */
export function Reveal({
  children,
  style,
}: ViewProps & {
  from?: 'up' | 'left' | 'right';
  delay?: number;
  distance?: number;
  duration?: number;
  eager?: boolean;
}) {
  return <View style={style}>{children}</View>;
}

export function Float({
  children,
  style,
}: ViewProps & { amplitude?: number; period?: number; delay?: number }) {
  return <View style={style}>{children}</View>;
}
