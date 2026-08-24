/**
 * GET /.well-known/apple-app-site-association — universal links for
 * getflyright.com. Apple's CDN requires a 200 with application/json and no
 * redirect. Paths cover the travel-day share links (/t/<token>).
 *
 * Team id 7NNC4W2FUU = the FlyRight (FI) Apple developer team.
 */

const APP_ID = '7NNC4W2FUU.com.shanavasshaji.flyright';

export function GET() {
  return Response.json({
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [APP_ID],
          components: [{ '/': '/t/*', comment: 'Travel-day share links' }],
          // Older iOS versions read the legacy key.
          paths: ['/t/*'],
        },
      ],
    },
    webcredentials: { apps: [APP_ID] },
  });
}
