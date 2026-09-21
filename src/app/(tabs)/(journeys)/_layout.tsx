import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { NewMessageButton } from '@/screens/support-messages';

// Assistant links can enter this stack directly. Keep My travels underneath
// the trip so its immersive screen always has a way back.
//
// Settings has no tab of its own: it is pushed from the avatar in this
// tab's header, so it lives in this stack. A group's name never appears in
// a URL, so /settings, /account and /messages kept their paths when they
// moved here from Home's stack.
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
      {/* The name sits in the bar, not in the page: it is reached from the
          avatar, so the bar is where iOS puts it, and a navigation title is
          the right size for it. No hairline under it either. */}
      <Stack.Screen
        name="settings"
        options={{ title: 'Profile', headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}
      />
      <Stack.Screen
        name="manage-subscription"
        options={{ title: 'Manage subscription', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="contact"
        options={{ title: 'Contact support', headerBackButtonDisplayMode: 'minimal' }}
      />
      {/* Composing lives in the navigation bar (see screens/support-messages),
          the way an inbox does — not as a button stacked over the list. */}
      <Stack.Screen
        name="messages/index"
        options={{
          title: 'Support',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => <NewMessageButton />,
        }}
      />
      <Stack.Screen
        name="messages/[id]"
        options={{ title: 'Conversation', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="blocked"
        options={{ title: 'Blocked people', headerBackButtonDisplayMode: 'minimal' }}
      />
      {/* On native, Clerk's UserProfileView brings its own navigation chrome;
          the route header is hidden and onHostBack (see screens/account.tsx)
          pops the route, so there's a single back button at every level. The
          web UserProfile has no onHostBack, so web keeps the stack header. */}
      <Stack.Screen
        name="account"
        options={
          Platform.OS === 'web'
            ? { title: 'Account', headerBackTitle: 'Back' }
            : { headerShown: false }
        }
      />
    </Stack>
  );
}
