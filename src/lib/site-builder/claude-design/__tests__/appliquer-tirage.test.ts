/**
 * @jest-environment node
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appliquerTiragePourSite } from "../appliquer-tirage";
import { sansDoublon, urlsVisibles, type SlotTire } from "../tirage-entreprise";
import { parseImageSet } from "../image-set";

/**
 * LA RÉGRESSION QUE CE FICHIER GARDE.
 *
 * Le 12/08/2026, 34 sites ont été refaits depuis un modèle une heure et demie
 * après leur tirage de photos. La refonte SUPPRIME les pages et les réinsère
 * depuis le gabarit : les 34 se sont retrouvés avec la bande du gabarit, octet
 * pour octet — photos hors métier, doublons de retour, et deux images entre
 * temps supprimées de la médiathèque qui pointaient dans le vide.
 *
 * Le tirage appartient désormais à l'entreprise. Ce que ces tests vérifient,
 * c'est qu'il REVIENT sur des pages recréées, qu'il revient FIGÉ (une seule
 * candidate, donc plus de re-résolution au rendu), qu'une photo disparue est
 * remplacée au lieu d'être servie morte, et qu'aucun doublon ne passe.
 */

const SECTION_ID = "s-realisations";
const HTML = `
<section class="section">
  <div class="track">
    <figure class="hcard"><div class="ph"><img id="realisation-1" src="tpl-1.jpg" alt="Chantier 1"></div></figure>
    <figure class="hcard"><div class="ph"><img id="realisation-2" src="tpl-2.jpg" alt="Chantier 2"></div></figure>
    <figure class="hcard"><div class="ph"><img id="realisation-3" src="tpl-3.jpg" alt="Chantier 3"></div></figure>
  </div>
</section>
`;

/** Le JSON du gabarit tel qu'une refonte vient de le recopier : des jeux à
 *  plusieurs candidats, tirés pour personne. */
const OVERRIDES_DU_GABARIT: Record<string, unknown> = {
  "0.0.0.0.0:image_set": {
    kind: "image_set",
    value: JSON.stringify({
      candidates: [
        { url: "https://cdn/gabarit-a.jpg", tags: ["Climatisation"] },
        { url: "https://cdn/gabarit-b.jpg", tags: ["Plomberie"] },
      ],
    }),
  },
  "0.0.1.0.0:image_set": {
    kind: "image_set",
    value: JSON.stringify({ candidates: [{ url: "https://cdn/gabarit-b.jpg", tags: ["Climatisation"] }] }),
  },
};

const TIRAGE: SlotTire[] = [
  { ordre: 1, url: "https://cdn/clim-1.jpg", alt: "Clim en séjour", tag: "Climatisation", masque: false },
  { ordre: 2, url: "https://cdn/plomb-1.jpg", alt: "Salle de bain", tag: "Plomberie", masque: false },
  { ordre: 3, url: "https://cdn/clim-2.jpg", alt: "Groupe extérieur", tag: "Climatisation", masque: false },
];

interface Ecriture {
  table: string;
  payload: Record<string, unknown>;
}

interface Options {
  tirage?: SlotTire[];
  /** URLs encore présentes dans la médiathèque. Par défaut : toutes celles du
   *  tirage — le cas nominal d'une refonte. */
  vivantes?: string[];
  /** La médiathèque dans laquelle une remplaçante sera cherchée. */
  bibliotheque?: Array<{ id: string; public_url: string; service_tags: string[]; alt_text: string | null }>;
  isTemplate?: boolean;
}

/** Client Supabase minimal : le chaînage exact dont `appliquerTiragePourSite`
 *  se sert, et un journal des écritures pour les vérifier. */
