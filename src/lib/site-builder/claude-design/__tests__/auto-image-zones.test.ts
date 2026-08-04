import { AUTO_IMAGE_ZONES, findAllZoneSlots, findZone, findZoneSlots } from "../auto-image-zones";
import { resolveImageSets } from "../resolve-image-sets";
import { serializeImageSet } from "../image-set";

const REALISATIONS = findZone("realisations")!;

// The service-page band ("Exemples de chantiers / Nos réalisations près de chez
// vous") — masonry markup, as Classique ships it.
const SERVICE_PAGE = `
<section class="section section--sand">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow eyebrow--terra">Exemples de chantiers</p>
      <h2>Nos réalisations près de chez vous</h2>
    </div>
    <div class="masonry">
      <figure class="m-item"><div class="ph has-img"><img id="realisation-1" src="a.jpg" alt="Clim en séjour"></div></figure>
      <figure class="m-item"><div class="ph has-img"><img id="realisation-2" src="b.jpg" alt="PAC extérieure"></div></figure>
      <figure class="m-item"><div class="ph has-img"><img id="realisation-3" src="c.jpg" alt="Chauffe-eau"></div></figure>
    </div>
  </div>
</section>
`;

// The home-page band ("Nos réalisations / Nos derniers chantiers") — completely
// different markup (horizontal scroll, an extra CTA card), same ids.
const HOME_PAGE = `
<section class="section section--sand realisations" id="realisations">
  <div class="hscroll"><div class="hscroll-sticky">
    <div class="wrap hscroll-head"><div class="section-head">
      <p class="eyebrow">Nos réalisations</p><h2>Nos derniers chantiers</h2>
    </div></div>
    <div class="hscroll-track">
      <figure class="hcard hcard--wide"><div class="ph has-img"><img id="realisation-1" src="a.jpg" alt="Clim en séjour"></div></figure>
      <figure class="hcard"><div class="ph has-img"><img id="realisation-2" src="b.jpg" alt="PAC extérieure"></div></figure>
      <figure class="hcard hcard--narrow"><div class="ph has-img"><img id="realisation-3" src="c.jpg" alt="Chauffe-eau"></div></figure>
      <div class="hcard hcard--end"><p>Votre projet, ici ?</p><a href="#contact" class="btn">Devis</a></div>
    </div>
  </div></div>
</section>
`;

describe("findZoneSlots", () => {
  it("finds the six-slot band on a service page, in id order", () => {
    const slots = findZoneSlots(SERVICE_PAGE, REALISATIONS);
    expect(slots.map((s) => s.elementId)).toEqual(["realisation-1", "realisation-2", "realisation-3"]);
    expect(slots.every((s) => s.isImg)).toBe(true);
    expect(slots[0].alt).toBe("Clim en séjour");
  });

  it("finds the same band on the home page, whose markup is entirely different", () => {
    const slots = findZoneSlots(HOME_PAGE, REALISATIONS);
    expect(slots.map((s) => s.elementId)).toEqual(["realisation-1", "realisation-2", "realisation-3"]);
    // The CTA card that follows the photos is not a slot.
    expect(slots).toHaveLength(3);
  });

  it("orders by the id suffix, not by document order or string sort", () => {
    const scrambled = `
      <section><div>
        <img id="realisation-10" src="j.jpg">
        <img id="realisation-2" src="b.jpg">
        <img id="realisation-1" src="a.jpg">
      </div></section>`;
    expect(findZoneSlots(scrambled, REALISATIONS).map((s) => s.order)).toEqual([1, 2, 10]);
  });

  it("counts paths from the fragment's top level, like an override key does", () => {
    const slots = findZoneSlots(SERVICE_PAGE, REALISATIONS);
    // section(0) > div.wrap(0) > div.masonry(1) > figure(n) > div.ph(0) > img(0)
    expect(slots.map((s) => s.path)).toEqual(["0.0.1.0.0.0", "0.0.1.1.0.0", "0.0.1.2.0.0"]);
  });

  it("shifts with the head <style> blocks the importer prepends", () => {
    // parse-template-bundle stores `[...headStyles, bodyHtml]`, and that whole
    // fragment is what the section wrapper receives — so the styles take the
    // first indices and every path below them moves.
    const withStyles = `<style>.a{}</style><style>.b{}</style>${SERVICE_PAGE}`;
    expect(findZoneSlots(withStyles, REALISATIONS).map((s) => s.path)).toEqual([
      "2.0.1.0.0.0", "2.0.1.1.0.0", "2.0.1.2.0.0",
    ]);
  });

  it("ignores pages without the band, and malformed input", () => {
    expect(findZoneSlots("<section><div><img id=\"photo-hero-clim\"></div></section>", REALISATIONS)).toEqual([]);
    expect(findZoneSlots("", REALISATIONS)).toEqual([]);
  });

  it("does not match an id that merely starts the same way", () => {
    const near = `<section><div><img id="realisations-title"><img id="realisation-1"></div></section>`;
    expect(findZoneSlots(near, REALISATIONS).map((s) => s.elementId)).toEqual(["realisation-1"]);
  });
});

