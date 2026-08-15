/**
 * @jest-environment node
 */
const mockAuthGetUser = jest.fn();
const mockFetch = jest.fn();
const mockEnsureServiceRunning = jest.fn();
const mockGetCurrentIP = jest.fn();
const mockScaleDown = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  GMAPS_API_TOKEN: 'gmaps-token',
  GMAPS_PORT: 3000,
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
  scaleDown: (...args: unknown[]) => mockScaleDown(...args),
}));

import { POST } from './route';

/**
 * Corps de réponse instrumenté : dit s'il a été DRAINÉ (lu jusqu'au bout) ou
 * annulé. Un corps qu'on n'a jamais lu n'est tiré qu'une fois (le tampon initial
 * de la plomberie) puis reste en suspens — et undici garde la socket ouverte.
 * Il faut donc plusieurs morceaux pour distinguer « effleuré » de « drainé ».
 */
const corpsInstrumente = () => {
  const etat = { morceaux: 0, draine: false, annule: false };
  const flux = new ReadableStream<Uint8Array>({
    pull(controller) {
      etat.morceaux += 1;
      if (etat.morceaux < 3) {
        controller.enqueue(new TextEncoder().encode('{"ok":'));
        return;
      }
      etat.draine = true;
      controller.close();
    },
    cancel() {
      etat.annule = true;
    },
  });
  return { etat, reponse: new Response(flux, { status: 200 }) };
};

describe('POST /api/gmaps/scale-down', () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockEnsureServiceRunning.mockResolvedValue(undefined);
    mockGetCurrentIP.mockResolvedValue('http://203.0.113.7:3000');
    mockScaleDown.mockResolvedValue(undefined);
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  const post = () =>
    POST(
      new Request('http://localhost/api/gmaps/scale-down', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
      }),
    );

  // --- C5 : le corps de la réponse amont doit être consommé -------------------
  it('consomme le corps de la réponse du conteneur', async () => {
    const { etat, reponse } = corpsInstrumente();
    mockFetch.mockResolvedValue(reponse);

    const res = await post();

    expect(res.status).toBe(200);
    expect(etat.draine || etat.annule).toBe(true);
  });

  it("ne réveille pas le service juste pour l'éteindre", async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await post();
    expect(mockEnsureServiceRunning).not.toHaveBeenCalled();
    expect(mockScaleDown).toHaveBeenCalledTimes(1);
  });

  it('éteint quand même si le conteneur est injoignable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, conteneurPrevenu: false });
    expect(mockScaleDown).toHaveBeenCalledTimes(1);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await POST(
      new Request('http://localhost/api/gmaps/scale-down', { method: 'POST' }),
    );
    expect(res.status).toBe(401);
    expect(mockScaleDown).not.toHaveBeenCalled();
  });
});
