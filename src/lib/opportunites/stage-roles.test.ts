import { findStageByRole, stageRole } from "./stage-roles";

describe("stageRole", () => {
  // Les libellés du pipeline « Agent SAMA » (sql/20260603_agent_portal_ownership.sql,
  // renommés par sql/20260722_agent_pipeline_premiere_approche.sql).
  it("classe les étapes d'Agent SAMA", () => {
    expect(stageRole("Nouveau lead")).toBe("nouveau");
    expect(stageRole("Première approche")).toBe("approche");
    expect(stageRole("Contacté (appelé)")).toBe("contacte");
    expect(stageRole("En échange")).toBe("contacte");
    expect(stageRole("Intéressé")).toBe("interesse");
    expect(stageRole("RDV calé")).toBe("rdv");
    expect(stageRole("Client signé")).toBe("signe");
    expect(stageRole("Perdu")).toBe("perdu");
  });

  // Ceux du pipeline par défaut (AppDataContext.DEFAULT_PIPELINE_STAGE_NAMES) :
  // c'est là que vivent les affaires historiques, et c'est ce que l'ancienne
  // reconnaissance par nom exact ne voyait pas du tout.
  it("classe les étapes du pipeline par défaut", () => {
    expect(stageRole("Qualifié")).toBe("nouveau");
    expect(stageRole("Approche")).toBe("approche");
    expect(stageRole("Relance 1")).toBe("contacte");
    expect(stageRole("RDV de vente 2")).toBe("rdv");
    expect(stageRole("Devis")).toBe("propo");
    expect(stageRole("Signature")).toBe("signe");
    expect(stageRole("Acompte")).toBe("signe");
  });

  // L'ordre des tests compte : « Client signé » contient « client » ET « signé »,
  // « RDV de vente » contient « vente » et pourrait passer pour une proposition.
  it("fait gagner le motif le plus spécifique", () => {
    expect(stageRole("Client signé")).toBe("signe");
    expect(stageRole("RDV de vente 1")).toBe("rdv");
    expect(stageRole("Devis perdu")).toBe("perdu");
  });

  // LE TEST QUI GARDE LE BUG FERMÉ. « Lost » est le nom de l'étape de perte dans
  // la majorité des pipelines en production ; tant qu'il tombait en « autre », la
  // vue fondue affichait les affaires perdues dans une colonne d'avancement et
  // l'entonnoir les comptait comme vivantes. On le nomme donc à part, sous toutes
  // les formes vues en base, pour qu'une réécriture du motif ne le reperde pas.
  it("reconnaît « Lost » comme une perte, pas comme une étape d'avancement", () => {
    expect(stageRole("Lost")).toBe("perdu");
    expect(stageRole("LOST")).toBe("perdu");
    expect(stageRole("Closed Lost")).toBe("perdu");
    expect(stageRole("Lost / Perdu")).toBe("perdu");
    expect(stageRole("Deal lost")).toBe("perdu");
  });

  it("classe aussi les fins négatives françaises", () => {
    expect(stageRole("Refusé")).toBe("perdu");
    expect(stageRole("Annulé")).toBe("perdu");
    expect(stageRole("Abandonné")).toBe("perdu");
  });

  it("retombe sur « autre » plutôt que de deviner", () => {
    expect(stageRole("Étape maison")).toBe("autre");
    expect(stageRole(null)).toBe("autre");
    expect(stageRole("")).toBe("autre");
  });

  it("est insensible à la casse et aux accents manquants", () => {
    expect(stageRole("PERDU")).toBe("perdu");
    expect(stageRole("interesse")).toBe("interesse");
  });
});

describe("findStageByRole", () => {
  const stages = [
    { id: 1, nom: "Nouveau lead", ordre: 10 },
    { id: 2, nom: "Première approche", ordre: 20 },
    { id: 3, nom: "Relance 1", ordre: 30 },
    { id: 4, nom: "Relance 2", ordre: 40 },
    { id: 5, nom: "Perdu", ordre: 90 },
  ];

  it("rend la première étape du rôle demandé, au sens de l'ordre", () => {
    expect(findStageByRole(stages, "contacte")?.id).toBe(3);
  });

  it("essaie les rôles dans l'ordre donné", () => {
    // Pas d'étape « intéressé » ici : on retombe sur « rdv »… absent aussi,
    // puis sur « contacte ».
    expect(findStageByRole(stages, "interesse", "rdv", "contacte")?.id).toBe(3);
  });

  it("rend null quand aucun rôle ne correspond", () => {
    expect(findStageByRole(stages, "signe")).toBeNull();
  });

  it("ne dépend pas de l'ordre du tableau reçu", () => {
    const shuffled = [...stages].reverse();
    expect(findStageByRole(shuffled, "contacte")?.id).toBe(3);
  });
});
