import { useAuth, useUser } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SectionLabel } from '@/components/grouped-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { carrierFor } from '@/constants/carriers';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { noteSuccess, tapLight } from '@/services/haptics';
import { useJourneys } from '@/services/journeys';
import {
  creditTip,
  describeMembership,
  expiryLine,
  formatCount,
  maskNumber,
  tierLine,
  tierProgress,
} from '@/services/loyalty-programmes';
import { unlockMemberships, useMemberships, type MembershipRow } from '@/services/memberships';

const CARD_HEIGHT = 196;
/** How much of a stacked card shows above the next: its airline, name and
 * tier — the part you pick a card by. */
const PEEK = 64;

/** The wallet of frequent flyer cards (docs/memberships.md). Stacked, each
 * card shows its name and tier; tap one to open it — the whole card, its
 * progress and its actions — and tap it again to stack it. "Expand all"
 * opens every card with its details, without actions. Numbers stay masked
 * until the phone's lock is passed. */
export function Memberships() {
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const rows = useMemberships(userId);
  const { data: journeys } = useJourneys(userId);
  const [openId, setOpen] = useState<string | null>(null);
  // A card removed while open leaves nothing open.
  const open = rows?.some((r) => r.id === openId) ? openId : null;
  const [all, setAll] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const now = useNow().getTime();
  const tip = useMemo(() => {
    if (!rows?.length || !journeys) return null;
    const upcoming = journeys
      .filter((j) => j.mode === 'flight' && Date.parse(j.scheduledDeparture) > now)
      .map((j) => j.number);
    return creditTip(upcoming, rows, (code) => carrierFor(code)?.name ?? code);
  }, [rows, journeys, now]);

  const reveal = async (m: MembershipRow) => {
    if (shown[m.id]) {
      setShown((s) => ({ ...s, [m.id]: false }));
      return;
    }
    if (await unlockMemberships()) setShown((s) => ({ ...s, [m.id]: true }));
  };

  const copy = async (m: MembershipRow) => {
    if (!shown[m.id] && !(await unlockMemberships())) return;
    await Clipboard.setStringAsync(m.number.replace(/\s+/g, ''));
    noteSuccess();
    setCopied(m.id);
    setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1600);
  };

  const addButton = () => (
    <Pressable
      testID="add-membership"
      accessibilityRole="button"
      accessibilityLabel="Add membership"
      hitSlop={Spacing.two}
      onPress={() => router.push('/membership')}
      style={styles.headerButton}>
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} weight="semibold" tintColor={theme.tint} />
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerRight: addButton }} />
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <ScrollView
          testID="memberships-list"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {rows === undefined ? null : rows.length === 0 ? (
            <EmptyState onAdd={() => router.push('/membership')} />
          ) : (
            <>
              <View style={styles.hintRow}>
                <View
                  style={[styles.hint, rows.length === 1 && styles.hidden]}
                  accessibilityElementsHidden={rows.length === 1}
                  importantForAccessibility={rows.length === 1 ? 'no-hide-descendants' : 'auto'}>
                  <SymbolView name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={12} tintColor={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {all ? 'All cards with details' : open ? 'Tap the card again to stack it' : 'Tap a card to open it'}
                  </ThemedText>
                </View>
                {rows.length > 1 && (
                  <Pressable
                    testID="memberships-expand-all"
                    accessibilityRole="button"
                    accessibilityLabel={all ? 'Stack the cards' : 'Expand all cards'}
                    accessibilityState={{ selected: all }}
                    onPress={() => {
                      tapLight();
                      setAll((a) => !a);
                      setOpen(null);
                    }}
                    style={({ pressed }) => [
                      styles.allPill,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.hairline },
                      pressed && styles.pressed,
                    ]}>
                    <SymbolView
                      name={
                        all
                          ? { ios: 'rectangle.stack', android: 'stacks', web: 'stacks' }
                          : { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }
                      }
                      size={13}
                      tintColor={theme.tint}
                    />
                    <ThemedText type="smallBold">{all ? 'Stack' : 'Expand all'}</ThemedText>
                  </Pressable>
                )}
              </View>

              <View>
                {rows.map((m, i) => {
                  const expanded = all || m.id === open || rows.length === 1;
                  const prevExpanded = i > 0 && (all || rows[i - 1].id === open);
                  const last = i === rows.length - 1;
                  return (
                    <Animated.View
                      key={m.id}
                      layout={LinearTransition.duration(260)}
                      style={{ marginTop: i === 0 ? 0 : prevExpanded ? Spacing.four : -(CARD_HEIGHT - PEEK), zIndex: i }}>
                      <MembershipCard
                        membership={m}
                        revealed={!!shown[m.id]}
                        expanded={expanded || last}
                        onPress={() => {
                          tapLight();
                          if (rows.length === 1) return;
                          if (all) {
                            setAll(false);
                            setOpen(m.id);
                          } else {
                            setOpen(m.id === open ? null : m.id);
                          }
                        }}
                      />
                      {expanded && (
                        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
                          <MembershipDetails
                            membership={m}
                            actions={!all}
                            revealed={!!shown[m.id]}
                            copied={copied === m.id}
                            onReveal={() => void reveal(m)}
                            onCopy={() => void copy(m)}
                            onEdit={() => router.push({ pathname: '/membership', params: { id: m.id } })}
                          />
                        </Animated.View>
                      )}
                    </Animated.View>
                  );
                })}
              </View>

              {tip && (
                <>
                  <SectionLabel>Smart tip</SectionLabel>
                  <ThemedView type="backgroundElement" style={styles.tip}>
                    <View style={[styles.tipIcon, { backgroundColor: `${theme.tint}29` }]}>
                      <SymbolView name={{ ios: 'globe', android: 'public', web: 'public' }} size={18} tintColor={theme.tint} />
                    </View>
                    <View style={styles.tipText}>
                      <ThemedText style={styles.tipTitle}>{tip.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {tip.body}
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          const m = rows.find((r) => r.id === tip.membershipId);
                          if (m) void copy(m);
                        }}
                        style={styles.tipAction}>
                        <ThemedText type="smallBold" style={{ color: theme.tint }}>
                          {copied === tip.membershipId ? 'Number copied' : 'Copy number for your bookings'}
                        </ThemedText>
                      </Pressable>
                    </View>
                  </ThemedView>
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function tierColors(tier: string | null): { bg: string; fg: string } {
  const t = (tier ?? '').toLowerCase();
  if (/gold|senator|executive|diamond|hon|1k|elite plus/.test(t)) return { bg: '#CDB27A', fg: '#2B220E' };
  if (/silver|platinum|elite|frequent traveller|medallion|bronze/.test(t)) return { bg: '#C4CBD6', fg: '#22262D' };
  return { bg: 'rgba(255,255,255,0.16)', fg: '#FFFFFF' };
}

function MembershipCard({
  membership: m,
  revealed,
  expanded,
  onPress,
}: {
  membership: MembershipRow;
  revealed: boolean;
  expanded: boolean;
  onPress: () => void;
}) {
  const { user } = useUser();
  const d = describeMembership(m);
  const tier = tierColors(m.tier);
  const holder = user?.firstName?.trim().toUpperCase();
  return (
    <Pressable
      testID={`membership-card-${m.programme}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${d.airline} ${d.name}${m.tier ? `, ${m.tier}` : ''}`}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: d.card.from,
          experimental_backgroundImage: `linear-gradient(135deg, ${d.card.from} 0%, ${d.card.to} 100%)`,
        },
      ]}>
      <View style={styles.cardTop}>
        <View style={[styles.stripe, { backgroundColor: d.card.accent }]} />
        <View style={styles.cardTitle}>
          <ThemedText style={styles.cardEyebrow} numberOfLines={1}>
            {d.airline.toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.cardName} numberOfLines={1}>
            {d.name}
          </ThemedText>
        </View>
        {m.tier ? (
          <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
            <ThemedText style={[styles.tierText, { color: tier.fg }]} numberOfLines={1}>
              {m.tier.toUpperCase()}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.numberBlock}>
          <ThemedText style={styles.cardEyebrow}>{holder ? `${holder} · MEMBER NO.` : 'MEMBER NO.'}</ThemedText>
          <ThemedText testID={`membership-number-${m.programme}`} style={styles.cardNumber} numberOfLines={1} selectable={revealed}>
            {revealed ? m.number : maskNumber(m.number)}
          </ThemedText>
        </View>
        {m.balance != null && (
          <View style={styles.balanceBlock}>
            <ThemedText style={styles.cardEyebrow} numberOfLines={1}>
              {d.currency.toUpperCase()}
            </ThemedText>
            <ThemedText style={styles.cardBalance}>{formatCount(m.balance)}</ThemedText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function MembershipDetails({
  membership: m,
  actions,
  revealed,
  copied,
  onReveal,
  onCopy,
  onEdit,
}: {
  membership: MembershipRow;
  actions: boolean;
  revealed: boolean;
  copied: boolean;
  onReveal: () => void;
  onCopy: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const d = describeMembership(m);
  const progress = tierProgress(m);
  const validity = tierLine(m);
  const expiry = expiryLine(m);
  if (!actions && !progress && !validity && !expiry) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.details}>
      {progress && (
        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <ThemedText type="small">{progress.text}</ThemedText>
            {progress.next && (
              <ThemedText type="small" themeColor="textSecondary">
                {progress.next}
              </ThemedText>
            )}
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${progress.fraction * 100}%`, backgroundColor: d.card.accent }]} />
          </View>
        </View>
      )}
      {validity && (
        <ThemedText type="small" themeColor="textSecondary">
          {validity}
        </ThemedText>
      )}
      {expiry && (
        <View style={[styles.alert, { backgroundColor: `${theme.warning}1F` }]}>
          <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={14} tintColor={theme.warning} />
          <ThemedText type="small" style={{ color: theme.warning, flex: 1 }}>
            {expiry}
          </ThemedText>
        </View>
      )}
      {actions && (
        <View style={styles.actions}>
          <ActionButton
            testID={`membership-reveal-${m.programme}`}
            icon={revealed ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'faceid', android: 'fingerprint', web: 'fingerprint' }}
            label={revealed ? 'Hide' : 'Show'}
            a11y={revealed ? 'Hide number' : 'Show number'}
            onPress={onReveal}
          />
          <ActionButton
            testID={`membership-copy-${m.programme}`}
            icon={copied ? { ios: 'checkmark', android: 'check', web: 'check' } : { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
            label={copied ? 'Copied' : 'Copy'}
            a11y={copied ? 'Number copied' : 'Copy number'}
            onPress={onCopy}
          />
          <ActionButton
            testID={`membership-edit-${m.programme}`}
            icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
            label="Edit"
            a11y="Edit membership"
            onPress={onEdit}
          />
        </View>
      )}
    </ThemedView>
  );
}

function ActionButton({
  icon,
  label,
  a11y,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  label: string;
  /** The full name for VoiceOver/TalkBack ("Show number"). */
  a11y: string;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={icon} size={15} tintColor={theme.text} />
      <ThemedText type="smallBold" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyStack}>
        {['#2A2238', '#1A2A4A', '#1E2A40'].map((c, i) => (
          <View
            key={c}
            style={[styles.emptyCard, { backgroundColor: c, top: i * 22, transform: [{ rotate: `${(i - 1) * 3}deg` }] }]}
          />
        ))}
      </View>
      <ThemedText type="subtitle" style={styles.emptyTitle}>
        Your frequent flyer cards
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyBody}>
        Keep your membership numbers, tiers and miles in one place. They stay on this phone, and the
        numbers stay hidden until you unlock them.
      </ThemedText>
      <Pressable
        testID="add-first-membership"
        accessibilityRole="button"
        onPress={onAdd}
        style={({ pressed }) => [styles.emptyButton, { backgroundColor: theme.tint }, pressed && styles.pressed]}>
        <ThemedText style={styles.emptyButtonText}>Add a membership</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  hidden: {
    opacity: 0,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  allPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    justifyContent: 'space-between',
    boxShadow: '0 -6px 18px rgba(0,0,0,0.35)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stripe: {
    width: 5,
    height: 28,
    borderRadius: 3,
  },
  cardTitle: {
    flex: 1,
    gap: 1,
  },
  cardEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: '#B8C3D6',
  },
  cardName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  tierBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '45%',
  },
  tierText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: 800,
    letterSpacing: 1,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  numberBlock: {
    flexShrink: 1,
    gap: 4,
  },
  cardNumber: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  balanceBlock: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  cardBalance: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: 700,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  details: {
    marginTop: Spacing.two,
    padding: Spacing.three,
    paddingHorizontal: 18,
    borderRadius: 22,
    gap: Spacing.three,
  },
  progressBlock: {
    gap: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    borderRadius: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: Spacing.two,
  },
  tip: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: 22,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    gap: Spacing.one,
  },
  tipTitle: {
    fontWeight: 600,
  },
  tipAction: {
    minHeight: 32,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  emptyStack: {
    width: 220,
    height: 150,
    marginBottom: Spacing.two,
  },
  emptyCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 104,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: Spacing.two,
    minHeight: 50,
    alignSelf: 'stretch',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: 700,
  },
});
