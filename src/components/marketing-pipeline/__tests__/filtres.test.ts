/**
 * LA GRAMMAIRE DES CASES À COCHER, ET LES DEUX FAÇONS DE LA RATER.
 *
 *  1. **Un ET partout.** Le tableau se vide dès la deuxième case, et on cesse
 *     d'utiliser la barre. Ce qu'on veut est « OU dans un groupe, ET entre les
 *     groupes » — « sans site OU inconnu » ET « note faible ».
 *  2. **Un groupe vide qui filtre.** Cocher « sans site » sans se prononcer sur
 *     l'audit ne doit écarter aucune ligne au titre de l'audit. Sinon il faut
 *     cocher partout pour voir quoi que ce soit.
 *
 * Et la règle de fond, celle que le CRM a payée : le site du prospect a TROIS
 * états. « vérifié sans site » et « on ne sait pas » sont deux populations, et
 * la seconde n'a rien à faire dans une campagne « création ».
 */
import {
  GROUPES,
  compter,
  passeLesFiltres,
  servicesDe,
  servicesPresents,
  type CleFiltre,
} from "../filtres";
import type { BoardItem } from "../types";

const ligne = (over: Partial<BoardItem>): BoardItem =>
  ({
    id: "x",
    name: "X",
    entreprise_id: 1,
    pipeline_id: null,
    company_name: "X",
    company_url: null,
    logo_url: null,
    ville: null,
    google_url: null,
    google_maps_url: null,
    priorite: null,
    montant: null,
    type: null,
    mrr: null,
    recurrence_months: null,
    tags: null,
    enriched: false,
    enrichment: null,
    project: null,
    site: null,
    audit: null,
    agent: null,
    missing_for_site: [],
    column: 1,
    ...over,
  }) as BoardItem;

const set = (...c: CleFiltre[]) => new Set<CleFiltre>(c);

const avecSite = ligne({ presence_site: { statut: "present", origine: "constat", confiance: "haute" } });
const sansSite = ligne({ presence_site: { statut: "absent", origine: "constat", confiance: "haute" } });
const inconnu = ligne({ presence_site: { statut: "inconnu", origine: "constat", confiance: "faible" } });
const jamaisRegarde = ligne({ presence_site: null });

describe("le site du prospect a trois états, et un quatrième silence", () => {
  it("distingue « vérifié sans site » de « on ne sait pas »", () => {
    expect(passeLesFiltres(sansSite, set("site_absent"))).toBe(true);
    expect(passeLesFiltres(inconnu, set("site_absent"))).toBe(false);
    expect(passeLesFiltres(jamaisRegarde, set("site_absent"))).toBe(false);
  });

  // « Jamais regardé » n'est pas « inconnu » : le premier demande de lancer un
  // lissage, le second qu'un autre outil s'y colle.
  it("ne confond pas « jamais regardé » avec « regardé sans conclure »", () => {
    expect(passeLesFiltres(jamaisRegarde, set("site_jamais_regarde"))).toBe(true);
    expect(passeLesFiltres(inconnu, set("site_jamais_regarde"))).toBe(false);
  });

  it("coche deux états du même groupe = OU", () => {
    const f = set("site_absent", "site_inconnu");
    expect(passeLesFiltres(sansSite, f)).toBe(true);
    expect(passeLesFiltres(inconnu, f)).toBe(true);
    expect(passeLesFiltres(avecSite, f)).toBe(false);
  });
});

describe("entre les groupes, c’est un ET", () => {
  const faible = ligne({
    presence_site: { statut: "present", origine: "constat", confiance: "haute" },
    note_site: { globale: 31, libelle: null, vitesse: null, seo: null, mobile: null, conversion: null, partielle: false },
  });
  const bonne = ligne({
    presence_site: { statut: "present", origine: "constat", confiance: "haute" },
    note_site: { globale: 78, libelle: null, vitesse: null, seo: null, mobile: null, conversion: null, partielle: false },
  });

  it("exige les deux quand deux groupes sont cochés", () => {
    const f = set("site_present", "note_faible");
    expect(passeLesFiltres(faible, f)).toBe(true);
    expect(passeLesFiltres(bonne, f)).toBe(false);
  });

  // LE TEST QUI REND LA BARRE UTILISABLE : un groupe où rien n'est coché ne
  // doit écarter personne.
  it("un groupe sans case cochée ne filtre rien", () => {
    expect(passeLesFiltres(ligne({ audit: null, presence_site: { statut: "absent", origine: "constat", confiance: "haute" } }), set("site_absent"))).toBe(true);
  });

  it("aucune case cochée laisse tout passer", () => {
    expect(passeLesFiltres(avecSite, set())).toBe(true);
    expect(passeLesFiltres(jamaisRegarde, set())).toBe(true);
  });
});

