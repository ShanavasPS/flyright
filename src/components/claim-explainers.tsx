import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SummaryItem } from '@/services/claim-status';

/**
 * What a wide window's Claims tab shows beside or over its claims
 * (docs/wide-layouts-plan.md §6): the figures over the list, how a claim
 * works, and what EU261 pays. Static apart from the figures; the phone
 * layout does not use them.
 */

export function ClaimsSummaryCard({ items }: { items: SummaryItem[] }) {
  const theme = useTheme();
  if (!items.length) return null;
  return (
    <Card style={styles.summary}>
      {items.map((item) => (
        <View key={item.label} style={styles.summaryItem}>
          <ThemedText
            type="subtitle"
            style={[styles.summaryValue, { color: item.money ? theme.success : theme.heading }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {item.value}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {item.label}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

const STEPS: [string, string][] = [
  ['Add your flights', 'By hand, or import a booking PDF.'],
  [
    'FlyRight checks each one',
    'Delayed 3 h+, cancelled late or denied boarding: it works out what EU261 or UK261 owes.',
  ],
  ['You send the claim', 'FlyRight writes it; you send it and log the airline’s reply here.'],
];

export function HowClaimsWork() {
  const theme = useTheme();
  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        How a claim works
      </ThemedText>
      {STEPS.map(([title, detail], i) => (
        <View key={title} style={[styles.step, i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={[styles.stepNumber, { borderColor: theme.tint }]}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {i + 1}
            </ThemedText>
          </View>
          <View style={styles.stepCopy}>
            <ThemedText type="smallBold">{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {detail}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Article 7 of Regulation (EC) 261/2004, per passenger. The middle band
 * covers intra-EU flights over 1,500 km too — Art. 7(1)(b) caps those at
 * €400 however far they go. */
const BANDS: [string, string, string][] = [
  ['Up to 1,500 km', 'e.g. Helsinki → Berlin', '€250'],
  ['1,500–3,500 km, and flights within the EU over 1,500 km', 'e.g. Helsinki → London', '€400'],
  ['Over 3,500 km', 'e.g. Helsinki → New York', '€600'],
];

export function Eu261Bands() {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.bandsHead}>
        <ThemedText type="smallBold" themeColor="heading" style={styles.bandsTitle}>
          What EU261 pays
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          per passenger
        </ThemedText>
      </View>
      {BANDS.map(([distance, example, amount], i) => (
        <View key={amount} style={[styles.band, i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.stepCopy}>
            <ThemedText type="smallBold">{distance}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {example}
            </ThemedText>
          </View>
          <ThemedText type="subtitle" themeColor="heading" style={styles.bandAmount}>
            {amount}
          </ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        For arrivals 3 h+ late, or cancellations with under 14 days’ notice. On flights over
        3,500 km, airlines may pay half when the arrival is 3–4 h late. UK261 pays £220, £350
        and £520.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  summaryItem: {
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 28,
  },
  block: {
    gap: Spacing.two,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  bandsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  bandsTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  bandAmount: {
    fontSize: 22,
    lineHeight: 28,
  },
});
