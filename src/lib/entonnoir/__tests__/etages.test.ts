import {
  AGES,
  compterSorties,
  construireEntonnoir,
  lectureParAge,
  lireCohorte,
  type CleEtage,
  type Cohorte,
  type FaitsEntreprise,
} from "../etages";

const MAINTENANT = new Date("2026-08-26T09:00:00Z");

let prochainId = 1;
const fait = (
  cohorte: Cohorte,
  premiereTouche: string | null,
  atteints: Array<[CleEtage, string | null]> = [],
  sortie: FaitsEntreprise["sortie"] = null,
): FaitsEntreprise => ({
  id: prochainId++,
  nom: `Entreprise ${prochainId}`,
  cohorte,
  premiereTouche,
  atteints: new Map(atteints),
  sortie,
});

const etage = (etages: ReturnType<typeof construireEntonnoir>, cle: CleEtage) =>
  etages.find((e) => e.cle === cle)!;

describe("construireEntonnoir", () => {
  it("compte la perte d'un étage par rapport au précédent", () => {
    const faits = [
      fait("A_site_faible", "2026-08-17T08:00:00Z", [["touchee", "2026-08-17T08:00:00Z"]]),
      fait("A_site_faible", "2026-08-17T08:00:00Z", [
        ["touchee", "2026-08-17T08:00:00Z"],
        ["repondu", "2026-08-18T08:00:00Z"],
      ]),
      fait("A_site_faible", null),
      fait("A_site_faible", null),
    ];

    const etages = construireEntonnoir(faits);

    expect(etage(etages, "ciblee").total).toBe(4);
    expect(etage(etages, "ciblee").perte).toBeNull(); // point de départ
    expect(etage(etages, "touchee").total).toBe(2);
    expect(etage(etages, "touchee").perte).toBe(2);
    expect(etage(etages, "touchee").pertePct).toBe(50);
    expect(etage(etages, "repondu").perte).toBe(1);
    expect(etage(etages, "repondu").depuis).toBe("touchee");
  });

  it("distingue une source muette d'un zéro, et compare l'étage suivant au dernier étage MESURÉ", () => {
    const faits = [
      fait("B_sans_site", "2026-08-20T08:00:00Z", [
        ["touchee", "2026-08-20T08:00:00Z"],
        ["repondu", "2026-08-21T08:00:00Z"],
        ["conversation", "2026-08-22T08:00:00Z"],
      ]),
      fait("B_sans_site", "2026-08-20T08:00:00Z", [["touchee", "2026-08-20T08:00:00Z"]]),
    ];

    const etages = construireEntonnoir(faits, { document_ouvert: "GA4 n'a pas répondu" });

    // Un zéro dirait « personne n'ouvre ses documents » ; `null` dit « on ne sait pas ».
    expect(etage(etages, "document_ouvert").total).toBeNull();
    expect(etage(etages, "document_ouvert").perte).toBeNull();
    expect(etage(etages, "document_ouvert").muette).toBe("GA4 n'a pas répondu");
    // La panne ne troue pas l'entonnoir : « Conversation » se compare à « A répondu ».
    expect(etage(etages, "conversation").depuis).toBe("repondu");
    expect(etage(etages, "conversation").perte).toBe(0);
  });

  it("laisse voir une perte négative — c'est un trou de journalisation, pas un gain", () => {
    const faits = [
      // Signée sans qu'aucune réponse n'ait été enregistrée : l'entonnoir doit
      // le montrer plutôt que de fabriquer une réponse pour rester décroissant.
      fait("A_site_faible", "2026-08-17T08:00:00Z", [
        ["touchee", "2026-08-17T08:00:00Z"],
        ["payee", "2026-08-20T08:00:00Z"],
      ]),
    ];

    const etages = construireEntonnoir(faits);
    expect(etage(etages, "repondu").total).toBe(0);
    expect(etage(etages, "payee").total).toBe(1);
    expect(etage(etages, "payee").perte).toBe(-1);
  });
});

