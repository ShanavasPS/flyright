import { Stack, useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { AddFlight } from '@/screens/add-flight';

/** The journal form: the route, the day, the airline and the times. Also
 * where a trip's "Edit trip details" lands, with the row filled in. */
export default function AddFlightDetailsRoute() {
  useMarkInteractive();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: editId ? 'Edit Trip' : 'Trip details' }} />
      <AddFlight step="manual" />
    </>
  );
}
