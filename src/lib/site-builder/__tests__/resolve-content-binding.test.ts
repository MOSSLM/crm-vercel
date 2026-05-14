import { resolveContentBinding, type ElementClickInfo } from "../resolve-content-binding";

function el(partial: Partial<ElementClickInfo>): ElementClickInfo {
  return {
    kind: "text",
    tag: "p",
    text: "",
    path: [0],
    attrs: {},
    fieldId: null,
    ...partial,
  };
}

describe("resolveContentBinding", () => {
  describe("field-id strategy", () => {
    it("returns field-id when present, ignoring content", () => {
      const result = resolveContentBinding(
        el({ fieldId: "heading", text: "Whatever" }),
        { unrelated: "stuff" },
      );
      expect(result).toEqual({
        strategy: "field-id",
        key: "heading",
        location: { scope: "instance" },
      });
    });
  });

  describe("direct strategy", () => {
    it("matches a text element by exact string", () => {
      const result = resolveContentBinding(
        el({ kind: "text", text: "Bienvenue" }),
        { heading: "Bienvenue", subtitle: "Sous-titre" },
      );
      expect(result).toEqual({
        strategy: "direct",
        key: "heading",
        location: { scope: "instance" },
      });
    });

    it("matches an image by src", () => {
      const result = resolveContentBinding(
        el({ kind: "image", attrs: { src: "https://example.com/a.png" } }),
        { imageSrc: "https://example.com/a.png", heading: "Hi" },
      );
      expect(result).toMatchObject({ strategy: "direct", key: "imageSrc" });
    });

    it("ignores keys prefixed with __", () => {
      const result = resolveContentBinding(
        el({ kind: "text", text: "Bienvenue" }),
        { __overrides: "Bienvenue", heading: "Bienvenue" },
      );
      expect(result).toMatchObject({ strategy: "direct", key: "heading" });
    });
  });

  describe("composite strategy", () => {
    it("matches a composite button by label", () => {
      const result = resolveContentBinding(
        el({ kind: "button", text: "Commencer", attrs: { href: "/start" } }),
        { cta_primary: { label: "Commencer", href: "/start" } },
      );
      expect(result).toMatchObject({ strategy: "composite", key: "cta_primary" });
    });

    it("matches a composite button by href when label differs", () => {
      const result = resolveContentBinding(
        el({ kind: "button", text: "X", attrs: { href: "/contact" } }),
        { cta_primary: { label: "Different", href: "/contact" } },
      );
      expect(result).toMatchObject({ strategy: "composite", key: "cta_primary" });
    });

    it("matches a composite input by placeholder", () => {
      const result = resolveContentBinding(
        el({ kind: "input", attrs: { placeholder: "votre@email.fr" } }),
        { email_field: { placeholder: "votre@email.fr", input_type: "email" } },
      );
      expect(result).toMatchObject({ strategy: "composite", key: "email_field" });
    });
  });

  describe("pair strategy", () => {
    it("detects legacy label + href pair", () => {
      const result = resolveContentBinding(
        el({ kind: "button", text: "Nous contacter", attrs: { href: "/contact" } }),
        { primaryLabel: "Nous contacter", primaryHref: "/contact" },
      );
      expect(result).toEqual({
        strategy: "pair",
        labelKey: "primaryLabel",
        hrefKey: "primaryHref",
        location: { scope: "instance" },
      });
    });

    it("returns a fallback href key when none exists yet", () => {
      const result = resolveContentBinding(
        el({ kind: "button", text: "Nous contacter", attrs: { href: "tel:0123456789" } }),
        { primaryLabel: "Nous contacter" },
      );
      expect(result).toMatchObject({
        strategy: "pair",
        labelKey: "primaryLabel",
        hrefKey: "primaryHref",
      });
    });
  });

  describe("override strategy", () => {
    it("returns override with a path string when nothing matches", () => {
      const result = resolveContentBinding(
        el({ kind: "text", text: "Hardcoded", path: [2, 1, 0, 3] }),
        { heading: "Different" },
      );
      expect(result).toEqual({ strategy: "override", pathStr: "2.1.0.3" });
    });
  });

  describe("blocks scope", () => {
    it("matches inside a block's settings", () => {
      const result = resolveContentBinding(
        el({ kind: "text", text: "Q1" }),
        { heading: "FAQ" },
        [{ id: "b1", type: "faq_item", settings: { question: "Q1", answer: "A1" } }],
      );
      expect(result).toEqual({
        strategy: "direct",
        key: "question",
        location: { scope: "block", blockId: "b1" },
      });
    });
  });
});
