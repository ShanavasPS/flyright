import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle, type ViewInstance} from 'react-native';

import type { ViewStyleProp, ViewStyleValue } from '@/types/styles';
import { unstable_createElement } from 'react-native-web';

/** A capture that moves: the still underneath, a muted looping video over
 * it once it can play. The video is only attached when the frame is on
 * screen (no bandwidth spent on a page nobody scrolled to), never under
 * reduced motion, and the still stays if autoplay is refused — so the
 * worst case is exactly the screenshot. */
export function PhoneVideo({
  still,
  video,
  style,
  alt,
}: {
  /** The screenshot (an `expo-image` source). */
  still: number;
  /** URL of the loop, served from public/. */
  video: string;
  style?: ViewStyleProp;
  alt?: string;
}) {
  const ref = useRef<ViewInstance>(null);
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const node = ref.current as unknown as Element | null;
    let reduced = false;
    try {
      reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      reduced = false;
    }
    if (reduced || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setWanted(true);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <View ref={ref} style={[styles.frame, style]}>
      <Image source={still} style={StyleSheet.absoluteFill} contentFit="cover" alt={alt} />
      {wanted &&
        unstable_createElement('video', {
          src: video,
          autoPlay: true,
          muted: true,
          loop: true,
          playsInline: true,
          preload: 'auto',
          'aria-hidden': true,
          tabIndex: -1,
          onPlaying: () => setPlaying(true),
          style: [styles.video, { opacity: playing ? 1 : 0 }],
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    // The still shows until the first frame plays, then the loop fades in.
    transitionProperty: 'opacity',
    transitionDuration: '400ms',
  } as unknown as ViewStyleValue,
});
