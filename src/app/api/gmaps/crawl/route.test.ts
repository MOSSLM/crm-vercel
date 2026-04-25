/**
 * @jest-environment node
 */
const mockAuthGetUser = jest.fn();
const mockFetch = jest.fn();
const mockEnsureServiceRunning = jest.fn();
const mockGetCurrentIP = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  GMAPS_API_TOKEN: 'gmaps-token',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

jest.mock('@/lib/aws/gmaps-ip', () => ({
  ensureServiceRunning: (...args: unknown[]) => mockEnsureServiceRunning(...args),
  getCurrentIP: (...args: unknown[]) => mockGetCurrentIP(...args),
  scaleDown: jest.fn(),
}));

import { POST } from './route';

describe('POST /api/gmaps/crawl', () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockEnsureServiceRunning.mockResolvedValue(undefined);
    mockGetCurrentIP.mockResolvedValue('http://gmaps.svc');
    mockFetch.mockResolvedValue(new Response('{"jobId":"j1","status":"queued"}', { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  const post = (opts: { authorization?: string | null } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return POST(
      new Request('http://localhost/api/gmaps/crawl', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keyword: 'pizza', location: 'Paris' }),
      }),
    );
  };

  it('forwards to upstream gmaps service on happy path', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockEnsureServiceRunning).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/crawl');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer gmaps-token');
    expect(headers['x-user-auth']).toBe('Bearer test-token');
  });

  it('returns 401 without Authorization header — does not start the upstream service', async () => {
    const res = await post({ authorization: null });
    expect(res.status).toBe(401);
    expect(mockEnsureServiceRunning).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
