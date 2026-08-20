import { Stack } from 'expo-router';

// Screens this tab pushes live in this nested stack: pushing on the root
// stack detaches the native tab controller, which resets to the first tab
// when it re-attaches on pop.
export default function JourneysStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="journey/[id]"
        options={{ title: 'Journey', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="stats"
        options={{ title: 'Travel stats', headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}
