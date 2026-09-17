import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Barcode } from '@/components/barcode';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { asPassFormat, codeFacts as passFacts } from '@/services/boarding-pass';
import { editedLabel } from '@/services/dates';
import { tapLight } from '@/services/haptics';
import type { JourneyRow } from '@/services/journeys';

/**
 * The boarding pass on the trip page — the Apple Wallet / Qantas pattern:
 * the barcode on its own white panel (white on purpose, whatever the theme:
 * a scanner wants contrast, and a dark card behind a dark stripe reads as
 * nothing), the pass facts under it in the app's chip row, one tap to the
 * full-screen gate view.
 *
 * Three shapes, one component:
 *  - `prominent` (upcoming and travel-day trips): the panel with a preview
 *    of the code, the facts, the "show at the gate" line.
 *  - compact (flown trips): a single row — the pass is a keepsake now, not
 *    something to hold up — that still opens the gate view.
 *  - empty (upcoming trip, no pass yet): a quiet row into the scanner, so
 *    the pass is on the trip before the traveller is at the airport.
 */
export function BoardingPassCard({ row, prominent }: { row: JourneyRow; prominent: boolean }) {
  return <>
    <SavedCodeCard row={row} prominent={prominent} />
    {!!row.ticketCode && <SavedCodeCard row={row} prominent={false} ticket />}
  </>;
}

function SavedCodeCard({ row, prominent, ticket = false }: { row: JourneyRow; prominent: boolean; ticket?: boolean }) {
  const code = ticket ? row.ticketCode : row.passCode;
  const codeFormat = ticket ? row.ticketFormat : row.passFormat;
  const capturedAt = ticket ? row.ticketCapturedAt : row.passCapturedAt;
  const title = ticket ? 'Ticket for check-in' : 'Boarding pass';
  const router = useRouter();
  const theme = useTheme();
  const format = asPassFormat(codeFormat);
  const facts = useMemo(
    () => (code ? passFacts(code, row) : null),
    [code, row],
  );
  const [panelWidth, setPanelWidth] = useState(0);
  const codeKey = `${codeFormat}:${code}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const undrawable = failedKey === codeKey;

  if (!code || !format || !facts) {
    if (!prominent || ticket) return null;
    return (
      <RowCard
        icon={{ ios: 'barcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' }}
        title="Add your boarding pass"
        detail="Scan or upload your pass after check-in. Keep it handy for the airport."
        testID="boarding-pass-add"
        onPress={() => {
          tapLight();
          trackEvent('boarding_pass_add_tapped', { from: 'trip' });
          router.push({ pathname: '/add', params: { scan: '1', journeyId: row.id } });
        }}
      />
    );
  }

  const open = () => {
    tapLight();
    trackEvent('boarding_pass_opened', { from: prominent ? 'trip' : 'trip_past' });
    router.push({ pathname: '/boarding-pass', params: { journeyId: row.id, kind: ticket ? 'ticket' : 'boarding' } });
  };

  const chips = [
    facts.seat && `Seat ${facts.seat}`,
    facts.sequence && `Seq ${facts.sequence}`,
    facts.pnr && `Booking ${facts.pnr}`,
    facts.legs > 1 && `Leg ${facts.leg} of ${facts.legs}`,
  ].filter((chip): chip is string => !!chip);

  if (!prominent) {
    return (
      <RowCard
        icon={{ ios: 'qrcode', android: 'qr_code_2', web: 'qr_code_2' }}
        title={title}
        detail={ticket ? `Ticket ${facts.ticketNumber} · Show at check-in` : [facts.holder, ...chips.slice(0, 2)].filter(Boolean).join(' · ') || 'The code from your pass'}
        testID={ticket ? "ticket-code-row" : "boarding-pass-row"}
        onPress={open}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Boarding pass — show at the gate"
      testID="boarding-pass-card"
      onPress={open}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
      <Card>
        <View style={styles.header}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            Boarding pass
          </ThemedText>
          <SymbolView
            name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }}
            size={16}
            tintColor={theme.textSecondary}
          />
        </View>
        {/* The panel is white in both themes: it's the part the scanner reads. */}
        <View style={styles.panel} onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}>
          {panelWidth > 0 && !undrawable ? (
            <Barcode
              code={code}
              format={format}
              width={panelWidth - Spacing.three * 2}
              maxHeight={format === 'pdf417' ? 96 : 132}
              onFailed={() => setFailedKey(codeKey)}
            />
          ) : undrawable ? (
            <ThemedText type="small" style={styles.undrawable}>
              This pass&apos;s code can&apos;t be drawn on this phone.
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.facts}>
          {facts.holder && (
            <ThemedText type="smallBold" numberOfLines={1}>
              {facts.holder}
            </ThemedText>
          )}
          {chips.length > 0 && (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <View key={chip} style={[styles.chip, { backgroundColor: `${theme.tint}1A` }]}>
                  <ThemedText type="smallBold" style={[styles.chipText, { color: theme.tint }]}>
                    {chip}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {capturedAt ? `Saved ${editedLabel(capturedAt, new Date())} · ` : ''}
          Tap to show at the gate
        </ThemedText>
      </Card>
    </Pressable>
  );
}

function RowCard({
  icon,
  title,
  detail,
  testID,
  onPress,
}: {
  icon: { ios: string; android: string; web: string };
  title: string;
  detail: string;
  testID: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
      <Card style={styles.row}>
        <View style={[styles.iconBadge, { backgroundColor: `${theme.tint}1A` }]}>
          <SymbolView name={icon as never} size={20} tintColor={theme.tint} />
        </View>
        <View style={styles.rowText}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {detail}
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          tintColor={theme.textSecondary}
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    // A hairline so the white panel still has an edge on the light theme's
    // white card.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11,20,36,0.12)',
  },
  undrawable: {
    color: '#5A6A7E',
    textAlign: 'center',
  },
  facts: {
    gap: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Spacing.four,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
