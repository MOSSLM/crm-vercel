/**
 * Ce que la vue d'équipe doit garantir.
 *
 * Les deux tests qui comptent sont les deux pièges de l'en-tête du module :
 * « aucun signe » n'est pas « zéro jour », et les tâches écartées ne sont pas
 * des gestes. Les deux sont des erreurs déjà payées ailleurs dans ce CRM.
 */

import {
  LIBELLE_ECARTEES,
  classer,
  joursDepuis,
  lireActivite,
  totaux,
  trierParAttention,
  type LigneActivite,
} from "../activite";

const MAINTENANT = new Date("2026-08-27T13:00:00Z");

const ligne = (over: Partial<LigneActivite> = {}): LigneActivite => ({
  agent_id: "a1",
  nom: "Bilal Cacan",
  email: "bilal@example.com",
  role: "freelance",
  taches_en_attente: 38,
  taches_en_retard: 38,
  taches_reportees: 65,
  taches_faites_jour: 0,
  taches_faites_7j: 0,
  taches_faites_total: 125,
  taches_ecartees: 152,
  gestes_7j: 0,
  gestes_total: 472,
  gestes_par_action: { qualify: 80, skip: 85, enrich: 21, regenerate_site: 76 },
  dernier_signe: "2026-08-20T09:17:28Z",
  ...over,
});

describe("lireActivite", () => {
  it("convertit les compteurs, que PostgREST les rende en nombre ou en chaîne", () => {
    // `count(*)` est un bigint : selon la taille il arrive en nombre ou en
    // texte. Un `"38" + 1` vaudrait "381".
    const a = lireActivite(ligne({ taches_en_attente: "38", gestes_total: "472" }), MAINTENANT);
    expect(a.file.enAttente).toBe(38);
    expect(a.gestes.total).toBe(472);
  });

  it("range les gestes dans l'ordre du cycle, pas par fréquence", () => {
    // `skip` (85) est plus fréquent que `qualify` (80) et passe pourtant après :
    // on qualifie avant d'écarter, et un écran qui range par fréquence raconte
    // une autre histoire chaque semaine.
    const a = lireActivite(ligne(), MAINTENANT);
    expect(a.gestes.parAction.map((g) => g.action)).toEqual([
      "qualify",
      "skip",
      "enrich",
      "regenerate_site",
    ]);
  });

  it("garde une action inconnue plutôt que de la perdre", () => {
    const a = lireActivite(ligne({ gestes_par_action: { qualify: 2, chose_nouvelle: 9 } }), MAINTENANT);
    const cles = a.gestes.parAction.map((g) => g.action);
    expect(cles).toContain("chose_nouvelle");
    // Les connues d'abord : l'inconnue passe derrière malgré son nombre.
    expect(cles).toEqual(["qualify", "chose_nouvelle"]);
    expect(a.gestes.parAction[1].libelle).toBe("chose_nouvelle");
  });

  it("n'additionne JAMAIS les tâches écartées au travail fait", () => {
    // 152 écartées, dont on ne sait pas qui les a écartées : quatre chemins de
    // code écrivent ce statut, deux sont des machines. Les verser dans
    // « faites » gonflerait le travail d'un agent d'un chiffre qu'il n'a pas
    // produit.
    const a = lireActivite(ligne(), MAINTENANT);
    expect(a.faites.total).toBe(125);
    expect(a.ecartees).toBe(152);
    expect(LIBELLE_ECARTEES).toMatch(/toutes causes/i);
  });
});

describe("joursSansSigne", () => {
  it("distingue « aucun signe » de « un signe aujourd'hui »", () => {
    // LE PIÈGE. `null` = ce compte n'a jamais rien produit ; `0` = il a produit
    // quelque chose il y a moins de 24 h. Les confondre ferait passer un accès
    // jamais servi pour quelqu'un qui vient de travailler.
    expect(lireActivite(ligne({ dernier_signe: null }), MAINTENANT).joursSansSigne).toBeNull();
    expect(
      lireActivite(ligne({ dernier_signe: "2026-08-27T08:00:00Z" }), MAINTENANT).joursSansSigne,
    ).toBe(0);
  });

  it("ne rend jamais un nombre négatif sur une date à venir", () => {
    expect(joursDepuis("2026-09-01T00:00:00Z", MAINTENANT)).toBe(0);
  });

  it("ignore une date illisible plutôt que de rendre NaN", () => {
    expect(joursDepuis("pas une date", MAINTENANT)).toBeNull();
  });
});

