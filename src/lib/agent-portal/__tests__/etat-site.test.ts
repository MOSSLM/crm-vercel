/**
 * AVEC SITE, SANS SITE — et les deux façons de se tromper.
 *
 * Ce fichier tient la couture entre `etatSiteDe` et
 * `v_entreprises_presence_site`, dont il recopie la règle. Les cas ne sont pas
 * inventés : chacun a été compté en base le 01/09/2026 sur la file de
 * démarchage, et c'est ce qui décide lesquels méritent un test.
 */
import { countByEtatSite, etatSiteDe, normaliserUrlSite } from "@/lib/agent-portal/etat-site";

describe("etatSiteDe — l'URL fait foi, le constat parle à défaut", () => {
  /**
   * SEPT TÂCHES de la file portent `site_web_canonique = ''`, et SIX d'entre
   * elles portent un constat « absent ». Un `is not null` les rangerait donc
   * « avec site » contre leur propre constat — et l'agent appellerait un artisan
   * qui n'a rien en ligne en croyant qu'il a un site à critiquer.
   */
  it("ne prend pas la chaîne vide pour une URL", () => {
    expect(etatSiteDe("", "absent")).toBe("absent");
    expect(etatSiteDe("   ", "absent")).toBe("absent");
    expect(etatSiteDe("", null)).toBe("inconnu");
  });

  it("laisse l'URL en base l'emporter sur un vieux constat d'absence", () => {
    // Le constat date d'avant que quelqu'un trouve le site : la fiche a raison.
    expect(etatSiteDe("https://plombier-annecy.fr", "absent")).toBe("present");
  });

  /**
   * Le bot a trouvé un site que personne n'a recopié sur la fiche : trois cas
   * dans la file au 01/09/2026. Ce n'est pas une raison pour aller lui vendre
   * son premier site.
   */
  it("croit un constat « present » même sans URL sur la fiche", () => {
    expect(etatSiteDe(null, "present")).toBe("present");
  });

  /**
   * LA DISTINCTION QUI JUSTIFIE TOUT LE RESTE : 74 absences confirmées en base
   * contre 34 244 fiches jamais regardées. Sans elle, on promet au téléphone
   * quatre cent cinquante fois ce qu'on peut démontrer.
   */
  it("sépare « cherché et non trouvé » de « personne n'a regardé »", () => {
    expect(etatSiteDe(null, "absent")).toBe("absent");
    expect(etatSiteDe(null, "inconnu")).toBe("inconnu");
    expect(etatSiteDe(null, null)).toBe("inconnu");
  });

  it("retombe sur « inconnu » devant un état qu'il ne connaît pas", () => {
    // Une valeur venue d'une future migration ne doit pas se lire comme une
    // absence : « je ne sais pas » est le seul repli honnête.
    expect(etatSiteDe(null, "peut_etre")).toBe("inconnu");
    expect(etatSiteDe(undefined, undefined)).toBe("inconnu");
  });
});

describe("countByEtatSite — ce que les pastilles annoncent", () => {
  it("compte les trois états et ignore les lignes sans état", () => {
    expect(
      countByEtatSite([
        { etat_site: "present" },
        { etat_site: "absent" },
        { etat_site: "absent" },
        { etat_site: null },
        {},
      ]),
    ).toEqual({ present: 1, absent: 2, inconnu: 0 });
  });
});

/**
 * L'adresse se saisit en écoutant quelqu'un l'épeler au téléphone. Ce qui est
 * testé ici, c'est la frontière entre « il a mal tapé, on rattrape » et « ce
 * n'est pas une adresse, on refuse » — une saisie fautive écrite en base
 * sortirait la fiche du stock « sans site » sans que rien ne le signale.
 */
describe("normaliserUrlSite — rattraper la frappe, refuser le reste", () => {
  it("ajoute le schéma qui manque et met l'hôte en minuscules", () => {
    expect(normaliserUrlSite("plombier-annecy.fr")).toBe("https://plombier-annecy.fr");
    expect(normaliserUrlSite("  WWW.Plombier-Annecy.FR  ")).toBe("https://www.plombier-annecy.fr");
  });

  it("garde le chemin quand il y en a un, et le laisse tomber quand il est vide", () => {
    expect(normaliserUrlSite("https://exemple.fr/")).toBe("https://exemple.fr");
    expect(normaliserUrlSite("exemple.fr/nos-services")).toBe("https://exemple.fr/nos-services");
  });

  it("ne réécrit pas un http:// délibéré en https://", () => {
    // Beaucoup de sites d'artisans n'ont pas de certificat : forcer https
    // rendrait un lien mort, et c'est justement le genre de constat qu'on
    // vient poser.
    expect(normaliserUrlSite("http://exemple.fr")).toBe("http://exemple.fr");
  });

  it("refuse ce qui n'est pas une adresse", () => {
    expect(normaliserUrlSite("plombier")).toBeNull();
    expect(normaliserUrlSite("il n'en a pas")).toBeNull();
    expect(normaliserUrlSite("")).toBeNull();
    expect(normaliserUrlSite(null)).toBeNull();
  });

  it("refuse les schémas qui ne sont pas du web", () => {
    expect(normaliserUrlSite("javascript:alert(1)")).toBeNull();
    expect(normaliserUrlSite("mailto:contact@exemple.fr")).toBeNull();
  });
});
