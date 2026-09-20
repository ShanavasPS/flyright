import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ViewStyleProp } from '@/types/styles';

/** Native shows the still; the web twin (phone-video.web.tsx) plays a loop. */
export function PhoneVideo({
  still,
  style,
  alt,
}: {
  still: number;
  video: string;
  style?: ViewStyleProp;
  alt?: string;
}) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Image source={still} style={StyleSheet.absoluteFill} contentFit="cover" alt={alt} />
    </View>
  );
}
