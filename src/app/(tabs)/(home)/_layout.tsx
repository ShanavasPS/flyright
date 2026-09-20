import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { NewMessageButton } from '@/screens/support-messages';

// See (journeys)/_layout.tsx for why pushed screens live inside the tab.
//
// Settings has no tab of its own any more: it is pushed from the avatar in
// Home's header, so it lives in Home's stack. Keeping the files in this
// group means every route path is unchanged — /settings, /account,
// /messages — because a group's name never appears in a URL.
export const unstable_settings = { anchor: 'index' };

export default function HomeStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      {/* The name sits in the bar, not in the page: it is reached from the
          avatar, so the bar is where iOS puts it, and a navigation title is
          the right size for it — the page's own large heading pushed every
          row down a line for nothing. No hairline under it either. */}
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
