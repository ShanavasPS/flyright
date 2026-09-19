import { Stack } from 'expo-router';

// Assistant links can enter this stack directly. Keep My travels underneath
// the trip so its immersive screen always has a way back.
export const unstable_settings = { anchor: 'index' };

// Screens this tab pushes live in this nested stack: pushing on the root
// stack detaches the native tab controller, which resets to the first tab
// when it re-attaches on pop.
export default function JourneysStack() {
  return (
    <Stack>
      {/* The title is set even though the header is hidden: it is what names
        the back button on every screen pushed over this one, and without it
        VoiceOver reads that button as nothing at all. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Flights' }} />
      <Stack.Screen
        name="journey/[id]"
        options={{ title: '', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="stats/index"
        options={{ title: 'Travel stats', headerBackButtonDisplayMode: 'minimal' }}
      />
      {/* The lists behind the stats cards: every flight, place and airline. */}
      <Stack.Screen
        name="stats/flights"
        options={{ title: 'Flights', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="stats/places"
        options={{ title: 'Places', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="stats/airlines"
        options={{ title: 'Airlines', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="stats/aircraft/index"
        options={{ title: 'Aircraft', headerBackButtonDisplayMode: 'minimal' }}
      />
      {/* One type's page names itself after the type. */}
      <Stack.Screen name="stats/aircraft/[model]" options={{ headerBackButtonDisplayMode: 'minimal' }} />
      {/* Adding a flight, one screen per step, pushed over My travels so the
        back chevron and swipe return to what was already entered (the draft
        they share is services/add-flight-draft). The details screen sets its
        own title: it doubles as a trip's editor. The confirmation has no
        header and no swipe: it leaves by itself. */}
      <Stack.Screen
        name="add"
        options={{ title: 'Add Flight', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="add-date"
        options={{ title: 'Departure date', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen name="add-details" options={{ headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen
        name="add-result"
        options={{ title: 'Your flight', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen name="add-done" options={{ headerShown: false, gestureEnabled: false }} />
    </Stack>
  );
}
