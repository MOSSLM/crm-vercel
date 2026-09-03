/**
 * CE QUE CE FICHIER TIENT : un classement d'août ne doit pas se lire comme un
 * fait d'aujourd'hui — ni à l'œil sur la ligne, ni à voix haute au téléphone.
 *
 * La cohorte est figée le jour du démarchage et jamais reprise ;
 * l'enrichissement, lui, continue de tourner et finit par trouver le site.
 * Mesuré le 03/09/2026 sur la file vivante : **70 des 74 lignes classées
 * « sans site » portent une URL** — 63 sur un domaine propre, 7 sur une page
 * gratuite. L'étiquette a donc tort 19 fois sur 20, et l'argument qu'elle porte
 * (« il n'a rien en ligne, on lui montre le sien ») est un script faux qu'un
 * agent lit à voix haute avant de le découvrir au téléphone.
 */
import {
  argumentDeCohorte,
  cohorteContredite,
  COHORTE_INFO,
  COHORTE_ORDER,
} from "../cohortes";

describe("cohorteContredite — quand le classement a tort", () => {
  it("dément « sans site » dès qu'une URL est en base", () => {
    expect(cohorteContredite("B_sans_site", "present")).toBe(true);
  });

  it("dément « site faible » quand l'absence a été CONSTATÉE", () => {
    // Le cas symétrique : il n'y a pas de site à auditer, donc pas d'audit à
    // envoyer. Zéro ligne dans ce cas au 03/09/2026, mais la règle est la même.
    expect(cohorteContredite("A_site_faible", "absent")).toBe(true);
  });

  it("ne dément RIEN sur un site jamais vérifié", () => {
    // « personne n'a regardé » n'est pas « il a un site ». Traiter les 34 244
    // fiches jamais vérifiées comme des démentis ferait clignoter un
    // avertissement sur toute la file — et il ne voudrait plus rien dire.
    for (const c of COHORTE_ORDER) expect(cohorteContredite(c, "inconnu")).toBe(false);
  });

  it("ne dément rien quand la fiche confirme le classement", () => {
    expect(cohorteContredite("B_sans_site", "absent")).toBe(false);
    expect(cohorteContredite("A_site_faible", "present")).toBe(false);
  });

  it("ne dit rien hors campagne, ni sans état de site", () => {
    expect(cohorteContredite(null, "present")).toBe(false);
    expect(cohorteContredite("B_sans_site", null)).toBe(false);
  });
});

describe("argumentDeCohorte — le script, corrigé par la fiche du jour", () => {
  it("rend l'accroche de la cohorte quand rien ne la dément", () => {
    expect(argumentDeCohorte("B_sans_site", "absent")).toBe(COHORTE_INFO.B_sans_site.argument);
    expect(argumentDeCohorte("A_site_faible", "inconnu")).toBe(COHORTE_INFO.A_site_faible.argument);
  });

  it("REMPLACE le script quand il est faux, au lieu de le nuancer", () => {
    // Ce qu'on ne veut surtout pas : l'ancien texte suivi d'un « mais ». On lit
    // ces lignes en composant le numéro, et la première phrase est celle qui
    // sort de la bouche.
    const dit = argumentDeCohorte("B_sans_site", "present")!;
    expect(dit).not.toContain(COHORTE_INFO.B_sans_site.argument);
    expect(dit).toContain("URL");
    expect(dit.startsWith("⚠")).toBe(true);
  });

  it("ne devine PAS l'autre script à la place", () => {
    // « il a une URL » ne dit pas que son site est faible, et l'audit qui va
    // avec la cohorte A n'existe pas forcément. On envoie regarder, on ne
    // fabrique pas un argument sur une déduction.
    const dit = argumentDeCohorte("B_sans_site", "present")!;
    expect(dit).not.toContain(COHORTE_INFO.A_site_faible.argument);
  });

  it("rend `null` hors campagne — l'appelant écrit sa propre phrase", () => {
    expect(argumentDeCohorte(null, "present")).toBeNull();
  });
});

describe("les libellés de ligne", () => {
  it("annoncent un CLASSEMENT, jamais un constat", () => {
    // C'est ce mot qui empêche « a un site » et « classé sans site » de se lire
    // comme deux affirmations concurrentes sur la même ligne.
    for (const c of COHORTE_ORDER) {
      expect(COHORTE_INFO[c].court.startsWith("classé ")).toBe(true);
      expect(COHORTE_INFO[c].long).toContain("au démarchage");
    }
  });

  it("tiennent dans une ligne de file — trois mots au maximum", () => {
    // 286 px, et l'étiquette n'est jamais seule sur sa ligne.
    for (const c of COHORTE_ORDER) {
      expect(COHORTE_INFO[c].court.split(" ").length).toBeLessThanOrEqual(3);
    }
  });
});
