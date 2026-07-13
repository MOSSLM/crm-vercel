import {
  collectImagePlaceholders,
  collectDesignPlaceholders,
  countPlaceholders,
  toCsv,
  toJson,
  toText,
} from "../collect-image-placeholders";

describe("collectImagePlaceholders", () => {
  it("extracts label + zone from a top-level .ph with meaningful own classes", () => {
    const html = `<section><div class="ph ph--azur hero-photo is-overflow"><span class="ph-label">Photo — borne de recharge murale dans un garage</span></div></section>`;
    const res = collectImagePlaceholders(html);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      index: 1,
      label: "Photo — borne de recharge murale dans un garage",
      zone: "hero-photo", // ph / ph--azur / is-overflow stripped
    });
  });

  it("falls back to the parent's classes when the .ph itself has none meaningful", () => {
    const html = `<div class="pro-cardx-media"><div class="ph ph--azur"><span class="ph-label">Photo — parking d'entreprise équipé de bornes</span></div></div>`;
    const res = collectImagePlaceholders(html);
    expect(res[0].zone).toBe("pro-cardx-media");
    expect(res[0].label).toBe("Photo — parking d'entreprise équipé de bornes");
  });

  it("collapses whitespace/newlines in the label", () => {
    const html = `<div class="ph"><span class="ph-label">Photo —\n   deux    lignes</span></div>`;
    expect(collectImagePlaceholders(html)[0].label).toBe("Photo — deux lignes");
  });

  it("numbers placeholders in document order", () => {
    const html = `<div class="ph"><span class="ph-label">A</span></div><div class="ph"><span class="ph-label">B</span></div>`;
    const res = collectImagePlaceholders(html);
    expect(res.map((p) => [p.index, p.label])).toEqual([[1, "A"], [2, "B"]]);
  });

  it("computes an element-child path matching the runtime override key", () => {
    const html = `<div><span>x</span><div class="ph"><span class="ph-label">A</span></div></div>`;
    // outer div = 0, the .ph is the 2nd element child (span=0, ph=1) → "0.1"
    expect(collectImagePlaceholders(html)[0].path).toBe("0.1");
  });

  it("skips a slot already filled by an image / bg_image override", () => {
    const html = `<div class="ph"><span class="ph-label">A</span></div>`;
    expect(collectImagePlaceholders(html, { "0:bg_image": { kind: "bg_image", value: "x.jpg" } })).toHaveLength(0);
    expect(collectImagePlaceholders(html, { "0:image": { kind: "image", value: "y.jpg" } })).toHaveLength(0);
  });

  it("does not skip when the override value is empty", () => {
    const html = `<div class="ph"><span class="ph-label">A</span></div>`;
    expect(collectImagePlaceholders(html, { "0:bg_image": { kind: "bg_image", value: "" } })).toHaveLength(1);
  });

  it("skips a removed slot", () => {
    const html = `<div class="ph"><span class="ph-label">A</span></div>`;
    expect(collectImagePlaceholders(html, { "0:remove": { kind: "remove", value: "" } })).toHaveLength(0);
  });

  it("skips a slot the design already marked has-img", () => {
    const html = `<div class="ph has-img"><span class="ph-label">A</span></div>`;
    expect(collectImagePlaceholders(html)).toHaveLength(0);
  });

  it("uses the raw text when there is no .ph-label", () => {
    const html = `<div class="ph hero-photo">Photo brute</div>`;
    expect(collectImagePlaceholders(html)[0]).toMatchObject({ label: "Photo brute", zone: "hero-photo" });
  });

  it("returns [] for empty html", () => {
    expect(collectImagePlaceholders("")).toEqual([]);
  });
});

describe("collectDesignPlaceholders + formatters", () => {
  const pages = [
    {
      slug: "/",
      title: "Accueil",
      html: `<div class="ph hero-photo"><span class="ph-label">Photo — hero</span></div><div class="ph"><span class="ph-label">Photo — deux</span></div>`,
    },
    { slug: "/services", title: "Services", html: `<div class="pro-cardx-media"><div class="ph"><span class="ph-label">Photo, avec virgule</span></div></div>` },
    { slug: "/vide", title: "Vide", html: `<section>aucune image</section>` },
  ];

  it("groups by page and drops pages with no missing images", () => {
    const res = collectDesignPlaceholders(pages);
    expect(res.map((p) => p.slug)).toEqual(["/", "/services"]);
    expect(countPlaceholders(res)).toBe(3);
  });

  it("CSV escapes commas and has a header row", () => {
    const csv = toCsv(collectDesignPlaceholders(pages));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("page,titre_page,numero,zone,description");
    expect(csv).toContain(`"Photo, avec virgule"`);
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it("JSON carries the total and grouped pages", () => {
    const parsed = JSON.parse(toJson("Mon design", collectDesignPlaceholders(pages)));
    expect(parsed.design).toBe("Mon design");
    expect(parsed.totalMissing).toBe(3);
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[0].placeholders[0].label).toBe("Photo — hero");
  });

  it("text output lists every image grouped under its page", () => {
    const txt = toText("Mon design", collectDesignPlaceholders(pages));
    expect(txt).toContain("Images à créer : 3");
    expect(txt).toContain("Accueil");
    expect(txt).toContain("1. [hero-photo] Photo — hero");
    expect(txt).toContain("Services");
  });
});
