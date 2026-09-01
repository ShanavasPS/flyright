import { type ReactNode } from 'react';

/** Marketing chrome for the web funnel — see site-chrome.web.tsx. Native screens
 * already carry the tab bar and stack headers, and /check is reachable there via
 * the flyright:///check push deep link, so on native this is a passthrough. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
