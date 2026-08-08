/**
 * Ce que ces tests protègent : la publication fige `published_variables`, donc
 * le logo servi au prospect est décidé une fois pour toutes à cet instant. Deux
 * colonnes le portent et celle du projet prime ; les réparer toutes les deux,
 * sans télécharger deux fois la même image, et sans jamais faire échouer une
 * publication, c'est tout l'objet du module.
 */

import { ensureHostedLogo } from "../ensure-hosted-logo";

jest.mock("@/lib/images/rehost-remote-image", () => ({
  isAlreadyHosted: (_c: unknown, url: string) => url.includes("notre-stockage"),
  rehostRemoteImage: jest.fn(),
}));

import { rehostRemoteImage } from "@/lib/images/rehost-remote-image";

const rehost = rehostRemoteImage as jest.MockedFunction<typeof rehostRemoteImage>;

/** Client réduit aux lectures et écritures que le module effectue. */
function fakeSupabase(rows: {
  entreprise?: { id: number; name: string | null; logo_url: string | null } | null;
  projet?: { id: string; logo_url: string | null } | null;
}) {
  const updates: Array<{ table: string; logo_url: string; id: unknown; matchedOn: string }> = [];

  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: table === "entreprises" ? (rows.entreprise ?? null) : (rows.projet ?? null),
          }),
        }),
      }),
      update: (patch: { logo_url: string }) => {
        const chain = {
          _id: undefined as unknown,
          eq(col: string, val: unknown) {
            if (col === "id") this._id = val;
            else updates.push({ table, logo_url: patch.logo_url, id: this._id, matchedOn: String(val) });
            return this;
          },
          then: (r: (v: unknown) => unknown) => r({ error: null }),
        };
        return chain;
      },
    }),
  };

  return { client: client as never, updates };
}

const ok = (publicUrl: string) =>
  ({ ok: true as const, publicUrl, storagePath: "company/x.webp", bytes: 10, alreadyHosted: false });

beforeEach(() => rehost.mockReset());

describe("ensureHostedLogo", () => {
  it("ne fait rien sans entreprise ni projet", async () => {
    const { client } = fakeSupabase({});
    const res = await ensureHostedLogo(client, { enterpriseId: null, projectId: null });
    expect(res).toEqual({ repaired: [], warnings: [] });
    expect(rehost).not.toHaveBeenCalled();
  });

  it("ne touche pas un logo déjà servi par nous", async () => {
    const { client, updates } = fakeSupabase({
      entreprise: { id: 1, name: "Untel", logo_url: "https://notre-stockage/company/a.webp" },
      projet: { id: "p1", logo_url: "https://notre-stockage/company/a.webp" },
    });

    const res = await ensureHostedLogo(client, { enterpriseId: 1, projectId: "p1" });

    expect(rehost).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(res.warnings).toEqual([]);
  });

  it("ne télécharge qu'une fois quand les deux colonnes portent la même adresse", async () => {
    const partagee = "https://site-client.fr/logo.png";
    const { client, updates } = fakeSupabase({
      entreprise: { id: 1, name: "Untel", logo_url: partagee },
      projet: { id: "p1", logo_url: partagee },
    });
    rehost.mockResolvedValue(ok("https://notre-stockage/company/neuf.webp"));

    const res = await ensureHostedLogo(client, { enterpriseId: 1, projectId: "p1" });

    // Une seule requête réseau, mais les DEUX colonnes réécrites.
    expect(rehost).toHaveBeenCalledTimes(1);
    expect(res.repaired).toEqual([partagee]);
    expect(updates.map((u) => u.table).sort()).toEqual(["entreprises", "lead_magnet_projects"]);
    expect(updates.every((u) => u.logo_url === "https://notre-stockage/company/neuf.webp")).toBe(true);
  });

  it("ne réécrit que les lignes portant encore l'ancienne adresse", async () => {
    const { client, updates } = fakeSupabase({
      entreprise: { id: 7, name: null, logo_url: "https://site-client.fr/logo.png" },
      projet: null,
    });
    rehost.mockResolvedValue(ok("https://notre-stockage/company/neuf.webp"));

    await ensureHostedLogo(client, { enterpriseId: 7, projectId: null });

    // Le second `.eq` cible l'ancienne URL : un logo changé à la main entre
    // temps garde le sien.
    expect(updates[0]).toMatchObject({ id: 7, matchedOn: "https://site-client.fr/logo.png" });
  });

  it("traite les deux adresses quand elles diffèrent", async () => {
    const { client, updates } = fakeSupabase({
      entreprise: { id: 1, name: "Untel", logo_url: "https://site-client.fr/a.png" },
      projet: { id: "p1", logo_url: "https://autre-hote.fr/b.png" },
    });
    rehost
      .mockResolvedValueOnce(ok("https://notre-stockage/company/a.webp"))
      .mockResolvedValueOnce(ok("https://notre-stockage/company/b.webp"));

    const res = await ensureHostedLogo(client, { enterpriseId: 1, projectId: "p1" });

    expect(rehost).toHaveBeenCalledTimes(2);
    expect(res.repaired).toHaveLength(2);
    expect(updates).toHaveLength(2);
  });

  it("répare le logo du projet seul — c'est lui qui prime à l'affichage", async () => {
    const { client, updates } = fakeSupabase({
      entreprise: { id: 1, name: "Untel", logo_url: null },
      projet: { id: "p1", logo_url: "https://site-client.fr/logo.png" },
    });
    rehost.mockResolvedValue(ok("https://notre-stockage/company/neuf.webp"));

    await ensureHostedLogo(client, { enterpriseId: 1, projectId: "p1" });

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("lead_magnet_projects");
  });

  it("n'échoue pas quand l'aspiration rate : la publication doit aller au bout", async () => {
    const { client, updates } = fakeSupabase({
      entreprise: { id: 1, name: "Untel", logo_url: "https://site-client.fr/logo.png" },
      projet: null,
    });
    rehost.mockResolvedValue({ ok: false, error: "HTTP 403" });

    const res = await ensureHostedLogo(client, { enterpriseId: 1, projectId: null });

    expect(res.repaired).toEqual([]);
    expect(updates).toHaveLength(0);
    expect(res.warnings).toHaveLength(1);
    // Le motif nomme l'hôte fautif, pour savoir sur quelle fiche repasser.
    expect(res.warnings[0]).toContain("HTTP 403");
    expect(res.warnings[0]).toContain("site-client.fr");
  });
});
