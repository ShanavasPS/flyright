import { Stack, useLocalSearchParams } from 'expo-router';

import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { countryName } from '@/services/airports';
import { StatsCountryDays } from '@/screens/stats-country-days';

/** One country's days in a year, stay by stay (Places › Days). */
export default function StatsCountryDaysRoute() {
  useMarkInteractive();
  const { country, year } = useLocalSearchParams<{ country: string; year?: string }>();
  const code = (country ?? '').toUpperCase();
  return (
    <>
      <Stack.Screen options={{ title: countryName(code) }} />
      <StatsCountryDays country={code} initialYear={Number(year) || new Date().getFullYear()} />
    </>
  );
}
