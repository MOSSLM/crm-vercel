/**
 * @jest-environment node
 */
import { corsHeadersFor, preflight } from '../cors';

describe('corsHeadersFor', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  const req = (origin?: string) =>
    new Request('http://localhost', origin ? { headers: { origin } } : undefined);

  it('emits "*" when allowAny is set', () => {
    const headers = corsHeadersFor(req('https://x.example'), { allowAny: true });
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
  });

  it('echoes origin when it is in API_ALLOWED_ORIGINS', () => {
    process.env = { ...ORIGINAL_ENV, API_ALLOWED_ORIGINS: 'https://app.example,https://other' };
    const headers = corsHeadersFor(req('https://app.example'));
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example');
    expect(headers['Vary']).toBe('Origin');
  });

  it('omits Allow-Origin when origin is not in allowlist', () => {
    process.env = { ...ORIGINAL_ENV, API_ALLOWED_ORIGINS: 'https://app.example' };
    const headers = corsHeadersFor(req('https://evil.example'));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('omits Allow-Origin when no origin header is present (same-origin)', () => {
    const headers = corsHeadersFor(req());
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('preflight', () => {
  it('returns 204 with CORS headers', () => {
    const res = preflight(new Request('http://localhost'), { allowAny: true });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
