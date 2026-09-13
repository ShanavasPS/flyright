import { useAuth } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import { Barcode } from '@/components/barcode';
import { cityLabel } from '@/components/route-hero';
import { Spacing } from '@/constants/theme';
import { useMaxBrightness } from '@/hooks/use-max-brightness';
import { trackEvent } from '@/services/analytics';
import { airportZone } from '@/services/airports';
import { asPassFormat, codeFacts as passFacts } from '@/services/boarding-pass';
import { formatTime, tripDateTitle } from '@/services/dates';
import { tapLight } from '@/services/haptics';
import { removeBoardingPass, removeTicketCode, useJourney } from '@/services/journeys';

/**
 * The boarding pass, held up at the gate: a white sheet (whatever the theme
 * — the scanner wants ink on paper), the flight and the route at the top,
 * the pass facts as Wallet lays them out, and the code as large as the
 * screen allows. Brightness goes to full while it's open.
 *
 * A PDF417 stripe is wider than it is tall; tapping it stands it on end so
 * it fills the phone's height and reads from further away (the FocusFlight
 * pattern). Square codes need no such trick.
 */
const INK = '#0B1424';
const INK_SOFT = '#5A6A7E';
const HAIRLINE = '#E3E8EF';

export function BoardingPassScreen() {
  const { journeyId, kind } = useLocalSearchParams<{ journeyId?: string; kind?: string }>();
  const ticket = kind === 'ticket';
  const { userId } = useAuth();
  const { row, loaded } = useJourney(journeyId ?? '', userId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [expandedHeight, setExpandedHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [codeTop, setCodeTop] = useState(0);
  const [captionHeight, setCaptionHeight] = useState(60);

  const code = ticket ? row?.ticketCode : row?.passCode;
  const format = asPassFormat(ticket ? row?.ticketFormat : row?.passFormat);
  const codeKey = `${format}:${code}`;
  const undrawable = failedKey === codeKey;
  const rotated = rotatedKey === codeKey;
  const facts = useMemo(() => (code && row ? passFacts(code, row) : null), [code, row]);

  useMaxBrightness(!!code && !!format && !undrawable);

  const remove = () => {
    if (!row) return;
    const confirm = () =>
      Alert.alert(ticket ? 'Remove this ticket code?' : 'Remove this boarding pass?', 'It comes off this trip on all your devices.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            trackEvent('boarding_pass_removed');
            void (ticket ? removeTicketCode(row.id) : removeBoardingPass(row.id)).then(() => router.back()).catch(() => Alert.alert('Could not remove the code', 'Please try again.'));
          },
        },
      ]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [ticket ? 'Remove ticket code' : 'Remove boarding pass', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (index) => {
          if (index === 0) confirm();
        },
      );
    } else {
      confirm();
    }
  };

  const horizontal = Spacing.five;
  const codeWidth = Math.min(screenWidth, 520) - horizontal * 2;
  // Fit the whole symbol below the facts, including on shorter screens.
  // The expanded view has its own measured area and works for square codes too.
  const codeMaxHeight = viewportHeight && codeTop
    ? Math.max(100, viewportHeight - codeTop - captionHeight - insets.bottom - Spacing.six - Spacing.four - Spacing.three * 2)
    : Math.min(200, screenHeight * 0.3);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.bar}>
        <BarButton
          label="Close"
          symbol={{ ios: 'xmark', android: 'close', web: 'close' }}
          onPress={() => router.back()}
        />
        {code && (
          <BarButton
            label="Boarding pass options"
            symbol={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
            onPress={remove}
          />
        )}
      </View>

      {!row || !code || !format || !facts ? (
        <View style={styles.centred}>
          <Text style={styles.noticeTitle}>{loaded ? 'No saved code on this trip' : 'Opening your pass…'}</Text>
          {loaded && <Text style={styles.notice}>Scan or upload one from the trip page and it will be here.</Text>}
        </View>
      ) : rotated ? (
        <View style={[styles.expanded, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Text style={[styles.flightNumber, styles.caption]}>
            {row.number} · {row.fromCode} → {row.toCode}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show pass details"
            testID="boarding-pass-code"
            style={styles.expandedCode}
            onLayout={(event) => setExpandedHeight(event.nativeEvent.layout.height)}
            onPress={() => { tapLight(); setRotatedKey(null); }}>
            {expandedHeight > Spacing.six && (
              <Barcode
                code={code}
                format={format}
                width={codeWidth}
                maxHeight={expandedHeight - Spacing.six}
                rotated={format === 'pdf417'}
                onFailed={() => setFailedKey(codeKey)}
              />
            )}
          </Pressable>
          <Text style={styles.caption}>Tap the code to return to pass details</Text>
        </View>
      ) : (
        <ScrollView
          onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          contentContainerStyle={[styles.content, { paddingHorizontal: horizontal, paddingBottom: insets.bottom + Spacing.six }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.flightRow}>
            <AirlineLogo number={row.number} carrier={row.carrier} size={36} />
            <View style={styles.flightText}>
              <Text style={styles.flightNumber} numberOfLines={1}>
                {row.carrier}
                {row.number ? ` ${row.number}` : ''}
              </Text>
              <Text style={styles.flightDate} numberOfLines={1}>
                {tripDateTitle(row.scheduledDeparture, new Date(), airportZone(row.fromCode))}
                {' · departs '}
                {formatTime(row.scheduledDeparture, airportZone(row.fromCode))}
              </Text>
            </View>
          </View>

          <View style={styles.routeRow} accessible accessibilityLabel={`${row.fromCode} to ${row.toCode}`}>
            <View style={styles.endpoint}>
              <Text style={styles.code}>{row.fromCode}</Text>
              <Text style={styles.city} numberOfLines={1}>
                {cityLabel({ code: row.fromCode })}
              </Text>
            </View>
            <SymbolView
              name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
              size={22}
              tintColor={INK_SOFT}
              style={Platform.OS === 'ios' ? undefined : styles.rotatedIcon}
            />
            <View style={[styles.endpoint, styles.endpointRight]}>
              <Text style={styles.code}>{row.toCode}</Text>
              <Text style={[styles.city, styles.cityRight]} numberOfLines={1}>
                {cityLabel({ code: row.toCode })}
              </Text>
            </View>
          </View>

          <View style={styles.rule} />

          <View style={styles.factsGrid}>
            {facts.holder && <Fact label="Passenger" value={facts.holder} wide />}
            {ticket ? <Fact label="Ticket number" value={facts.ticketNumber ?? '—'} wide /> : <>
              <Fact label="Seat" value={facts.seat ?? row.seat ?? '—'} />
              <Fact label="Sequence" value={facts.sequence ?? '—'} />
            </>}
            <Fact label="Booking" value={facts.pnr ?? row.bookingReference ?? '—'} />
            {facts.cabin && <Fact label="Cabin" value={facts.cabin} />}
            {facts.legs > 1 && <Fact label="Leg" value={`${facts.leg} of ${facts.legs}`} />}
          </View>

          <View style={styles.rule} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enlarge the code"
            disabled={undrawable}
            onLayout={(event) => setCodeTop(event.nativeEvent.layout.y)}
            onPress={() => {
              tapLight();
              setRotatedKey(rotated ? null : codeKey);
            }}
            style={styles.codeBox}
            testID="boarding-pass-code">
            {undrawable ? (
              <Text style={styles.notice}>
                This pass&apos;s code can&apos;t be drawn on this phone. The airline&apos;s own pass still works.
              </Text>
            ) : (
              <Barcode
                code={code}
                format={format}
                width={codeWidth}
                maxHeight={codeMaxHeight}
                rotated={rotated && format === 'pdf417'}
                onFailed={() => setFailedKey(codeKey)}
              />
            )}
          </Pressable>

          {!undrawable && (
            <Text style={styles.caption} onLayout={(event) => setCaptionHeight(event.nativeEvent.layout.height)}>
              {format === 'pdf417' ? 'Tap the code to turn it. ' : 'Tap the code to enlarge it. '}
              {ticket ? 'Ticket code for check-in. Your airline issues a boarding pass after check-in.' : 'Saved on this phone. Ready to show without an internet connection.'}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.fact, wide && styles.factWide]}>
      <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function BarButton({
  label,
  symbol,
  onPress,
}: {
  label: string;
  symbol: { ios: string; android: string; web: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.barButton, { opacity: pressed ? 0.6 : 1 }]}>
      <SymbolView name={symbol as never} size={18} tintColor={INK} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  barButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F5F9',
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  flightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flightText: {
    flex: 1,
    gap: 2,
  },
  flightNumber: {
    color: INK,
    fontSize: 17,
    fontWeight: '600',
  },
  flightDate: {
    color: INK_SOFT,
    fontSize: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  endpoint: {
    flex: 1,
    gap: 2,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  code: {
    color: INK,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '700',
    letterSpacing: -1,
  },
  city: {
    color: INK_SOFT,
    fontSize: 14,
  },
  cityRight: {
    textAlign: 'right',
  },
  rotatedIcon: {
    transform: [{ rotate: '90deg' }],
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: HAIRLINE,
  },
  factsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  fact: {
    width: '33.333%',
    gap: 2,
  },
  factWide: {
    width: '100%',
  },
  factLabel: {
    color: INK_SOFT,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  factValue: {
    color: INK,
    fontSize: 20,
    fontWeight: '600',
  },
  codeBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  expanded: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
  },
  expandedCode: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    color: INK_SOFT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    gap: Spacing.two,
  },
  noticeTitle: {
    color: INK,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  notice: {
    color: INK_SOFT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
