import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { LogBox, useColorScheme } from 'react-native';

import { initNotifications } from '@/services/notifications';
import { initPurchases } from '@/services/purchases';

// Known dev-time noise (missing keys, Test Store notices). Keep them in the
// console but out of the LogBox toast — its animation breaks the accessibility
// tree that Maestro E2E runs read.
LogBox.ignoreLogs(['[notifications]', '[purchases]', '[RevenueCat]']);

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initPurchases();
    initNotifications();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="journey/[id]" options={{ title: 'Journey' }} />
          <Stack.Screen
            name="paywall"
            options={{ presentation: 'modal', headerShown: false }}
          />
        </Stack>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
