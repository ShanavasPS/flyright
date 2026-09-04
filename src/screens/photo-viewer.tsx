import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { deletePhoto, usePhoto } from '@/services/photos';

/** One trip photo, full screen on black, with close and delete controls. */
export function PhotoViewer() {
  const { photoId } = useLocalSearchParams<{ photoId?: string }>();
  const photo = usePhoto(photoId ?? '');
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
      {photo && (
        <Image
          source={{ uri: photo.uri }}
          contentFit="contain"
          transition={150}
          style={styles.image}
          accessibilityLabel="Trip photo"
        />
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
