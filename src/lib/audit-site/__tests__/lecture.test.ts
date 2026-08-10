import { lireAudit, UNDEFINED_TABLE } from "../lecture";

/**
 * Ces tests protègent trois règles qui, si elles cassent, produisent une page
 * MENSONGÈRE plutôt qu'une page en erreur — donc un défaut qu'on ne verrait pas
 * en recette :
 *
 *   1. un axe en confiance faible n'est jamais publié ;
 *   2. une preuve non mesurée n'est jamais affichée ;
 *   3. quand PageSpeed est frais, il REMPLACE la note vitesse maison — jamais
 *      les deux côte à côte.
 */

type Row = Record<string, unknown>;

function client(reponse: { data: Row | null; error: { code?: string; message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => reponse,
        }),
      }),
    }),
  } as never;
}

const LIGNE_BASE: Row = {
  entreprise_id: 7,
  url_analysee: "https://exemple.fr",
  url_finale: "https://exemple.fr",
  http_status: 200,
  bloque: false,
  injoignable: false,
  note_globale: 62,
  note_vitesse: 64,
  note_seo: 71,
  note_mobile: 55,
  note_conversion: 58,
  confiance: { vitesse: "haute", seo: "haute", mobile: "haute", conversion: "haute" },
  detail: {
    vitesse: [
      { cle: "chargement", libelle: "Temps pour afficher la page", valeur: "1,8 s", seuil: "2,5 s", poids: 30, verdict: "ok" },
      { cle: "cache", libelle: "Mise en cache configurée", valeur: null, seuil: null, poids: 5, verdict: "inconnu" },
    ],
    seo: [],
    mobile: [],
    conversion: [],
  },
  alertes: [],
  issue_keys: ["weak_cta"],
};

describe("lireAudit — table absente", () => {
  it("répond « indisponible » et nomme la migration", async () => {
    const res = await lireAudit(client({ data: null, error: { code: UNDEFINED_TABLE, message: "x" } }), 7);
    expect(res.disponible).toBe(false);
    if (!res.disponible) expect(res.motif).toContain("20260810_audit_site.sql");
  });
});

