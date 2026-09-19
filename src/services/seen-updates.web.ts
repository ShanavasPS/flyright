/** The web keeps no seen list, so it marks nothing as new rather than
 * everything. */
export function markUpdatesSeen(_ids: string[]) {}

export function useIsUnseen(): (updateId: string) => boolean {
  return () => false;
}
