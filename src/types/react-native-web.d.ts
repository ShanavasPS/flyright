/** react-native-web ships no types for its escape hatch; the website uses it
 * for one raw `<video>` (components/phone-video.web.tsx). */
declare module 'react-native-web' {
  import type { ReactElement } from 'react';

  export function unstable_createElement(
    type: string,
    props?: Record<string, unknown>,
    ...children: unknown[]
  ): ReactElement;
}
