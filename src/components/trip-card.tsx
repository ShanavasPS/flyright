import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AirlineLogo } from '@/components/airline-logo';
import { flightLabel, type HeroJourney } from '@/components/route-hero';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import type { BaggageChip } from '@/services/baggage';
import type { TripCardCell, TripCardClock, TripCardField, TripCardModel, TripCardTone } from '@/services/trip-card';

const TWO_DAYS_MS = 48 * 3_600_000;

/** The trip page's head (services/trip-card), A2 layout: the flight and its
 * status as a plain row over the route, then — under the route's times —
 * the clock that matters as one compact strip. */
export function TripStatusRow({
  model,
  journey,
  action,
}: {
  model: TripCardModel;
  journey: Pick<HeroJourney, 'number' | 'carrier'>;
  /** Inline share / ··· for the embedded pane, which has no header. */
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.top}>
      <AirlineLogo number={journey.number} carrier={journey.carrier} size={24} />
      <ThemedText type="smallBold" themeColor="heading" style={styles.flight} numberOfLines={1}>
        {flightLabel(journey)}
      </ThemedText>
      <StatusPill text={model.status.text} tone={model.status.tone} />
      {action}
    </View>
  );
}

/** "Departs in 4d 21h" / "2:14:05", "Landed 16:58": the countdown or the
 * time, small enough to sit under the route, with the real times of a flown
 * trip and the in-flight progress under it. */
