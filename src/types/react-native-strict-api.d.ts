/** Shims for React Native 0.88's strict TypeScript API.
 *
 * 0.88 makes deep imports from `react-native/Libraries/*` a type error: the
 * package's exports map answers `"types": null` for that subpath unless the
 * `react-native-legacy-deep-imports` condition is set, and that condition
 * disappears after 0.88. Setting it in tsconfig would opt the WHOLE app back
 * onto the deprecated types, so the app migrated to the strict API instead
 * and only the third-party module that still reaches inside is shimmed here.
 *
 * react-native-view-shot 5.1.1 (the version SDK 58 pins) imports `Int32` and
 * `WithDefault` from the codegen types to describe its TurboModule spec. They
 * are compile-time markers the codegen reads — at runtime every one of them is
 * a plain number, string or boolean — so declaring them is exact, not a
 * loosening. Delete this file once view-shot stops using the deep import. */
declare module 'react-native/Libraries/Types/CodegenTypes' {
  export type Int32 = number;
  export type Float = number;
  export type Double = number;
  export type UnsafeObject = object;
  export type UnsafeMixed = unknown;
  export type WithDefault<Type, _Default> = Type | null | undefined;
  export type BubblingEventHandler<T, _S = string> = (event: { nativeEvent: T }) => void;
  export type DirectEventHandler<T, _S = string> = (event: { nativeEvent: T }) => void;
}
