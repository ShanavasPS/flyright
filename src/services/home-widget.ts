/** Hands the "Next flight" widget its timeline (iOS; expo-widgets).
 *
 * Called at the end of every travel-day reconcile — journal edits, stage
 * taps, background flight checks, launch — with the inputs that reconcile
 * already read. The timeline itself is built in home-widget-content.ts. */

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { widgetTimeline, type WidgetInput } from '@/services/home-widget-content';
import NextFlight from '@/widgets/next-flight';

// A dev client built before expo-widgets was linked has no native module,
// and the package's own import throws without it. The widget module loads
// on first use (lazyImports, babel.config.js), so it is only touched here.
const available = () => Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoWidgets');

let lastPushed = '';

export function refreshHomeWidget(input: WidgetInput): void {
  if (!available()) return;
  const entries = widgetTimeline(input);
  // Reconcile runs often; WidgetKit reloads are budgeted. Skip a timeline
  // that matches the last one apart from its first entry's stamp.
  const key = JSON.stringify(entries.map((e, i) => [i === 0 ? 0 : e.date.getTime(), e.props]));
  if (key === lastPushed) return;
  try {
    NextFlight.updateTimeline(entries);
    lastPushed = key;
  } catch (error) {
    console.warn('[home-widget] timeline update failed', error);
  }
}