describe("les autres critères", () => {
  it("sépare la démo créée de la démo en ligne", () => {
    const brouillon = ligne({ site: { id: "s", name: null, build_stage: "pret", is_published: false, url: null, is_claude_design: true } });
    const enLigne = ligne({ site: { id: "s", name: null, build_stage: "pret", is_published: true, url: "u", is_claude_design: true } });
    expect(passeLesFiltres(brouillon, set("demo_brouillon"))).toBe(true);
    expect(passeLesFiltres(brouillon, set("demo_publiee"))).toBe(false);
    expect(passeLesFiltres(enLigne, set("demo_publiee"))).toBe(true);
    expect(passeLesFiltres(ligne({}), set("demo_aucune"))).toBe(true);
  });

  // « Rédigé » n'est pas « existe » : c'est `prepare`. Sans cette distinction,
  // 67 documents vides ont déjà été validés en lot.
  it("ne compte comme « rédigé » qu’un audit réellement écrit", () => {
    const vide = ligne({ audit: { id: "a", statut: "draft", pdf_url: null, prepare: false } });
    const ecrit = ligne({ audit: { id: "a", statut: "draft", pdf_url: null, prepare: true } });
    expect(passeLesFiltres(vide, set("audit_redige"))).toBe(false);
    expect(passeLesFiltres(ecrit, set("audit_redige"))).toBe(true);
  });
});

describe("compter", () => {
  it("donne un effectif par case, sur toutes les lignes", () => {
    const c = compter([avecSite, sansSite, sansSite, inconnu, jamaisRegarde]);
    expect(c.site_present).toBe(1);
    expect(c.site_absent).toBe(2);
    expect(c.site_inconnu).toBe(1);
    expect(c.site_jamais_regarde).toBe(1);
    // La somme du groupe « site » égale la population : c'est une partition.
    expect(c.site_present + c.site_absent + c.site_inconnu + c.site_jamais_regarde).toBe(5);
  });

  it("le groupe « note » partitionne lui aussi", () => {
    const c = compter([avecSite, sansSite]);
    expect(c.note_absente).toBe(2);
    expect(c.note_faible + c.note_correcte).toBe(0);
  });
});

describe("le catalogue", () => {
  it("n’a pas deux fois la même clé — sinon un groupe en volerait un autre", () => {
    const cles = GROUPES.flatMap((g) => g.options.map((o) => o.cle));
    expect(new Set(cles).size).toBe(cles.length);
  });
});

/**
 * LES MÉTIERS — un cinquième axe, la même grammaire.
 *
 * Le besoin, mot pour mot : « il y a pas mal d'entreprises qui font isolation
 * par l'extérieur, et rénovation, mais pas clim. Je préférerais mettre dans un
 * segment à part. » C'est-à-dire : plusieurs métiers en OU, combinés en ET avec
 * les autres filtres.
 */
describe("les métiers du prospect", () => {
  const isolant = ligne({ service_tags: ["Isolation des murs par l'extérieur", "Rénovation globale"] });
  const clim = ligne({ service_tags: ["climatisation"] });
  const inconnuMetier = ligne({});

  const ISO = "Isolation des murs par l'extérieur";

  it("ne filtre rien quand aucun métier n'est demandé", () => {
    for (const l of [isolant, clim, inconnuMetier]) {
      expect(passeLesFiltres(l, new Set(), new Set())).toBe(true);
    }
  });

  it("retient une entreprise qui porte le métier demandé, parmi ses autres", () => {
    expect(passeLesFiltres(isolant, new Set(), new Set([ISO]))).toBe(true);
    expect(passeLesFiltres(clim, new Set(), new Set([ISO]))).toBe(false);
  });

  it("écarte une fiche sans métier — c'est une fiche à enrichir, pas un « autre »", () => {
    expect(passeLesFiltres(inconnuMetier, new Set(), new Set([ISO]))).toBe(false);
  });

  it("plusieurs métiers se lisent en OU", () => {
    const deux = new Set([ISO, "climatisation"]);
    expect(passeLesFiltres(isolant, new Set(), deux)).toBe(true);
    expect(passeLesFiltres(clim, new Set(), deux)).toBe(true);
  });

  it("se combine en ET avec les cases — c'est la question de départ", () => {
    // « isolation par l'extérieur ET vérifié sans site »
    const isolantSansSite = ligne({
      service_tags: [ISO],
      presence_site: { statut: "absent", origine: "constat", confiance: "haute" },
    });
    const isolantAvecSite = ligne({
      service_tags: [ISO],
      presence_site: { statut: "present", origine: "constat", confiance: "haute" },
    });
    expect(passeLesFiltres(isolantSansSite, set("site_absent"), new Set([ISO]))).toBe(true);
    expect(passeLesFiltres(isolantAvecSite, set("site_absent"), new Set([ISO]))).toBe(false);
  });

  /**
   * ON NE NORMALISE PAS. « climatisation » et « Installateur climatisation »
   * sont deux étiquettes distinctes en base : les fondre inventerait une
   * population que personne ne retrouverait en SQL.
   */
  it("ne rapproche pas deux libellés voisins", () => {
    const autre = ligne({ service_tags: ["Installateur climatisation"] });
    expect(passeLesFiltres(autre, new Set(), new Set(["climatisation"]))).toBe(false);
  });

  it("compte les métiers présents, du plus porté au moins porté", () => {
    const presents = servicesPresents([isolant, clim, ligne({ service_tags: ["climatisation"] })]);
    expect(presents).toEqual([
      { service: "climatisation", n: 2 },
      { service: ISO, n: 1 },
      { service: "Rénovation globale", n: 1 },
    ]);
  });

  it("rend un tableau vide pour une fiche sans métier — jamais `undefined`", () => {
    expect(servicesDe(inconnuMetier)).toEqual([]);
  });
});
