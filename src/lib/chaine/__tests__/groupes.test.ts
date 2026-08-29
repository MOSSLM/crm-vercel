/**
 * Les groupes de la chaîne — et les deux propriétés qui les rendent lisibles.
 *
 * EXCLUSIFS : une fiche tombe dans un groupe et un seul. EXHAUSTIFS : la somme
 * des groupes égale l'effectif. Sans ces deux-là, on retombe sur le tableau de
 * filtres qu'on cherche à remplacer — celui dont on additionne les colonnes
 * sans jamais retrouver le total.
 *
 * Le reste des cas tient en une phrase : c'est l'ORDRE qui est la règle, donc
 * ce sont les priorités entre groupes qu'on teste, pas chaque champ isolément.
 */
import {
  GROUPES,
  attentes,
  classer,
  compter,
  gestesDisponibles,
  groupe,
  type FaitsFiche,
} from "@/lib/chaine/groupes";

/** Une fiche arrivée au bout : tout est fait, rien n'est attendu. */
const complete: FaitsFiche = {
  metier_de_cote: false,
  statut_site: "present",
  origine_statut: "constat",
  enrichie: true,
  champs_manquants: false,
  a_logo: true,
  site_existe: true,
  site_pret: true,
  a_vignette: true,
  a_plaquette: true,
  a_proprietaire: true,
  en_sequence: true,
  garee: false,
  demarchee: false,
};

const fiche = (patch: Partial<FaitsFiche> = {}): FaitsFiche => ({
  ...complete,
  ...patch,
});

describe("classer", () => {
  it("range une fiche complète en séquence", () => {
    expect(classer(complete)).toBe("en_sequence");
  });

  it("ne fait jamais redescendre une fiche déjà démarchée", () => {
    // Le piège que `aDemarcher` documente côté pipeline : un prospect touché à
    // qui il manque une vignette repartirait dans le stock, et on lui
    // renverrait l'accroche.
    expect(
      classer(
        fiche({ demarchee: true, a_vignette: false, origine_statut: "aucune" }),
      ),
    ).toBe("demarchee");
  });

  it("met de côté AVANT de lisser et d'enrichir", () => {
    // Placé haut exprès : lisser puis enrichir une fiche qu'on écartera au bout
    // dépense un appel LLM — le poste le plus cher de la chaîne.
    expect(
      classer(
        fiche({
          metier_de_cote: true,
          origine_statut: "aucune",
          enrichie: false,
        }),
      ),
    ).toBe("metier_de_cote");
  });

  it("n'écarte JAMAIS une fiche déjà démarchée, même mise de côté", () => {
    // Ce qui est parti est parti. La rendre au stock ferait rappeler quelqu'un
    // à qui on a déjà écrit.
    expect(classer(fiche({ metier_de_cote: true, demarchee: true }))).toBe(
      "demarchee",
    );
  });

  it("la présence du métier suffit — pas d'exception « il fait aussi de la clim »", () => {
    // Règle du propriétaire : « isolation les exclut pour le moment, c'est un
    // service FORT, on peut pas présenter un site démo sans ça. » Une fiche
    // parfaitement prête, avec démo et plaquette, sort quand même.
    expect(classer(fiche({ metier_de_cote: true }))).toBe("metier_de_cote");
  });

  it("distingue les trois états du site — et « jamais regardée » n'est pas « absent »", () => {
    expect(classer(fiche({ statut_site: "absent" }))).toBe("sans_site");
    expect(classer(fiche({ statut_site: "present" }))).toBe("en_sequence");
  });

  it("« jamais regardée » et « regardée sans conclure » ne se lisent pas dans le même champ", () => {
    // La vue ne rend JAMAIS null : sans constat ni colonne elle rend 'inconnu'
    // avec l'origine 'aucune'. Lire le seul statut fondrait les 206 fiches
    // jamais regardées du lot 2 avec les 13 sur lesquelles un outil a séché.
    expect(
      classer(fiche({ statut_site: "inconnu", origine_statut: "aucune" })),
    ).toBe("a_lisser");
    expect(
      classer(fiche({ statut_site: "inconnu", origine_statut: "constat" })),
    ).toBe("site_inconnu");
  });

  it("laisse passer une présence qui ne vient que de la colonne", () => {
    // 279 fiches du lot 2 : le CRM porte une URL que personne n'a vérifiée.
    // L'edge function n'a besoin que d'une URL, et elle dit quand l'hôte ne
    // répond pas — la bloquer ici arrêterait la moitié du lot sans preuve.
    expect(
      classer(
        fiche({
          statut_site: "present",
          origine_statut: "colonne",
          enrichie: false,
        }),
      ),
    ).toBe("a_enrichir");
  });

  it("n'envoie à l'enrichissement que celles qui ont un site à lire", () => {
    // L'edge function part de `site_web_canonique` : sans URL elle échoue en
    // `home_unreachable_or_empty`. Une fiche sans site n'a rien à y faire.
    expect(classer(fiche({ statut_site: "absent", enrichie: false }))).toBe(
      "sans_site",
    );
    expect(classer(fiche({ statut_site: "present", enrichie: false }))).toBe(
      "a_enrichir",
    );
  });

  it("réclame le logo avant la fiche complète, et la fiche complète avant le site", () => {
    // L'ordre importe : sans logo on ne fabrique pas, donc inutile de réclamer
    // les champs — c'est le geste suivant qui doit s'afficher, pas les deux.
    expect(
      classer(
        fiche({ a_logo: false, champs_manquants: true, site_existe: false }),
      ),
    ).toBe("sans_logo");
    expect(classer(fiche({ champs_manquants: true, site_existe: false }))).toBe(
      "fiche_incomplete",
    );
    expect(classer(fiche({ site_existe: false }))).toBe("a_fabriquer");
  });

  it("sépare le site fabriqué du site prêt", () => {
    expect(classer(fiche({ site_pret: false }))).toBe("site_a_publier");
  });

  it("passe la vignette avant la plaquette", () => {
    expect(classer(fiche({ a_vignette: false, a_plaquette: false }))).toBe(
      "sans_vignette",
    );
    expect(classer(fiche({ a_plaquette: false }))).toBe("sans_plaquette");
  });

  it("distingue « garée » de « en séquence » — c'est le cas des 524", () => {
    // Active, sans échéance : le régulateur exige `next_run_at is not null`.
    // Elle n'attend rien, et aucun écran ne le disait.
    expect(classer(fiche({ garee: true }))).toBe("garee");
    expect(classer(fiche({ en_sequence: false }))).toBe("a_inscrire");
    expect(classer(fiche({ a_proprietaire: false, en_sequence: false }))).toBe(
      "a_attribuer",
    );
  });
});

