import { useWindowDimensions } from 'react-native';

import { WideWindowMinWidth } from '@/constants/theme';

/** 'compact' = phone-shaped window, 'wide' = tablet / unfolded foldable /
 * generous split-screen pane. Live: fold/unfold and split-screen resizes
 * re-evaluate automatically via useWindowDimensions. */
export function useWindowSizeClass(): 'compact' | 'wide' {
  const { width } = useWindowDimensions();
  return width >= WideWindowMinWidth ? 'wide' : 'compact';
}
