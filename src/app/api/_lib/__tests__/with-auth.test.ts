/**
 * @jest-environment node
 */
import { z } from 'zod';
import { withAuth } from '../with-auth';
import { __resetServiceClientForTests } from '../service-client';

const mockAuthGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

const okUser = (id = 'user-1') => ({
  data: { user: { id, email: `${id}@test` } },
  error: null,
});

const profileQuery = (role: 'admin' | 'freelance' | null) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: role ? { role } : null, error: null }),
});

const makeRequest = (opts: {
  method?: string;
  body?: unknown;
  authorization?: string | null;
  origin?: string;
} = {}) => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.authorization === undefined) {
    headers.set('Authorization', 'Bearer test-token');
  } else if (opts.authorization !== null) {
    headers.set('Authorization', opts.authorization);
  }
  if (opts.origin) headers.set('Origin', opts.origin);
  return new Request('http://localhost/api/test', {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
};

describe('withAuth', () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockAuthGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 when no Authorization header', async () => {
    const handler = withAuth({}, async () => new Response('ok'));
    const res = await handler(makeRequest({ authorization: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('calls the inner handler with the authed user on success', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    const inner = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const handler = withAuth({}, inner);
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner.mock.calls[0][0].user).toEqual({ id: 'user-1', email: 'user-1@test' });
  });

  it('returns 403 when role does not match', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    mockFrom.mockReturnValueOnce(profileQuery('freelance'));
    const inner = jest.fn();
    const handler = withAuth({ role: 'admin' }, inner);
    const res = await handler(makeRequest());
    expect(res.status).toBe(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it('returns 200 when role matches', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    mockFrom.mockReturnValueOnce(profileQuery('admin'));
    const inner = jest.fn().mockResolvedValue(new Response('ok'));
    const handler = withAuth({ role: 'admin' }, inner);
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('parses and validates the JSON body against a Zod schema', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    const body = z.object({ name: z.string().min(1) });
    const inner = jest.fn().mockImplementation(async (ctx: { body: { name: string } }) =>
      new Response(JSON.stringify({ got: ctx.body.name }), { status: 200 }),
    );
    const handler = withAuth({ body }, inner);
    const res = await handler(makeRequest({ body: { name: 'Alice' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: 'Alice' });
  });

  it('returns 400 with details when body fails Zod validation', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    const body = z.object({ name: z.string().min(1) });
    const inner = jest.fn();
    const handler = withAuth({ body }, inner);
    const res = await handler(makeRequest({ body: { name: '' } }));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe('invalid_body');
    expect(payload.details).toBeDefined();
    expect(inner).not.toHaveBeenCalled();
  });

  it('returns 400 when body is required but JSON is malformed', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    const body = z.object({ name: z.string() });
    const handler = withAuth({ body }, jest.fn());
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: '{not json',
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
  });

  it('returns 500 when the inner handler throws', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    const inner = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = withAuth({}, inner);
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });

  it('short-circuits OPTIONS preflight with CORS headers', async () => {
    const handler = withAuth({}, jest.fn());
    const res = await handler(makeRequest({ method: 'OPTIONS', authorization: null }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('passes Next.js route params through to the inner handler', async () => {
    mockAuthGetUser.mockResolvedValueOnce(okUser());
    const inner = jest.fn().mockImplementation(async (ctx: { params: { id: string } }) =>
      new Response(JSON.stringify({ id: ctx.params.id }), { status: 200 }),
    );
    const handler = withAuth<undefined, { id: string }>({}, inner);
    const res = await handler(makeRequest({ method: 'GET' }), { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'abc' });
  });

  it('attaches CORS headers to 401 responses', async () => {
    process.env.API_ALLOWED_ORIGINS = 'https://app.example';
    const handler = withAuth({}, jest.fn());
    const res = await handler(makeRequest({ authorization: null, origin: 'https://app.example' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    delete process.env.API_ALLOWED_ORIGINS;
  });
});
