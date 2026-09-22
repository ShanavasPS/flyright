import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What a wide window's second pane shows before there is anything to put in
 * it (docs/wide-layouts-plan.md §3.6): the silhouette of the page it will
 * become, and one line saying so. Static — no data, no hooks beyond the
 * theme. The shapes are decorative and hidden from assistive tech; the
 * caption is what VoiceOver and TalkBack read.
 */
export function PaneOutline({
  kind,
  caption,
}: {
  kind: 'trip' | 'person' | 'claim' | 'people';
  caption: string;
}) {
  return (
    <View style={styles.outline}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.outline}>
        {kind === 'trip' && <TripShape />}
        {kind === 'person' && <PersonShape />}
        {kind === 'claim' && <ClaimShape />}
        {kind === 'people' && <PeopleShape />}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
        {caption}
      </ThemedText>
    </View>
  );
}

/** A dashed row that states an empty section instead of leaving a gap:
 * "Nothing in progress", "No active claims". */
export function DashedNote({ title, detail }: { title: string; detail: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { borderColor: theme.hairline }]}>
      <SymbolView
        name={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }}
        size={22}
        tintColor={theme.textSecondary}
      />
      <View style={styles.noteCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
    </View>
  );
}

function Bar({ width, height = 10 }: { width: DimensionValue; height?: number }) {
  const theme = useTheme();
  return <View style={{ width, height, borderRadius: Spacing.two, backgroundColor: theme.field }} />;
}

function Block({ height, round = false, size }: { height: number; round?: boolean; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size ?? '100%',
        height,
        borderRadius: round ? 999 : Spacing.three,
        backgroundColor: theme.field,
      }}
    />
  );
}

function DashedCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.dashedCard, { borderColor: theme.hairline }]}>{children}</View>;
}

function Heading({ round }: { round?: boolean }) {
  return (
    <View style={styles.row}>
      <Block height={56} size={56} round={round} />
      <View style={styles.lines}>
        <Bar width="55%" height={18} />
        <Bar width="35%" />
      </View>
    </View>
  );
}

function TripShape() {
  return (
    <>
      <Heading />
      <View style={styles.lines}>
        <Bar width="45%" />
        <Bar width="75%" />
        <Bar width="30%" />
      </View>
      <DashedCard>
        {[60, 54, 48, 42, 36].map((w) => (
          <View key={w} style={styles.row}>
            <Block height={22} size={22} round />
            <Bar width={`${w}%`} />
          </View>
        ))}
      </DashedCard>
    </>
  );
}

function PersonShape() {
  return (
    <>
      <Heading round />
      <Block height={170} />
      <DashedCard>
        <Bar width="40%" height={14} />
        <View style={styles.row}>
          <Block height={96} size={96} />
          <View style={styles.lines}>
            <Bar width="80%" />
            <Bar width="50%" />
          </View>
        </View>
      </DashedCard>
    </>
  );
}

function ClaimShape() {
  return (
    <>
      <Heading />
      <DashedCard>
        <Bar width="30%" height={16} />
        <Bar width="25%" height={40} />
        {[45, 45, 45].map((w, i) => (
          <View key={i} style={styles.row}>
            <Block height={12} size={12} round />
            <Bar width={`${w}%`} />
          </View>
        ))}
        <Block height={48} />
      </DashedCard>
    </>
  );
}

function PeopleShape() {
  return (
    <View style={styles.people}>
      {[50, 42, 34].map((w) => (
        <View key={w} style={styles.row}>
          <Block height={44} size={44} round />
          <View style={styles.lines}>
            <Bar width={`${w}%`} />
            <Bar width={`${w + 20}%`} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  outline: {
    gap: Spacing.three,
  },
  caption: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  lines: {
    flex: 1,
    gap: Spacing.two,
  },
  people: {
    gap: Spacing.three,
  },
  dashedCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  noteCopy: {
    flex: 1,
    gap: Spacing.half,
  },
});
