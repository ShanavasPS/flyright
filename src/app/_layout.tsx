import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { IdentitySync } from "@/components/identity-sync";
import { JourneySync } from "@/components/journey-sync";
import { CONVEX_URL } from "@/constants/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Observe, ObserveRoot } from "expo-observe";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";

// The hydration-aware hook (not react-native's) so the navigation chrome and
// the screens resolve the same scheme on web — RN's own hook leaves the header
// stuck on the pre-hydration light theme while screens go dark.
import { useColorScheme } from "@/hooks/use-color-scheme";

import { NotificationRouter } from "@/components/notification-router";
import { ThemedText } from "@/components/themed-text";
import { UpdateRequired } from "@/components/update-required";
import { Colors } from "@/constants/theme";
import { useVersionGate } from "@/hooks/use-version-gate";
import { registerFlightWatch } from "@/services/flight-watch";
import { useDbReady } from "@/services/journeys";
import {
  initNotificationLifecycle,
  reconcileNotifications,
} from "@/services/notification-lifecycle";
import { initNotifications } from "@/services/notifications";
import { reconcileTravelDay } from "@/services/travel-day-lifecycle";
import { initPurchases } from "@/services/purchases";
import { applyStoredTheme } from "@/services/theme";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add your key to .env.local.\nRun: 1) clerk auth login  2) clerk link  3) clerk env pull — then restart the dev server.",
  );
}

// Known dev-time noise (missing keys, Test Store notices). Keep them in the
// console but out of the LogBox toast — its animation breaks the accessibility
// tree that Maestro E2E runs read.
LogBox.ignoreLogs([
  "[notifications]",
  "[flight-watch]",
  "[purchases]",
  "[RevenueCat]",
  "Clerk: Clerk has been loaded with development keys",
]);

// Must run at module scope, before any screen mounts — configure() throws if
// called after mount. Release builds only; debug builds collect but don't send.
Observe.configure({
  integrations: { "expo-router": true },
});

// Before first render for the same reason — a post-mount apply would flash
// the system theme before snapping to the user's chosen one.
applyStoredTheme();

const queryClient = new QueryClient();

// Cloud sync is optional infrastructure: with no EXPO_PUBLIC_CONVEX_URL the
// app runs exactly as before, purely local.
const convex = CONVEX_URL
  ? new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false })
  : null;

/** Mounts the Convex provider + journey sync when a deployment is configured;
 * otherwise renders children untouched. */
function CloudSync({ children }: { children: React.ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <JourneySync />
      {children}
    </ConvexProviderWithClerk>
  );
}

/** Replaces the app with the update-required screen when the server rejects
 * this binary version. Fails open — see useVersionGate. */
function VersionGate({ children }: { children: React.ReactNode }) {
  const { blocked, storeUrl } = useVersionGate();
  if (blocked) return <UpdateRequired storeUrl={storeUrl} />;
  return <>{children}</>;
}

/** react-navigation theme derived from the app palette so headers and screen
 * backgrounds match the cards instead of the stock pure-black/white. */
function navTheme(scheme: "light" | "dark") {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
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

function RootLayout() {
  const colorScheme = useColorScheme();
  const { success: dbReady, error: dbError } = useDbReady();

  useEffect(() => {
    initPurchases();
    initNotifications();
    initNotificationLifecycle();
    // Importing flight-watch also defines its background task (global-scope
    // contract); registration + a reconcile pass heal any schedule drift
    // from runs the app missed while closed.
    void registerFlightWatch();
    void reconcileNotifications();
  }, []);

  // Unlike its sibling above, this reconcile reads the travel_day table that
  // migration 0004 introduces — running it before migrations finish would
  // warn "no such table" on every cold start of an upgraded install.
  useEffect(() => {
    if (dbReady) void reconcileTravelDay();
  }, [dbReady]);

  if (dbError) {
    return (
      <ThemedText>Database migration failed: {dbError.message}</ThemedText>
    );
  }
  if (!dbReady) {
    return null; // splash screen keeps covering this frame
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <IdentitySync />
      <NotificationRouter />
      <CloudSync>
      <ThemeProvider
        value={navTheme(colorScheme === "dark" ? "dark" : "light")}
      >
        <QueryClientProvider client={queryClient}>
          <VersionGate>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="add-flight"
                options={{
                  presentation: "formSheet",
                  headerShown: false,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.9],
                }}
              />
              <Stack.Screen
                name="claim"
                options={{
                  presentation: "formSheet",
                  headerShown: false,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.97],
                }}
              />
              <Stack.Screen
                name="paywall"
                options={{
                  presentation: "formSheet",
                  headerShown: false,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.97],
                }}
              />
              {/* No swipe-to-dismiss: AuthView's onDismiss fires on native view
                disappearance, so a native-initiated close plus our
                router.back() would double-pop into the tab navigator. Clerk's
                X button and auth completion are the dismissal paths. */}
              <Stack.Screen
                name="sign-in"
                options={{
                  presentation: "formSheet",
                  headerShown: false,
                  gestureEnabled: false,
                  sheetAllowedDetents: [0.9],
                }}
              />
              {/* First-run intro. No dismiss gesture: Skip and the CTAs are
                the exits, so the seen-flag paths stay the only ways out. */}
              <Stack.Screen
                name="onboarding"
                options={{
                  presentation: "fullScreenModal",
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
              {/* Web funnel: landing → checkout → post-purchase. Present on
                native too (go-pro forwards to the paywall) but only linked
                from the web build. */}
              <Stack.Screen
                name="check"
                options={{ title: "Check your flight" }}
              />
              <Stack.Screen name="go-pro" options={{ title: "FlyRight Pro" }} />
              <Stack.Screen
                name="welcome"
                options={{ title: "Welcome to Pro" }}
              />
              <Stack.Screen
                name="privacy"
                options={{ title: "Privacy Policy" }}
              />
              <Stack.Screen
                name="terms"
                options={{ title: "Terms of Service" }}
              />
              <Stack.Screen
                name="delete-account"
                options={{ title: "Delete account" }}
              />
              <Stack.Screen name="support" options={{ title: "Support" }} />
            </Stack>
          </VersionGate>
        </QueryClientProvider>
      </ThemeProvider>
      </CloudSync>
    </ClerkProvider>
  );
}

// Measures TTR from launch to first render of the tree above.
export default ObserveRoot.wrap(RootLayout);
