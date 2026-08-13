import {
  celebrationAMontrer,
  cleMemoire,
  detailParCanal,
  palierAtteint,
  paliersFranchis,
  texteCelebration,
  type StatsJournee,
} from "../agent-journee";

/**
 * Les félicitations de fin de journée.
 *
 * Ce qui est vérifié ici tient en une phrase : on fête, on ne compte pas les
 * points, et **on n'arrête rien**. Le CRM a déjà eu un plafond par agent
 * (`task_max_per_agent`) qui, avec un seul commercial, ne répartissait rien et
 * l'empêchait de travailler — ces tests existent pour que la carte de bravo ne
 * redevienne jamais une barrière.
 */

const stats = (contacts: number, restantes = 0): StatsJournee => ({
  contacts,
  parCanal: [],
  restantes,
  debutJournee: "2026-08-13T22:00:00.000Z",
});

describe("palierAtteint", () => {
  it("ne dit rien avant le premier palier", () => {
    expect(palierAtteint(0)).toBe(0);
    expect(palierAtteint(19)).toBe(0);
  });

  it("rend le palier franchi, pas le total", () => {
    expect(palierAtteint(20)).toBe(20);
    expect(palierAtteint(39)).toBe(20);
    expect(palierAtteint(40)).toBe(40);
    expect(palierAtteint(107)).toBe(100);
  });
});

describe("celebrationAMontrer", () => {
  it("propose le palier atteint tant qu'il n'a pas été montré", () => {
    expect(celebrationAMontrer(23, [])).toBe(20);
  });

  it("se tait une fois le palier montré", () => {
    expect(celebrationAMontrer(23, [20])).toBeNull();
  });

  it("ne montre QUE le plus haut quand plusieurs ont été franchis en une absence", () => {
    // Ouverture du CRM à 43 contacts : 20 et 40 sont passés, on ne félicite
    // qu'une fois — empiler deux cartes ferait de la fête une file d'attente.
    expect(celebrationAMontrer(43, [])).toBe(40);
  });

  it("refête au palier suivant", () => {
    expect(celebrationAMontrer(41, [20])).toBe(40);
  });
});

describe("paliersFranchis", () => {
  it("liste les paliers intermédiaires, pour les marquer sans les afficher", () => {
    expect(paliersFranchis(0, 43)).toEqual([20, 40]);
  });

  it("ne remonte pas ceux d'avant le relevé précédent", () => {
    expect(paliersFranchis(20, 43)).toEqual([40]);
  });

  it("rend une liste vide quand rien n'a bougé", () => {
    expect(paliersFranchis(25, 27)).toEqual([]);
  });
});

describe("texteCelebration", () => {
  it("dit « premiers » une seule fois dans la journée", () => {
    expect(texteCelebration(20, stats(21)).titre).toContain("20 premiers contacts");
    expect(texteCelebration(40, stats(41)).titre).not.toContain("premiers");
  });

  it("annonce explicitement que rien ne se ferme", () => {
    const { message } = texteCelebration(20, stats(21, 6));
    expect(message).toMatch(/continuer autant que tu veux/);
    expect(message).toContain("6 fiches");
  });

  it("ne réclame rien quand la file est vide", () => {
    expect(texteCelebration(20, stats(20, 0)).message).toContain("file est vide");
  });

  it("accorde le singulier sur une seule fiche restante", () => {
    expect(texteCelebration(20, stats(21, 1)).message).toContain("1 fiche dans ta file");
  });
});

describe("detailParCanal", () => {
  it("garde l'ordre des canaux et écarte les vides", () => {
    expect(detailParCanal({ call: 3, whatsapp: 12, linkedin: 0 })).toEqual([
      { canal: "whatsapp", libelle: "WhatsApp", nombre: 12 },
      { canal: "call", libelle: "Appels", nombre: 3 },
    ]);
  });
});

describe("cleMemoire", () => {
  it("sépare par agent ET par jour", () => {
    expect(cleMemoire("agent-1", "2026-08-13T22:00:00.000Z")).toBe("sama:journee:agent-1:2026-08-13");
    expect(cleMemoire("agent-1", "2026-08-13T22:00:00.000Z")).not.toBe(
      cleMemoire("agent-2", "2026-08-13T22:00:00.000Z"),
    );
  });
});
