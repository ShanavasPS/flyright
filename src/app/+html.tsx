import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/** The document every web page is served in. Pages set their own title and
 * description with `<Head>` from expo-router/head; what lives here is what
 * every page shares — the font, the icons, the social card defaults and the
 * viewport. Static: rendered once at export. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>FlyRight — your travel day, live</title>
        <meta
          name="description"
          content="Gates, delays and boarding as they happen, shared with the people waiting for you. A journal that fills itself, your routes on a globe — and what airlines owe you when a flight goes wrong."
        />
        <meta name="theme-color" content="#F7F9FC" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#070F20" media="(prefers-color-scheme: dark)" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="FlyRight" />
        <meta property="og:title" content="FlyRight — your travel day, live" />
        <meta
          property="og:description"
          content="Live flight tracking for the people who fly with you, a travel journal, your world on a globe, and what you're owed when it goes wrong."
        />
        <meta property="og:url" content="https://getflyright.com/" />
        <meta property="og:image" content="https://getflyright.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FlyRight — your travel day, live" />
        <meta name="twitter:image" content="https://getflyright.com/og-image.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <ScrollViewStyleReset />
        {/* Inter for the inputs too; ThemedText sets it on every Text. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `input, textarea, button { font-family: var(--font-display); }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
