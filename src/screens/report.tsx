import { ConvexError } from 'convex/values';
import { useMutation } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { ReportReason } from '../../convex/safety';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { noteSuccess } from '@/services/haptics';

/** The reasons in the order they are offered. Scam first: the one that
 * costs a traveler money is the one to make easiest to say. */
const REASONS: { key: ReportReason; label: string; detail: string }[] = [
  { key: 'scam', label: 'Scam or spam', detail: 'Asking for money, codes, or links to somewhere else.' },
  { key: 'impersonation', label: 'Pretending to be someone', detail: 'A name or photo that belongs to someone else.' },
  { key: 'harassment', label: 'Harassment', detail: 'Unwanted contact, threats, or abuse.' },
  { key: 'inappropriate', label: 'Inappropriate photo or words', detail: 'Something no one should have to see.' },
  { key: 'other', label: 'Something else', detail: 'Tell us below.' },
];

const MAX_DETAILS = 1000;

/**
 * "Report" — for a person, or one of their trip updates. A card modal like
 * the update composer: pick a reason, add a line if it helps, send. The
 * report goes to the people who run FlyRight, never to the person reported,
 * and the sheet offers to block them on the way out.
 */
export function ReportSheet() {
  // `userId` may be absent on the open share page, which never learns it;
  // an update names its author server-side.
  const { userId, name, updateId } = useLocalSearchParams<{
    userId?: string;
    name?: string;
    updateId?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const report = useMutation(api.safety.report);
  const block = useMutation(api.safety.block);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const who = name?.trim() || 'this person';
  const aboutUpdate = !!updateId;
  const canSend = !busy && !!reason && (reason !== 'other' || details.trim().length > 0);

  const submit = async () => {
    if (!canSend || !reason || (!userId && !updateId)) return;
    setBusy(true);
    try {
      const { targetUserId } = await report({
        userId: userId ?? null,
        updateId: (updateId as Id<'tripUpdates'> | undefined) ?? null,
        reason,
        details: details.trim(),
      });
      noteSuccess();
      trackEvent('report_sent', { reason, update: aboutUpdate });
      Alert.alert(
        'Thanks — we’ll look into it',
        `${who} won’t know you reported ${aboutUpdate ? 'this' : 'them'}. Do you also want to block ${who}? They’ll be removed from your circle and can’t find you again.`,
        [
          { text: 'Not now', style: 'cancel', onPress: () => router.back() },
          {
            text: `Block ${who}`,
            style: 'destructive',
            onPress: () => {
              void block({ userId: targetUserId })
                .then(() => trackEvent('person_blocked', { from: 'report' }))
                .catch(() => {});
              // Two levels: this sheet and the profile beneath it, which is
              // gone as far as the server is concerned.
              router.dismissAll();
            },
          },
        ],
      );
    } catch (error) {
      const text = error instanceof ConvexError ? String(error.data) : 'Check your connection and try again.';
      Alert.alert('Could not send the report', text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: aboutUpdate ? 'Report this update' : `Report ${who}`,
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={() => router.back()} />,
          headerRight: () =>
            busy ? (
              <ActivityIndicator style={styles.headerButton} />
            ) : (
              <HeaderButton label="Send" bold disabled={!canSend} onPress={() => void submit()} />
            ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          {aboutUpdate
            ? `What’s wrong with this update from ${who}?`
            : `What’s wrong with ${who}? Reports are private — they won’t be told.`}
        </ThemedText>

        <View style={[styles.group, { backgroundColor: theme.field }]}>
          {REASONS.map((r, i) => {
            const selected = reason === r.key;
            return (
              <Pressable
                key={r.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                testID={`report-reason-${r.key}`}
                onPress={() => setReason(r.key)}
                style={({ pressed }) => [
                  styles.option,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.optionText}>
                  <ThemedText>{r.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {r.detail}
                  </ThemedText>
                </View>
                {selected && (
                  <SymbolView
                    name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                    size={22}
                    tintColor={theme.tint}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={details}
          onChangeText={(t) => setDetails(t.slice(0, MAX_DETAILS))}
          placeholder={reason === 'other' ? 'What happened?' : 'Anything else we should know? (optional)'}
          placeholderTextColor={theme.textSecondary}
          multiline
          textAlignVertical="top"
          testID="report-details"
          style={[styles.details, { color: theme.text, backgroundColor: theme.field }]}
        />
      </ScrollView>
    </ThemedView>
  );
}

function HeaderButton({
  label,
  bold,
  disabled,
  onPress,
}: {
  label: string;
  bold?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={Spacing.two}
      onPress={onPress}
      testID={`report-${label.toLowerCase()}`}
      style={({ pressed }) => [styles.headerButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={{ color: theme.tint }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  group: { borderRadius: Spacing.three, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  optionText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
  details: {
    minHeight: 96,
    fontSize: 16,
    lineHeight: 22,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  headerButton: { paddingHorizontal: Spacing.two, minWidth: 44, alignItems: 'center' },
});
