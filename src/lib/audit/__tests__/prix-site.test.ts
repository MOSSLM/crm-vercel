/**
 * Le prix par prospect — et surtout ce qu'il ne compte PAS.
 *
 * Les deux cas qui justifient le module tiennent en deux tests : le bruit
 * d'annuaire ne facture rien, et le plan de la démo ne sert pas de compteur
 * (il est identique sur les 256 sites publiés).
 */
import type { OffreAudit } from "@/lib/audit/offres-audit";
import {
  formatPrixEuros,
  pagesServiceFacturables,
  prixDuSite,
  prixPlaquette,
} from "@/lib/audit/prix-site";

const socle = (over: Partial<OffreAudit> = {}): OffreAudit => ({
  code: "site_demo_cle_en_main",
  nom: "Votre nouveau site, clé en main",
  description: null,
  prixHt: 490,
  mensuel: false,
  role: "socle",
  repondA: [],
  aPartirDe: true,
  hebergementMensuel: 19,
  prixPageService: 50,
  ...over,
});

describe("pagesServiceFacturables", () => {
  it("ne compte que les services que le gabarit sait rendre", () => {
    // Les trois derniers sont des catégories Google Business : elles ne
    // pilotent aucune page, donc elles ne facturent rien.
    const tags = [
      "Climatisation",
      "Pompe à chaleur",
      "Fournisseur de systèmes de climatisation",
      "Magasin d'électroménager",
      "Plombier",
    ];
    expect(pagesServiceFacturables(tags)).toBe(2);
  });

  it("dédoublonne les variantes d'écriture du même service", () => {
    expect(pagesServiceFacturables(["Pompe à chaleur", "pompe-a-chaleur", "POMPE A CHALEUR"])).toBe(1);
  });

  it("rend au moins une page quand aucun tag n'est reconnu", () => {
    expect(pagesServiceFacturables(["Serrurier", "Paysagiste"])).toBe(1);
    expect(pagesServiceFacturables([])).toBe(1);
    expect(pagesServiceFacturables(null)).toBe(1);
  });

  it("ignore ce qui n'est pas une chaîne", () => {
    expect(pagesServiceFacturables(["Chauffage", 42, null, { nom: "Plomberie" }])).toBe(1);
  });
});

describe("prixDuSite", () => {
  it("part du prix du socle pour la page comprise", () => {
    expect(prixDuSite([socle()], 1)).toBe(490);
  });

  it("ajoute le pas du catalogue par page supplémentaire", () => {
    expect(prixDuSite([socle()], 3)).toBe(590);
    expect(prixDuSite([socle()], 9)).toBe(890);
  });

  it("prend le repli de 50 € quand le catalogue ne dit pas le pas", () => {
    expect(prixDuSite([socle({ prixPageService: null })], 3)).toBe(590);
  });

  it("suit le catalogue quand le prix de base change", () => {
    // La raison d'être du module : aucun montant n'est écrit dans le document.
    expect(prixDuSite([socle({ prixHt: 690 })], 2)).toBe(740);
  });

  it("n'annonce aucun prix quand le catalogue n'a pas de socle", () => {
    expect(prixDuSite([], 3)).toBeNull();
    expect(prixDuSite([socle({ role: "addition" })], 3)).toBeNull();
    expect(prixDuSite([socle({ prixHt: 0 })], 3)).toBeNull();
  });
});

describe("prixPlaquette", () => {
  it("rend le compte, le montant et le texte d'un seul tenant", () => {
    expect(prixPlaquette([socle()], ["Chauffage", "Plomberie", "Ventilation"])).toEqual({
      pages: 3,
      montant: 590,
      texte: "590\u00A0\u20AC",
    });
  });

  it("rend null plutôt qu'un montant faux", () => {
    expect(prixPlaquette([], ["Chauffage"])).toBeNull();
  });
});

describe("formatPrixEuros", () => {
  it("sépare le montant de sa devise par une espace insécable", () => {
    expect(formatPrixEuros(590)).toBe("590 €");
    // Le séparateur de milliers du français est lui aussi insécable.
    expect(formatPrixEuros(1090)).toBe("1\u00A0090\u00A0\u20AC");
  });
});
