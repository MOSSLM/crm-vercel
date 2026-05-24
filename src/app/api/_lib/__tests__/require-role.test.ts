/**
 * @jest-environment node
 */
import { requireRole, type UserRole } from '../require-role';
import { __resetServiceClientForTests } from '../service-client';

const mockFrom = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  })),
}));

const profileQuery = (result: { data: { role: UserRole } | null; error: { message: string } | null }) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(result),
});

describe('requireRole', () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
  });

  it('allows when the user_profiles role matches', async () => {
    mockFrom.mockReturnValueOnce(profileQuery({ data: { role: 'admin' }, error: null }));
    const result = await requireRole({ id: 'user-1' }, 'admin');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.role).toBe('admin');
    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
  });

  it('denies with 403 when the role differs', async () => {
    mockFrom.mockReturnValueOnce(profileQuery({ data: { role: 'freelance' }, error: null }));
    const result = await requireRole({ id: 'user-1' }, 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: 'forbidden' });
    }
  });

  it('denies with 403 when the user has no profile row', async () => {
    mockFrom.mockReturnValueOnce(profileQuery({ data: null, error: null }));
    const result = await requireRole({ id: 'ghost' }, 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('returns 500 on a DB error', async () => {
    mockFrom.mockReturnValueOnce(profileQuery({ data: null, error: { message: 'connection lost' } }));
    const result = await requireRole({ id: 'user-1' }, 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(500);
      expect(await result.response.json()).toEqual({ error: 'profile_lookup_failed' });
    }
  });

  it('merges extraHeaders into the denial response (CORS)', async () => {
    mockFrom.mockReturnValueOnce(profileQuery({ data: { role: 'freelance' }, error: null }));
    const result = await requireRole({ id: 'user-1' }, 'admin', { 'X-Test': 'yes' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.headers.get('X-Test')).toBe('yes');
  });
});
