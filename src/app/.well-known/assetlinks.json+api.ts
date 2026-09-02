/**
 * GET /.well-known/assetlinks.json — Android App Links verification for
 * getflyright.com (travel-day share links /t/<token>, circle invites /i/<token>).
 *
 * The SHA-256 fingerprints come from the ASSETLINKS_SHA256 env var on EAS
 * Hosting (comma-separated). Play App Signing re-signs release builds, so the
 * value MUST be the "App signing key certificate" fingerprint from Play
 * Console → Setup → App signing (add the upload/debug certs too if links
 * should also verify on internal-test and dev builds). Until the env var is
 * set this serves an empty relation list and verification simply fails.
 */

export function GET() {
  const prints = (process.env.ASSETLINKS_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return Response.json(
    prints.length
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: 'com.shanavasshaji.flyright',
              sha256_cert_fingerprints: prints,
            },
          },
        ]
      : [],
  );
}
