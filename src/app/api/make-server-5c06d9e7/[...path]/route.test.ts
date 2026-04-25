/**
 * @jest-environment node
 */
import { POST } from './route';

const mockFrom = jest.fn();
const mockInsertTouchpoints = jest.fn();
const mockInsertActivityLog = jest.fn();
const mockInsertPipelineEvents = jest.fn();
const mockAuthGetUser = jest.fn();
let touchpointSelect: any;
let touchpointSelectMock: jest.Mock;

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

// Build a chainable Postgrest-like query object that supports .eq/.order/.limit
// after any link in the chain, and resolves to the given value on `await`.
const buildChainable = (resolved: unknown) => {
  const q: any = {
    eq: jest.fn(() => q),
    order: jest.fn(() => q),
    limit: jest.fn(() => q),
    then: (resolve: (v: unknown) => void) => resolve(resolved),
  };
  return q;
};

describe('make-server journal routes', () => {
  beforeEach(() => {
    touchpointSelect = buildChainable({ data: [{ step_sequence: 2 }], error: null });
    touchpointSelectMock = jest.fn().mockReturnValue(touchpointSelect);

    mockInsertTouchpoints.mockResolvedValue({ error: null });
    mockInsertActivityLog.mockResolvedValue({ error: null });
    mockInsertPipelineEvents.mockResolvedValue({ error: null });

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@test' } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'opportunity_touchpoints') {
        return {
          select: touchpointSelectMock,
          insert: mockInsertTouchpoints,
        };
      }
      if (table === 'activity_log') {
        return {
          insert: mockInsertActivityLog,
        };
      }
      if (table === 'pipeline_events') {
        return {
          insert: mockInsertPipelineEvents,
        };
      }
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const executePost = (path: string[], body: any, opts: { authorization?: string | null } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      }),
      { params: Promise.resolve({ path }) }
    );
  };

  it('creates relance touchpoint with computed sequence', async () => {
    const response = await executePost(['journal', 'touchpoint'], {
      opportunite_id: 'opp-1',
      step_kind: 'relance',
      channel: 'email',
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, step_sequence: 3, touchpoint_kind: 'relance' });
    expect(mockInsertTouchpoints).toHaveBeenCalledWith(
      expect.objectContaining({
        step_kind: 'relance',
        step_sequence: 3,
        channel: 'email',
      })
    );
    expect(touchpointSelectMock).toHaveBeenCalledTimes(1);
    expect(touchpointSelect.limit).toHaveBeenCalledTimes(1);
  });

  it('maps cold_call to approche with fixed sequence', async () => {
    const response = await executePost(['journal', 'touchpoint'], {
      opportunite_id: 'opp-approche',
      step_kind: 'cold_call',
      channel: 'sms',
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, step_sequence: 1, touchpoint_kind: 'approche' });
    expect(mockInsertTouchpoints).toHaveBeenCalledWith(
      expect.objectContaining({
        step_kind: 'approche',
        step_sequence: 1,
        channel: 'sms',
      })
    );
    expect(touchpointSelectMock).not.toHaveBeenCalled();
  });

  it('collapses non relance kinds into autre with null sequence', async () => {
    const response = await executePost(['journal', 'touchpoint'], {
      opportunite_id: 'opp-autre',
      step_kind: 'rdv',
      channel: 'email',
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, step_sequence: null, touchpoint_kind: 'autre' });
    expect(mockInsertTouchpoints).toHaveBeenCalledWith(
      expect.objectContaining({
        step_kind: 'autre',
        step_sequence: null,
        channel: 'email',
      })
    );
    expect(touchpointSelectMock).not.toHaveBeenCalled();
  });

  it('logs call metadata in activity_log payload', async () => {
    const response = await executePost(['journal', 'call'], {
      opportunite_id: 'opp-2',
      entreprise_id: 10,
      description: 'Essai',
      channel: 'email',
      details: 'appel initial',
      skipTouchpoint: true,
    });

    expect(response.status).toBe(200);
    expect(mockInsertTouchpoints).not.toHaveBeenCalled();
    expect(mockInsertActivityLog).toHaveBeenCalledTimes(1);
    expect(mockInsertPipelineEvents).toHaveBeenCalledTimes(1);

    const activityPayload = mockInsertActivityLog.mock.calls[0][0];
    expect(activityPayload).toMatchObject({
      activity_type: 'appel',
      title: 'cold_call',
      description: 'Essai',
      metadata: {
        type_evenement: 'cold_call',
        channel: 'email',
        details: 'appel initial',
      },
    });
    expect(activityPayload.channel).toBeUndefined();
    expect(activityPayload.details).toBeUndefined();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await executePost(['journal', 'touchpoint'], {
      opportunite_id: 'opp-1',
      step_kind: 'relance',
      channel: 'email',
    }, { authorization: null });

    expect(response.status).toBe(401);
    expect(mockInsertTouchpoints).not.toHaveBeenCalled();
    expect(mockAuthGetUser).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase rejects the access token', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid_token' },
    });

    const response = await executePost(['journal', 'touchpoint'], {
      opportunite_id: 'opp-1',
      step_kind: 'relance',
      channel: 'email',
    });

    expect(response.status).toBe(401);
    expect(mockInsertTouchpoints).not.toHaveBeenCalled();
    expect(mockAuthGetUser).toHaveBeenCalledTimes(1);
  });
});
