import { Redirect } from 'expo-router';

/** Flights lived at /flights while Home held "/". Links saved then (an
 * assistant shortcut, a sign-in return) still arrive; send them home. */
export default function OldFlightsRoute() {
  return <Redirect href="/" />;
}
