import { applyOverridesToHTML, type OverrideEntry } from "../apply-overrides-html";

describe("applyOverridesToHTML", () => {
  const wrapHtml = (inner: string) => `<div data-root>${inner}</div>`;

  it("applies text override", () => {
    const html = wrapHtml(`<h2>Default</h2>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:text": { kind: "text", value: "Edited" },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.applied).toBe(1);
    expect(out.html).toContain("Edited");
    expect(out.html).not.toContain("Default");
  });

  it("applies image src override", () => {
    const html = wrapHtml(`<img src="/old.png" alt="x"/>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:image": { kind: "image", value: "/new.png" },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.html).toContain('src="/new.png"');
  });

  it("wraps img in <picture> for image_mobile override", () => {
    const html = wrapHtml(`<img src="/desk.png" alt="x"/>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:image_mobile": { kind: "image_mobile", value: "/mob.png" },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.applied).toBe(1);
    expect(out.html).toContain("<picture");
    expect(out.html).toContain('data-mobile-src-wrap="1"');
    expect(out.html).toContain('media="(max-width: 767px)"');
    expect(out.html).toContain('srcset="/mob.png"');
    expect(out.html).toContain('src="/desk.png"');
  });

  it("merges style override (display:none hides element)", () => {
    const html = wrapHtml(`<p>hello</p>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:style": { kind: "style", value: "", meta: { style: { display: "none" } } },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.html).toMatch(/style="[^"]*display:\s*none/);
  });

  it("interpolates {{ variables }} in text overrides", () => {
    const html = wrapHtml(`<span>x</span>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:text": { kind: "text", value: "Hi {{ name }}" },
    };
    const out = applyOverridesToHTML(html, overrides, { name: "Sam" });
    expect(out.html).toContain("Hi Sam");
  });
});