describe("findAllZoneSlots", () => {
  it("lists only the zones the page actually carries", () => {
    const found = findAllZoneSlots(HOME_PAGE);
    expect(found.map((f) => f.zone.id)).toEqual(["realisations"]);
    expect(found[0].slots).toHaveLength(3);
    expect(findAllZoneSlots("<section><p>Rien</p></section>")).toEqual([]);
  });
});

describe("the paths reach the slot through the real renderer", () => {
  // Two conventions have to agree: findZoneSlots counts from the fragment's top
  // level, and the renderer counts from the children of the section wrapper the
  // fragment is injected into. They are the same indices — this test is what
  // keeps them the same, because a one-level drift silently addresses the wrong
  // nodes instead of failing.
  const render = (fragment: string, overrides: Record<string, { kind: string; value: string }>, tags: string[]) =>
    resolveImageSets(`<div data-claude-design="">${fragment}</div>`, overrides, tags);

  it.each([["service page", SERVICE_PAGE], ["home page", HOME_PAGE]])("%s", (_label, fragment) => {
    const slots = findZoneSlots(fragment, REALISATIONS);
    const overrides: Record<string, { kind: string; value: string }> = {};
    slots.forEach((slot, i) => {
      overrides[`${slot.path}:image_set`] = {
        kind: "image_set",
        value: serializeImageSet([{ url: `https://x/tire-${i}.jpg`, tags: ["Climatisation"] }]),
      };
    });

    const html = render(fragment, overrides, ["Climatisation"]);
    slots.forEach((slot, i) => {
      // The drawn photo landed, and it landed on the right slot.
      expect(html).toContain(`id="${slot.elementId}"`);
      expect(html).toMatch(new RegExp(`src="https://x/tire-${i}\\.jpg"[^>]*id="${slot.elementId}"|id="${slot.elementId}"[^>]*src="https://x/tire-${i}\\.jpg"`));
    });
  });

  it("still lands after the head <style> blocks shift every index", () => {
    const fragment = `<style>.a{}</style>${SERVICE_PAGE}`;
    const slots = findZoneSlots(fragment, REALISATIONS);
    const overrides = {
      [`${slots[0].path}:image_set`]: {
        kind: "image_set",
        value: serializeImageSet([{ url: "https://x/apres-style.jpg", tags: ["Climatisation"] }]),
      },
    };
    const html = render(fragment, overrides, ["Climatisation"]);
    expect(html).toMatch(/id="realisation-1"[^>]*src="https:\/\/x\/apres-style\.jpg"|src="https:\/\/x\/apres-style\.jpg"[^>]*id="realisation-1"/);
  });
});

describe("AUTO_IMAGE_ZONES", () => {
  // Auto-filling is deliberately narrow: everywhere else the NUMBER of photos
  // depends on the company's trades, so a fixed draw would be wrong.
  it("declares the réalisations band and nothing else", () => {
    expect(AUTO_IMAGE_ZONES.map((z) => z.id)).toEqual(["realisations"]);
  });
});
