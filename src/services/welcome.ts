import Storage from 'expo-sqlite/kv-store';

/** This launch of the app. The first session after someone signs in on this
 * phone says "Welcome", for as long as that session lasts; every later launch
 * says "Welcome back". */
const LAUNCH = String(Date.now());

const keyFor = (userId: string) => `welcomed:${userId}`;

/** "Welcome" or "Welcome back" for a signed-in person on this phone. The
 * first call for an account records this launch as its first; a later
 * launch finds a different one there. Per phone, since that is where the
 * greeting is seen: signing in on a new phone is a first time there too. */
export function welcomeFor(userId: string): 'Welcome' | 'Welcome back' {
  const first = Storage.getItemSync(keyFor(userId));
  if (first == null) {
    Storage.setItemSync(keyFor(userId), LAUNCH);
    return 'Welcome';
  }
  return first === LAUNCH ? 'Welcome' : 'Welcome back';
}
