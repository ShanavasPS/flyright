import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { dismissFlash, useFlash } from '@/services/flash';

const SHOWN_MS = 3500;
// The pass cards' night navy and the payout green (theme.ts).
const NAVY = '#0C1B36';
const GREEN = '#0FA362';

/** The confirmation a closed screen left behind ("Update shared · Clara,
 * Noah & Sofia can see it now"), as a navy card over the bottom of the
 * screen that goes by itself. Render once per screen that can receive one. */
export function FlashToast() {
  const flash = useFlash();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => dismissFlash(flash.id), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!flash) return null;
  return (
    <Animated.View
      key={flash.id}
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={[flash.title, flash.detail].filter(Boolean).join('. ')}
      // Above the floating tab bar the trip screens sit under.
      style={[styles.toast, { bottom: insets.bottom + BottomTabInset + Spacing.three }]}>
      <View style={styles.check}>
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={14}
          weight="bold"
          tintColor="#FFFFFF"
        />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{flash.title}</Text>
        {flash.detail && (
          <Text style={styles.detail} numberOfLines={2}>
            {flash.detail}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: NAVY,
    boxShadow: '0 8px 24px rgba(7,15,32,0.3)',
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
  },
  detail: {
    color: '#9FB0C6',
    fontSize: 13,
    lineHeight: 18,
  },
});
