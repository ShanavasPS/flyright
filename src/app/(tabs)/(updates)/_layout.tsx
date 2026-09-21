import { Stack } from 'expo-router';

// See (journeys)/_layout.tsx for why a tab keeps its own stack. Updates
// pushes nothing of its own — a face opens the person on Friends, a photo
// opens the root viewer — so this is the one screen.
export const unstable_settings = { anchor: 'updates' };

export default function UpdatesStack() {
  return (
    <Stack>
      <Stack.Screen name="updates" options={{ headerShown: false, title: 'Updates' }} />
    </Stack>
  );
}
