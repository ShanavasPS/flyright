import { useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { Avatar } from '@/components/avatar';
import { FormTextField, KeyboardForm } from '@/components/keyboard-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { HeaderButton } from '@/screens/journey-note';

/** Name and photo — what Friends see. The email is shown but changed in
 * Account & security, where it is verified with a code. Saves to
 * Clerk; the photo goes up the moment it is picked. */
export function EditProfile() {
  const router = useRouter();
  const theme = useTheme();
  const { user, isLoaded } = useUser();
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const lastRef = useRef<TextInput>(null);

  const firstName = first ?? user?.firstName ?? '';
  const lastName = last ?? user?.lastName ?? '';
  const dirty =
    !!user && (firstName.trim() !== (user.firstName ?? '') || lastName.trim() !== (user.lastName ?? ''));
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const shownName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || email;

  const save = async () => {
    if (!user || !dirty || saving) return;
    setSaving(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      router.back();
    } catch {
      Alert.alert("Couldn't save your name", 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard your changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const upload = async (file: string | null) => {
    if (!user) return;
    setPhotoBusy(true);
    try {
      await user.setProfileImage({ file });
    } catch {
      Alert.alert("Couldn't change your photo", 'Check your connection and try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    await upload(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
  };

  const changePhoto = () => {
    if (!user?.hasImage) {
      void pick();
      return;
    }
    Alert.alert('Profile photo', undefined, [
      { text: 'Choose a new photo', onPress: () => void pick() },
      { text: 'Remove photo', style: 'destructive', onPress: () => void upload(null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Edit profile',
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () => <HeaderButton label="Save" bold disabled={!dirty || saving} onPress={save} />,
        }}
      />
      {!isLoaded || !user ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <KeyboardForm testID="edit-profile-form" contentContainerStyle={styles.content}>
          <View style={styles.photo}>
            <Pressable
              testID="change-photo"
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              disabled={photoBusy}
              onPress={changePhoto}>
              <Avatar name={shownName} imageUrl={user.imageUrl ?? null} size={96} />
              <View style={[styles.cameraBadge, { backgroundColor: theme.backgroundSelected, borderColor: theme.background }]}>
                {photoBusy ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} size={15} tintColor={theme.tint} />
                )}
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={photoBusy} onPress={changePhoto} hitSlop={Spacing.two}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Change photo
              </ThemedText>
            </Pressable>
          </View>

          <FormTextField
            testID="edit-first-name"
            label="First name"
            value={firstName}
            onChangeText={setFirst}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => lastRef.current?.focus()}
          />
          <FormTextField
            ref={lastRef}
            testID="edit-last-name"
            label="Last name"
            value={lastName}
            onChangeText={setLast}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <FormTextField label="Email" value={email} editable={false} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Change your email in{' '}
            <ThemedText
              type="smallBold"
              style={{ color: theme.tint }}
              accessibilityRole="link"
              onPress={() => router.push('/account')}>
              Account & security
            </ThemedText>
            .
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.preview}>
            <Avatar name={shownName} imageUrl={user.imageUrl ?? null} size={32} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.previewText}>
              Friends see you as <ThemedText type="smallBold">{shownName}</ThemedText> with this photo.
            </ThemedText>
          </ThemedView>
        </KeyboardForm>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    marginTop: Spacing.six,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  photo: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  cameraBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    marginTop: -Spacing.one,
    marginLeft: Spacing.two,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  previewText: {
    flex: 1,
  },
});
