import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { CARD_HEIGHT, CARD_WIDTH, WorldShareCard } from '@/components/world-share-card';
import { Spacing } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';
import { shareCopy, useWorldShare, type ShareFormat } from '@/services/world-share';

/** Pixel width of the exported image — Instagram's native story and post width. */
const EXPORT_WIDTH = 1080;

const BG = '#040A18';
const SURFACE = '#101D34';
const TEXT = '#F2F6FB';
const MUTED = '#8FA2BB';
const TINT = '#4E9BF5';

/** Preview of the shareable card, a Story/Square toggle, and the share sheet.
 *
 * The card is laid out at its design size and scaled down to fit the screen,
 * so what is captured is the same tree the traveller is looking at; the
 * capture asks for 1080 px across and view-shot rasterises the design-size
 * view up to it. The screen itself is always dark: the card is, and a white
 * frame around a navy poster made it look like a mistake. */
export function ShareWorld() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const share = useWorldShare();
  const { user } = useUser();
  const [format, setFormat] = useState<ShareFormat>('story');
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date());
  const cardRef = useRef<View>(null);

  const firstName = user?.firstName ?? null;
  const copy = useMemo(
    () => (share ? shareCopy(share, firstName, now) : null),
    [share, firstName, now],
  );

  const cardHeight = CARD_HEIGHT[format];
  // Room left for the preview once the bar above and the controls below
  // have theirs; never scale up past the design size.
  const availableWidth = width - Spacing.four * 2;
  const availableHeight = height - insets.top - insets.bottom - 56 - 150;
  const scale = Math.min(1, availableWidth / CARD_WIDTH, availableHeight / cardHeight);

  const onShare = async () => {
    if (!share || !copy || busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        // Photos and messengers show the file name; a UUID reads as junk.
        fileName: `flyright-${copy.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        width: EXPORT_WIDTH,
        height: Math.round((EXPORT_WIDTH * cardHeight) / CARD_WIDTH),
      });
      trackEvent('world_shared', {
        format,
        kind: share.kind,
        period: share.period.kind,
        flights: share.rows.length,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share your world',
      });
    } catch {
      Alert.alert('Couldn’t make the image', 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.barButton}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={16}
            weight="bold"
            tintColor={TEXT}
          />
        </Pressable>
        <Text style={styles.barTitle}>Share</Text>
        <View style={styles.barButton} />
      </View>

      <View style={styles.preview}>
        {share && copy ? (
          <View style={{ width: CARD_WIDTH * scale, height: cardHeight * scale }}>
            <View
              style={{
                width: CARD_WIDTH,
                height: cardHeight,
                transform: [{ scale }],
                transformOrigin: 'top left',
                borderRadius: 24 / scale,
                overflow: 'hidden',
              }}>
              <WorldShareCard ref={cardRef} rows={share.rows} copy={copy} format={format} now={now} />
            </View>
          </View>
        ) : (
          <Text style={styles.empty}>Nothing to share yet.</Text>
        )}
      </View>

      <View style={styles.controls}>
        <View style={styles.formats}>
          <FormatChip label="Story" hint="9:16" selected={format === 'story'} onPress={() => setFormat('story')} />
          <FormatChip label="Square" hint="1:1" selected={format === 'square'} onPress={() => setFormat('square')} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share image"
          disabled={!share || busy}
          onPress={onShare}
          style={[styles.shareButton, (!share || busy) && styles.shareButtonDisabled]}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <SymbolView
                name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                size={18}
                weight="semibold"
                tintColor="#FFFFFF"
              />
              <Text style={styles.shareLabel}>Share image</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function FormatChip({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      <Text style={[styles.chipHint, selected && styles.chipLabelSelected]}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  barButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTitle: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '700',
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  empty: {
    color: MUTED,
  },
  controls: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  formats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    height: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    backgroundColor: SURFACE,
  },
  chipSelected: {
    backgroundColor: TINT,
  },
  chipLabel: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 36,
  },
  chipHint: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: '#FFFFFF',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 26,
    backgroundColor: TINT,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
