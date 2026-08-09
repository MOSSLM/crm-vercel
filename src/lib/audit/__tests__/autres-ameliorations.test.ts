import { autresAmeliorations, classerParForce, phraseAutresAmeliorations } from "../autres-ameliorations";
import type { AuditLu } from "@/lib/audit-site/lecture";

/**
 * Ce que ces tests protègent : la ligne « et X autres améliorations possibles »
 * ne doit jamais annoncer un nombre qu'on ne saurait pas justifier ligne par
 * ligne devant le prospect. Tout écart entre X et le nombre de preuves
 * réellement en échec est un mensonge chiffré.
 */

function audit(preuves: Array<{ cle: string; verdict: string; poids?: number }>): AuditLu {
  return {
    entreprise_id: 1,
    url_analysee: "https://exemple.fr",
    url_finale: "https://exemple.fr",
    http_status: 200,
    bloque: false,
    injoignable: false,
    note_globale: 62,
    libelle: "Perfectible",
    axes: [
      {
        id: "seo",
        note: 62,
        preuves: preuves.map((p) => ({
          cle: p.cle,
          libelle: `Libellé ${p.cle}`,
          valeur: "x",
          seuil: null,
          poids: p.poids ?? 10,
          verdict: p.verdict,
        })),
      },
    ],
    axes_masques: [],
    issue_keys: [],
    alertes: [],
    ttfb_ms: 200,
    chargement_ms: 300,
    poids_octets: 1000,
    capture_url: null,
    note_globale_demo: null,
    analyse_le: null,
    psi_performance: null,
    psi_recupere_le: null,
  } as unknown as AuditLu;
}

describe("autresAmeliorations", () => {
  it("ne compte que les preuves en échec", () => {
    const a = audit([
      { cle: "title", verdict: "probleme" },
      { cle: "canonical", verdict: "ok" },
      { cle: "lang", verdict: "moyen" },
      { cle: "sitemap", verdict: "inconnu" },
    ]);
    // Un « moyen » n'est pas une amélioration chiffrable, un « inconnu » n'est rien.
    expect(autresAmeliorations(a, []).nombre).toBe(1);
  });

  it("retire les preuves déjà défendues par une carte affichée", () => {
    const a = audit([
      { cle: "title", verdict: "probleme" },
      { cle: "description", verdict: "probleme" },
      { cle: "canonical", verdict: "probleme" },
    ]);
    // `weak_title` couvre la preuve `title` : elle ne doit pas être recomptée.
    const r = autresAmeliorations(a, ["weak_title"]);
    expect(r.nombre).toBe(2);
    expect(r.entrees.map((e) => e.cle)).not.toContain("title");
  });

  it("nomme chaque amélioration, pour pouvoir la citer en rendez-vous", () => {
    const a = audit([{ cle: "canonical", verdict: "probleme" }]);
    const e = autresAmeliorations(a, []).entrees;
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ cle: "canonical", libelle: "Libellé canonical", valeur: "x" });
  });

  it("ne dit rien sans analyse, ni sur un site injoignable", () => {
    expect(autresAmeliorations(null, []).nombre).toBe(0);
    const mort = { ...audit([{ cle: "title", verdict: "probleme" }]), injoignable: true };
    expect(autresAmeliorations(mort, []).nombre).toBe(0);
  });

  it("accorde la phrase, et se tait à zéro", () => {
    expect(phraseAutresAmeliorations({ nombre: 0, entrees: [] })).toBeNull();
    expect(phraseAutresAmeliorations({ nombre: 1, entrees: [] })).toContain("1 autre amélioration possible");
    expect(phraseAutresAmeliorations({ nombre: 4, entrees: [] })).toContain("4 autres améliorations possibles");
  });
});

describe("classerParForce", () => {
  it("met devant le constat dont la preuve pèse le plus lourd", () => {
    const a = audit([
      { cle: "canonical", verdict: "probleme", poids: 5 },
      { cle: "viewport", verdict: "probleme", poids: 40 },
    ]);
    // Un site non adaptatif passe devant une adresse canonique manquante.
    expect(classerParForce(["no_canonical", "outdated_or_not_mobile"], a)[0]).toBe(
      "outdated_or_not_mobile",
    );
  });

  it("garde un ordre stable quand aucune mesure ne départage", () => {
    const cles = ["weak_cta", "slow_site"];
    expect(classerParForce(cles, null)).toEqual(classerParForce(cles, null));
  });
});
