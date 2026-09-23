import { SymbolView } from 'expo-symbols';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as COUNTRY_FLAGS from 'country-flag-icons/string/3x2';


import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { Connection } from '@/services/connections';
import { cityOf } from '@/services/timeline';
import type { TripGroup, TripStay } from '@/services/trip-groups';

/** Join the virtualized rows into one filled trip container. Each flight keeps
 * its own list key and measured position for live-card shortcuts and scrolling. */
export function TripGroupFrame({ children, header, first, last, country }: {
  children: ReactNode;
  header?: boolean;
  first?: boolean;
  last?: boolean;
  country?: string;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const band = scheme === 'dark' ? BAND_DARK : BAND_LIGHT;
  const backgroundColor = header ? band : theme.field;
  return (
    <View style={[
      styles.frame,
      header ? styles.frameHeader : styles.frameBody,
      first && styles.frameFirst,
      last && styles.frameLast,
      { backgroundColor, borderColor: theme.hairline },
    ]}>
      {header && !!country && <TripGroupFlag country={country} tone={backgroundColor} />}
      {children}
      {/* Android slightly insets a rounded background's flat edges too.
          Fill that join so adjacent cells cannot expose a hairline seam. */}
      {(header || last) && <View pointerEvents="none" style={[
        styles.joinFill,
        header ? styles.joinBottom : styles.joinTop,
        { backgroundColor },
      ]} />}
    </View>
  );
}

/** The flag is drawn at full strength and the gradient alone fades it. Dimming
 * the artwork as well blended a flag's white areas into the near-white light
 * band until they vanished (Singapore, Japan, Finland), so its colours stay
 * true and the scrim does all the work. */
const FLAG_PRESENCE = 1;
/** The title band is pulled away from the page in both themes so a flag always
 * has something to read against: deeper than `backgroundSelected` in light, so
 * white areas show (Singapore, Japan, Finland), and lighter in dark, so navy
 * and black ones do (the UK's blue, the US canton, Germany's stripe). The date
 * ink moves with it — 5.6:1 light and 5.7:1 dark, both better than the 5.4:1
 * and 4.7:1 that secondary ink managed on the plain band. */
const BAND_LIGHT = '#DCE5F0';
const BAND_DATE_LIGHT = '#4A5A6E';
const BAND_DARK = '#26395F';
const BAND_DATE_DARK = '#A8BBD4';
/** The whole flag is drawn into this much of the band, measured from the right,
 * so its hoist side is dimmed by the fade rather than cut off by the scrim. Its
 * own left edge lands at 25%, which the gradient is still fully solid over. */
const FLAG_WIDTH = '75%';
/** A flag's white areas vanish on the near-white light band (Singapore, Japan,
 * Finland, Poland) and its dark areas vanish on the navy one. The flag is drawn
 * on this plate so both keep something to read against; it is faded by the same
 * ramp as the flag, so it never shows an edge of its own. */

/** The country's flag as an SVG string, or null for a code we have no art for
 * (the band then keeps its plain fill). */
function flagArt(country: string): string | null {
  const art = (COUNTRY_FLAGS as Record<string, string | undefined>)[country.toUpperCase()];
  return art ?? null;
}

/** The destination's flag, faded into the right of the title band in place of
 * the glyph that used to sit beside the title. The artwork is the vector flag,
 * stretched edge to edge like a banner and held down by a gradient of the
 * band's own colour, so the title and dates keep their normal contrast and the
 * title starts at the band's ordinary left inset. The emoji glyph cannot do
 * this job: it is a rounded sticker with its own padding and shadow, so
 * stretching it shows the sticker rather than the flag. */
const TripGroupFlag = memo(function TripGroupFlag({ country, tone }: { country: string; tone: string }) {
  const art = flagArt(country);
  if (!art) return null;
  // Fully solid across the title and dates, then falling away to nothing by the
  // right edge, so the flag is at FLAG_PRESENCE there and absent behind the
  // words. Same shape as the app's other scrims.
  const fade = `linear-gradient(90deg, ${tone} 0%, ${tone} 34%, ${tone}D9 52%, ${tone}59 78%, ${tone}00 100%)`;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.flagLayer}
    >
      <View style={styles.flagBanner}>
        <SvgXml xml={art} width="100%" height="100%" preserveAspectRatio="none" />
      </View>
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: fade }]} />
    </View>
  );
});

