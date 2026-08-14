import { noteDocument, baseDocument, PLAFOND_SANS_CONTENU, POIDS_DOCUMENT } from "../malus";
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

describe("la note part de la moyenne des axes affichés", () => {
  it("laisse la base intacte quand rien ne manque", () => {
    const r = noteDocument(74, siteImpeccable());
    expect(r.note).toBe(74);
    expect(r.base).toBe(74);
    expect(r.lignes).toEqual([]);
  });

  it("ne publie AUCUNE note sans axe publiable", () => {
    // On ne montre pas au prospect un chiffre qu'on n'a pas mesuré : sans un
    // seul axe affiché, il n'y a rien à moyenner et rien à publier.
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
  const siteIndefendable = () => ({
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

  /**
   * LE PLANCHER A ÉTÉ REMPLACÉ PAR UN PLAFOND, et l'échange n'est pas neutre.
   *
   * Le plancher à 35 protégeait les mauvais sites — il refusait d'écrire 12/100
   * pour ne pas vexer. Mais le défaut coûteux était l'inverse : un site vide qui
   * charge vite décrochait 67, PageSpeed récompensant le vide. On protégeait
   * donc les indéfendables et on récompensait les bâclés.
   *
   * Le plafond fait l'inverse et la note redevient un diagnostic : elle descend
   * là où le site le mérite, et elle ne monte plus sur du vent.
   */
  it("laisse la note descendre : un site indéfendable n'est plus protégé", () => {
    const r = noteDocument(20, siteIndefendable());
    expect(r.note).toBeLessThan(20);
    expect(r.plafondAtteint).toBe(false);
    // Les constats restent tous là : la note borne le chiffre, pas le diagnostic.
    expect(r.lignes.length).toBeGreaterThan(7);
  });

  it("ne descend jamais sous zéro", () => {
    expect(noteDocument(3, siteIndefendable()).note).toBe(0);
  });

  /**
   * Le cas qui a motivé le plafond : rapide, propre, et vide.
   *
   * Rapidité 100, référencement technique 85, accessibilité 95 portent la
   * moyenne à près de 70 alors que le site ne dit rien de l'entreprise. Le
   * plafond le ramène à 50 — pas pour punir, pour cesser de récompenser.
   */
  it("plafonne un site sans contenu, quelle que soit sa vitesse", () => {
    const r = noteDocument(88, siteImpeccable(), {}, 15);
    expect(r.note).toBe(PLAFOND_SANS_CONTENU);
    expect(r.plafondAtteint).toBe(true);
  });

  it("ne plafonne pas quand le contenu n'a pas été relevé", () => {
    // Une absence de mesure n'est pas un mauvais contenu. Sans ce garde-fou,
    // tout dossier non préparé tomberait à 50 sans que rien ne l'ait constaté.
    expect(noteDocument(88, siteImpeccable(), {}, null).note).toBeGreaterThan(PLAFOND_SANS_CONTENU);
  });

  it("ne plafonne pas un contenu correct", () => {
    expect(noteDocument(88, siteImpeccable(), {}, 72).note).toBeGreaterThan(PLAFOND_SANS_CONTENU);
  });

  it("ignore le nombre d'avis Google : la note parle du SITE", () => {
    // Règle ancienne qu'une première version de ce barème avait emportée. Le
    // nombre d'avis reçus ne se répare pas en achetant un site.
    const sans = noteDocument(70, siteImpeccable());
    const avecPeuDAvis = noteDocument(70, siteImpeccable(), { nombreAvis: 1, noteMoyenne: 2.4 });
    expect(avecPeuDAvis.note).toBe(sans.note);
  });
});

/**
 * La base, c'est-à-dire ce que le prospect peut refaire de tête.
 *
 * L'INCOHÉRENCE QUE CES TESTS FERMENT. La note valait la seule catégorie
 * performance de Google, moins des malus. Sur un dossier réel — Air et Vie —
 * cela donnait 35 en gros au-dessus d'une carte « Visibilité sur Google · 100 ».
 * Le document invitait à une addition qui ne retombait jamais sur son propre
 * chiffre, et un prospect qui fait cette addition cesse de croire le reste.
 */
describe("la base : moyenne pondérée des axes AFFICHÉS", () => {
  it("moyenne les axes publiés, pondérés", () => {
    // 100×25 + 50×20 = 3500, sur 45 points de poids ⇒ 78.
    expect(baseDocument([
      { id: "vitesse", note: 100 },
      { id: "seo", note: 50 },
    ])).toBe(78);
  });

  it("normalise sur les axes présents : un axe absent ne vaut pas zéro", () => {
    // On ne punit jamais un site pour ce qu'on n'a pas su regarder — la règle
    // de tout ce module, appliquée aussi à la note du document.
    const seul = baseDocument([{ id: "vitesse", note: 60 }]);
    expect(seul).toBe(60);
  });

  it("ignore les axes à poids nul, qui s'affichent sans peser", () => {
    // La notoriété ne se répare pas en achetant un site ; les bonnes pratiques
    // de Lighthouse ne se racontent pas à un artisan. Les deux restent visibles.
    const avec = baseDocument([
      { id: "vitesse", note: 60 },
      { id: "popularite", note: 0 },
      { id: "bonnes_pratiques", note: 100 },
    ]);
    expect(avec).toBe(60);
  });

  it("rend null quand aucun axe pesant n'a été publié", () => {
    expect(baseDocument([{ id: "popularite", note: 90 }])).toBeNull();
    expect(baseDocument([])).toBeNull();
  });

  /**
   * Le poids de `mobile` et celui d'`accessibilite` sont égaux, et ce n'est pas
   * un hasard : notre axe mobile ne sort que si Google n'a pas rendu
   * l'accessibilité, qui dit la même chose en mieux. Deux poids différents
   * feraient bouger la note selon que Lighthouse a abouti ou non, sur un site
   * inchangé.
   */
  it("donne le même poids à l'axe mobile et à l'accessibilité qui le remplace", () => {
    expect(POIDS_DOCUMENT.mobile).toBe(POIDS_DOCUMENT.accessibilite);
  });

  it("met le poids sur ce que l'offre répare", () => {
    expect(POIDS_DOCUMENT.contenu + POIDS_DOCUMENT.conversion).toBe(40);
    expect(POIDS_DOCUMENT.popularite).toBe(0);
    expect(POIDS_DOCUMENT.bonnes_pratiques).toBe(0);
  });
});
