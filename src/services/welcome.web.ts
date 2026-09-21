// Web renders the site's front page where Flights would greet anyone, so
// there is no first time to remember. (expo-sqlite's kv-store would pull its
// wasm worker into the web bundle, which Metro is not set up to resolve.)
export function welcomeFor(_userId: string): 'Welcome' | 'Welcome back' {
  return 'Welcome back';
}
