import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { WorldShareCard } from '@/components/world-share-card';
import { Spacing } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';
import { renderRouteHeat, routeHeatKey, routeHeatSupported } from '@/services/route-heat';
import { getSharePrefs, setSharePrefs } from '@/services/share-prefs';
import {
  SHARE_CARD,
  shareCopy,
  shareMapModel,
  useWorldShare,
  type PosterTheme,
  type ShareFormat,
  type ShareMapModel,
} from '@/services/world-share';

/** Pixel width of the exported image — Instagram's native story and post width. */
const EXPORT_WIDTH = 1080;

const BG = '#040A18';
const SURFACE = '#101D34';
const TEXT = '#F2F6FB';
const MUTED = '#8FA2BB';
const TINT = '#4E9BF5';
const GREEN = '#2FD68C';

/** Preview of the shareable card, the Story/Square toggle, the poster's
 * Dark/Light switch, the Heat switch, and the share sheet.
 *
 * The card is laid out at its design size and scaled down to fit the screen,
 * so what is captured is the same tree the traveller is looking at; the
 * capture asks for 1080 px across and view-shot rasterises the design-size
 * view up to it. The screen itself is always dark whatever the poster is:
 * a light poster on a dark screen reads as a preview, a navy poster on a
 * white screen read as a mistake. */
export function ShareWorld() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const share = useWorldShare();
  const { user } = useUser();
  const [format, setFormat] = useState<ShareFormat>('story');
  const [prefs, setPrefs] = useState(getSharePrefs);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date());
  const cardRef = useRef<View>(null);

  const firstName = user?.firstName ?? null;
  const copy = useMemo(
    () => (share ? shareCopy(share, firstName, now) : null),
    [share, firstName, now],
  );
  const model = useMemo(
    () => (share && copy ? shareMapModel(share.rows, now, format, copy.single) : null),
    [share, copy, now, format],
  );
  const heat = useRouteHeat(model, prefs.theme, prefs.heat);

  const choose = (next: Partial<typeof prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setSharePrefs(merged);
  };

  const cardHeight = SHARE_CARD.height[format];
  // Room left for the preview once the bar above and the controls below
  // have theirs; never scale up past the design size.
  const availableWidth = width - Spacing.four * 2;
  const availableHeight = height - insets.top - insets.bottom - 56 - 202;
  const scale = Math.min(1, availableWidth / SHARE_CARD.width, availableHeight / cardHeight);

  const onShare = async () => {
    if (!share || !copy || busy || heat.pending) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        // Photos and messengers show the file name; a UUID reads as junk.
        fileName: `flyright-${copy.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        width: EXPORT_WIDTH,
        height: Math.round((EXPORT_WIDTH * cardHeight) / SHARE_CARD.width),
      });
      trackEvent('world_shared', {
        format,
        kind: share.kind,
        period: share.period.kind,
        flights: share.rows.length,
        theme: prefs.theme,
        heat: heat.uri !== null,
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

  const disabled = !share || busy || heat.pending;
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
        {share && copy && model ? (
          <View style={{ width: SHARE_CARD.width * scale, height: cardHeight * scale }}>
            <View
              style={{
                width: SHARE_CARD.width,
                height: cardHeight,
                transform: [{ scale }],
                transformOrigin: 'top left',
                borderRadius: 24 / scale,
                overflow: 'hidden',
              }}>
              <WorldShareCard
                ref={cardRef}
                model={model}
                copy={copy}
                format={format}
                theme={prefs.theme}
                heatUri={heat.uri}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.empty}>Nothing to share yet.</Text>
        )}
      </View>

      <View style={styles.controls}>
        <View style={styles.formats}>
          <Chip label="Story" hint="9:16" selected={format === 'story'} onPress={() => setFormat('story')} />
          <Chip label="Square" hint="1:1" selected={format === 'square'} onPress={() => setFormat('square')} />
        </View>
        <View style={styles.options}>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Poster theme">
            <SegmentButton
              label="Dark"
              symbol={{ ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' }}
              selected={prefs.theme === 'dark'}
              onPress={() => choose({ theme: 'dark' })}
            />
            <SegmentButton
              label="Light"
              symbol={{ ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' }}
              selected={prefs.theme === 'light'}
              onPress={() => choose({ theme: 'light' })}
            />
          </View>
          {heat.supported && (
            <View style={styles.toggle}>
              <Text style={styles.toggleLabel}>Heat</Text>
              <Switch
                testID="share-heat"
                accessibilityLabel="Heat layer"
                value={prefs.heat}
                onValueChange={(value) => choose({ heat: value })}
                thumbColor="#FFFFFF"
                trackColor={{ true: GREEN, false: '#22344F' }}
              />
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share image"
          disabled={disabled}
          onPress={onShare}
          style={[styles.shareButton, disabled && styles.shareButtonDisabled]}>
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

/** The heat PNG for this map in this theme, drawn on the GPU as soon as the
 * inputs settle; the card shows the plain atlas until it lands. `pending`
 * holds the share button so a capture never goes out half-drawn.
 * `supported` is whether this phone can draw it at all — false hides the
 * switch, since off is exactly what it would get. */
function useRouteHeat(model: ShareMapModel | null, theme: PosterTheme, enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<{ key: string | null; uri: string | null }>({ key: null, uri: null });
  const key = model && enabled ? routeHeatKey(model, theme) : null;

  useEffect(() => {
    let live = true;
    routeHeatSupported().then((ok) => {
      if (live) setSupported(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!model || !key) return;
    let live = true;
    renderRouteHeat(model, theme).then((uri) => {
      if (live) setState({ key, uri });
    });
    return () => {
      live = false;
    };
  }, [model, theme, key]);

  const ready = key !== null && state.key === key;
  return {
    supported,
    uri: ready ? state.uri : null,
    pending: supported && key !== null && !ready,
  };
}

function Chip({
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

function SegmentButton({
  label,
  symbol,
  selected,
  onPress,
}: {
  label: string;
  symbol: ComponentProps<typeof SymbolView>['name'];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    // A button, not a radio: Android maps `radio` to a RadioButton whose
    // accessibility click never reached onPress.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.segmentButton, selected && styles.segmentSelected]}>
      <SymbolView name={symbol} size={13} weight="semibold" tintColor={selected ? TEXT : MUTED} />
      <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{label}</Text>
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
  options: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  segment: {
    flexDirection: 'row',
    height: 36,
    padding: 3,
    borderRadius: 18,
    backgroundColor: SURFACE,
  },
  segmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: 15,
  },
  segmentSelected: {
    backgroundColor: '#22344F',
  },
  segmentLabel: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentLabelSelected: {
    color: TEXT,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  toggleLabel: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '700',
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
