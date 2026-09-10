import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { deletePhoto, usePhoto } from '@/services/photos';

/** One trip photo, full screen on black, with close and delete controls. */
export function PhotoViewer() {
  const { photoId } = useLocalSearchParams<{ photoId?: string }>();
  const { row: photo, loaded } = usePhoto(photoId ?? '');
  const [broken, setBroken] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const remove = () => {
    if (!photo) return;
    Alert.alert('Remove this photo?', 'It comes off this trip on all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void deletePhoto(photo.id).then(() => router.back());
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {photo && !broken ? (
        <Image
          source={{ uri: photo.uri }}
          contentFit="contain"
          transition={150}
          style={styles.image}
          accessibilityLabel="Trip photo"
          onError={() => setBroken(true)}
        />
      ) : !loaded ? (
        <View style={styles.centred}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        <View style={styles.centred}>
          <Text style={styles.noticeTitle}>{photo ? "Couldn't load this photo" : 'Photo unavailable'}</Text>
          <Text style={styles.notice}>
            {photo
              ? 'The file may still be syncing from another device. Try again in a moment.'
              : 'It was removed from this trip.'}
          </Text>
        </View>
      )}
      <View style={[styles.bar, { top: insets.top + Spacing.two }]}>
        <ViewerButton
          label="Close"
          symbol={{ ios: 'xmark', android: 'close', web: 'close' }}
          onPress={() => router.back()}
        />
        <ViewerButton
          label="Remove photo"
          symbol={{ ios: 'trash', android: 'delete', web: 'delete' }}
          onPress={remove}
        />
      </View>
    </View>
  );
}

function ViewerButton({
  label,
  symbol,
  onPress,
}: {
  label: string;
  symbol: { ios: string; android: string; web: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
      <SymbolView name={symbol as never} size={20} tintColor="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  image: {
    flex: 1,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
  },
  noticeTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 600,
  },
  notice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  bar: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
