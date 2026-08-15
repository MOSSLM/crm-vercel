import {
  avancementDeLEtape,
  avancementLePlusAvance,
  statutEntreprise,
} from "../statuts";
import { DEPARTEMENTS, departementFromCodePostal } from "../departements";

/**
 * Le statut d'une entreprise sur la carte n'existe nulle part en base : il est
 * recomposé à partir de la fiche et de ses affaires. Ces tests figent les deux
 * décisions qui ont demandé un arbitrage — ce qui compte comme « contact
 * entamé », et qui gagne quand une fiche est à la fois masquée et qualifiée.
 */
describe("avancement d'une affaire", () => {
  it("ne compte pas les étapes d'entrée comme un contact", () => {
    expect(avancementDeLEtape("Qualifié", 1)).toBe("aucun");
    expect(avancementDeLEtape("LM Déployé", 2)).toBe("aucun");
    // Pipeline « Agent SAMA » : ordre 10, mais personne n'a encore appelé.
    expect(avancementDeLEtape("Nouveau lead", 10)).toBe("aucun");
  });

  it("compte l'approche et les relances comme un contact entamé", () => {
    expect(avancementDeLEtape("Approche", 10)).toBe("contact");
    expect(avancementDeLEtape("Relance 3", 40)).toBe("contact");
    expect(avancementDeLEtape("RDV de vente 1", 7)).toBe("contact");
    expect(avancementDeLEtape("Contacté", 20)).toBe("contact");
    // Parkée, mais l'échange a bien eu lieu.
    expect(avancementDeLEtape("En attente", 140)).toBe("contact");
  });

  it("distingue le client de l'affaire perdue", () => {
    expect(avancementDeLEtape("Signature", 110)).toBe("client");
    expect(avancementDeLEtape("Acompte", 120)).toBe("client");
    expect(avancementDeLEtape("Client signé", 60)).toBe("client");
    expect(avancementDeLEtape("Lost", 130)).toBe("perdu");
    expect(avancementDeLEtape("Perdu", 70)).toBe("perdu");
  });

  it("retombe sur l'ordre pour une étape ajoutée après coup", () => {
    expect(avancementDeLEtape("Second rappel", 45)).toBe("contact");
    expect(avancementDeLEtape("Pré-qualification", 2)).toBe("aucun");
  });

  it("garde l'affaire la plus avancée", () => {
    expect(avancementLePlusAvance("aucun", "contact")).toBe("contact");
    expect(avancementLePlusAvance("client", "perdu")).toBe("client");
    expect(avancementLePlusAvance("perdu", "contact")).toBe("contact");
  });
});

describe("statut d'une entreprise", () => {
  const fiche = (over: Partial<Parameters<typeof statutEntreprise>[0]> = {}) => ({
    qualifie: false,
    hidden_in_qualification: false,
    archived_at: null,
    ...over,
  });

  it("part de prospect tant que rien n'a été validé", () => {
    expect(statutEntreprise(fiche())).toBe("prospect");
  });

  it("passe qualifiée dès que la fiche l'est", () => {
    expect(statutEntreprise(fiche({ qualifie: true }))).toBe("qualifie");
  });

  it("fait primer la progression commerciale sur la qualification", () => {
    expect(statutEntreprise(fiche({ qualifie: true }), "contact")).toBe("contact");
    expect(statutEntreprise(fiche({ qualifie: true }), "client")).toBe("client");
  });

  it("fait primer le masquage sur la qualification", () => {
    // Geste humain explicite : la carte doit permettre de la retrouver.
    expect(statutEntreprise(fiche({ qualifie: true, hidden_in_qualification: true }))).toBe(
      "masquee",
    );
  });

  it("écarte les fiches archivées ou dont l'affaire est perdue", () => {
    expect(statutEntreprise(fiche({ archived_at: "2026-01-01T00:00:00Z" }), "client")).toBe(
      "ecartee",
    );
    expect(statutEntreprise(fiche({ qualifie: true }), "perdu")).toBe("ecartee");
  });
});

describe("référentiel des départements", () => {
  it("couvre les 96 départements métropolitains, région comprise", () => {
    expect(DEPARTEMENTS).toHaveLength(96);
    expect(DEPARTEMENTS.filter((d) => d.region === "—")).toEqual([]);
    expect(DEPARTEMENTS.map((d) => d.code)).toContain("2A");
    expect(DEPARTEMENTS.map((d) => d.code)).not.toContain("20");
  });

  it("déduit le département d'un code postal, Corse comprise", () => {
    expect(departementFromCodePostal("69003")).toBe("69");
    expect(departementFromCodePostal("01 120")).toBe("01");
    expect(departementFromCodePostal("20000")).toBe("2A");
    expect(departementFromCodePostal("20200")).toBe("2B");
  });

  it("refuse ce qui n'est pas un code postal métropolitain", () => {
    expect(departementFromCodePostal(null)).toBeNull();
    expect(departementFromCodePostal("")).toBeNull();
    expect(departementFromCodePostal("97400")).toBeNull();
    expect(departementFromCodePostal("Lyon")).toBeNull();
  });
});
