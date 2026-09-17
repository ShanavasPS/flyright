import { create } from 'zustand';

import type { StoredPass } from '@/services/boarding-pass';
import type { TripVisibility } from '@/services/trip-visibility';
import { getDefaultTripVisibility } from '@/services/trip-visibility-default';

/** The add-flight steps, each its own screen in the My travels stack so the
 * back chevron and swipe walk the traveller back through them. 'added' is
 * the confirmation that replaces the saving step and dismisses itself. */
export type AddFlightStep = 'flight' | 'date' | 'manual' | 'result' | 'added';

export const ADD_FLIGHT_PATH = {
  flight: '/add',
  date: '/add-date',
  manual: '/add-details',
  result: '/add-result',
  added: '/add-done',
} as const satisfies Record<AddFlightStep, string>;

/** Everything typed, scanned or picked so far. It lives outside the screens
 * because each step is a separate screen: what the flight step collected has
 * to be there when the date step mounts, and still there when the traveller
 * swipes back to change it. */
export interface AddFlightDraft {
  flightInput: string;
  flightNumber: string | null;
  date: string | null;
  /** Calendar picks are staged behind an explicit confirm — a mis-tap on a
   * day cell shouldn't commit a decades-back journal date and jump the step. */
  pendingDate: string | null;
  /** Journal path: entered via the blank ticket, or when the lookup failed. */
  manualMode: boolean;
  fromInput: string;
  toInput: string;
  /** Optional 'HH:mm' times for journal entries; null keeps the noon placeholder. */
  depTime: string | null;
  arrTime: string | null;
  /** The airline of a journal entry when the traveller chose it by hand. */
  airline: { iata: string; name: string; country: string } | null;
  bookingRef: string;
  seat: string;
  /** Who sees the trip the moment it is saved. */
  audience: TripVisibility;
  /** The code the scanner read, kept on the trip so it can be shown at the gate. */
  scannedPass: StoredPass | null;
  /** What the draft was last seeded from — an edited row's id, or the import
   * params — so the seeding runs once, not on every render or remount. */
  seededFrom: string | null;
}

interface AddFlightDraftStore extends AddFlightDraft {
  patch: (changes: Partial<AddFlightDraft>) => void;
  /** Start over, optionally with some fields already filled in. */
  reset: (seed?: Partial<AddFlightDraft>) => void;
}

const empty = (): AddFlightDraft => ({
  flightInput: '',
  flightNumber: null,
  date: null,
  pendingDate: null,
  manualMode: false,
  fromInput: '',
  toInput: '',
  depTime: null,
  arrTime: null,
  airline: null,
  bookingRef: '',
  seat: '',
  audience: getDefaultTripVisibility(),
  scannedPass: null,
  seededFrom: null,
});

export const useAddFlightDraft = create<AddFlightDraftStore>()((set) => ({
  ...empty(),
  patch: (changes) => set(changes),
  reset: (seed) => set({ ...empty(), ...seed }),
}));
