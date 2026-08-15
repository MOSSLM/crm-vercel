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

import { GET } from './route';
import { JobStatusSchema } from '@/lib/gmaps/contract';

const STATUT_AMONT = {
  status: 'done',
  found: 42,
  inserted: 30,
  merged: 12,
  saved: 30,
  pages: 3,
  tilesDone: 9,
  tilesTotal: 9,
  rechercheIds: { climatisation: '11111111-1111-1111-1111-111111111111' },
  error: null,
  metadata: { location: 'Lyon' },
};

describe('GET /api/gmaps/job/[jobId]', () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockEnsureServiceRunning.mockResolvedValue(undefined);
    mockGetCurrentIP.mockResolvedValue('http://203.0.113.7:3000');
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STATUT_AMONT), { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  const get = (jobId = 'job-1', requete = '') =>
    GET(
      new Request(`http://localhost/api/gmaps/job/${jobId}${requete}`, {
        headers: { authorization: 'Bearer test-token' },
      }),
      { params: Promise.resolve({ jobId }) },
    );

  // --- C4 : le scraper expose /crawl/:jobId, pas /job/:jobId ------------------
  it('interroge /crawl/:jobId en amont, sur le bon port', async () => {
    await get('job-1');
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('http://203.0.113.7:3000/crawl/job-1');
    expect(String(url)).not.toContain('/job/');
  });

  // --- C5 : statut à plat, conforme au CONTRAT 2 ------------------------------
  it('renvoie un statut à plat qui satisfait le schéma partagé', async () => {
    const res = await get('job-1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(JobStatusSchema.safeParse(data).success).toBe(true);
    // Le jobId est réinjecté depuis l'URL : le scraper ne le renvoie pas.
    expect(data.jobId).toBe('job-1');
    expect(data).toMatchObject({ status: 'done', found: 42, inserted: 30, merged: 12, pages: 3 });
  });

  it('comble par 0 les compteurs absents plutôt que de laisser des undefined', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 'running', metadata: {} }), { status: 200 }),
    );
    const res = await get('job-2');
    const data = await res.json();
    expect(data).toMatchObject({
      jobId: 'job-2',
      status: 'running',
      found: 0,
      inserted: 0,
      merged: 0,
      saved: 0,
      pages: 0,
      tilesDone: 0,
      tilesTotal: 0,
      error: null,
    });
  });

  // --- C6 : tolérance symétrique sur les dictionnaires optionnels ------------
  // `.default({})` acceptait la clé absente mais rejetait `null`, d'où un 502
  // « statut_scraper_invalide » sur un job parfaitement sain dont le persister
  // avait écrit `metadata: null`.
  it('tolère metadata/rechercheIds à null comme il tolère leur absence', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'running', metadata: null, rechercheIds: null }),
        { status: 200 },
      ),
    );
    const res = await get('job-null');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.metadata).toEqual({});
    expect(data.rechercheIds).toEqual({});
  });

  it('refuse toujours un dictionnaire franchement incohérent', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 'running', metadata: 42 }), { status: 200 }),
    );
    const res = await get('job-md-nombre');
    expect(res.status).toBe(502);
  });

  it("aplatit l'objet d'erreur historique de jobManager en message lisible", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'error', error: { message: 'Playwright timeout', stack: '…' } }),
        { status: 200 },
      ),
    );
    const data = await (await get('job-3')).json();
    expect(data.error).toBe('Playwright timeout');
  });

  it('signale en 502 un statut hors contrat au lieu de renvoyer des undefined', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 'en_cours_de_truc' }), { status: 200 }),
    );
    const res = await get('job-4');
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: 'statut_scraper_invalide' });
  });

  it('relaie le 404 du scraper tel quel', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 }),
    );
    const res = await get('inconnu');
    expect(res.status).toBe(404);
  });

  // --- CONTRAT 5 : suivi incrémental des points de la carte ------------------
  // Sans curseur, une recherche de 500 fiches réexpédierait 500 points toutes
  // les 3 s — sur l'écran qu'on regarde justement depuis un mobile.
  it('relaie le curseur de points au scraper', async () => {
    await get('job-1', '?pointsDepuis=12');
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      'http://203.0.113.7:3000/crawl/job-1?pointsDepuis=12',
    );
  });

  it("n'envoie aucun curseur quand le navigateur n'en donne pas", async () => {
    await get('job-1');
    expect(String(mockFetch.mock.calls[0][0])).toBe('http://203.0.113.7:3000/crawl/job-1');
  });

  it.each(['abc', '-3', '1.5', ''])(
    'ignore un curseur invalide (%p) au lieu de le relayer tel quel',
    async (valeur) => {
      await get('job-1', `?pointsDepuis=${valeur}`);
      // Ce qui part vers le scraper ne doit jamais venir directement de l'URL
      // du navigateur : un curseur incohérent se traduit par « donne-moi tout ».
      expect(String(mockFetch.mock.calls[0][0])).toBe('http://203.0.113.7:3000/crawl/job-1');
    },
  );

  it('relaie la grille, les tuiles et les points du scraper', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...STATUT_AMONT,
          status: 'running',
          grille: {
            latitudes: [45.9, 45.8],
            longitudes: [1.2, 1.3],
            rangees: 1,
            colonnes: 1,
            total: 1,
            tileStep: 0.1,
            source: 'openstreetmap',
          },
          tuiles: [2],
          points: [{ nom: 'Plomberie A', lat: 45.85, lng: 1.25, nouveau: true, tuile: 1 }],
          pointsDepuis: 4,
          pointsTotal: 5,
        }),
        { status: 200 },
      ),
    );
    const data = await (await get('job-carte', '?pointsDepuis=4')).json();
    expect(data.grille).toMatchObject({ total: 1, source: 'openstreetmap' });
    expect(data.tuiles).toEqual([2]);
    expect(data.points).toHaveLength(1);
    expect(data.pointsDepuis).toBe(4);
    expect(data.pointsTotal).toBe(5);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await GET(
      new Request('http://localhost/api/gmaps/job/job-1'),
      { params: Promise.resolve({ jobId: 'job-1' }) },
    );
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
