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