function fakeClient(opts: Options = {}) {
  const tirage = opts.tirage ?? TIRAGE;
  const vivantes = new Set(opts.vivantes ?? tirage.map((s) => s.url));
  const bibliotheque = opts.bibliotheque ?? [];
  const ecritures: Ecriture[] = [];

  const resultat = (data: unknown) => {
    const payload = { data, error: null };
    const thenable = {
      eq: () => thenable,
      in: () => thenable,
      order: () => thenable,
      limit: () => thenable,
      contains: () => thenable,
      single: async () => ({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
      maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(payload).then(resolve),
    };
    return thenable;
  };

  const client = {
    from(table: string) {
      return {
        select(_cols?: string) {
          void _cols;
          switch (table) {
            case "sites":
              return resultat({ is_claude_design: true, enterprise_id: 42, is_template: opts.isTemplate === true });
            case "site_section_instances":
              return resultat([
                {
                  id: "inst-home",
                  page_slug: "/",
                  content: {
                    __library: { theme_slug: "claude-designs", section_id: SECTION_ID },
                    __overrides: { ...OVERRIDES_DU_GABARIT },
                  },
                },
              ]);
            case "theme_sections":
              return resultat([{ section_id: SECTION_ID, example_data: { __token_html: HTML } }]);
            case "entreprise_tirages_photos":
              return resultat([
                { entreprise_id: 42, zone_id: "realisations", slots: tirage, seed: 7, tire_le: null },
              ]);
            case "entreprises":
              return resultat({ service_tags: ["Climatisation", "Plomberie"] });
            case "media_library":
              // Deux lectures : la vérification des URLs (`.in`) et la
              // médiathèque complète (`.order().limit()`). La même donnée sert
              // les deux, filtrée par ce que le test déclare vivant.
              return resultat(
                bibliotheque.length > 0
                  ? bibliotheque
                  : [...vivantes].map((u) => ({ id: u, public_url: u, service_tags: [], alt_text: null })),
              );
            default:
              return resultat([]);
          }
        },
        update(payload: Record<string, unknown>) {
          ecritures.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
        upsert(payload: Record<string, unknown>) {
          ecritures.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, ecritures };
}

/** Les overrides que la repose a écrits sur la page. */
function overridesEcrits(ecritures: Ecriture[]): Record<string, { kind?: string; value?: string }> {
  const derniere = [...ecritures].reverse().find((e) => e.table === "site_section_instances");
  const content = derniere?.payload.content as Record<string, unknown> | undefined;
  return (content?.__overrides ?? {}) as Record<string, { kind?: string; value?: string }>;
}

const urlsPosees = (ecritures: Ecriture[]): string[] =>
  Object.entries(overridesEcrits(ecritures))
    .filter(([k]) => k.endsWith(":image_set"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => parseImageSet(v.value ?? "").candidates[0]?.url ?? "");

describe("appliquerTiragePourSite", () => {
  it("repose le tirage de l'entreprise sur des pages revenues au gabarit", async () => {
    const { client, ecritures } = fakeClient();

    const res = await appliquerTiragePourSite(client, "site-1");

    expect(res.applique).toBe(true);
    expect(res.emplacements).toBe(3);
    // Les photos du gabarit ont disparu, celles de l'entreprise sont là.
    expect(urlsPosees(ecritures)).toEqual([
      "https://cdn/clim-1.jpg",
      "https://cdn/plomb-1.jpg",
      "https://cdn/clim-2.jpg",
    ]);
  });

  it("fige la photo : un seul candidat, donc plus rien à re-résoudre au rendu", async () => {
    const { client, ecritures } = fakeClient();

    await appliquerTiragePourSite(client, "site-1");

    for (const [cle, entree] of Object.entries(overridesEcrits(ecritures))) {
      if (!cle.endsWith(":image_set")) continue;
      // Un jeu à plusieurs candidats se re-résout selon les `service_tags` du
      // moment : c'est ce qui faisait bouger les photos sans que personne le
      // demande, et retomber deux emplacements sur la même image.
      expect(parseImageSet(entree.value ?? "").candidates).toHaveLength(1);
    }
  });

  it("remplace une photo supprimée de la médiathèque au lieu de la servir morte", async () => {
    const { client, ecritures } = fakeClient({
      // `plomb-1` a été supprimée : elle n'est plus dans la médiathèque.
      vivantes: ["https://cdn/clim-1.jpg", "https://cdn/clim-2.jpg"],
      bibliotheque: [
        { id: "1", public_url: "https://cdn/clim-1.jpg", service_tags: ["Climatisation"], alt_text: null },
        { id: "2", public_url: "https://cdn/clim-2.jpg", service_tags: ["Climatisation"], alt_text: null },
        { id: "3", public_url: "https://cdn/plomb-2.jpg", service_tags: ["Plomberie"], alt_text: "Douche" },
      ],
    });

    const res = await appliquerTiragePourSite(client, "site-1");

    expect(res.remplacees).toBe(1);
    const posees = urlsPosees(ecritures);
    expect(posees).not.toContain("https://cdn/plomb-1.jpg");
    expect(posees).toContain("https://cdn/plomb-2.jpg");
    // Et le tirage corrigé est réenregistré : la prochaine refonte ne
    // recommencera pas la même recherche de remplaçante.
    const upsert = ecritures.find((e) => e.table === "entreprise_tirages_photos");
    expect(upsert).toBeDefined();
    expect(JSON.stringify(upsert!.payload.slots)).toContain("plomb-2.jpg");
  });

  it("masque la carte plutôt que de doubler une photo quand il ne reste rien", async () => {
    const { client, ecritures } = fakeClient({
      vivantes: ["https://cdn/clim-1.jpg", "https://cdn/clim-2.jpg"],
      // Aucune photo de remplacement disponible : la médiathèque ne porte que
      // les deux déjà posées.
      bibliotheque: [
        { id: "1", public_url: "https://cdn/clim-1.jpg", service_tags: ["Climatisation"], alt_text: null },
        { id: "2", public_url: "https://cdn/clim-2.jpg", service_tags: ["Climatisation"], alt_text: null },
      ],
    });

    const res = await appliquerTiragePourSite(client, "site-1");

    expect(res.masquees).toBe(1);
    const posees = urlsPosees(ecritures).filter(Boolean);
    expect(new Set(posees).size).toBe(posees.length);
    // La carte disparaît de la grille au lieu de laisser un cadre vide.
    expect(Object.keys(overridesEcrits(ecritures)).some((k) => k.endsWith(":remove"))).toBe(true);
  });

  it("ne touche pas à un gabarit : ses jeux servent toutes les entreprises", async () => {
    const { client, ecritures } = fakeClient({ isTemplate: true });

    const res = await appliquerTiragePourSite(client, "tpl-1");

    expect(res.applique).toBe(false);
    expect(ecritures).toHaveLength(0);
  });
});

describe("sansDoublon", () => {
  it("masque la répétition et garde la première occurrence", () => {
    const sortie = sansDoublon([
      { ordre: 1, url: "a.jpg", alt: "", tag: null, masque: false },
      { ordre: 2, url: "b.jpg", alt: "", tag: null, masque: false },
      { ordre: 3, url: "a.jpg", alt: "", tag: null, masque: false },
    ]);

    expect(sortie.map((s) => s.masque)).toEqual([false, false, true]);
    expect(urlsVisibles(sortie)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("classe par ordre, quel que soit l'ordre d'arrivée", () => {
    const sortie = sansDoublon([
      { ordre: 3, url: "c.jpg", alt: "", tag: null, masque: false },
      { ordre: 1, url: "a.jpg", alt: "", tag: null, masque: false },
    ]);

    expect(sortie.map((s) => s.ordre)).toEqual([1, 3]);
  });

  it("laisse masquée une carte que le tirage avait déjà abandonnée", () => {
    const sortie = sansDoublon([
      { ordre: 1, url: "a.jpg", alt: "", tag: null, masque: false },
      { ordre: 2, url: "b.jpg", alt: "", tag: null, masque: true },
    ]);

    expect(sortie[1].masque).toBe(true);
    expect(urlsVisibles(sortie)).toEqual(["a.jpg"]);
  });
});
