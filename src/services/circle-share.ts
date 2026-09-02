import { Share } from 'react-native';

import { trackEvent } from '@/services/analytics';
import { INVITE_URL } from '@/services/circle';

/** Hand a freshly minted invite to the system share sheet — WhatsApp,
 * iMessage, Telegram… whatever the OS offers. */
export async function shareInvite(token: string, name?: string | null) {
  trackEvent('circle_invite_shared');
  const who = name ? `${name}'s` : 'my';
  await Share.share({
    message: `Follow ${who} trips on FlyRight — a heads-up the day before each flight and live updates on travel day: ${INVITE_URL(token)}`,
  });
}