export function TripGroupHeading({ group, dates }: { group: TripGroup; dates: string }) {
  const scheme = useColorScheme();
  const dateInk = { color: scheme === 'dark' ? BAND_DATE_DARK : BAND_DATE_LIGHT };
  return (
    <View style={styles.heading} testID={`trip-group-${group.id}`}>
      <ThemedText type="smallBold" themeColor="heading" style={styles.name} accessibilityRole="header">
        {group.title}
      </ThemedText>
      {!!dates && <ThemedText type="small" themeColor="textSecondary" style={[styles.dates, dateInk]}>{dates}</ThemedText>}
    </View>
  );
}

export function TripStayMark({ stay }: { stay: TripStay }) {
  const theme = useTheme();
  const duration = stay.days === 0 ? 'Less than a day' : `${stay.days} ${stay.days === 1 ? 'day' : 'days'}`;
  return (
    <View style={styles.stay} accessible accessibilityLabel={`Stay: ${duration} in ${stay.place}`} testID={`trip-stay-${stay.id}`}>
      <View style={[styles.shortLine, { backgroundColor: theme.hairline }]} />
      <SymbolView name={{ ios: 'bed.double', android: 'bed', web: 'bed' }} size={16} tintColor={theme.heading} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.stayLabel}>Stay ·</ThemedText>
      <ThemedText type="small" themeColor="heading" style={styles.stayCopy}>
        <ThemedText type="smallBold" themeColor="heading">{duration}</ThemedText> in {stay.place}
      </ThemedText>
      <View style={[styles.shortLine, { backgroundColor: theme.hairline }]} />
    </View>
  );
}

/** Scoped to the Flights list; other live/detail connection surfaces keep
 * their existing layout and labels. */
export function TripConnectionMark({ connection }: { connection: Connection }) {
  const theme = useTheme();
  const label = `${connection.layover} connection in ${cityOf(connection.viaCode)}`;
  return (
    <View style={styles.connection} accessible accessibilityLabel={label}>
      <View style={styles.stem}>
        {[0, 1, 2].map(i => <View key={i} style={[styles.dot, { backgroundColor: theme.textSecondary }]} />)}
      </View>
      <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={13} tintColor={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.connectionText}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: -Spacing.two,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    // Include the border in the 8-point inset, preserving flight-card width.
    paddingHorizontal: Spacing.two - 1,
  },
  frameHeader: {
    borderTopWidth: 1,
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    paddingTop: Spacing.two + Spacing.one - 1,
    paddingBottom: Spacing.two + Spacing.one,
    // Clip the faded flag to the band's rounded top corners.
    overflow: 'hidden',
  },
  // Keep the gap with the preceding card so its shadow has room to fade.
  frameBody: { paddingBottom: Spacing.one },
  frameFirst: { paddingTop: Spacing.two + Spacing.one },
  frameLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Spacing.three,
    borderBottomRightRadius: Spacing.three,
    paddingBottom: Spacing.two - 1,
    marginBottom: Spacing.two + Spacing.one,
  },
  joinFill: { position: 'absolute', left: 1, right: 1, height: 1 },
  joinTop: { top: 0 },
  joinBottom: { bottom: 0 },
  heading: { minWidth: 0 },
  name: { fontSize: 16 },
  dates: { fontSize: 12, lineHeight: 16, marginTop: 1, fontVariant: ['tabular-nums'] },
  flagLayer: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    flexDirection: 'row', justifyContent: 'flex-end', overflow: 'hidden',
  },
  // The flag occupies the right of the band only, so all of it is present and
  // the fade dims its hoist side instead of the scrim swallowing it.
  flagBanner: { position: 'absolute', top: 0, right: 0, bottom: 0, width: FLAG_WIDTH, opacity: FLAG_PRESENCE },
  stay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  shortLine: { width: Spacing.three, flexShrink: 0, height: StyleSheet.hairlineWidth },
  stayLabel: { fontSize: 12, flexShrink: 0 },
  stayCopy: { flexShrink: 1, textAlign: 'center' },
  connection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.three + 40 + Spacing.two, paddingVertical: Spacing.one },
  connectionText: { fontSize: 12, flexShrink: 1 },
  stem: { gap: 3, alignItems: 'center' },
  dot: { width: 2, height: 2, borderRadius: 1, opacity: 0.6 },
});
