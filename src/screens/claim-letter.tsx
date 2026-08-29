import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { generateClaimPdf, shareClaim } from '@/services/claim-delivery';
import { parseSentSnapshot } from '@/services/claim-status';
import { useClaimForJourney } from '@/services/claims';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';

/** The claim, as it went out: the email's subject and cover note (or the
 * shared PDF's details), who it addressed, and exactly when — read straight
 * from the snapshot frozen at send time, never regenerated from live data. */
export function ClaimLetter() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const claim = useClaimForJourney(journeyId ?? '');
  const snapshot = parseSentSnapshot(claim?.sentSnapshot);
  const [busy, setBusy] = useState(false);

  if (!claim || !snapshot) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText type="subtitle">No sent letter here</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Once a claim goes out, the exact email and letter are kept here.
        </ThemedText>
      </ThemedView>
    );
  }

  const sentLabel = claim.sentAt
    ? `${formatDayLabelWithYear(claim.sentAt)} at ${formatTime(claim.sentAt)}`
    : 'Unknown';

  const openPdf = async () => {
    setBusy(true);
    try {
      const uri = await generateClaimPdf(snapshot.letterHtml, snapshot.pdfName);
      await shareClaim(uri);
    } catch {
      Alert.alert('Could not open the letter', 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // Plain layout on purpose — a ScrollView inside this formSheet is
    // captured by the sheet's drag integration (same constraint as the claim
    // wizard and add-flight); the content must fit the sheet.
    <ThemedView style={[styles.container, styles.content]}>
        <ThemedText type="title" themeColor="heading">
          {snapshot.via === 'email' ? 'The email you sent' : 'The letter you shared'}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <InfoRow label="Sent" value={sentLabel} />
          <InfoRow label="Addressed to" value={snapshot.recipient} />
          <InfoRow
            label="From"
            value={`${snapshot.claimantName} · ${snapshot.claimantEmail}`}
          />
          <InfoRow label="Subject" value={snapshot.subject} />
          <InfoRow label="Attachment" value={snapshot.pdfName} />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            {snapshot.via === 'email' ? 'Email message' : 'Cover note'}
          </ThemedText>
          <ThemedText type="small" style={styles.body}>
            {snapshot.body}
          </ThemedText>
        </ThemedView>

        {snapshot.via === 'share' && (
          <ThemedText type="small" themeColor="textSecondary">
            This claim left the app through the share sheet, so the recipient came from the app
            you shared it to.
          </ThemedText>
        )}

        <PrimaryButton label={busy ? 'Opening…' : 'Open the PDF letter'} onPress={openPdf} />
    </ThemedView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.infoLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.infoValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
  },
  centeredText: {
    textAlign: 'center',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  infoLabel: {
    width: 96,
  },
  infoValue: {
    flex: 1,
  },
  body: {
    lineHeight: 20,
  },
});
