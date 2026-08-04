import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { LogBox, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useDbReady } from '@/services/journeys';
import { initNotifications } from '@/services/notifications';
import { initPurchases } from '@/services/purchases';

// Known dev-time noise (missing keys, Test Store notices). Keep them in the
// console but out of the LogBox toast — its animation breaks the accessibility
// tree that Maestro E2E runs read.
LogBox.ignoreLogs(['[notifications]', '[purchases]', '[RevenueCat]']);

const queryClient = new QueryClient();

/** react-navigation theme derived from the app palette so headers and screen
 * backgrounds match the cards instead of the stock pure-black/white. */
function navTheme(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.tint,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.backgroundElement,
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { success: dbReady, error: dbError } = useDbReady();

  useEffect(() => {
    initPurchases();
    initNotifications();
  }, []);

  if (dbError) {
    return <ThemedText>Database migration failed: {dbError.message}</ThemedText>;
  }
  if (!dbReady) {
    return null; // splash screen keeps covering this frame
  }

  return (
    <ThemeProvider value={navTheme(colorScheme === 'dark' ? 'dark' : 'light')}>
      <QueryClientProvider client={queryClient}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="journey/[id]"
            options={{ title: 'Journey', headerBackButtonDisplayMode: 'minimal' }}
          />
          <Stack.Screen
            name="add-flight"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.9],
            }}
          />
          <Stack.Screen
            name="paywall"
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen
            name="customer-center"
            options={{ title: 'Manage subscription', headerBackTitle: 'Back' }}
          />
        </Stack>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
