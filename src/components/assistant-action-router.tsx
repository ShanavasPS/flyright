import { useAuth } from '@clerk/expo';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { addAssistantActionListener, takePendingAssistantAction } from '../../modules/flyright-assistant';
import { isAssistantAction } from '@/services/assistant-actions';

/** Drain only after startup gates settle, and after onboarding if it is visible.
 * Subscribing before draining closes the cold-start/listener-registration race. */
export function AssistantActionRouter() {
  const { isLoaded } = useAuth();
  const navigation = useRootNavigationState();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !navigation?.key || pathname === '/onboarding' || pathname === '/sign-in') return;
    const collect = () => {
      const action = takePendingAssistantAction();
      if (isAssistantAction(action)) router.push({ pathname: '/assistant/[action]', params: { action } });
    };
    const listener = addAssistantActionListener(collect);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') collect();
    });
    collect();
    return () => { listener.remove(); foreground.remove(); };
  }, [isLoaded, navigation?.key, pathname, router]);

  return null;
}
