import { SignIn as ClerkSignIn } from '@clerk/expo/web';
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SiteChrome } from '@/components/site-chrome';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Web build renders Clerk's web sign-in (the surface the web funnel uses).
 *
 * Wrapped in the funnel chrome, plus its own way out: this is a destination the
 * header links to, and a visitor who changed their mind shouldn't need the
 * browser's back button to leave. The chrome's wordmark also goes home, but a
 * logo is a convention, not a signpost — on a page whose whole job is a form,
 * the exit has to be spelled out.
 *
 * The chrome owns the scroll, so Clerk's card — taller than a phone viewport —
 * scrolls with the page instead of overflowing its container. */
export function SignIn() {
  return (
    <SiteChrome>
      <View style={styles.content}>
        <Link href="/check">
          <ThemedText type="link">← Back to flight check</ThemedText>
        </Link>
        {/* Fallback, not force: an explicit redirect_url — the one Clerk adds
          when it bounces a visitor here from somewhere else — should still
          win. Absent that, land on /check rather than Clerk's default "/",
          and cover the sign-up path too, since the component links to it. */}
        <ClerkSignIn fallbackRedirectUrl="/check" signUpFallbackRedirectUrl="/check" />
      </View>
    </SiteChrome>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
