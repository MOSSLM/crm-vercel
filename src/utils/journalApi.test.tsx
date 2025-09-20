import { ContactChannel } from '../types';
import { createTouchpoint, logCall } from './journalApi';

describe('journalApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates touchpoint with default direction and outcome', async () => {
    await createTouchpoint({
      step_kind: 'cold_call',
      channel: ContactChannel.Telephone,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/journal/touchpoint');
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({
      step_kind: 'approche',
      channel: ContactChannel.Telephone,
      direction: 'outgoing',
      outcome: 'inconnu',
    });
  });

  it('logs call with channel and skipTouchpoint flag', async () => {
    // Mock two calls: touchpoint then journal
    mockFetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });

    await logCall('opp-1', 42, 'Test description', ContactChannel.Email);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[0]).toContain('/journal/touchpoint');
    const firstBody = JSON.parse((firstCall[1] as RequestInit).body as string);
    expect(firstBody).toMatchObject({ step_kind: 'approche' });

    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain('/journal/call');
    const body = JSON.parse((secondCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      opportunite_id: 'opp-1',
      entreprise_id: 42,
      description: 'Test description',
      channel: ContactChannel.Email,
      skipTouchpoint: true,
    });
  });

  it('maps non relance touchpoints to autre', async () => {
    await createTouchpoint({
      step_kind: 'rdv',
      channel: ContactChannel.Email,
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ step_kind: 'autre' });
  });
});
