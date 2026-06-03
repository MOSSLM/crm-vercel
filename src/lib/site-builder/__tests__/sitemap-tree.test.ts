import { deriveSlugFromTitle, isSlugAutoDerived, parentPathOf } from "../sitemap-tree";

describe("sitemap-tree slug derivation (#4)", () => {
  describe("parentPathOf", () => {
    it("returns '' for a top-level slug", () => {
      expect(parentPathOf("/services")).toBe("");
    });
    it("returns the parent path for nested slugs", () => {
      expect(parentPathOf("/services/climatisation")).toBe("/services");
      expect(parentPathOf("/a/b/c")).toBe("/a/b");
    });
    it("returns '' for root/empty", () => {
      expect(parentPathOf("/")).toBe("");
      expect(parentPathOf("")).toBe("");
    });
  });

  describe("deriveSlugFromTitle", () => {
    it("derives a top-level slug from a title", () => {
      expect(deriveSlugFromTitle("", "Tarifs")).toBe("/tarifs");
    });
    it("nests under the parent path", () => {
      expect(deriveSlugFromTitle("/services", "Climatisation Réversible")).toBe(
        "/services/climatisation-reversible",
      );
    });
    it("strips diacritics and slugifies", () => {
      expect(deriveSlugFromTitle("", "Dépannage d'Urgence")).toBe("/depannage-d-urgence");
    });
    it("treats '/' parent as root", () => {
      expect(deriveSlugFromTitle("/", "Accueil")).toBe("/accueil");
    });
  });

  describe("isSlugAutoDerived", () => {
    it("true when the slug matches the title-derived value", () => {
      expect(isSlugAutoDerived("/services/climatisation", "Climatisation")).toBe(true);
    });
    it("true with a -N uniqueness suffix", () => {
      expect(isSlugAutoDerived("/nouvelle-page-2", "Nouvelle page")).toBe(true);
    });
    it("false when the slug was manually customised", () => {
      expect(isSlugAutoDerived("/promo-ete", "Climatisation")).toBe(false);
    });
    it("false for a non-numeric suffix", () => {
      expect(isSlugAutoDerived("/climatisation-pro", "Climatisation")).toBe(false);
    });
    it("false for the home page", () => {
      expect(isSlugAutoDerived("/", "Accueil")).toBe(false);
    });
  });
});
