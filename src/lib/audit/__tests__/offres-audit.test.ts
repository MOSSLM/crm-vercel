import {
  additionsPour,
  codesRetenus,
  construirePage5,
  versOffreAudit,
  type OffreAudit,
} from "../offres-audit";
import type { AuditPage5 } from "@/types";

/**
 * Ce que ces tests protègent : un audit ne doit jamais annoncer un prix que le
 * catalogue ne pratique pas, ni conseiller une prestation qu'aucun constat ne
 * justifie. Le premier est un passif commercial, le second une vente forcée.
 */

const SOCLE: OffreAudit = {
  code: "site_demo_cle_en_main",
  nom: "Site clé en main (base démo)",
  description: "On part du site démo déjà construit pour vous.",
  prixHt: 490,
  mensuel: false,
  role: "socle",
  repondA: ["slow_site", "outdated_or_not_mobile"],
  aPartirDe: true,
  hebergementMensuel: 19,
};

const AVIS: OffreAudit = {
  code: "GMB_RELANCE_AVIS",
  nom: "Relance d'avis clients (mensuel)",
  description: "Sollicitation régulière de vos clients.",
  prixHt: 49,
  mensuel: true,
  role: "addition",
  repondA: ["too_few_reviews", "low_rating"],
  aPartirDe: false,
  hebergementMensuel: null,
};

const LEGAL: OffreAudit = {
  code: "ADD_LEGAL_PAGES",
  nom: "Pages légales",
  description: null,
  prixHt: 150,
  mensuel: false,
  role: "addition",
  repondA: ["no_legal_pages"],
  aPartirDe: false,
  hebergementMensuel: null,
};

const ALT: OffreAudit = {
  code: "site_sur_mesure",
  nom: "Site sur mesure",
  description: "Vous choisissez votre direction artistique.",
  prixHt: 1990,
  mensuel: false,
  role: "alternative",
  repondA: [],
  aPartirDe: false,
  hebergementMensuel: null,
};

const PAGE5_VIDE: AuditPage5 = { planning_steps: [], price_note: "Prix HT." };

describe("versOffreAudit", () => {
  it("ignore une offre sans rôle — rien n'est proposable par accident", () => {
    expect(versOffreAudit({ code: "X", nom: "X", metadata: {} })).toBeNull();
  });

  it("ignore une offre inactive", () => {
    const row = { code: "X", nom: "X", actif: false, metadata: { role_audit: "addition" } };
    expect(versOffreAudit(row)).toBeNull();
  });

  it("lit le rôle, le récurrent et ce que l'offre répare", () => {
    const o = versOffreAudit({
      code: "GMB_RELANCE_AVIS",
      nom: "Relance",
      prix_ht: "49.00",
      billing_period: "monthly",
      actif: true,
      metadata: { role_audit: "addition", repond_a: ["too_few_reviews"] },
    });
    expect(o).toMatchObject({ prixHt: 49, mensuel: true, role: "addition", repondA: ["too_few_reviews"] });
  });
});

describe("additionsPour", () => {
  it("ne conseille que ce qu'un constat retenu justifie", () => {
    // Aucun constat d'avis retenu : la relance n'a rien à faire là.
    expect(additionsPour([AVIS, LEGAL], ["no_legal_pages"]).map((o) => o.code)).toEqual([
      "ADD_LEGAL_PAGES",
    ]);
  });

  it("ne conseille rien quand aucun constat n'est retenu", () => {
    expect(additionsPour([AVIS, LEGAL], [])).toEqual([]);
  });

  it("met devant l'offre qui couvre le plus de constats", () => {
    const codes = additionsPour([LEGAL, AVIS], ["no_legal_pages", "too_few_reviews", "low_rating"]).map(
      (o) => o.code,
    );
    expect(codes[0]).toBe("GMB_RELANCE_AVIS");
  });
});

describe("construirePage5", () => {
  it("pose toujours le socle, même sans aucun constat", () => {
    // On vend le démo, obligatoirement : il ne dépend pas de ce qu'on a mesuré.
    const p = construirePage5(PAGE5_VIDE, [SOCLE], []);
    expect(p.services?.[0]).toMatchObject({ label: SOCLE.nom, amount: 490, from: true });
    expect(p.additional_services ?? []).toEqual([]);
  });

  it("ajoute l'hébergement comme seconde ligne récurrente", () => {
    const p = construirePage5(PAGE5_VIDE, [SOCLE], []);
    expect(p.services?.[1]).toMatchObject({ amount: 19, is_mrr: true });
  });

  it("place les additions dans leur propre emplacement, avec leur pilier en badge", () => {
    const p = construirePage5(PAGE5_VIDE, [SOCLE, AVIS], ["too_few_reviews"]);
    expect(p.additional_services).toHaveLength(1);
    expect(p.additional_services?.[0]).toMatchObject({
      amount: 49,
      is_mrr: true,
      badge: "Réputation",
    });
  });

  it("met le sur-mesure en alternative, pas en ligne principale", () => {
    const p = construirePage5(PAGE5_VIDE, [SOCLE, ALT], []);
    expect(p.secondary_card).toMatchObject({ amount: 1990 });
    expect(p.services?.map((s) => s.amount)).not.toContain(1990);
  });

  it("préserve les choix rédactionnels de l'opérateur", () => {
    const page: AuditPage5 = { ...PAGE5_VIDE, price_note: "Note maison", pricing_subtitle: "Au choix" };
    const p = construirePage5(page, [SOCLE], []);
    expect(p.price_note).toBe("Note maison");
    expect(p.pricing_subtitle).toBe("Au choix");
  });

  it("garde les tarifs existants si le catalogue ne rend aucun socle", () => {
    // Mieux vaut un tarif périmé qu'une page de tarifs vide devant un prospect.
    const page: AuditPage5 = {
      ...PAGE5_VIDE,
      services: [{ label: "Ancien", amount: 490, is_mrr: false, enabled: true }],
    };
    expect(construirePage5(page, [], []).services).toEqual(page.services);
  });
});

describe("codesRetenus", () => {
  it("liste le socle puis les additions justifiées — la base du devis", () => {
    expect(codesRetenus([SOCLE, AVIS, LEGAL, ALT], ["too_few_reviews"])).toEqual([
      "site_demo_cle_en_main",
      "GMB_RELANCE_AVIS",
    ]);
  });
});
