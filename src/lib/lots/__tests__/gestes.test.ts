/**
 * @jest-environment node
 */

/**
 * Ce que l'écran d'un lot propose de lancer, et ce qu'il renvoie ailleurs.
 *
 * LE TEST QUI COMPTE est le dernier : un lot bloqué sur un axe qui ne se comble
 * PAS depuis le CRM ne doit pas se voir proposer le geste suivant. Sauter
 * l'ordre reviendrait à chercher la présence web d'entreprises qu'on n'a pas
 * encore rapprochées du registre — donc à chercher sur des noms faux, ce que
 * l'ordre des sept axes existe précisément pour éviter.
 */

import { AXES, type CleAxe, type Couverture } from "../couverture";
import { GESTES, ailleurs, gesteConseille, gestePourAxe, porteeDuGeste } from "../gestes";

const RIEN: Record<CleAxe, number> = {
  siret: 0,
  donnees: 0,
  constat: 0,
  demo: 0,
  audit: 0,
  proprietaire: 0,
  sequence: 0,
};

const lot = (total: number, couverts: Partial<Record<CleAxe, number>>): Couverture => ({
  lotId: 1,
  nom: "essai",
  note: null,
  creeLe: "2026-08-28T00:00:00Z",
  total,
  couverts: { ...RIEN, ...couverts },
});

/** Tout couvert sauf ce qu'on nomme — le raccourci des cas « bloqué sur X ». */
const complet = (total: number, sauf: CleAxe[]): Couverture =>
  lot(
    total,
    Object.fromEntries(AXES.map((a) => [a.cle, sauf.includes(a.cle) ? 0 : total])) as Record<
      CleAxe,
      number
    >,
  );

describe("le geste conseillé suit l'ordre des axes", () => {
  it("commence par le lissage quand le SIRET manque", () => {
    expect(gesteConseille(lot(500, {}))?.cle).toBe("lisser");
  });

  it("reste sur le lissage tant qu'un de ses trois axes a un trou", () => {
    // SIRET et données faits, présence web non : c'est encore le lissage.
    expect(gesteConseille(complet(500, ["constat", "demo", "audit", "proprietaire", "sequence"]))?.cle)
      .toBe("lisser");
  });

  it("propose la campagne quand il ne manque plus que la séquence", () => {
    expect(gesteConseille(complet(500, ["sequence"]))?.cle).toBe("campagne");
  });

  it("ne propose rien sur un lot complet", () => {
    expect(gesteConseille(complet(500, []))).toBeNull();
  });

  it("ne propose rien sur un lot vide, plutôt que du travail imaginaire", () => {
    expect(gesteConseille(lot(0, {}))).toBeNull();
  });

  it("NE SAUTE PAS un axe qui se comble ailleurs", () => {
    // Bloqué sur les démos : elles se fabriquent en production, pas ici. Le
    // geste suivant dans l'ordre serait « mettre en campagne » — le proposer
    // enverrait démarcher des fiches dont la démo n'existe pas.
    const bloque = complet(500, ["demo", "sequence"]);
    expect(gesteConseille(bloque)).toBeNull();
    expect(ailleurs(bloque).map((a) => a.axe)).toEqual(["Fabriquer les démos"]);
  });
});

describe("la portée d'un geste", () => {
  it("prend le plus gros de ses axes, jamais leur somme", () => {
    // 400 sans SIRET et 300 sans données publiques, ce sont très
    // probablement les mêmes fiches : annoncer 700 promettrait un travail qui
    // n'existe pas.
    const c = lot(500, { siret: 100, donnees: 200, constat: 500 });
    expect(porteeDuGeste(c, GESTES[0])).toBe(400);
  });

  it("vaut zéro pour un geste qui ne comble aucun axe", () => {
    const plaquettes = GESTES.find((g) => g.cle === "plaquettes")!;
    expect(plaquettes.comble).toHaveLength(0);
    expect(porteeDuGeste(lot(500, {}), plaquettes)).toBe(0);
  });
});

describe("ce qui se comble ailleurs", () => {
  it("nomme l'endroit, et combien il en reste", () => {
    const c = complet(500, ["audit", "proprietaire"]);
    expect(ailleurs(c)).toEqual([
      { axe: "Préparer les audits", ou: "Marketing pipeline", combien: 500 },
      { axe: "Attribuer à un agent", ou: "Pipeline commercial", combien: 500 },
    ]);
  });

  it("ne liste jamais un axe qu'un bouton comble déjà", () => {
    const c = lot(500, {});
    const noms = ailleurs(c).map((a) => a.axe);
    for (const g of GESTES) for (const axe of g.comble) {
      expect(noms).not.toContain(AXES.find((a) => a.cle === axe)!.geste);
    }
  });

  it("ne dit rien d'un lot complet", () => {
    expect(ailleurs(complet(500, []))).toEqual([]);
  });
});

describe("la table des gestes", () => {
  it("ne fait porter un axe que par un seul geste", () => {
    const vus = new Set<CleAxe>();
    for (const g of GESTES) {
      for (const axe of g.comble) {
        expect(vus.has(axe)).toBe(false);
        vus.add(axe);
      }
    }
  });

  it("ne comble que des axes qui existent", () => {
    const connus = new Set(AXES.map((a) => a.cle));
    for (const g of GESTES) for (const axe of g.comble) expect(connus.has(axe)).toBe(true);
  });

  it("rend null pour un axe qu'aucun bouton ne comble", () => {
    expect(gestePourAxe("demo")).toBeNull();
    expect(gestePourAxe("audit")).toBeNull();
    expect(gestePourAxe("siret")?.cle).toBe("lisser");
  });
});
