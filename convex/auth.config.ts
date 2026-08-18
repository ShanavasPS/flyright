/** Clerk is the identity provider. Requires:
 *  - a Clerk JWT template named exactly "convex" (Clerk dashboard → JWT templates)
 *  - CLERK_JWT_ISSUER_DOMAIN set on the Convex deployment (dashboard → Settings →
 *    Environment Variables), e.g. https://your-instance.clerk.accounts.dev
 */
// The convex/ tsconfig has no Node types; process exists at deploy time.
declare const process: { env: Record<string, string | undefined> };

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: 'convex',
    },
  ],
};
