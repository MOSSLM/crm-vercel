/**
 * @jest-environment node
 */
const mockAuthGetUser = jest.fn();
const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

import { GET } from './route';

describe('GET /api/email/logs', () => {
  beforeEach(() => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    // Build a chainable query whose terminal `.then`/await resolves to data.
    const chain: any = {
      select: (...a: unknown[]) => { mockSelect(...a); return chain; },
      order: (...a: unknown[]) => { mockOrder(...a); return chain; },
      limit: (...a: unknown[]) => { mockLimit(...a); return chain; },
      eq: (...a: unknown[]) => { mockEq(...a); return chain; },
      // requireRole (admin gate) looks up the caller's role in user_profiles.
      maybeSingle: () => Promise.resolve({ data: { role: 'admin' }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: 'log-1' }], error: null }),
    };
    mockFrom.mockReturnValue(chain);
  });
  afterEach(() => jest.clearAllMocks());

  const get = (search = '', opts: { authorization?: string | null } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return GET(
      new Request(`http://localhost/api/email/logs${search}`, { headers }),
    );
  };

  it('returns logs on happy path with default limit', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toEqual([{ id: 'log-1' }]);
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('respects an explicit limit', async () => {
    const res = await get('?limit=10');
    expect(res.status).toBe(200);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('rejects limit=abc with 400 (regression for the Math.min(NaN) bug)', async () => {
    const res = await get('?limit=abc');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('rejects limit > 200 with 400', async () => {
    const res = await get('?limit=999');
    expect(res.status).toBe(400);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await get('', { authorization: null });
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
