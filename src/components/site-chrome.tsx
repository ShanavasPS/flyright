import { type ReactNode } from 'react';

/** Native passthrough: the stack header is the chrome there. The web twin
 * (site-chrome.web.tsx) draws the website's header and footer. */
export function SiteChrome({ children }: { children: ReactNode; bare?: boolean }) {
  return <>{children}</>;
}

/** Store badges only make sense on the web — on a phone the store is where
 * the visitor already is. */
export function StoreBadges() {
  return null;
}
