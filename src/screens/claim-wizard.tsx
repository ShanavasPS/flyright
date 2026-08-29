import { useAuth, useUser } from '@clerk/expo';
import { Observe } from 'expo-observe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import {
  claimEmailBody,
  claimEmailSubject,
  claimPdfName,
  formattedAmount,
  renderClaimLetter,
  type Claimant,
} from '@/claims/letter';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DEMO_DISRUPTION, DEMO_JOURNEY, isDemoJourneyId } from '@/constants/demo-journey';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption } from '@/rules/types';
import { canEmail, emailClaim, generateClaimPdf, shareClaim } from '@/services/claim-delivery';
import type { SentSnapshot } from '@/services/claim-status';
import { RESPONSE_WINDOW_DAYS, saveClaim } from '@/services/claims';
import { formatDayLabelWithYear } from '@/services/dates';
import { toDomainJourney, useJourney } from '@/services/journeys';

// details → review → (share sheet only: confirm) → sent. The confirm step
// exists because the share sheet — and Android's mail intent — never says
// whether anything was actually sent; we ask instead of guessing.
type Step = 'details' | 'review' | 'confirm' | 'sent';

// Module-level so the react-hooks purity rule sees the component itself stays
// pure — this only ever runs from event handlers.
const deadlineFromNow = () =>
  new Date(Date.now() + RESPONSE_WINDOW_DAYS * 86_400_000).toISOString();

const PROMPTS: Record<Step, string> = {
  details: 'Who should the payout go to?',
  review: 'Review and send your claim',
  confirm: 'Did your claim letter go out?',
  sent: '',
};

