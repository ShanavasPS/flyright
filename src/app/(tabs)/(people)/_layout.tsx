import { Stack } from 'expo-router';

// See (journeys)/_layout.tsx for why pushed screens live inside the tab.
export default function PeopleStack() {
  return (
    <Stack>
      {/* The title is set even though the header is hidden: it is what names
        the back button on every screen pushed over this one, and without it
        VoiceOver reads that button as nothing at all. */}
      <Stack.Screen name="people" options={{ headerShown: false, title: 'People' }} />
      <Stack.Screen
        name="trip/[token]"
        options={{ title: 'Live trip', headerBackButtonDisplayMode: 'minimal' }}
      />
      {/* No title: the person's own name is already the first thing on the
        page, and repeating it in the bar says it twice. */}
      <Stack.Screen
        name="person/[id]/index"
        options={{ title: '', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="person/[id]/trip/[journeyId]"
        options={{ title: 'Trip', headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}
