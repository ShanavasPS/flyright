import { Stack, useLocalSearchParams } from 'expo-router';

import { Paywall } from '@/screens/paywall';

export default function PaywallRoute() {
  const { offering } = useLocalSearchParams<{ offering?: string }>();

  return (
    <>
      {/* The root layout sizes this sheet at 0.97 for the tall acquisition
          paywall. Offering variants (change-plan) are short utility screens —
          a full-height sheet leaves a lake of empty space below the footer,
          so they get a sheet that hugs the content instead. */}
      {offering ? <Stack.Screen options={{ sheetAllowedDetents: [0.75] }} /> : null}
      <Paywall />
    </>
  );
}
