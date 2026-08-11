import { noteDocument, NOTE_PLANCHER } from "../malus";
import type { SignauxSite } from "../types";

/**
 * Ces tests protègent la note que le prospect lit en gros sur la couverture.
 *
 * Deux d'entre eux viennent d'erreurs commises en écrivant ce barème et
 * rattrapées par des tests plus anciens : un site absent mieux noté que tous
 * ceux qui existent, et la réputation entrée dans une note qui parle du site.
 */

/** Un site correct : rien à retirer à la mesure de Google. */
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
    title: "Chauffagiste à Lyon — Dupont",
    metaDescription: "Installation et entretien de chaudières à Lyon depuis 1998.",
    jsonLdLocalBusiness: true,
    villeDansTitre: true,
  } as unknown as SignauxSite;
}

describe("la note part de PageSpeed, pas de nous", () => {
  it("laisse la note de Google intacte quand rien ne manque", () => {
    const r = noteDocument(74, siteImpeccable());
    expect(r.note).toBe(74);
    expect(r.base).toBe(74);
    expect(r.lignes).toEqual([]);
  });

  it("ne publie AUCUNE note sans mesure Google", () => {
    // Le pendant de la décision de ne plus publier nos axes vitesse et mobile
    // sans lui : on ne montre pas au prospect un chiffre qu'on n'a pas mesuré.
    expect(noteDocument(null, siteImpeccable()).note).toBeNull();
    expect(noteDocument(undefined, siteImpeccable()).note).toBeNull();
  });

  it("ne note pas un site injoignable", () => {
    expect(noteDocument(80, { ...siteImpeccable(), joignable: false }).note).toBeNull();
  });
});

describe("les malus n'ajoutent que ce que Google ne voit pas", () => {
  it("retire des points nommés, et garde la base pour la soustraction", () => {
    const r = noteDocument(58, { ...siteImpeccable(), telCliquable: false, nbCta: 0 });
    expect(r.base).toBe(58);
    expect(r.note).toBe(53);
    expect(r.lignes).toEqual([
      { libelle: "Votre numéro ne se compose pas en un clic", points: 3 },
      { libelle: "Presque aucun bouton pour vous contacter", points: 2 },
    ]);
  });

  it("reste petit : un ajustement, pas un second barème", () => {
    // Sur les six sites réels mesurés, le total va de 7 à 18 points. Assez pour
    // compter, pas assez pour écraser la mesure de Google.
    const pire = noteDocument(58, {
      ...siteImpeccable(),
      https: false,
      formulaire: false,
      mailto: false,
      telCliquable: false,
      nbCta: 0,
      avisDansLaPage: false,
      mentionsLegales: false,
      title: "",
      metaDescription: "",
      jsonLdLocalBusiness: false,
    });
    const total = pire.lignes.reduce((a, l) => a + l.points, 0);
    expect(total).toBeLessThanOrEqual(20);
  });

  it("ne compte PAS le temps d'affichage : il est déjà dans la note de Google", () => {
    // La règle « un défaut, un malus ». Le LCP est le cœur de la performance
    // Lighthouse ; l'y ajouter compterait deux fois la même chose.
    const r = noteDocument(30, siteImpeccable());
    expect(r.lignes.map((l) => l.libelle).join(" ")).not.toMatch(/affich|seconde|s’affiche/i);
  });
});

describe("les deux garde-fous", () => {
  it("ne descend pas sous le plancher : on humilie sans convaincre", () => {
    const r = noteDocument(20, {
      ...siteImpeccable(),
      https: false,
      formulaire: false,
      mailto: false,
      telCliquable: false,
      nbCta: 0,
      avisDansLaPage: false,
      mentionsLegales: false,
      title: "",
      metaDescription: "",
      jsonLdLocalBusiness: false,
    });
    expect(r.note).toBe(NOTE_PLANCHER);
    expect(r.plancherAtteint).toBe(true);
    // Les constats restent tous là : le plancher borne la note, pas le diagnostic.
    expect(r.lignes.length).toBeGreaterThan(7);
  });

  it("ignore le nombre d'avis Google : la note parle du SITE", () => {
    // Règle ancienne qu'une première version de ce barème avait emportée. Le
    // nombre d'avis reçus ne se répare pas en achetant un site.
    const sans = noteDocument(70, siteImpeccable());
    const avecPeuDAvis = noteDocument(70, siteImpeccable(), { nombreAvis: 1, noteMoyenne: 2.4 });
    expect(avecPeuDAvis.note).toBe(sans.note);
  });
});
