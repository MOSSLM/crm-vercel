import { isRetryableStatus, toSiteAccessible } from "../llm";

/**
 * `site_accessible` décide si un site part en production ou si l'opportunité est
 * routée vers « sans site web ».
 *
 * L'expression précédente — `typeof v === "boolean" ? v : v !== false` — ne
 * s'évaluait qu'en l'absence de booléen, cas où `v !== false` est toujours vrai :
 * elle répondait donc « accessible » à `"false"`, `0`, `"non"`. DeepSeek n'a pas
 * de schéma strict et renvoie volontiers une chaîne, si bien qu'un site en
 * construction pouvait passer pour exploitable.
 */
describe("toSiteAccessible", () => {
  it("respecte un vrai booléen", () => {
    expect(toSiteAccessible(true)).toBe(true);
    expect(toSiteAccessible(false)).toBe(false);
  });

  it("comprend les chaînes négatives — le cas qui passait à travers", () => {
    for (const v of ["false", "FALSE", " false ", "non", "no", "0", "null"]) {
      expect(toSiteAccessible(v)).toBe(false);
    }
  });

  it("comprend les chaînes positives", () => {
    for (const v of ["true", "oui", "yes", "1"]) {
      expect(toSiteAccessible(v)).toBe(true);
    }
  });

  it("traite 0 comme négatif et les autres nombres comme positifs", () => {
    expect(toSiteAccessible(0)).toBe(false);
    expect(toSiteAccessible(1)).toBe(true);
  });

  /**
   * Sur une absence franche on ne bloque pas : l'immense majorité des sites
   * répondent, et refuser sur un champ manquant ferait échouer des
   * enrichissements parfaitement valides.
   */
  it("laisse passer une absence de champ", () => {
    expect(toSiteAccessible(undefined)).toBe(true);
    expect(toSiteAccessible(null)).toBe(true);
  });

  it("laisse passer une graphie inattendue plutôt que de bloquer", () => {
    expect(toSiteAccessible("peut-être")).toBe(true);
  });
});

/**
 * Rejouer un appel LLM coûte de l'argent : on ne le fait que si la cause peut se
 * résoudre d'elle-même.
 */
describe("isRetryableStatus", () => {
  it("réessaie sur un débit dépassé ou une panne serveur", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("réessaie sur une erreur réseau ou une expiration", () => {
    expect(isRetryableStatus(0)).toBe(true);
  });

  /** Le cas DeepSeek qui motivait le retry d'origine : 200 mais contenu vide. */
  it("réessaie sur un 200 au contenu vide", () => {
    expect(isRetryableStatus(200)).toBe(true);
  });

  it("n'insiste pas sur une erreur déterministe", () => {
    // Schéma refusé, modèle inconnu, clé invalide : rejouer paie deux fois la
    // même erreur.
    for (const s of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(s)).toBe(false);
    }
  });
});
