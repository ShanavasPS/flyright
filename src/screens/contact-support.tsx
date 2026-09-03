import { useUser } from '@clerk/expo';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import * as Application from 'expo-application';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { api } from '../../convex/_generated/api';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CONVEX_URL, SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Settings → Contact support. The message is stored in Convex and emailed
 * to the support inbox with the traveler's address as Reply-To (see
 * convex/support.ts), so a reply from a normal mail client reaches them. */
export function ContactSupport() {
  return (
    <ThemedView style={styles.container}>
      {/* "padding" on both platforms — see support-thread.tsx for why Android
          needs it too under edge-to-edge. */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            Questions about a verdict, a claim, or your subscription? Tell us what
            happened — include the flight number and date if it&apos;s about a trip.
          </ThemedText>
          {/* useMutation needs a ConvexProvider, which _layout mounts only when
              a deployment is configured. Without one, fall back to plain email. */}
          {CONVEX_URL ? <ContactForm /> : <MailFallback />}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function ContactForm() {
  const theme = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const startThread = useMutation(api.support.startThread);
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    setError(null);
    setState('sending');
    try {
      const threadId = await startThread({
        message,
        email: accountEmail ?? email,
        platform: Platform.OS,
        appVersion: `${Application.nativeApplicationVersion ?? ''} (${Application.nativeBuildVersion ?? ''})`,
      });
      // Signed-in users get the conversation view, where support's reply will
      // appear; anonymous senders have no history to show, so confirm inline.
      if (user) router.replace(`/messages/${threadId}`);
      else setState('sent');
    } catch (e) {
      setState('idle');
      setError(
        e instanceof ConvexError && typeof e.data === 'string'
          ? e.data
          : `Couldn't send right now. Email us at ${SUPPORT_EMAIL} instead.`,
      );
    }
  };

  if (state === 'sent') {
    return (
      <Card>
        <ThemedText type="smallBold">Message sent</ThemedText>
        <ThemedText type="small">
          Thanks — we&apos;ll reply to {accountEmail ?? email.trim()} within a day or two.
        </ThemedText>
      </Card>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.field }];

  return (
    <Card>
      {accountEmail ? (
        <ThemedText type="small" themeColor="textSecondary">
          We&apos;ll reply to {accountEmail}.
        </ThemedText>
      ) : (
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          placeholder="Your email, so we can reply"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
      )}
      <TextInput
        multiline
        value={message}
        onChangeText={setMessage}
        placeholder="What can we help with?"
        placeholderTextColor={theme.textSecondary}
        textAlignVertical="top"
        style={[inputStyle, styles.messageInput]}
      />
      {error && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      )}
      <PrimaryButton
        label={state === 'sending' ? 'Sending…' : 'Send message'}
        onPress={onSend}
        disabled={state === 'sending' || message.trim().length === 0}
      />
    </Card>
  );
}

function MailFallback() {
  return (
    <Card>
      <ThemedText type="small">Email us and we&apos;ll get back to you.</ThemedText>
      <Link href={`mailto:${SUPPORT_EMAIL}`}>
        <ThemedText type="link">{SUPPORT_EMAIL}</ThemedText>
      </Link>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    fontSize: 16,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  messageInput: {
    minHeight: 160,
  },
});
