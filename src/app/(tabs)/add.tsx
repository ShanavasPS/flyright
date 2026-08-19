import { Redirect } from 'expo-router';

/** Route behind the tab bar's "+" trigger. Never shown: the trigger is
 * disabled and its tabPress opens the add-flight sheet instead (see the tabs
 * layout). The redirect covers stray deep links only. */
export default function AddRoute() {
  return <Redirect href="/" />;
}
