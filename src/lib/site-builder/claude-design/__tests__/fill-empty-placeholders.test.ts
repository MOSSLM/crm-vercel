import { fillEmptyPlaceholders, type CompanyImage } from "../fill-empty-placeholders";

const images: CompanyImage[] = [
  { url: "https://x/clim.jpg", tags: ["climatisation"], alt: "Clim" },
  { url: "https://x/team.jpg", tags: ["all"], alt: "Équipe" },
];

const html = `<section><div class="ph a"><span class="ph-label">Photo A</span></div><div class="ph b has-img" style="background-image:url('kept.jpg')"><span class="ph-label">kept</span></div><div class="ph c"><span class="ph-label">Photo C</span></div></section>`;

describe("fillEmptyPlaceholders", () => {
  it("fills empty .ph slots best-first and marks them filled", () => {
    const out = fillEmptyPlaceholders(html, images, ["climatisation"]);
    // First empty slot gets the best match (clim), second empty slot the next.
    expect(out).toContain("https://x/clim.jpg");
    expect(out).toContain("https://x/team.jpg");
    // The already-filled slot (has-img) is left untouched.
    expect(out).toContain("kept.jpg");
    // Filled slots are marked + get an aria-label.
    expect(out).toContain('aria-label="Clim"');
  });

  it("cycles images when there are more empty slots than images", () => {
    const one: CompanyImage[] = [{ url: "https://x/only.jpg", tags: [], alt: "" }];
    const out = fillEmptyPlaceholders(html, one, []);
    // Both empty slots use the single image — no slot left empty.
    const count = out.split("https://x/only.jpg").length - 1;
    expect(count).toBe(2);
  });

  it("is a no-op with no images or no placeholders", () => {
    expect(fillEmptyPlaceholders(html, [], ["climatisation"])).toBe(html);
    expect(fillEmptyPlaceholders("<div>no ph here</div>", images, [])).toBe("<div>no ph here</div>");
  });

  it("never fills a fallback placeholder that belongs to a real <img> slot (stepper)", () => {
    // The service stepper slot: a real <img> plus a CSS-hidden `.stepper-ph`
    // fallback. The fallback must stay empty (no mismatched company photo).
    const stepper = `<div class="stepper-img"><img src="https://x/real.png" alt="Schéma"><div class="ph stepper-ph"><span class="ph-label">Schéma — secours</span></div></div>`;
    const out = fillEmptyPlaceholders(stepper, images, ["climatisation"]);
    expect(out).toBe(stepper); // untouched — no fill, no has-img
    expect(out).not.toContain("background-image");
  });

  it("still fills a genuine empty slot next to the stepper fallback", () => {
    const mixed = `<div class="stepper-img"><img src="https://x/real.png"><div class="ph stepper-ph"><span class="ph-label">secours</span></div></div><div class="pro-media"><div class="ph"><span class="ph-label">Photo pro</span></div></div>`;
    const out = fillEmptyPlaceholders(mixed, images, ["climatisation"]);
    // The independent pro placeholder is filled; the stepper fallback is not.
    expect(out).toContain("https://x/clim.jpg");
    expect(out.match(/has-img/g) ?? []).toHaveLength(1);
  });
});
