import { noteParMalus, NOTE_PLANCHER } from "../malus";
import type { SignauxSite } from "../types";

/**
 * Ces tests protègent la note que le prospect lit en gros sur la couverture.
 *
 * Deux d'entre eux viennent d'erreurs commises en écrivant ce barème, et
 * rattrapées par des tests plus anciens : un site absent mieux noté que tous
 * ceux qui existent, et la réputation entrée dans une note qui parle du site.
 */

/** Un site correct : rien à retirer. */
function siteImpeccable(): SignauxSite {
  return {
    joignable: true,
    https: true,
    formulaire: true,
    mailto: true,
    telCliquable: true,
    nbCta: 4,
    avisDansLaPage: true,
    widgetAvis: null,
    mentionsLegales: true,
    noindex: false,
    title: "Chauffagiste à Lyon — Dupont",
    metaDescription: "Installation et entretien de chaudières à Lyon depuis 1998.",
    nbImagesSansAlt: 0,
    jsonLdLocalBusiness: true,
    villeDansTitre: true,
  } as unknown as SignauxSite;
}

describe("la note se construit par soustraction", () => {
  it("laisse 100 à un site sans défaut", () => {
    const r = noteParMalus(siteImpeccable());
    expect(r.note).toBe(100);
    expect(r.lignes).toEqual([]);
  });

  it("nomme chaque point retiré — c'est la démonstration", () => {
    const r = noteParMalus({ ...siteImpeccable(), formulaire: false, mailto: false });
    expect(r.lignes).toEqual([{ libelle: "Aucun moyen de vous écrire en ligne", points: 10 }]);
    expect(r.note).toBe(90);
  });

  it("range les malus du plus lourd au plus léger", () => {
    const r = noteParMalus(
      { ...siteImpeccable(), telCliquable: false, jsonLdLocalBusiness: false },
      {},
      13_000,
    );
    expect(r.lignes.map((l) => l.points)).toEqual([35, 10, 2]);
  });
});

describe("le temps d'affichage, seul malus que Google seul peut produire", () => {
  const avec = (lcp: number | null) => noteParMalus(siteImpeccable(), {}, lcp);

  it("suit les paliers", () => {
    expect(avec(2_000).note).toBe(100);
    expect(avec(4_000).note).toBe(95);
    expect(avec(6_000).note).toBe(90);
    expect(avec(9_000).note).toBe(82);
    expect(avec(11_000).note).toBe(75);
    // Le cas réel qui a motivé tout ceci : 18,6 s pour afficher la page.
    expect(avec(18_560).note).toBe(65);
  });

  it("n'existe pas sans mesure Google, et c'est assumé", () => {
    expect(avec(null).note).toBe(100);
    expect(avec(null).lignes).toEqual([]);
  });

  it("dit la valeur mesurée, pas le palier", () => {
    expect(avec(18_560).lignes[0].libelle).toContain("18,6 s");
  });
});

describe("les deux garde-fous", () => {
  it("ne descend pas sous le plancher : on humilie sans convaincre", () => {
    const catastrophe = noteParMalus(
      {
        ...siteImpeccable(),
        https: false,
        formulaire: false,
        mailto: false,
        telCliquable: false,
        nbCta: 0,
        avisDansLaPage: false,
        mentionsLegales: false,
        noindex: true,
        title: "",
        metaDescription: "",
        nbImagesSansAlt: 14,
        jsonLdLocalBusiness: false,
      },
      {},
      20_000,
    );
    expect(catastrophe.note).toBe(NOTE_PLANCHER);
    expect(catastrophe.plancherAtteint).toBe(true);
    // Les constats restent tous là : le plancher borne la note, pas le diagnostic.
    expect(catastrophe.lignes.length).toBeGreaterThan(8);
  });

  it("ne donne pas une bonne note à un site absent", () => {
    // Le piège du barème par soustraction : sans HTML à lire, presque aucun
    // malus ne se déclenche, et le site injoignable ressortait à 90/100 — mieux
    // noté que tous ceux qui existent.
    expect(noteParMalus({ ...siteImpeccable(), joignable: false }).note).toBe(0);
  });
});

describe("la note parle du SITE, pas de la réputation", () => {
  it("ignore le nombre d'avis Google", () => {
    // Règle ancienne que la réécriture a failli emporter : le nombre d'avis
    // reçus ne se répare pas en achetant un site.
    const sans = noteParMalus(siteImpeccable());
    const avecPeuDAvis = noteParMalus(siteImpeccable(), { nombreAvis: 1, noteMoyenne: 2.4 });
    expect(avecPeuDAvis.note).toBe(sans.note);
  });

  it("compte en revanche la ville absente du titre, qui est bien le site", () => {
    const r = noteParMalus({ ...siteImpeccable(), villeDansTitre: false }, { ville: "Lyon" });
    expect(r.note).toBe(97);
  });
});