export function TripClockStrip({ model }: { model: TripCardModel }) {
  const theme = useTheme();
  if (!model.clock) return null;
  const tone = model.clock.kind === 'countdown' ? model.clock.tone : 'normal';
  const tint = tone === 'late' ? theme.warning : tone === 'boarding' ? theme.success : null;
  return (
    <View style={styles.clockBlock}>
      <ThemedView
        type="backgroundElement"
        style={[styles.clockStrip, tint ? { backgroundColor: `${tint}1F` } : null]}>
        <SymbolView
          name={{ ios: 'timer', android: 'timer', web: 'timer' }}
          size={16}
          tintColor={tint ?? theme.tint}
        />
        <Clock clock={model.clock} />
      </ThemedView>
      {model.line && (
        <ThemedText type="small" themeColor="textSecondary">
          {model.line}
        </ThemedText>
      )}
      {model.progress && (
        <View style={styles.progressBlock}>
          <View style={[styles.track, { backgroundColor: theme.hairline }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: theme.tint, width: `${Math.round(model.progress.fraction * 100)}%` },
              ]}
            />
          </View>
          {!!model.progress.caption && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.progressCaption}>
              {model.progress.caption}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

const TICKET = 'Your ticket';

/** One of the trip's fact cards: 'airport' is the departure airport's
 * terminal, check-in, gate and boarding with the belt at the other end;
 * 'ticket' is the seat and booking. Every box opens the trip-details editor
 * on its field. `children` go under the boxes (the ticket's earning line);
 * the airport card carries the model's footnote. Nothing when the model has
 * no such section (a flown trip with nothing recorded shows its ticket
 * alone). */
export function TripFactsCard({
  model,
  part,
  onEdit,
  children,
  testID,
}: {
  model: TripCardModel;
  part: 'airport' | 'ticket';
  onEdit?: (field: TripCardField) => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const sections = model.sections.filter((s) => (part === 'ticket') === (s.title === TICKET));
  if (!sections.length) return null;
  const footnote = part === 'airport' ? model.footnote : null;
  return (
    <ThemedView testID={testID} type="backgroundElement" style={[styles.card, { borderColor: theme.hairline }]}>
      {sections.map((section, i) => (
        <View key={section.title}>
          <View style={[styles.sectionHead, i === 0 && styles.firstHead, { borderTopColor: theme.hairline }]}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
              {section.title.toUpperCase()}
            </ThemedText>
          </View>
          <View style={[styles.grid, { backgroundColor: theme.hairline, borderTopColor: theme.hairline }]}>
            {rows(section.cells).map((pair) => (
              <View key={pair.map((cell) => cell.field).join()} style={styles.gridRow}>
                {pair.map((cell) => (
                  <FactCell key={cell.field} cell={cell} onPress={onEdit ? () => onEdit(cell.field) : undefined} />
                ))}
              </View>
            ))}
          </View>
          {section.baggage && (
            <BaggageRow chips={section.baggage} onPress={onEdit ? () => onEdit('baggage') : undefined} />
          )}
        </View>
      ))}
      {children}
      {footnote && (
        <View style={[styles.footnote, { borderTopColor: theme.hairline }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {footnote}
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

/** Two boxes to a row; a wide box takes its row alone. */
function rows(cells: TripCardCell[]): TripCardCell[][] {
  const out: TripCardCell[][] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (cell.wide || !last || last.length === 2 || last[0].wide) out.push([cell]);
    else last.push(cell);
  }
  return out;
}

function StatusPill({ text, tone }: { text: string; tone: TripCardTone }) {
  const theme = useTheme();
  const [fg, bg] = {
    neutral: [theme.textSecondary, theme.field],
    good: [theme.success, `${theme.success}1F`],
    info: [theme.tint, `${theme.tint}1A`],
    late: [theme.warning, `${theme.warning}24`],
    boarding: ['#FFFFFF', theme.success],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText type="smallBold" style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

function Clock({ clock }: { clock: TripCardClock }) {
  return clock.kind === 'countdown' ? (
    <Countdown clock={clock} />
  ) : (
    <ClockRow label={clock.label} big={clock.value} small={clock.unit} />
  );
}

/** Hours, minutes and ticking seconds inside two days; days and hours
 * beyond, where seconds would only be noise. */
function Countdown({ clock }: { clock: Extract<TripCardClock, { kind: 'countdown' }> }) {
  const theme = useTheme();
  const now = useNow(1_000).getTime();
  const left = Math.max(0, clock.end - now);
  const color = clock.tone === 'late' ? theme.warning : clock.tone === 'boarding' ? theme.success : undefined;
  if (left > TWO_DAYS_MS) {
    const hours = Math.floor(left / 3_600_000);
    return <ClockRow label={clock.label} big={`${Math.floor(hours / 24)}d`} small={`${hours % 24}h`} color={color} />;
  }
  const seconds = Math.floor(left / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return (
    <ClockRow
      label={clock.label}
      big={`${hours}:${String(minutes).padStart(2, '0')}`}
      small={`:${String(seconds % 60).padStart(2, '0')}`}
      color={color}
      tight
    />
  );
}

function ClockRow({
  label,
  big,
  small,
  color,
  tight,
}: {
  label: string;
  big: string;
  small: string | null;
  color?: string;
  /** Seconds sit flush against the minutes; a unit keeps a space. */
  tight?: boolean;
}) {
  return (
    <View style={styles.clockRow} accessible accessibilityLabel={`${label} ${big}${tight ? '' : ' '}${small ?? ''}`}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.clockLabel}>
        {label}
      </ThemedText>
      {/* The label centres on the strip with the icon; only the figure and
          its seconds or unit share a baseline. */}
      <View style={styles.clockValue}>
        <ThemedText themeColor="heading" style={[styles.clockBig, color ? { color } : null]}>
          {big}
        </ThemedText>
        {small && (
          <ThemedText themeColor="textSecondary" style={[styles.clockSmall, !tight && styles.clockUnit]}>
            {small}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/** The ticket's baggage as the design's chips: what is included with a
 * tick, what isn't dashed ("No checked bag"). Nothing known offers "Add".
 * The whole row opens the editor on the baggage. */
function BaggageRow({ chips, onPress }: { chips: BaggageChip[]; onPress?: () => void }) {
  const theme = useTheme();
  const label = chips.length ? `Baggage: ${chips.map((c) => c.label).join(', ')}` : 'Add baggage';
  return (
    <Pressable
      testID="trip-card-baggage"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={chips.length ? 'Edit' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.baggage,
        { backgroundColor: theme.field, borderTopColor: theme.hairline, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cellLabel}>
        BAGGAGE
      </ThemedText>
      {chips.length ? (
        <View style={styles.baggageChips}>
          {chips.map((chip) => (
            <View
              key={chip.key}
              style={[
                styles.baggageChip,
                chip.included
                  ? { backgroundColor: `${theme.success}1F` }
                  : { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.textSecondary },
              ]}>
              {chip.included && (
                <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={11} weight="bold" tintColor={theme.success} />
              )}
              <ThemedText type="smallBold" style={[styles.baggageChipText, { color: chip.included ? theme.success : theme.textSecondary }]}>
                {chip.label}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.addRow}>
          <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={14} tintColor={theme.tint} />
          <ThemedText type="smallBold" style={[styles.addText, { color: theme.tint }]}>
            Add
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

function FactCell({ cell, onPress }: { cell: TripCardCell; onPress?: () => void }) {
  const theme = useTheme();
  const adds = !cell.value && cell.placeholder == null;
  return (
    <Pressable
      testID={`trip-card-${cell.field}`}
      accessibilityRole="button"
      accessibilityLabel={
        cell.value ? `${cell.label} ${cell.value}` : adds ? `Add ${cell.label.toLowerCase()}` : `${cell.label}, ${cell.placeholder}`
      }
      accessibilityHint={cell.value ? 'Edit' : adds ? undefined : 'Add it yourself'}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.cell, { backgroundColor: theme.field, opacity: pressed ? 0.7 : 1 }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cellLabel}>
        {cell.label.toUpperCase()}
      </ThemedText>
      {cell.value ? (
        <ThemedText themeColor="heading" style={styles.cellValue} numberOfLines={1} adjustsFontSizeToFit>
          {cell.value}
        </ThemedText>
      ) : adds ? (
        <View style={styles.addRow}>
          <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={14} tintColor={theme.tint} />
          <ThemedText type="smallBold" style={[styles.addText, { color: theme.tint }]}>
            Add
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.placeholder} numberOfLines={1}>
          {cell.placeholder}
        </ThemedText>
      )}
      {cell.byUser && (
        <View style={styles.byUser}>
          <SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={11} tintColor={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.byUserText}>
            Added by you
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  baggage: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.three - Spacing.half,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.two,
  },
  baggageChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two - Spacing.half,
  },
  baggageChip: {
    minHeight: 30,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  baggageChipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flight: {
    flex: 1,
    fontSize: 16,
  },
  pill: {
    borderRadius: 12,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
    flexShrink: 0,
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
  },
  clockBlock: {
    gap: Spacing.one + Spacing.half,
  },
  clockStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    minHeight: 48,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three + Spacing.half,
    borderRadius: Spacing.three,
  },
  clockRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  clockValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  clockLabel: {
    flex: 1,
    fontSize: 14,
    marginRight: Spacing.two,
  },
  clockBig: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 800,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  clockSmall: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  clockUnit: {
    marginLeft: Spacing.one + Spacing.half,
  },
  progressBlock: {
    gap: Spacing.one + Spacing.half,
    paddingTop: Spacing.one,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  progressCaption: {
    fontSize: 13,
    textAlign: 'center',
  },
  firstHead: {
    borderTopWidth: 0,
  },
  sectionHead: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three - Spacing.one,
    paddingBottom: Spacing.one + Spacing.half,
  },
  sectionTitle: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
  },
  grid: {
    borderTopWidth: 1,
    gap: 1,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 1,
  },
  cell: {
    flex: 1,
    minHeight: 64,
    paddingHorizontal: Spacing.three - Spacing.half,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.half,
  },
  cellLabel: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
  },
  cellValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 800,
  },
  placeholder: {
    fontSize: 16,
    lineHeight: 28,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    minHeight: 28,
  },
  addText: {
    fontSize: 17,
  },
  byUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  byUserText: {
    fontSize: 12,
    lineHeight: 16,
  },
  footnote: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
});
