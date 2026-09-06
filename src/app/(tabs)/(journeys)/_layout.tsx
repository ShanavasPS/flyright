import { Stack } from 'expo-router';

// Screens this tab pushes live in this nested stack: pushing on the root
// stack detaches the native tab controller, which resets to the first tab
// when it re-attaches on pop.
export default function JourneysStack() {
  return (
    <Stack>
      {/* The title is set even though the header is hidden: it is what names
        the back button on every screen pushed over this one, and without it
        VoiceOver reads that button as nothing at all. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'My travels' }} />
      <Stack.Screen
        name="journey/[id]"
        options={{ title: '', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="stats"
        options={{ title: 'Travel stats', headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}
