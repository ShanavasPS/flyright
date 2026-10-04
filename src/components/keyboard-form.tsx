import { createContext, forwardRef, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useKeyboardOverlap } from '@/hooks/use-keyboard-overlap';
import { useTheme } from '@/hooks/use-theme';

const FocusContext = createContext<() => void>(() => {});

/**
 * A scrolling form the keyboard never covers: the frame ends at the
 * keyboard's top edge (useKeyboardOverlap — KeyboardAvoidingView under-pads
 * inside card modals and under Android's edge-to-edge), and whichever field
 * has focus is scrolled into what is left, on focus and again once the
 * keyboard has taken its room. Fields are FormTextField, which report focus
 * here; the focused input is found through TextInput.State and measured
 * against the scroll content.
 */
export function KeyboardForm({
  children,
  contentContainerStyle,
  testID,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const frame = useRef<View | null>(null);
  const content = useRef<View | null>(null);
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const [viewport, setViewport] = useState(0);
  const [focusTick, setFocusTick] = useState(0);
  const { pad, onLayout } = useKeyboardOverlap(frame);

  useEffect(() => {
    const input = TextInput.State.currentlyFocusedInput?.();
    const target = content.current;
    if (!input || !target || !viewport) return;
    input.measureLayout(
      target,
      (_x, y, _w, h) => {
        const margin = Spacing.five;
        const top = y - margin;
        // A field taller than what is left: show its top.
        const bottom = Math.min(y + h + margin, top + viewport);
        if (top < scrollY.current) {
          scroll.current?.scrollTo({ y: Math.max(0, top), animated: true });
        } else if (bottom > scrollY.current + viewport) {
          scroll.current?.scrollTo({ y: bottom - viewport, animated: true });
        }
      },
      () => {},
    );
  }, [focusTick, viewport, pad]);

  return (
    <FocusContext.Provider value={() => setFocusTick((n) => n + 1)}>
      <View ref={frame} onLayout={onLayout} style={[styles.frame, { paddingBottom: pad }]}>
        <ScrollView
          testID={testID}
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}>
          <View ref={content} style={[styles.content, contentContainerStyle]}>
            {children}
          </View>
        </ScrollView>
      </View>
    </FocusContext.Provider>
  );
}

/** A labelled text field the way the Profile area draws them: the label
 * small inside the rounded field, the value under it. Tapping anywhere on
 * the field focuses it. */
export const FormTextField = forwardRef<
  TextInput,
  TextInputProps & { label: string; hint?: string; containerStyle?: StyleProp<ViewStyle> }
>(function FormTextField({ label, hint, containerStyle, onFocus, editable = true, style, ...input }, ref) {
  const theme = useTheme();
  const focused = useContext(FocusContext);
  const inner = useRef<TextInput | null>(null);
  return (
    <View style={[styles.fieldWrap, containerStyle]}>
      <Pressable
        accessible={false}
        onPress={() => inner.current?.focus()}
        style={[
          styles.field,
          { backgroundColor: theme.backgroundElement, borderColor: theme.hairline },
          !editable && styles.readOnly,
        ]}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <TextInput
          ref={(node) => {
            inner.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          accessibilityLabel={label}
          editable={editable}
          placeholderTextColor={theme.textSecondary}
          onFocus={(e) => {
            focused();
            onFocus?.(e);
          }}
          style={[styles.input, { color: editable ? theme.text : theme.textSecondary }, style]}
          {...input}
        />
      </Pressable>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  fieldWrap: {
    gap: Spacing.one,
  },
  field: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    minHeight: 60,
  },
  readOnly: {
    opacity: 0.75,
  },
  input: {
    fontSize: 17,
    letterSpacing: 0,
    lineHeight: 22,
    paddingVertical: Spacing.one,
    minHeight: 32,
  },
  hint: {
    marginLeft: Spacing.two,
  },
});
