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

  it("merges style override (display:none hides element) with !important", () => {
    const html = wrapHtml(`<p>hello</p>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:style": { kind: "style", value: "", meta: { style: { display: "none" } } },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    // !important so per-element overrides win over CTA rules / Tailwind utilities.
    expect(out.html).toMatch(/display:\s*none\s*!important/);
  });

  it("re-applying the same style override is idempotent (no double !important)", () => {
    const html = wrapHtml(`<p>hi</p>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:style": { kind: "style", value: "", meta: { style: { color: "#f00" } } },
    };
    const first = applyOverridesToHTML(html, overrides, {});
    const second = applyOverridesToHTML(first.html, overrides, {});
    expect(second.html).toMatch(/color:\s*#f00\s*!important/);
    expect(second.html).not.toMatch(/!important\s*!important/);
  });

  it("interpolates {{ variables }} in text overrides", () => {
    const html = wrapHtml(`<span>x</span>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:text": { kind: "text", value: "Hi {{ name }}" },
    };
    const out = applyOverridesToHTML(html, overrides, { name: "Sam" });
    expect(out.html).toContain("Hi Sam");
  });

  it("fills a Claude .ph placeholder: cover/center + has-img + hides the label", () => {
    const html = wrapHtml(`<div class="ph about-photo"><span class="ph-label">Photo</span></div>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:bg_image": { kind: "bg_image", value: "/hero.jpg" },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.applied).toBe(1);
    expect(out.html).toMatch(/background-image:\s*url\((&quot;|")?\/hero\.jpg/);
    expect(out.html).toMatch(/background-size:\s*cover/);
    expect(out.html).toContain("has-img");
    expect(out.html).toMatch(/class="ph-label"[^>]*style="[^"]*display:\s*none/);
  });

  it("bg_image on a non-placeholder sets cover/center without has-img", () => {
    const html = wrapHtml(`<section class="hero"></section>`);
    const overrides: Record<string, OverrideEntry> = {
      "0:bg_image": { kind: "bg_image", value: "/x.jpg" },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.html).toMatch(/background-image:\s*url\((&quot;|")?\/x\.jpg/);
    expect(out.html).toMatch(/background-position:\s*center/);
    expect(out.html).not.toContain("has-img");
  });

  it("skips React 19 resource hints (<link rel=preload>) when locating section root", () => {
    // react-dom/server@19 emits <link rel="preload"> ahead of the rendered tree
    // when the section contains <img> tags. The override walker must skip past
    // these so DOM paths still resolve against the actual section root.
    const html =
      `<link rel="preload" as="image" href="/img.png"/>` +
      `<section><h1>Default</h1></section>`;
    const overrides: Record<string, OverrideEntry> = {
      "0:text": { kind: "text", value: "Edited" },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.applied).toBe(1);
    expect(out.failed).toBe(0);
    expect(out.html).toContain("Edited");
    expect(out.html).toContain('<link rel="preload"'); // preload preserved
  });

  it("merges arbitrary appearance CSS (radius/border/shadow/bg/gap) — element-level overrides deploy", () => {
    const html = wrapHtml(`<div><button>Go</button></div>`);
    const overrides: Record<string, OverrideEntry> = {
      "0.0:style": {
        kind: "style",
        value: "",
        meta: {
          style: {
            borderRadius: "12px",
            borderWidth: "2px",
            borderStyle: "solid",
            borderColor: "#f00",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            backgroundColor: "#fff",
            gap: "10px",
          },
        },
      },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.applied).toBe(1);
    expect(out.html).toContain("border-radius: 12px !important");
    expect(out.html).toContain("border-width: 2px");
    expect(out.html).toContain("border-style: solid");
    expect(out.html).toContain("border-color: #f00");
    expect(out.html).toContain("box-shadow: 0 4px 12px");
    expect(out.html).toContain("background-color: #fff");
    expect(out.html).toContain("gap: 10px");
  });

  it("applies a root-path style override (\":style\", empty path) to the section root", () => {
    const html = wrapHtml(`<p>hi</p>`);
    const overrides: Record<string, OverrideEntry> = {
      ":style": { kind: "style", value: "", meta: { style: { borderRadius: "16px", gap: "8px" } } },
    };
    const out = applyOverridesToHTML(html, overrides, {});
    expect(out.applied).toBe(1);
    // The section root (the wrapper element) carries the style.
    expect(out.html).toMatch(/data-root[^>]*style="[^"]*border-radius:\s*16px/);
    expect(out.html).toContain("gap: 8px");
  });
});
