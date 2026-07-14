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
});
