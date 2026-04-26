/**
 * @jest-environment node
 */
const mockAuthGetUser = jest.fn();
const mockFetch = jest.fn();

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

import { POST } from './route';

describe('POST /api/lead-magnet/enrich', () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  const VALID_UUID = '00000000-0000-4000-8000-000000000000';

  const post = (body: unknown, opts: { authorization?: string | null } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return POST(
      new Request('http://localhost/api/lead-magnet/enrich', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  };

  it('forwards to upstream Supabase function on happy path', async () => {
    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).body).toContain(VALID_UUID);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await post({ project_id: VALID_UUID }, { authorization: null });
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body when project_id is not a UUID', async () => {
    const res = await post({ project_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 502 when upstream returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
    );
    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('edge_function_request_failed');
  });
});
