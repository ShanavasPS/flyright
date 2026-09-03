import { Stack } from 'expo-router';
import { Platform } from 'react-native';

// See (journeys)/_layout.tsx for why pushed screens live inside the tab.
export default function SettingsStack() {
  return (
    <Stack>
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="manage-subscription"
        options={{ title: 'Manage subscription', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="contact"
        options={{ title: 'Contact support', headerBackButtonDisplayMode: 'minimal' }}
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
