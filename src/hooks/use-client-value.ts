import { useWindowDimensions } from 'react-native';

/** Native twins of use-client-value.web: nothing to hydrate, so the values
 * are simply read. */
export function useBelowWidth(px: number): boolean {
  return useWindowDimensions().width < px;
}

export function useClientLocale(): string | undefined {
  return undefined;
}

export function useClientUserAgent(): string {
  return '';
}
