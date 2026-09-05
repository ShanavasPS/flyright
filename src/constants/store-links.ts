/** Public store listings — shared by the force-update API and the web funnel's
 * get-the-app surfaces. */
export const STORE_URLS = {
  ios: 'https://apps.apple.com/app/id6801505051',
  android: 'https://play.google.com/store/apps/details?id=com.shanavasshaji.flyright',
} as const;

/** The app's own URL scheme (app.json `scheme`). A web landing hands it to a
 * visitor who already installed the app: the https link can't, because once
 * they've opened it in the browser Safari keeps serving the page itself
 * rather than passing it to the app. */
export const APP_SCHEME = 'flyright';
