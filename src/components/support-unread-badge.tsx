import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { api } from '../../convex/_generated/api';

import { CONVEX_URL } from '@/constants/config';
import { useTheme } from '@/hooks/use-theme';

/**
 * How many conversations hold a support reply the traveler hasn't opened, as
 * the red pill both doors to the inbox wear: the home screen's messages
 * button and the Settings row. Renders nothing when there is nothing to read,
 * when cloud sync is off, or when nobody is signed in — so callers can drop
 * it in unconditionally.
 */
export function SupportUnreadBadge({ style }: { style?: ViewStyle }) {
  const { isSignedIn } = useAuth();
  if (!CONVEX_URL || !isSignedIn) return null;
  return (
    <QuietBoundary>
      <Count style={style} />
    </QuietBoundary>
  );
}

function Count({ style }: { style?: ViewStyle }) {
  const theme = useTheme();
  const count = useQuery(api.support.unreadCount, {});
  if (!count) return null;
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.danger }, style]}
      accessibilityLabel={`${count} unread`}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/** A decoration must never take the screen down: Convex query errors throw
 * during render, so the badge renders nothing if its query fails. */
class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 12,
  },
});
