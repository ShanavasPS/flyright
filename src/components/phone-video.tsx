import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Native shows the still; the web twin (phone-video.web.tsx) plays a loop. */
export function PhoneVideo({
  still,
  style,
  alt,
}: {
  still: number;
  video: string;
  style?: StyleProp<ViewStyle>;
  alt?: string;
}) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Image source={still} style={StyleSheet.absoluteFill} contentFit="cover" alt={alt} />
    </View>
  );
}
