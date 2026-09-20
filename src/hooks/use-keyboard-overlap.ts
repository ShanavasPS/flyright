import { useEffect, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, type View, type ViewInstance} from 'react-native';

/** How far the editor's bottom edge must rise to meet the keyboard's top
 * edge, both in window coordinates — so it holds inside a card modal, under
 * Android edge-to-edge, and with the suggestion strip toggling. The padded
 * view's own frame doesn't move (padding shrinks its content), so the pad is
 * simply frame-bottom minus keyboard-top, recomputed whenever either side
 * changes: keyboard frame events on one side, the view's layout on the other.
 * The layout hook matters because autoFocus raises the keyboard before the
 * first layout, when a measurement would read zeros. */
export function useKeyboardOverlap(content: RefObject<ViewInstance | null>) {
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [bottom, setBottom] = useState<number | null>(null);

  const measure = () => {
    content.current?.measureInWindow((_x, y, _w, h) => {
      if (h > 0) setBottom(y + h);
    });
  };

  useEffect(() => {
    // iOS fires will-change-frame in step with the animation (and for the
    // suggestion strip / emoji keyboard); Android only has did-show.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardTop(e.endCoordinates.screenY);
      measure();
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // iPhone: inside a card modal, measureInWindow answers relative to the
  // modal's own view (72pt short on an iPhone 16 Pro — two lines of text
  // under the keyboard), while the keyboard's top is in screen coordinates.
  // The card is flush with the screen bottom, so the window's height IS the
  // editor's bottom edge there. iPad's floating sheet and Android keep the
  // measurement (UIKit lifts the iPad sheet above the keyboard itself).
  const edge = Platform.OS === 'ios' && !Platform.isPad ? Dimensions.get('window').height : bottom;
  const pad = keyboardTop != null && edge != null ? Math.max(0, edge - keyboardTop) : 0;
  return { pad, onLayout: measure };
}
