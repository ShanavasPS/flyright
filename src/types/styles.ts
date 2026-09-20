/** The style types the React Native components actually accept.
 *
 * React Native 0.88 narrowed them and stopped exporting them by name — the
 * real `ViewStyleProp` now lives behind `react-native/Libraries/StyleSheet`,
 * which the strict TypeScript API closes off. The public `ViewStyle` is no
 * longer the same thing: it is wider, carrying `position: 'fixed' | 'sticky'`
 * among others, so a prop annotated `StyleProp<ViewStyle>` will not pass
 * through to a `<View>` any more. Deriving these off the components keeps the
 * app honest about what it can be handed, and needs no deep import. */
import type { ScrollViewProps, TextProps, ViewProps, ViewStyle } from 'react-native';

/** What a `style` PROP takes: one style, an array of them, or nothing. */
export type ViewStyleProp = ViewProps['style'];
export type TextStyleProp = TextProps['style'];
export type ScrollViewStyleProp = ScrollViewProps['style'];

/** One ENTRY of a style array. A style prop may be an array, but its entries
 * may not themselves be whole props, so the two are not interchangeable —
 * this is the one to cast to (`as unknown as ViewStyleValue`) when writing
 * web-only CSS that react-native-web renders and the types do not know. */
// One level of unwrapping, then drop everything that is not the style object
// itself: the array arms (recursing instead would chase RecursiveArray forever,
// TS2589, for no gain — every leaf is the same object), the falsy arms a style
// array tolerates, and the branded number StyleSheet.create hands back.
type EntryOf<S> = Exclude<
  NonNullable<S extends readonly (infer Inner)[] ? Inner : S>,
  readonly unknown[] | number | boolean | string
>;
export type ViewStyleValue = EntryOf<NonNullable<ViewStyleProp>>;
export type TextStyleValue = EntryOf<NonNullable<TextStyleProp>>;

/** A style object that every component will take.
 *
 * React Native 0.88 moved View, Text and ScrollView onto the narrowed internal
 * style type but left Pressable (and others) on the public `ViewStyle`, and the
 * two are not assignable to each other. A constant shared between a `<View>`
 * and a `<Pressable>` — the web-only CSS transitions, say — has to satisfy
 * both, which an intersection does. Drop this once React Native agrees with
 * itself. */
export type AnyViewStyleValue = ViewStyleValue & ViewStyle;
