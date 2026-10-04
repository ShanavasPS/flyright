import { isClerkAPIResponseError, useUser } from '@clerk/expo';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, type TextInput } from 'react-native';

import { FormTextField, KeyboardForm } from '@/components/keyboard-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { looksLikeEmail } from '@/services/account-security';
import { HeaderButton } from '@/screens/journey-note';

type UserResource = NonNullable<ReturnType<typeof useUser>['user']>;
type EmailAddress = UserResource['emailAddresses'][number];

function clerkMessage(error: unknown): string | null {
  return isClerkAPIResponseError(error) ? error.errors[0]?.longMessage || error.errors[0]?.message || null : null;
}

/** Change the sign-in email in two steps: type the new address, then the
 * code Clerk sends to it. Only a verified address becomes the sign-in
 * email; the old one is removed after the switch. Leaving halfway removes
 * the half-added address, so nothing unverified is left on the account. */
export function ChangeEmail() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useUser();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<EmailAddress | null>(null);
  const [working, setWorking] = useState(false);
  const codeRef = useRef<TextInput>(null);
  const pendingRef = useRef<EmailAddress | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // A half-added address is removed when the screen goes away unverified.
  useEffect(
    () => () => {
      const left = pendingRef.current;
      if (left && left.verification?.status !== 'verified') void left.destroy().catch(() => undefined);
    },
    [],
  );

  const current = user?.primaryEmailAddress?.emailAddress ?? '';

  const sendCode = async () => {
    if (!user || working) return;
    const address = email.trim().toLowerCase();
    if (!looksLikeEmail(address)) {
      Alert.alert('Check the email', 'That doesn’t look like an email address.');
      return;
    }
    if (address === current.toLowerCase()) {
      Alert.alert('Same email', 'You already sign in with this address.');
      return;
    }
    setWorking(true);
    try {
      const existing = user.emailAddresses.find((e) => e.emailAddress.toLowerCase() === address);
      const added = existing ?? (await user.createEmailAddress({ email: address }));
      await added.prepareVerification({ strategy: 'email_code' });
      setPending(added);
      setCode('');
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (error) {
      Alert.alert("Couldn't send a code", clerkMessage(error) ?? 'Check your connection and try again.');
    } finally {
      setWorking(false);
    }
  };

  const verify = async () => {
    if (!user || !pending || working) return;
    if (!/^\d{6}$/.test(code.trim())) {
      Alert.alert('Check the code', 'The code is the 6 digits in the email.');
      return;
    }
    setWorking(true);
    try {
      const checked = await pending.attemptVerification({ code: code.trim() });
      if (checked.verification?.status !== 'verified') throw new Error('Not verified');
      const old = user.primaryEmailAddress;
      await user.update({ primaryEmailAddressId: checked.id });
      if (old && old.id !== checked.id) await old.destroy().catch(() => undefined);
      await user.reload();
      setPending(null);
      router.back();
    } catch (error) {
      Alert.alert("That code didn't work", clerkMessage(error) ?? 'Check the code and try again.');
    } finally {
      setWorking(false);
    }
  };

  const cancel = () => {
    if (!pending && !email.trim()) {
      router.back();
      return;
    }
    Alert.alert('Keep your current email?', `You'll keep signing in with ${current}.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Keep current', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Change email',
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () =>
            working ? (
              <ActivityIndicator />
            ) : pending ? (
              <HeaderButton label="Verify" bold disabled={code.trim().length < 6} onPress={verify} />
            ) : (
              <HeaderButton label="Send code" bold disabled={!email.trim()} onPress={sendCode} />
            ),
        }}
      />
      <KeyboardForm testID="change-email-form" contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          You sign in with <ThemedText type="smallBold">{current}</ThemedText>. We’ll send a code to the new
          address; it becomes your sign-in email once the code is checked.
        </ThemedText>
        <FormTextField
          testID="change-email-address"
          label="New email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (pending) setPending(null);
          }}
          editable={!working}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          autoFocus
          onSubmitEditing={sendCode}
        />
        {pending && (
          <>
            <FormTextField
              ref={codeRef}
              testID="change-email-code"
              label={`Code sent to ${pending.emailAddress}`}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
              editable={!working}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="done"
              maxLength={6}
              onSubmitEditing={verify}
            />
            <Pressable
              testID="change-email-resend"
              accessibilityRole="button"
              disabled={working}
              hitSlop={Spacing.two}
              onPress={sendCode}
              style={styles.resend}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Send a new code
              </ThemedText>
            </Pressable>
          </>
        )}
      </KeyboardForm>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  intro: {
    marginHorizontal: Spacing.two,
  },
  resend: {
    alignSelf: 'flex-start',
    marginLeft: Spacing.two,
  },
});
