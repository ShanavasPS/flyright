import { useEffect } from 'react';
import { AppState } from 'react-native';

import { addStepMarkListener } from '../../modules/flyright-live-activities';
import { addNotificationStepMarkListener } from '../../modules/flyright-live-update';
import { applyPendingStepMarks } from '@/services/travel-day-lifecycle';

/** Records the steps the traveller marked outside the app ("I'm through
 * security"): on iOS the Lock Screen's and Dynamic Island's button (its
 * intent parks the mark in FlyRightStepMarks), on Android the travel-day
 * notification's (StepMarkReceiver parks it in StepMarks). This takes them
 * at launch, on every return to the foreground, and the moment one is made
 * while the app is running. Renders nothing. */
export function StepMarkSync() {
  useEffect(() => {
    const apply = () => void applyPendingStepMarks();
    apply();
    const marked = addStepMarkListener(apply);
    const notified = addNotificationStepMarkListener(apply);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply();
    });
    return () => {
      marked.remove();
      notified.remove();
      foreground.remove();
    };
  }, []);

  return null;
}