export function ClaimWizard() {
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const { user } = useUser();
  const { journeyId, delay } = useLocalSearchParams<{ journeyId?: string; delay?: string }>();

  const isDemo = isDemoJourneyId(journeyId);
  const row = useJourney(journeyId ?? 'demo', userId);
  const journey = isDemo ? DEMO_JOURNEY : row ? toDomainJourney(row) : null;

  // A cold deep link opens this sheet with no back stack — back() would throw
  // GO_BACK unhandled, so land on the tabs instead.
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const [step, setStep] = useState<Step>('details');
  // Clerk knows most signed-in users' name and email — start there.
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? '');
  const [bookingRef, setBookingRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [mailAvailable, setMailAvailable] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  // Stamped when the claim is actually sent, so the render stays pure.
  const [responseDeadline, setResponseDeadline] = useState<string | null>(null);
  // What deliver() handed to the composer/share sheet, awaiting persist() —
  // a ref because the confirm step commits it in a later event handler.
  const pendingSnapshot = useRef<SentSnapshot | null>(null);

  useEffect(() => {
    canEmail().then(setMailAvailable);
  }, []);

  useEffect(() => {
    Observe.logEvent('claim.started', { attributes: { demo: isDemo } });
  }, [isDemo]);

  if (!journey) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const disruption: Disruption = isDemo
    ? DEMO_DISRUPTION
    : { type: 'delay', delayMinutes: Number(delay) || 0 };
  const verdict = evaluate(journey, disruption);

  if (!verdict.eligible || !verdict.compensation) {
    // Only reachable if the verdict changed between screens (e.g. the status
    // API revised the delay) — say so instead of generating a bogus letter.
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText type="subtitle">No claim to generate</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {verdict.reason}
        </ThemedText>
      </ThemedView>
    );
  }

  const claimant: Claimant = {
    fullName: fullName.trim(),
    email: email.trim(),
    bookingReference: bookingRef.trim() || undefined,
  };
  const detailsValid = claimant.fullName.length > 1 && claimant.email.includes('@');

  const persist = async (sent: boolean) => {
    // The demo journey has no DB row to attach a claim to.
    if (!isDemo) {
      await saveClaim({
        journeyId: journey.id,
        userId,
        verdict,
        sent,
        snapshot: sent ? pendingSnapshot.current : null,
      });
    }
  };

  const finishSent = async (method: 'email' | 'share') => {
    setResponseDeadline(deadlineFromNow());
    await persist(true);
    Observe.logEvent('claim.sent', {
      attributes: {
        method,
        regulation: verdict.regulation ?? '',
        amount: verdict.compensation?.amount ?? 0,
        demo: isDemo,
      },
    });
    setStep('sent');
  };

  const keepDraft = async () => {
    await persist(false);
    setDraftSaved(true);
    setStep('review');
  };

  const deliver = async (method: 'email' | 'share') => {
    setBusy(true);
    try {
      const letterHtml = renderClaimLetter(journey, verdict, claimant);
      const pdfName = claimPdfName(journey, verdict);
      // Freeze what's going out BEFORE handing off to the composer/share
      // sheet — persist() stores this alongside the sent status so the user
      // can re-read exactly what the carrier received.
      pendingSnapshot.current = {
        subject: claimEmailSubject(journey, verdict),
        body: claimEmailBody(journey, verdict, claimant),
        letterHtml,
        recipient: `Customer Relations — ${journey.carrier}`,
        claimantName: claimant.fullName,
        claimantEmail: claimant.email,
        pdfName,
        via: method,
      };
      const pdfUri = await generateClaimPdf(letterHtml, pdfName);
      Observe.logEvent('claim.letter_generated', {
        attributes: { method, regulation: verdict.regulation ?? '', demo: isDemo },
      });
      if (method === 'email') {
        const outcome = await emailClaim({
          subject: claimEmailSubject(journey, verdict),
          body: claimEmailBody(journey, verdict, claimant),
          attachmentUri: pdfUri,
        });
        if (outcome !== 'sent') await keepDraft();
        // Android's mail intent reports 'sent' even when the user backs out,
        // so only iOS's answer is trusted; Android confirms like the share path.
        else if (Platform.OS === 'ios') await finishSent('email');
        else setStep('confirm');
      } else {
        if (await shareClaim(pdfUri)) setStep('confirm');
        else Alert.alert('Sharing unavailable', 'This device offers no way to share the letter.');
      }
    } catch (e) {
      Observe.logEvent('claim.generation_failed', {
        severity: 'error',
        body: e instanceof Error ? e.message : String(e),
      });
      Alert.alert('Could not generate the letter', 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'sent') {
    const deadline = responseDeadline ? formatDayLabelWithYear(responseDeadline) : 'six weeks';
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <Animated.View entering={ZoomIn.springify()} style={styles.sentBadge}>
          <ThemedText style={[styles.sentCheck, { color: theme.success }]}>✓</ThemedText>
          <ThemedText type="subtitle">Claim sent</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
            {journey.carrier} has 6 weeks to respond — until about {deadline}. If they
            stonewall, escalate to the {verdict.escalationBody ?? 'national enforcement body'}.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
            {isDemo
              ? 'This was the demo flight, so nothing was saved.'
              : 'We’re tracking it in your Claims tab.'}
          </ThemedText>
        </Animated.View>
        <View style={styles.sentDone}>
          <PrimaryButton label="Done" onPress={close} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" themeColor="heading">
          Your claim
        </ThemedText>
        <Pressable accessibilityLabel="Close" hitSlop={Spacing.three} onPress={close}>
          <ThemedText themeColor="textSecondary" style={styles.close}>
            ✕
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText themeColor="textSecondary">{PROMPTS[step]}</ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {journey.carrier}
          {journey.number ? ` ${journey.number}` : ''} · {journey.from.code} →{' '}
          {journey.to.code} · {formatDayLabelWithYear(journey.scheduledDeparture)}
        </ThemedText>
        <ThemedText type="subtitle" style={{ color: theme.success }}>
          {formattedAmount(verdict)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {verdict.regulation} · per passenger
        </ThemedText>
      </ThemedView>

      {step === 'details' && (
        <View style={styles.form}>
          <TextInput
            autoFocus
            autoComplete="name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name (as on the booking)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <TextInput
            autoComplete="email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email for the airline's reply"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            value={bookingRef}
            onChangeText={setBookingRef}
            placeholder="Booking reference (optional)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.cta}>
            <PrimaryButton
              label="Preview my claim →"
              disabled={!detailsValid}
              onPress={() => setStep('review')}
            />
          </View>
        </View>
      )}

      {step === 'review' && (
        <View style={styles.form}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">What the letter says</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {claimant.fullName} claims {formattedAmount(verdict)} from {journey.carrier} under{' '}
              {verdict.regulation}, payable within 14 days
              {claimant.bookingReference ? ` (booking ${claimant.bookingReference})` : ''}. After 6
              weeks without a substantive reply, the claim escalates to the{' '}
              {verdict.escalationBody ?? 'national enforcement body'}.
            </ThemedText>
            <Pressable onPress={() => setStep('details')} hitSlop={Spacing.two}>
              <ThemedText type="link">Edit my details →</ThemedText>
            </Pressable>
          </ThemedView>

          {draftSaved && !isDemo && (
            <ThemedText type="small" themeColor="textSecondary">
              Saved as a draft in your Claims tab — send it whenever you’re ready.
            </ThemedText>
          )}

          <View style={styles.cta}>
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator />
                <ThemedText type="small" themeColor="textSecondary">
                  Preparing your letter…
                </ThemedText>
              </View>
            ) : mailAvailable ? (
              <>
                <PrimaryButton label="Email my claim →" onPress={() => deliver('email')} />
                <Pressable onPress={() => deliver('share')} hitSlop={Spacing.two}>
                  <ThemedText type="link" style={styles.centeredText}>
                    Share the PDF another way →
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <PrimaryButton label="Share my claim letter →" onPress={() => deliver('share')} />
            )}
          </View>
        </View>
      )}

      {step === 'confirm' && (
        <View style={styles.form}>
          <ThemedText type="small" themeColor="textSecondary">
            If you emailed or messaged the letter to {journey.carrier}, we’ll start the 6-week
            response clock.
          </ThemedText>
          <View style={styles.cta}>
            <PrimaryButton label="I sent it ✓" onPress={() => finishSent('share')} />
            <Pressable onPress={keepDraft} hitSlop={Spacing.two}>
              <ThemedText type="link" style={styles.centeredText}>
                Not yet — keep it as a draft
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // Plain layout on purpose — a ScrollView inside this formSheet is captured
  // by the sheet's drag integration and hoisted over the header (same
  // constraint as add-flight); every step's content must fit the sheet.
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: {
    fontSize: 20,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  form: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  cta: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  sentBadge: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  sentCheck: {
    fontSize: 64,
    lineHeight: 72,
  },
  sentDone: {
    alignSelf: 'stretch',
  },
});
