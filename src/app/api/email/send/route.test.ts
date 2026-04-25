/**
 * @jest-environment node
 */
const mockEmailsSend = jest.fn();
const mockAuthGetUser = jest.fn();
const mockEmailLogsInsert = jest.fn();
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

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockEmailsSend(...args) },
  })),
}));

import { POST } from './route';

describe('POST /api/email/send', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'from@test' };
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'u@t' } },
      error: null,
    });
    mockEmailsSend.mockResolvedValue({ data: { id: 'res-1' }, error: null });
    mockEmailLogsInsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ insert: mockEmailLogsInsert }));
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  const validBody = {
    to_email: 'r@test.com',
    subject: 'Hi',
    body_html: '<p>Hi</p>',
  };

  const post = (body: unknown, opts: { authorization?: string | null } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return POST(
      new Request('http://localhost/api/email/send', {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  };

  it('sends email and writes log on happy path', async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, resend_id: 'res-1' });
    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    expect(mockEmailLogsInsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });

  it('returns 401 without Authorization header — does not call Resend', async () => {
    const res = await post(validBody, { authorization: null });
    expect(res.status).toBe(401);
    expect(mockEmailsSend).not.toHaveBeenCalled();
    expect(mockEmailLogsInsert).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body when to_email is not an email', async () => {
    const res = await post({ ...validBody, to_email: 'bad' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it('returns 503 when RESEND_API_KEY is missing', async () => {
    process.env.RESEND_API_KEY = '';
    const res = await post(validBody);
    expect(res.status).toBe(503);
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it('still writes a failed log when Resend returns an error', async () => {
    mockEmailsSend.mockResolvedValueOnce({ data: null, error: { message: 'rate-limited' } });
    const res = await post(validBody);
    expect(res.status).toBe(502);
    expect(mockEmailLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_message: 'rate-limited' }),
    );
  });
});
