/** Web has no Skia to read the logo's pixels, so the airline card keeps the
 * app's own colour there. */
export interface LogoTint {
  base: string;
  light: string;
}

export function logoTint(_code: string): Promise<LogoTint | null> {
  return Promise.resolve(null);
}

export function flagTint(_country: string): Promise<LogoTint | null> {
  return Promise.resolve(null);
}

export function useLogoTint(_code: string | null | undefined): LogoTint | null {
  return null;
}

export function useFlagTint(_country: string | null | undefined): LogoTint | null {
  return null;
}
