/** Web has no app icon to badge and no key-value store on the page; the
 * Settings row's own "Update available" copy does the whole job there. */
export function updateSeenVersion(): string | null {
  return null;
}

export function markUpdateSeen(_version: string) {}

export function useUpdateUnseen(_version: string | null | undefined): boolean {
  return false;
}