describe("classer", () => {
  it("sépare les quatre états", () => {
    const de = (signe: string | null) => classer(lireActivite(ligne({ dernier_signe: signe }), MAINTENANT));
    expect(de("2026-08-27T08:00:00Z")).toBe("aujourdhui");
    expect(de("2026-08-24T08:00:00Z")).toBe("cette_semaine");
    expect(de("2026-08-10T08:00:00Z")).toBe("en_sommeil");
    expect(de(null)).toBe("jamais");
  });

  it("compte des jours PLEINS : le sommeil commence au huitième", () => {
    // `joursSansSigne` est un plancher, pas un arrondi — sept jours et une
    // minute font encore « sept jours ». C'est voulu : le libellé dit « plus
    // d'une semaine », et quelqu'un vu il y a sept jours et demi n'a pas
    // disparu. Le basculement est donc franc, au huitième jour plein.
    const de = (signe: string) => classer(lireActivite(ligne({ dernier_signe: signe }), MAINTENANT));
    expect(de("2026-08-20T13:00:00Z")).toBe("cette_semaine"); // pile 7 jours
    expect(de("2026-08-20T12:59:00Z")).toBe("cette_semaine"); // 7 j et 1 min → 7 jours pleins
    expect(de("2026-08-19T13:00:00Z")).toBe("en_sommeil"); // 8 jours pleins
  });
});

describe("trierParAttention", () => {
  it("montre d'abord qui décroche, et jamais un compte jamais servi en tête", () => {
    const liste = [
      lireActivite(ligne({ agent_id: "actif", dernier_signe: "2026-08-27T08:00:00Z" }), MAINTENANT),
      lireActivite(ligne({ agent_id: "jamais", dernier_signe: null }), MAINTENANT),
      lireActivite(ligne({ agent_id: "sommeil", dernier_signe: "2026-08-01T08:00:00Z" }), MAINTENANT),
      lireActivite(ligne({ agent_id: "semaine", dernier_signe: "2026-08-25T08:00:00Z" }), MAINTENANT),
    ];
    expect(trierParAttention(liste).map((a) => a.agentId)).toEqual([
      "sommeil",
      "semaine",
      "actif",
      "jamais",
    ]);
  });

  it("à état égal, le plus de retard passe devant", () => {
    const liste = [
      lireActivite(ligne({ agent_id: "peu", taches_en_retard: 2 }), MAINTENANT),
      lireActivite(ligne({ agent_id: "beaucoup", taches_en_retard: 40 }), MAINTENANT),
    ];
    expect(trierParAttention(liste).map((a) => a.agentId)).toEqual(["beaucoup", "peu"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const liste = [
      lireActivite(ligne({ agent_id: "a", dernier_signe: "2026-08-27T08:00:00Z" }), MAINTENANT),
      lireActivite(ligne({ agent_id: "b", dernier_signe: "2026-08-01T08:00:00Z" }), MAINTENANT),
    ];
    trierParAttention(liste);
    expect(liste.map((a) => a.agentId)).toEqual(["a", "b"]);
  });
});

describe("totaux", () => {
  it("additionne les files, et rien qui ne s'additionne pas", () => {
    const liste = [
      lireActivite(ligne({ taches_en_attente: 38, taches_en_retard: 38, gestes_7j: 3 }), MAINTENANT),
      lireActivite(ligne({ taches_en_attente: 14, taches_en_retard: 14, gestes_7j: 1 }), MAINTENANT),
    ];
    expect(totaux(liste)).toEqual({ enAttente: 52, enRetard: 52, faitesJour: 0, gestes7j: 4 });
  });
});
