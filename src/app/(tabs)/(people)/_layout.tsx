import { Stack } from 'expo-router';

// See (journeys)/_layout.tsx for why pushed screens live inside the tab.
export default function PeopleStack() {
  return (
    <Stack>
      <Stack.Screen name="people" options={{ headerShown: false }} />
      <Stack.Screen
        name="trip/[token]"
        options={{ title: 'Live trip', headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}
