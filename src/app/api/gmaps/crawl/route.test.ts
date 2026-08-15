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
  scaleDown: jest.fn(),
}));

import { POST } from './route';
import { CrawlRequestSchema } from '@/lib/gmaps/contract';

describe('POST /api/gmaps/crawl', () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockEnsureServiceRunning.mockResolvedValue(undefined);
    // Le conteneur écoute sur 3000 : la base résolue porte le port (cf. C1).
    mockGetCurrentIP.mockResolvedValue('http://203.0.113.7:3000');
    mockFetch.mockResolvedValue(new Response('{"jobId":"j1"}', { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  const post = (
    opts: { authorization?: string | null; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return POST(
      new Request('http://localhost/api/gmaps/crawl', {
        method: 'POST',
        headers,
        body: JSON.stringify(
          opts.body ?? { keyword: 'pizza', location: 'Paris', useMaps: true, useSearch: false },
        ),
      }),
    );
  };

  /** Corps effectivement réémis vers le scraper. */
  const corpsAmont = () => {
    const [, init] = mockFetch.mock.calls[0];
    return JSON.parse(String((init as RequestInit).body));
  };

  it('forwards to upstream gmaps service on happy path', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockEnsureServiceRunning).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/crawl');
  });

  // --- C2 : les deux en-têtes étaient inversés ---------------------------------
  it("envoie le jeton de service dans x-api-token et le JWT dans Authorization", async () => {
    await post();
    const [, init] = mockFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    // Le middleware du scraper lit `x-api-token` (et exige le préfixe Bearer).
    expect(headers['x-api-token']).toBe('Bearer gmaps-token');
    // …et lit le JWT utilisateur dans `Authorization`, pas dans `x-user-auth`.
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-user-auth']).toBeUndefined();
  });

  // --- C1 : le port du conteneur doit survivre jusqu'à l'appel -----------------
  it("appelle le scraper sur son port, pas sur le 80", async () => {
    await post();
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('http://203.0.113.7:3000/crawl');
    expect(new URL(String(url)).port).toBe('3000');
  });

  // --- C3 : le corps réémis doit satisfaire le CONTRAT 3 ----------------------
  it("traduit `keyword` en `businessTypes` (tableau non vide)", async () => {
    await post({ body: { keyword: 'climatisation', location: 'Lyon' } });
    expect(corpsAmont().businessTypes).toEqual(['climatisation']);
  });

  it('laisse passer un businessTypes déjà fourni', async () => {
    await post({
      body: { businessTypes: ['plombier', 'chauffagiste'], location: 'Lille' },
    });
    expect(corpsAmont().businessTypes).toEqual(['plombier', 'chauffagiste']);
  });

  it('refuse en 400 un corps sans keyword ni businessTypes, sans réveiller le service', async () => {
    const res = await post({ body: { location: 'Paris' } });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockEnsureServiceRunning).not.toHaveBeenCalled();
  });

  // --- Garde-fou du coût : aucune facturation par omission ---------------------
  it("n'autorise JAMAIS les API Google payantes par défaut", async () => {
    // Le repli Places API est facturé PAR ENTREPRISE consultée : sur une ville
    // de 100 fiches, l'activer par mégarde produit 100 appels payants. Le seul
    // déclencheur légitime est la case du formulaire, cochée à la main.
    await post({ body: { keyword: 'pizza', location: 'Paris', useMaps: true } });
    expect(corpsAmont().useGoogleApi).toBe(false);
  });

  it('transmet useGoogleApi:true seulement quand il est explicitement demandé', async () => {
    await post({
      body: { keyword: 'pizza', location: 'Paris', useMaps: true, useGoogleApi: true },
    });
    expect(corpsAmont().useGoogleApi).toBe(true);
  });

  // --- C9 : le test qui aurait attrapé les 5 ruptures d'un coup ----------------
  it('réémet un corps conforme au schéma partagé CrawlRequest', async () => {
    await post({
      body: {
        keyword: 'pizza',
        location: 'Paris',
        tileStep: 0.02,
        useMaps: true,
        useSearch: true,
        // Chaîne : c'est ce que rend un <input type="number"> non typé (C7).
        pagesCount: '3',
      },
    });
    const envoye = corpsAmont();
    // Le schéma est le même objet que celui dont server.js est le jumeau :
    // s'il passe ici, le scraper ne peut plus répondre 400 pour cause de corps.
    const parse = CrawlRequestSchema.safeParse(envoye);
    expect(parse.success).toBe(true);
    expect(envoye).toEqual({
      location: 'Paris',
      businessTypes: ['pizza'],
      // Absent de la requete d'entree => faux. C'est le garde-fou du cout :
      // le repli Places API se facture PAR ENTREPRISE, il ne doit jamais
      // s'activer par omission.
      useGoogleApi: false,
      useMaps: true,
      useSearch: true,
      pagesCount: 3,
      tileStep: 0.02,
    });
    // `keyword` ne doit PAS survivre : le scraper ne le lit pas.
    expect(envoye).not.toHaveProperty('keyword');
  });

  it('applique les valeurs par défaut du contrat quand les options manquent', async () => {
    await post({ body: { keyword: 'pizza', location: 'Paris' } });
    const envoye = corpsAmont();
    expect(CrawlRequestSchema.safeParse(envoye).success).toBe(true);
    expect(envoye.useMaps).toBe(false);
    expect(envoye.useSearch).toBe(false);
    expect(envoye.pagesCount).toBe(0);
    expect(envoye.tileStep).toBe(0.05);
  });

  // --- C5 : forme de la réponse ------------------------------------------------
  it("complète le statut absent du POST amont par 'pending'", async () => {
    const res = await post();
    await expect(res.json()).resolves.toEqual({ jobId: 'j1', status: 'pending' });
  });

  it('signale en 502 une réponse amont hors contrat', async () => {
    mockFetch.mockResolvedValue(new Response('{"oups":true}', { status: 200 }));
    const res = await post();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: 'reponse_scraper_invalide' });
  });

  it("relaie le statut d'erreur du scraper au lieu de le masquer", async () => {
    mockFetch.mockResolvedValue(new Response('{"error":"Unauthorized"}', { status: 401 }));
    const res = await post();
    expect(res.status).toBe(401);
  });

  it('returns 401 without Authorization header — does not start the upstream service', async () => {
    const res = await post({ authorization: null });
    expect(res.status).toBe(401);
    expect(mockEnsureServiceRunning).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
