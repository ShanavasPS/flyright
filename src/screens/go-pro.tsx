import { Redirect } from 'expo-router';

/** /go-pro is the web funnel's checkout step; in the apps the RevenueCat
 * paywall is that step, so native just forwards. */
export function GoPro() {
  return <Redirect href="/paywall" />;
}
