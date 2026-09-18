/** The web draws its atlas, not the Skia globe (see world.web.tsx), so the
 * daylight switch has nothing to light there; it reads as on and is never
 * shown. */
export function getGlobeDaylight(): boolean {
  return true;
}

export function setGlobeDaylight(_enabled: boolean) {}

export function useGlobeDaylight(): boolean {
  return true;
}
