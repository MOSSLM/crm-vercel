/**
 * @jest-environment node
 */
import { requireUser } from '../auth';
import { __resetServiceClientForTests } from '../service-client';

const mockAuthGetUser = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

describe('requireUser', () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockAuthGetUser.mockReset();
  });

  const makeReq = (auth?: string | null) => {
    const headers: Record<string, string> = {};
    if (auth !== null && auth !== undefined) headers.authorization = auth;
    return new Request('http://localhost', { headers });
  };

  it('rejects requests without an Authorization header', async () => {
    const result = await requireUser(makeReq(null));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: 'unauthorized' });
    }
    expect(mockAuthGetUser).not.toHaveBeenCalled();
  });

  it('rejects malformed Authorization headers (no Bearer prefix)', async () => {
    const result = await requireUser(makeReq('Token abc'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mockAuthGetUser).not.toHaveBeenCalled();
  });

  it('rejects when Supabase reports an invalid token', async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad' } });
    const result = await requireUser(makeReq('Bearer abc'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mockAuthGetUser).toHaveBeenCalledWith('abc');
  });

  it('returns the user on a valid token', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-99', email: 'a@b.test' } },
      error: null,
    });
    const result = await requireUser(makeReq('Bearer good-token'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual({ id: 'user-99', email: 'a@b.test' });
      expect(result.accessToken).toBe('good-token');
    }
  });

  it('merges extraHeaders into the 401 response (e.g. CORS)', async () => {
    const result = await requireUser(makeReq(null), { 'X-Test': 'yes' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.headers.get('X-Test')).toBe('yes');
    }
  });
});
