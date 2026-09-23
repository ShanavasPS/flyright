import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { IconBadge } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { COBALT, NIGHT_SKY, WHITE, WHITE_FAINT } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';

const PLANE = { ios: 'airplane', android: 'flight', web: 'flight' } as const;
const BELL = { ios: 'bell', android: 'notifications', web: 'notifications' } as const;

export function ProHeader({ onClose, closeLabel, disabled = false }: { onClose: () => void; closeLabel: string; disabled?: boolean }) {
  const theme = useTheme();
  return <View style={styles.header}>
    <View style={styles.brand} accessible accessibilityLabel="FlyRight Pro">
      <ThemedText type="smallBold" themeColor="heading" style={styles.brandName}>FlyRight</ThemedText>
      <View style={[styles.proBadge, { backgroundColor: theme.tint + '14' }]}><ThemedText type="smallBold" themeColor="tint">Pro</ThemedText></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={disabled} onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: theme.field, opacity: pressed || disabled ? 0.6 : 1 }]}>
      <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} weight="semibold" tintColor={theme.textSecondary} />
    </Pressable>
  </View>;
}

/** A saved itinerary, never an invented preview of live gate or delay data. */
export function ProHero({ title, trip, plans = false }: { title: string; trip?: JourneyRow | null; plans?: boolean }) {
  return <View style={styles.hero}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.watermark}>
      <SymbolView name={PLANE} size={112} tintColor={WHITE_FAINT} style={Platform.OS === 'ios' ? { transform: [{ rotate: '-25deg' }] } : { transform: [{ rotate: '65deg' }] }} />
    </View>
    <ThemedText type="title" style={styles.heroTitle}>{title}</ThemedText>
    {trip && !plans ? <View style={styles.itinerary}>
      <View style={styles.route}>
        <ThemedText type="smallBold" style={styles.airport}>{trip.fromCode}</ThemedText>
        <View style={styles.routeLine} />
        <SymbolView name={PLANE} tintColor={COBALT} size={18} style={Platform.OS === 'ios' ? undefined : { transform: [{ rotate: '90deg' }] }} />
        <View style={styles.routeLine} />
        <ThemedText type="smallBold" style={styles.airport}>{trip.toCode}</ThemedText>
      </View>
      <ThemedText type="small" style={styles.onNavySecondary}>{[trip.number, formatDayLabelWithYear(trip.scheduledDeparture, airportZone(trip.fromCode))].filter(Boolean).join(' · ')}</ThemedText>
    </View> : <ThemedText type="small" style={styles.onNavySecondary}>{plans ? 'Live updates. Postcards. Claim preparation.\nYour family follows free.' : 'A little more help, wherever you’re heading.'}</ThemedText>}
  </View>;
}

const BENEFITS: { title: string; detail: string; symbol: SymbolViewProps['name'] }[] = [
  { title: 'Stay a step ahead', detail: 'Live gate, terminal, delay & belt updates', symbol: { ios: 'airplane', android: 'flight', web: 'flight' } },
  { title: 'Bring your people along', detail: 'Postcards for your people', symbol: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' } },
  { title: 'Know your next step', detail: 'Delay claim preparation', symbol: { ios: 'doc.text', android: 'description', web: 'description' } },
];

export function ProBenefits() {
  const theme = useTheme();
  return <View style={styles.benefits}>
    {BENEFITS.map(({ title, detail, symbol }, index) => <View key={title} style={[styles.benefit, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
      <View accessible={false} importantForAccessibility="no-hide-descendants"><IconBadge symbol={symbol} size={36} climbing={index === 0} /></View>
      <View style={styles.benefitCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
      </View>
    </View>)}
  </View>;
}

export function ProReminderCard({ trip, date }: { trip: JourneyRow; date: string }) {
  const zone = airportZone(trip.fromCode);
  return <View style={styles.hero}>
    <View style={styles.reminderLabel}>
      <SymbolView name={BELL} size={18} tintColor={COBALT} />
      <ThemedText type="smallBold" style={styles.onNavySecondary}>2 days before departure</ThemedText>
    </View>
    <ThemedText type="smallBold" style={styles.reminderDate}>{formatDayLabelWithYear(date, zone)}</ThemedText>
    <ThemedText type="display" style={styles.reminderTime}>{formatTime(date, zone)}</ThemedText>
    <ThemedText type="small" style={styles.onNavySecondary}>{trip.fromCode} local time</ThemedText>
    <View style={styles.reminderTrip}>
      <ThemedText type="smallBold" style={styles.onNavy}>{trip.fromCode} → {trip.toCode}</ThemedText>
      <ThemedText type="small" style={styles.onNavySecondary}>{formatDayLabelWithYear(trip.scheduledDeparture, zone)}</ThemedText>
    </View>
  </View>;
}

export function ProReminderSteps() {
  const theme = useTheme();
  return <View style={styles.steps}>
    <View style={[styles.stepLine, { backgroundColor: theme.hairline }]} />
    {[
      { title: 'One reminder in FlyRight', detail: 'Find it with this trip. On home too, unless you’ve hidden the card.', symbol: BELL },
      { title: 'You decide when to go Pro', detail: 'Nothing starts or charges automatically.', symbol: { ios: 'checkmark', android: 'check', web: 'check' } as const },
    ].map(({ title, detail, symbol }) => <View style={styles.step} key={title}>
      <View style={[styles.stepIcon, { borderColor: theme.hairline, backgroundColor: theme.background }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <SymbolView name={symbol} size={16} tintColor={theme.tint} />
      </View>
      <View style={styles.benefitCopy}><ThemedText type="smallBold">{title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText></View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, brandName: { fontSize: 18, lineHeight: 24 },
  proBadge: { borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  close: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  hero: { padding: Spacing.four, borderRadius: Spacing.four, gap: Spacing.two, backgroundColor: '#0C1B36', experimental_backgroundImage: NIGHT_SKY, overflow: 'hidden' },
  heroTitle: { color: WHITE, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  watermark: { position: 'absolute', right: -Spacing.three, top: -Spacing.two, opacity: 0.55 },
  itinerary: { gap: Spacing.one, marginTop: Spacing.two },
  route: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  airport: { color: WHITE, fontSize: 24, lineHeight: 30, letterSpacing: 1 },
  routeLine: { flex: 1, borderTopWidth: 1, borderColor: WHITE_FAINT, borderStyle: 'dashed' },
  onNavy: { color: WHITE }, onNavySecondary: { color: '#A9B8CE' },
  benefits: { gap: 0 }, benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  benefitCopy: { flex: 1, gap: Spacing.half },
  reminderLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  reminderDate: { color: WHITE, fontSize: 20, lineHeight: 26, marginTop: Spacing.two }, reminderTime: { color: WHITE },
  reminderTrip: { marginTop: Spacing.two, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, borderColor: WHITE_FAINT, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  steps: { gap: Spacing.four }, step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  stepIcon: { width: 32, height: 32, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepLine: { position: 'absolute', width: 1, left: 16, top: 16, bottom: 24 },
});
