import { Redirect, useLocalSearchParams } from 'expo-router';

import { ADD_FLIGHT_PATH } from '@/services/add-flight-draft';

/** The flow's old address, kept for what still uses it — flyright://add-flight
 * from Siri and Gemini, the Maestro flows, old links. It now lives in the
 * My travels stack: a trip edit lands on its details screen, everything else
 * on the first step, with the same params. */
export default function AddFlightRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  const pathname = params.editId ? ADD_FLIGHT_PATH.manual : ADD_FLIGHT_PATH.flight;
  // withAnchor: the stack's anchor (My travels) goes underneath, so the step
  // has a back chevron even when a link opened it cold — a plain replace
  // swapped My travels out for the step and left no way back.
  return <Redirect href={{ pathname, params }} withAnchor />;
}
