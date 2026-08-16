import { Stack } from 'expo-router';

// See (journeys)/_layout.tsx for why pushed screens live inside the tab.
export default function SettingsStack() {
  return (
    <Stack>
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="customer-center"
        options={{ title: 'Manage subscription', headerBackTitle: 'Back' }}
      />
      <Stack.Screen name="account" options={{ title: 'Account', headerBackTitle: 'Back' }} />
    </Stack>
  );
}
