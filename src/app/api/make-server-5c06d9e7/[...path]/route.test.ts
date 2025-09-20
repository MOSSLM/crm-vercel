import { POST } from './route';

const mockFrom = jest.fn();
const mockInsertTouchpoints = jest.fn();
const mockInsertJournal = jest.fn();
let touchpointSelect: any;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

describe('make-server journal routes', () => {
  beforeEach(() => {
    touchpointSelect = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ step_sequence: 2 }], error: null }),
    };

    mockInsertTouchpoints.mockResolvedValue({ error: null });
    mockInsertJournal.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'opportunity_touchpoints') {
        return {
          select: jest.fn(() => touchpointSelect),
          insert: mockInsertTouchpoints,
        };
      }
      if (table === 'journal_succes') {
        return {
          insert: mockInsertJournal,
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

  const executePost = (path: string[], body: any) =>
    POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ path }) }
    );

  it('creates touchpoint with computed sequence', async () => {
    const response = await executePost(['journal', 'touchpoint'], {
      opportunite_id: 'opp-1',
      step_kind: 'relance',
      channel: 'email',
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, step_sequence: 3 });
    expect(mockInsertTouchpoints).toHaveBeenCalledWith(
      expect.objectContaining({
        step_kind: 'relance',
        step_sequence: 3,
        channel: 'email',
      })
    );
  });

  it('logs call with channel fallback when journal table lacks column', async () => {
    mockInsertJournal
      .mockResolvedValueOnce({ error: { message: 'column "channel" of relation "journal_succes" does not exist' } })
      .mockResolvedValueOnce({ error: null });

    const response = await executePost(['journal', 'call'], {
      opportunite_id: 'opp-2',
      entreprise_id: 10,
      description: 'Essai',
      channel: 'email',
      skipTouchpoint: true,
    });

    expect(response.status).toBe(200);
    expect(mockInsertTouchpoints).not.toHaveBeenCalled();
    expect(mockInsertJournal).toHaveBeenCalledTimes(2);

    const firstCall = mockInsertJournal.mock.calls[0][0];
    expect(firstCall).toMatchObject({ channel: 'email' });

    const secondCall = mockInsertJournal.mock.calls[1][0];
    expect(secondCall.channel).toBeUndefined();
    expect(secondCall.description).toBe('Essai - Canal: email');
  });
});