describe("lireAudit — règle de publication", () => {
  it("retire les axes en confiance faible et les nomme", async () => {
    const row = {
      ...LIGNE_BASE,
      confiance: { vitesse: "haute", seo: "faible", mobile: "haute", conversion: "faible" },
    };
    const res = await lireAudit(client({ data: row, error: null }), 7);
    expect(res.disponible).toBe(true);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    expect(res.audit.axes.map((a) => a.id).sort()).toEqual(["mobile", "vitesse"]);
    // `popularite` est masqué faute de preuves dans cette ligne de test : sans
    // détail, sa note ne se recalcule pas, et un axe sans note ne se publie pas.
    expect(res.audit.axes_masques.sort()).toEqual(["conversion", "popularite", "seo"]);
  });

  it("n'expose jamais une preuve non mesurée", async () => {
    const res = await lireAudit(client({ data: LIGNE_BASE, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    const vitesse = res.audit.axes.find((a) => a.id === "vitesse");
    expect(vitesse?.preuves.map((p) => p.cle)).toEqual(["chargement"]);
    expect(vitesse?.preuves.every((p) => p.valeur !== null)).toBe(true);
  });
});

describe("lireAudit — cohabitation des deux vitesses", () => {
  const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const vieux = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

  it("PSI frais REMPLACE la note maison et se déclare", async () => {
    const row = {
      ...LIGNE_BASE,
      psi_performance: 31,
      psi_recupere_le: hier,
      psi_lcp_ms: 4200,
      psi_cls: 0.31,
      psi_tbt_ms: 850,
    };
    const res = await lireAudit(client({ data: row, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    const vitesse = res.audit.axes.find((a) => a.id === "vitesse");
    expect(vitesse?.note).toBe(31);
    expect(vitesse?.mesureGoogle).toBe(true);
    // Les preuves deviennent les Core Web Vitals, que l'analyseur maison ne
    // mesure pas — c'est bien Google qui parle, pas nous.
    expect(vitesse?.preuves.map((p) => p.cle)).toEqual(["psi_lcp", "psi_cls", "psi_tbt"]);
    // La note maison (64) ne doit apparaître nulle part dans l'axe publié.
    expect(vitesse?.preuves.some((p) => p.valeur === "1,8 s")).toBe(false);
  });

  it("PSI périmé laisse la note maison, sans mention Google", async () => {
    const row = { ...LIGNE_BASE, psi_performance: 31, psi_recupere_le: vieux };
    const res = await lireAudit(client({ data: row, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    const vitesse = res.audit.axes.find((a) => a.id === "vitesse");
    expect(vitesse?.note).toBe(64);
    expect(vitesse?.mesureGoogle).toBeUndefined();
  });

  it("PSI frais rend l'axe vitesse concluant même sur une SPA", async () => {
    // Notre analyseur ne conclut pas sur une SPA ; un vrai navigateur, si.
    const row = {
      ...LIGNE_BASE,
      confiance: { vitesse: "faible", seo: "faible", mobile: "haute", conversion: "faible" },
      psi_performance: 88,
      psi_recupere_le: hier,
      psi_lcp_ms: 1900,
    };
    const res = await lireAudit(client({ data: row, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    expect(res.audit.axes.find((a) => a.id === "vitesse")?.note).toBe(88);
    expect(res.audit.axes_masques).not.toContain("vitesse");
  });
});

/**
 * La règle la plus lourde de conséquences du dispositif : dès que Google a
 * mesuré, nos notes de site ne sont PLUS publiées. Si elle casse, on réaffiche
 * des chiffres maison à côté de ceux de Google — exactement la contradiction
 * qu'on passe ce chantier à éliminer, et elle ne se verrait qu'en rendez-vous.
 */
describe("lireAudit — quand Google a mesuré, nos notes de site s'effacent", () => {
  const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const AVEC_GOOGLE = {
    ...LIGNE_BASE,
    confiance: { vitesse: "haute", seo: "haute", mobile: "haute", conversion: "haute" },
    psi_performance: 47,
    psi_seo: 92,
    psi_accessibilite: 71,
    psi_bonnes_pratiques: 79,
    psi_recupere_le: hier,
    psi_lcp_ms: 4200,
    detail: {
      ...LIGNE_BASE.detail,
      google: [
        {
          id: "render-blocking-insight",
          categorie: "performance",
          titre: "Requêtes de blocage du rendu",
          valeur: "Économies estimées : 3 650 ms",
          gainMs: 3650,
          gainOctets: null,
          elements: 3,
          verdict: "probleme",
        },
        {
          id: "image-alt",
          categorie: "accessibility",
          titre: "Les éléments d'image possèdent des attributs `[alt]`",
          valeur: null,
          gainMs: null,
          gainOctets: null,
          elements: 4,
          verdict: "probleme",
        },
      ],
    },
  };

  it("publie les catégories de Google, et le référencement vient de lui", async () => {
    const res = await lireAudit(client({ data: AVEC_GOOGLE, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    const notes = Object.fromEntries(res.audit.axes.map((a) => [a.id, a.note]));
    expect(notes.vitesse).toBe(47);
    expect(notes.seo).toBe(92); // celle de Google, pas notre 71
    expect(notes.accessibilite).toBe(71);
    expect(notes.bonnes_pratiques).toBe(79);
  });

  it("fait disparaître l'axe mobile — remplacé, pas masqué", async () => {
    const res = await lireAudit(client({ data: AVEC_GOOGLE, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    expect(res.audit.axes.map((a) => a.id)).not.toContain("mobile");
    // Le lister comme masqué ferait croire à une mesure retenue faute de
    // confiance, alors que l'accessibilité de Google dit la même chose en mieux.
    expect(res.audit.axes_masques).not.toContain("mobile");
  });

  it("garde nos axes sur ce que Google ne mesure pas", async () => {
    const res = await lireAudit(client({ data: AVEC_GOOGLE, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    const conversion = res.audit.axes.find((a) => a.id === "conversion");
    expect(conversion?.note).toBe(58);
    expect(conversion?.mesureGoogle).toBeUndefined();
  });

  it("range chaque constat sous son axe", async () => {
    const res = await lireAudit(client({ data: AVEC_GOOGLE, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    expect(res.audit.axes.find((a) => a.id === "vitesse")?.constats?.map((c) => c.id)).toEqual([
      "render-blocking-insight",
    ]);
    expect(res.audit.axes.find((a) => a.id === "accessibilite")?.constats?.map((c) => c.id)).toEqual(
      ["image-alt"],
    );
  });

  it("garde notre note de référencement si Google n'a pas rendu la sienne", async () => {
    const row = { ...AVEC_GOOGLE, psi_seo: null };
    const res = await lireAudit(client({ data: row, error: null }), 7);
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    const seo = res.audit.axes.find((a) => a.id === "seo");
    expect(seo?.note).toBe(71);
    // Un seul chiffre à l'écran : celui-ci est le nôtre, il ne se réclame pas
    // de Google.
    expect(seo?.mesureGoogle).toBeUndefined();
  });

  it("n'expose aucun constat tant que la mesure Google est périmée", async () => {
    const vieux = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const res = await lireAudit(
      client({ data: { ...AVEC_GOOGLE, psi_recupere_le: vieux }, error: null }),
      7,
    );
    if (!res.disponible || !res.audit) throw new Error("audit attendu");

    expect(res.audit.constats_google).toEqual([]);
    expect(res.audit.axes.find((a) => a.id === "vitesse")?.note).toBe(64); // la nôtre
  });
});