describe("lectureParAge", () => {
  it("n'inclut au dénominateur que les entreprises assez vieilles pour l'âge lu", () => {
    const faits = [
      // Touchée il y a 9 jours : éligible jusqu'à J+7.
      fait("A_site_faible", "2026-08-17T09:00:00Z", [
        ["touchee", "2026-08-17T09:00:00Z"],
        ["repondu", "2026-08-19T09:00:00Z"], // J+2
      ]),
      // Touchée hier : éligible à J+1 seulement.
      fait("A_site_faible", "2026-08-25T09:00:00Z", [["touchee", "2026-08-25T09:00:00Z"]]),
    ];

    const points = lectureParAge(faits, { maintenant: MAINTENANT });
    const point = (jour: number) => points.find((p) => p.jour === jour)!;
    const part = (jour: number, cle: CleEtage) => point(jour).etages.find((e) => e.cle === cle)!;

    expect(points.map((p) => p.jour)).toEqual([...AGES]);
    expect(point(1).eligibles).toBe(2);
    expect(point(3).eligibles).toBe(1);
    expect(point(14).eligibles).toBe(0);

    // À J+1, la réponse du 19 n'a pas encore eu lieu : 0 sur 2.
    expect(part(1, "repondu").total).toBe(0);
    // À J+3, elle a eu lieu — et la jeune entreprise ne dilue pas le taux.
    expect(part(3, "repondu").total).toBe(1);
    expect(part(3, "repondu").part).toBe(100);
    // Sans éligible, un pourcentage serait une division par zéro déguisée.
    expect(part(14, "repondu").part).toBeNull();
  });

  it("sépare les cohortes et tait les étages qu'on ne sait pas dater", () => {
    const faits = [
      fait("A_site_faible", "2026-08-17T09:00:00Z", [
        ["touchee", "2026-08-17T09:00:00Z"],
        ["document_ouvert", "2026-08-18"],
      ]),
      fait("B_sans_site", "2026-08-20T09:00:00Z", [["touchee", "2026-08-20T09:00:00Z"]]),
    ];

    const points = lectureParAge(faits, { maintenant: MAINTENANT });
    const cellule = (cohorte: Cohorte, jour: number, cle: CleEtage) =>
      points.find((p) => p.cohorte === cohorte && p.jour === jour)!.etages.find((e) => e.cle === cle)!;

    expect(cellule("A_site_faible", 3, "touchee").part).toBe(100);
    expect(cellule("B_sans_site", 3, "touchee").part).toBe(100);
    expect(cellule("B_sans_site", 7, "touchee").part).toBeNull(); // pas encore 7 jours
    // GA4 ne voit que 7 jours glissants : dater cette visite avantagerait
    // mécaniquement la cohorte la plus jeune.
    expect(cellule("A_site_faible", 3, "document_ouvert").total).toBeNull();
  });

  it("tait par âge un étage compté mais non datable (journal d'étapes absent)", () => {
    const faits = [
      fait("A_site_faible", "2026-08-17T09:00:00Z", [
        ["touchee", "2026-08-17T09:00:00Z"],
        ["payee", null], // atteint, sans date
      ]),
    ];

    const parAge = lectureParAge(faits, {
      nonDatees: { payee: "opportunite_etapes_journal illisible" },
      maintenant: MAINTENANT,
    });
    expect(parAge.find((p) => p.jour === 7)!.etages.find((e) => e.cle === "payee")!.total).toBeNull();
    // Le total, lui, reste vrai : l'étape courante suffit à le compter.
    expect(construireEntonnoir(faits).find((e) => e.cle === "payee")!.total).toBe(1);
  });
});

describe("lireCohorte", () => {
  it("n'accepte que les deux cohortes de la campagne", () => {
    expect(lireCohorte("A_site_faible")).toBe("A_site_faible");
    expect(lireCohorte("B_sans_site")).toBe("B_sans_site");
    expect(lireCohorte("C_inventee")).toBeNull();
    expect(lireCohorte(null)).toBeNull();
  });
});

describe("compterSorties", () => {
  it("compte séparément les perdues et les nurturing", () => {
    const faits = [
      fait("A_site_faible", null, [], "perdu"),
      fait("A_site_faible", null, [], "nurturing"),
      fait("A_site_faible", null, [], "nurturing"),
      fait("A_site_faible", null),
    ];
    expect(compterSorties(faits)).toEqual({ perdu: 1, nurturing: 2, total: 3 });
  });
});
