import { Alert } from 'react-native';

import { airportZone } from '@/services/airports';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';
import { matchingImportedJourney, possibleImportedJourneys } from '@/services/imported-journeys';
import type { ImportedSegment } from '@/services/itinerary';
import type { JourneyRow } from '@/services/journeys';

/** Unknown marketing/operating pairs need confirmation. Missing or different
 * partner booking references must not silently create another copy. `null`
 * means a separate flight; `cancel` means leave the import untouched. */
export async function confirmImportedJourney(
  segment: ImportedSegment,
  rows: JourneyRow[],
): Promise<JourneyRow | null | 'cancel'> {
  const known = matchingImportedJourney(segment, rows);
  if (known) return known;
  const candidates = possibleImportedJourneys(segment, rows);
  for (const [index, row] of candidates.entries()) {
    const zone = airportZone(row.fromCode);
    const decision = await new Promise<'same' | 'different' | 'cancel'>(resolve => {
      Alert.alert(
        'Is this the same flight?',
        `${segment.flight ?? 'This flight'} is ${row.fromCode} → ${row.toCode} on ${formatDayLabelWithYear(segment.date!)}. You already have ${row.number || 'a flight'} on this route that day at ${formatTime(row.scheduledDeparture, zone)}.\n\nPartner airlines can use different flight numbers. Update the existing trip with these details?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
          { text: index < candidates.length - 1 ? 'Check next flight' : 'Add separately', onPress: () => resolve('different') },
          { text: 'Update existing', onPress: () => resolve('same') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') },
      );
    });
    if (decision === 'same') return row;
    if (decision === 'cancel') return 'cancel';
  }
  return null;
}
