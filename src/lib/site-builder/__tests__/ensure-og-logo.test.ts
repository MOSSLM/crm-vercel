/**
 * Ce que ces tests protègent : le logo est la seule marque du client sur la
 * carte de partage. Deux défauts s'y jouent, invisibles depuis le CRM —
 *
 *   - le dérivé était réutilisé sans jamais vérifier D'OÙ il venait, donc
 *     corriger le logo d'une fiche ne changeait plus jamais sa vignette ;
 *   - un serveur d'images momentanément indisponible refabriquait la carte
 *     SANS logo par-dessus une carte qui en avait un.
 */

import sharp from "sharp";
import { ensureOgLogo } from "../ensure-og-logo";

jest.mock("@/lib/og/storage", () => ({
  ...jest.requireActual("@/lib/og/storage"),
  putOgAsset: jest.fn(),
}));

import { putOgAsset } from "@/lib/og/storage";

const depot = putOgAsset as jest.MockedFunction<typeof putOgAsset>;

const SITE = "site-1";
const SOURCE = "https://cdn/entreprises/plomberie-durand.webp";
const AUTRE_SOURCE = "https://cdn/entreprises/plomberie-durand-v2.webp";

let PNG_CLAIR: Buffer;
beforeAll(async () => {
  // jsdom ne fournit pas `AbortSignal.timeout` ; le module s'en sert pour borner
  // le téléchargement du logo. Un signal qui ne se déclenche jamais suffit ici.
  if (typeof AbortSignal.timeout !== "function") {
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () =>
      new AbortController().signal;
  }
  PNG_CLAIR = await sharp({
    create: { width: 300, height: 120, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
  })
    .png()
    .toBuffer();
});

/** Client réduit aux `update` sur `sites` que le module effectue. */
function fakeSupabase(colonnesAbsentes: string[] = []) {
  const patches: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        patches.push({ ...patch });
        const manquante = colonnesAbsentes.find((c) => c in patch);
        const res = manquante
          ? { data: null, error: { code: "42703", message: `column sites.${manquante} does not exist` } }
          : { data: null, error: null };
        return { eq: () => ({ then: (r: (v: unknown) => unknown) => r(res) }) };
      },
    }),
  };
  return { client: client as never, patches };
}

function reponseOk(bytes: Buffer) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(reponseOk(PNG_CLAIR));
  global.fetch = fetchMock as unknown as typeof fetch;
  depot.mockReset().mockImplementation(async (_c, opts) => ({
    ok: true,
    publicUrl: `https://cdn/og/${opts.prefix}/${opts.name}-ffff.png`,
    path: `og/${opts.prefix}/${opts.name}-ffff.png`,
    bytes: 10,
  }));
});

/** L'URL qu'aurait produite une première fabrication depuis `source`. */
async function derivePour(source: string): Promise<string> {
  const { client } = fakeSupabase();
  const res = await ensureOgLogo(client, SITE, source);
  return res.url as string;
}

describe("ensureOgLogo", () => {
  it("ne fait rien sans logo sur la fiche", async () => {
    const { client } = fakeSupabase();
    expect(await ensureOgLogo(client, SITE, null)).toEqual({ url: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("réutilise le dérivé quand il vient bien de la source actuelle", async () => {
    const existant = await derivePour(SOURCE);
    fetchMock.mockClear();

    const { client } = fakeSupabase();
    const res = await ensureOgLogo(client, SITE, SOURCE, {
      existingUrl: existant,
      existingSombre: false,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res).toEqual({ url: existant, sombre: false });
  });

  it("refabrique quand le logo de la fiche a changé", async () => {
    // LE DÉFAUT CORRIGÉ : le dérivé de l'ancien logo était réutilisé
    // indéfiniment. Le client envoyait son vrai logo, l'opérateur remplaçait
    // celui de la fiche — et la carte ressortait avec l'ancien.
    const ancien = await derivePour(SOURCE);
    fetchMock.mockClear();

    const { client } = fakeSupabase();
    const res = await ensureOgLogo(client, SITE, AUTRE_SOURCE, {
      existingUrl: ancien,
      existingSombre: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(AUTRE_SOURCE, expect.anything());
    expect(res.url).not.toBe(ancien);
  });

  it("garde le logo précédent quand la source est momentanément injoignable", async () => {
    const ancien = await derivePour(SOURCE);
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const { client } = fakeSupabase();
    const res = await ensureOgLogo(client, SITE, SOURCE, {
      force: true,
      existingUrl: ancien,
      existingSombre: true,
    });

    expect(res.url).toBe(ancien);
    expect(res.sombre).toBe(true);
    expect(res.warning).toContain("conservé");
  });

  it("rend la carte sans logo quand il n'y a rien à conserver", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const { client } = fakeSupabase();

    const res = await ensureOgLogo(client, SITE, SOURCE);

    expect(res.url).toBeNull();
    expect(res.warning).toContain("404");
    expect(res.warning).not.toContain("conservé");
  });

  it("écrit quand même og_logo_url si og_logo_sombre n'existe pas", async () => {
    // Colonne d'une migration plus tardive : sans tolérance, son absence
    // emportait l'URL du logo avec elle.
    const { client, patches } = fakeSupabase(["og_logo_sombre"]);

    const res = await ensureOgLogo(client, SITE, SOURCE);

    expect(res.url).toBeTruthy();
    expect(patches).toHaveLength(2);
    expect(patches[1]).toEqual({ og_logo_url: res.url });
  });

  it("range le dérivé sous un nom qui identifie sa source", async () => {
    const { client } = fakeSupabase();
    await ensureOgLogo(client, SITE, SOURCE);

    const nom = depot.mock.calls[0][1].name;
    expect(nom).toMatch(/^logo-[0-9a-f]{8}$/);

    depot.mockClear();
    await ensureOgLogo(client, SITE, AUTRE_SOURCE);
    expect(depot.mock.calls[0][1].name).not.toBe(nom);
  });
});
