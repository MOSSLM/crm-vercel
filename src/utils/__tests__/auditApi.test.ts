import { saveAudit } from '../auditApi';
import type { AuditContent } from '@/types';

jest.mock('../supabase/client', () => {
  const updateMock = jest.fn();
  const eqMock = jest.fn();
  const fromMock = jest.fn();

  eqMock.mockReturnValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });

  return {
    __esModule: true,
    supabase: { from: fromMock },
    createClient: jest.fn(),
    default: { from: fromMock },
  };
});

const MINIMAL_CONTENT = {} as AuditContent;
const META = { statut: 'draft' as const };

describe('saveAudit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves without error on success', async () => {
    const { supabase } = await import('../supabase/client');
    const fromMock = supabase.from as jest.Mock;
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: eqMock }) });

    await expect(saveAudit('audit-id-1', MINIMAL_CONTENT, META)).resolves.toBeUndefined();
  });

  it('throws SESSION_EXPIRED when supabase returns a PGRST301 auth error', async () => {
    const { supabase } = await import('../supabase/client');
    const fromMock = supabase.from as jest.Mock;
    const authError = { code: 'PGRST301', message: 'JWT expired' };
    const eqMock = jest.fn().mockResolvedValue({ error: authError });
    fromMock.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: eqMock }) });

    await expect(saveAudit('audit-id-1', MINIMAL_CONTENT, META)).rejects.toThrow('SESSION_EXPIRED');
  });

  it('throws SESSION_EXPIRED when error message contains JWT', async () => {
    const { supabase } = await import('../supabase/client');
    const fromMock = supabase.from as jest.Mock;
    const authError = { code: '401', message: 'invalid JWT token' };
    const eqMock = jest.fn().mockResolvedValue({ error: authError });
    fromMock.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: eqMock }) });

    await expect(saveAudit('audit-id-1', MINIMAL_CONTENT, META)).rejects.toThrow('SESSION_EXPIRED');
  });

  it('throws the original error for non-auth failures', async () => {
    const { supabase } = await import('../supabase/client');
    const fromMock = supabase.from as jest.Mock;
    const dbError = { code: '42P01', message: 'relation does not exist' };
    const eqMock = jest.fn().mockResolvedValue({ error: dbError });
    fromMock.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: eqMock }) });

    await expect(saveAudit('audit-id-1', MINIMAL_CONTENT, META)).rejects.toMatchObject({ code: '42P01' });
  });
});