describe("les groupes forment une partition", () => {
  it("n'a aucune clé en double", () => {
    const cles = GROUPES.map((g) => g.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("classe TOUTE combinaison de faits dans un groupe déclaré", () => {
    // Balayage exhaustif des douze booléens, des quatre états de site et des
    // cinq origines : 2^12 × 4 × 5 = 81 920 fiches. Aucune ne doit tomber hors
    // de `GROUPES`.
    const declarees = new Set(GROUPES.map((g) => g.cle));
    const etats = [null, "present", "absent", "inconnu"];
    const origines = [null, "aucune", "constat", "colonne", "hote_sans_site"];
    let vues = 0;
    for (const statut_site of etats) {
      for (const origine_statut of origines) {
        for (let masque = 0; masque < 2 ** 12; masque += 1) {
          const bit = (i: number) => ((masque >> i) & 1) === 1;
          const cle = classer({
            statut_site,
            origine_statut,
            enrichie: bit(0),
            champs_manquants: bit(1),
            a_logo: bit(2),
            site_existe: bit(3),
            site_pret: bit(4),
            a_vignette: bit(5),
            a_plaquette: bit(6),
            a_proprietaire: bit(7),
            en_sequence: bit(8),
            garee: bit(9),
            demarchee: bit(10),
            metier_de_cote: bit(11),
          });
          expect(declarees.has(cle)).toBe(true);
          vues += 1;
        }
      }
    }
    expect(vues).toBe(81920);
  });
});

describe("compter", () => {
  it("rend TOUS les groupes, y compris ceux à zéro", () => {
    // Un groupe absent se lit « pas mesuré », un groupe à zéro « personne
    // ici ». Faire disparaître la colonne qui vient de se vider effacerait la
    // preuve que le travail a marché.
    const comptes = compter([complete]);
    expect(comptes).toHaveLength(GROUPES.length);
    expect(comptes.find((c) => c.cle === "en_sequence")?.n).toBe(1);
    expect(comptes.find((c) => c.cle === "a_lisser")?.n).toBe(0);
  });

  it("somme exactement à l'effectif", () => {
    const faits = [
      complete,
      fiche({ origine_statut: "aucune" }),
      fiche({ statut_site: "absent" }),
      fiche({ enrichie: false }),
      fiche({ a_logo: false }),
      fiche({ demarchee: true }),
      fiche({ metier_de_cote: true }),
    ];
    const total = compter(faits).reduce((n, c) => n + c.n, 0);
    expect(total).toBe(faits.length);
  });
});

describe("gestesDisponibles", () => {
  it("ne retient que ce qu'un serveur peut faire, et jamais un groupe vide", () => {
    const comptes = compter([
      fiche({ origine_statut: "aucune" }), // a_lisser — serveur
      fiche({ statut_site: "inconnu" }), // site_inconnu — local
      fiche({ a_logo: false }), // sans_logo — humain
      fiche({ a_vignette: false }), // sans_vignette — auto
    ]);
    expect(gestesDisponibles(comptes).map((c) => c.cle)).toEqual(["a_lisser"]);
  });

  it("garde l'ordre de la chaîne", () => {
    const comptes = compter([
      fiche({ a_plaquette: false }),
      fiche({ origine_statut: "aucune" }),
      fiche({ site_existe: false }),
    ]);
    expect(gestesDisponibles(comptes).map((c) => c.cle)).toEqual([
      "a_lisser",
      "a_fabriquer",
      "sans_plaquette",
    ]);
  });
});

describe("attentes", () => {
  it("dit ce qui attend le bureau et ce qui attend un œil", () => {
    const comptes = compter([
      fiche({ statut_site: "inconnu" }),
      fiche({ statut_site: "inconnu" }),
      fiche({ a_logo: false }),
      fiche({ origine_statut: "aucune" }),
    ]);
    const a = attentes(comptes);
    expect(a.local).toBe(2);
    expect(a.humain).toBe(1);
    expect(a.serveur).toBe(1);
  });
});

describe("groupe", () => {
  it("lève sur une clé inconnue plutôt que de rendre undefined", () => {
    // Une clé inconnue est un bug d'appelant : le silence la ferait afficher
    // comme une colonne vide au lieu de la signaler.
    expect(() => groupe("n_importe_quoi" as never)).toThrow(/groupe inconnu/);
  });
});
