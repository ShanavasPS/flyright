import { gateLookup } from '@/server/lookup-gate';

// No LOOKUP_QUOTA_SECRET here, so metering is skipped and only identity is
// under test; the quota rules themselves are covered in lookup-quota.test.ts.
const ISSUER = 'https://example.clerk.accounts.dev';

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://getflyright.com/api/flight-status?flight=AY1331&date=2026-08-30', {
    headers,
  });
}

describe('gateLookup', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, CLERK_JWT_ISSUER_DOMAIN: ISSUER, NODE_ENV: 'production' };
    delete process.env.LOOKUP_QUOTA_SECRET;
  });
  afterEach(() => {
    process.env = env;
  });

  it('refuses a signed-out app request', async () => {
    const result = await gateLookup(request(), 1);
    expect(result).toEqual({ ok: false, status: 401, error: 'sign_in_required' });
  });

  it('lets our web checker through when it identifies itself, keyed by address', async () => {
    // A browser sends no Origin on a same-origin GET, so the page says so.
    const result = await gateLookup(request({ 'x-flyright-web': '1', 'cf-connecting-ip': '203.0.113.7' }), 1);
    expect(result.ok).toBe(true);
    expect(result.ok && result.subject.kind).toBe('anonymous');
  });

  it('ignores the web marker when the request comes from another site', async () => {
    const result = await gateLookup(
      request({ 'x-flyright-web': '1', origin: 'https://scraper.example' }),
      1,
    );
    expect(result).toEqual({ ok: false, status: 401, error: 'sign_in_required' });
  });

  it('lets the web checker through by origin, keyed by address', async () => {
    const result = await gateLookup(
      request({ origin: 'https://getflyright.com', 'cf-connecting-ip': '203.0.113.7' }),
      1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subject.kind).toBe('anonymous');
      // Hashed, never the raw address.
      expect(result.subject.kind === 'anonymous' && result.subject.address).not.toContain('203.0.113.7');
    }
  });

  it('refuses unknown web origins', async () => {
    const result = await gateLookup(request({ origin: 'https://scraper.example' }), 1);
    expect(result).toEqual({ ok: false, status: 401, error: 'sign_in_required' });
  });

  it('refuses a malformed or foreign token', async () => {
    expect(await gateLookup(request({ authorization: 'Bearer not-a-jwt' }), 1)).toEqual({
      ok: false,
      status: 401,
      error: 'invalid_token',
    });
    // A well-formed RS256 token from another issuer never reaches the JWKS fetch.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({ iss: 'https://other.example', sub: 'user_1', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url');
    expect(await gateLookup(request({ authorization: `Bearer ${header}.${claims}.c2ln` }), 1)).toEqual({
      ok: false,
      status: 401,
      error: 'invalid_token',
    });
  });

  it('fails closed in production when no issuer is configured', async () => {
    delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    const result = await gateLookup(request({ origin: 'https://getflyright.com' }), 1);
    expect(result).toEqual({ ok: false, status: 500, error: 'lookup_auth_not_configured' });
  });

  it('runs ungated in development when no issuer is configured', async () => {
    delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    process.env.NODE_ENV = 'test';
    const result = await gateLookup(request(), 1);
    expect(result.ok).toBe(true);
  });
});
