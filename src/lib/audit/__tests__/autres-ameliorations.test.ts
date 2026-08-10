import {
  autresAmeliorations,
  classerParForce,
  forcePreuve,
  phraseAutresAmeliorations,
} from "../autres-ameliorations";
import type { Preuve } from "@/lib/audit-site/types";
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

describe("la force d'une preuve : ce qu'elle pèse × à quel point on la rate", () => {
  const p = (cle: string, poids: number, gravite?: number): Preuve => ({
    cle,
    libelle: cle,
    valeur: 'x',
    seuil: null,
    poids,
    verdict: 'probleme',
    gravite,
  });

  it("range un quasi-succès lourd derrière un échec total plus léger", () => {
    // Le cas réel : ttfb pèse 35, le plus lourd de son axe, mais un serveur à
    // 1,32 s pour un seuil à 0,8 s ne rate que de 120 ms. Le formulaire, lui,
    // est absent — il n'y a pas de « presque de formulaire ».
    expect(forcePreuve(p('ttfb', 35, 0.33))).toBeLessThan(forcePreuve(p('formulaire', 20, 1)));
  });

  it("retombe sur le poids seul quand la gravité manque", () => {
    // Les preuves écrites avant ce champ ne doivent pas se retrouver dernières
    // parce qu'elles sont anciennes.
    expect(forcePreuve(p('vieille', 30))).toBe(30);
  });

  it("classe les constats de FUSTER dans l'ordre qu'un artisan constaterait", () => {
    // Preuves réelles de l'entreprise 274, telles qu'elles sont en base.
    const audit = {
      injoignable: false,
      axes: [
        {
          id: 'vitesse' as const,
          note: 10,
          confiance: 'haute' as const,
          preuves: [p('ttfb', 35, 0.33), p('poids', 25, 0.93)],
        },
        {
          id: 'conversion' as const,
          note: 18,
          confiance: 'haute' as const,
          preuves: [p('tel', 25, 1), p('formulaire', 20, 1), p('avis', 15, 1)],
        },
      ],
    } as unknown as Parameters<typeof classerParForce>[1];

    const ordre = classerParForce(
      ['slow_site', 'phone_not_clickable', 'form_not_accessible', 'no_reviews_on_site'],
      audit,
    );

    // Le téléphone non cliquable ouvre : échec total sur le signal le plus
    // lourd de la conversion.
    expect(ordre[0]).toBe('phone_not_clickable');

    // `slow_site` reste haut, mais PAS pour la raison qu'on croit : il est
    // déclenché par `ttfb` ET par `poids`, et c'est la page à 5,7 Mo (0,93 de
    // gravité) qui le porte, pas le serveur à 1,3 s (0,33). La carte doit donc
    // argumenter sur le poids de la page — écrire « 1,3 s » ferait reposer tout
    // le constat sur sa jambe la plus faible.
    expect(forcePreuve(p('poids', 25, 0.93))).toBeGreaterThan(forcePreuve(p('ttfb', 35, 0.33)));

    // Et le serveur seul, s'il portait le constat, passerait derrière le
    // formulaire absent — ce qui était tout le problème signalé.
    expect(forcePreuve(p('ttfb', 35, 0.33))).toBeLessThan(forcePreuve(p('formulaire', 20, 1)));
  });
});
