import { findLinkedSlotPaths } from "../link-image-slots";

/**
 * The CVC "Marques partenaires" marquee: 6 brands, each shipped twice (the
 * second set is aria-hidden) so the CSS -50% scroll loops seamlessly. Each brand
 * is identified by a per-item class `bN`, present on both of its copies.
 */
const MARQUEE = `<div class="brands-marquee">
  <div class="brands-track">
    <img class="brand-logo b1" src="images/marque-daikin.png" alt="Daikin">
    <img class="brand-logo b2" src="images/marque-atlantic.png" alt="Atlantic">
    <img class="brand-logo b3" src="images/marque-mitsubishi.png" alt="Mitsubishi">
    <img class="brand-logo b4" src="images/marque-toshiba.png" alt="Toshiba">
    <img class="brand-logo b5" src="images/marque-bosch.png" alt="Bosch">
    <img class="brand-logo b6" src="images/marque-panasonic.png" alt="Panasonic">
    <img class="brand-logo b1" src="images/marque-daikin.png" alt="" aria-hidden="true">
    <img class="brand-logo b2" src="images/marque-atlantic.png" alt="" aria-hidden="true">
    <img class="brand-logo b3" src="images/marque-mitsubishi.png" alt="" aria-hidden="true">
    <img class="brand-logo b4" src="images/marque-toshiba.png" alt="" aria-hidden="true">
    <img class="brand-logo b5" src="images/marque-bosch.png" alt="" aria-hidden="true">
    <img class="brand-logo b6" src="images/marque-panasonic.png" alt="" aria-hidden="true">
  </div>
</div>`;

// Track is the first child of root (.brands-marquee), then .brands-track (child 0),
// then the img at position `i` — so a logo's path is [0, 0, i].
const logoPath = (i: number) => [0, 0, i];

describe("findLinkedSlotPaths — marquee logo pairing", () => {
  it("pairs the visible Daikin logo (b1) with its aria-hidden duplicate", () => {
    expect(findLinkedSlotPaths(MARQUEE, logoPath(0))).toEqual([logoPath(6)]);
  });

  it("pairs the duplicate copy back to the original (symmetric)", () => {
    expect(findLinkedSlotPaths(MARQUEE, logoPath(6))).toEqual([logoPath(0)]);
  });

  it("pairs a middle brand (b4) with only its own duplicate, not other brands", () => {
    expect(findLinkedSlotPaths(MARQUEE, logoPath(3))).toEqual([logoPath(9)]);
  });

  it("returns three twins when a brand is shipped three times", () => {
    const tripled = `<div class="brands-track">
      ${Array.from({ length: 3 }, () => `<img class="brand-logo b1" src="a.png">`).join("")}
      ${Array.from({ length: 3 }, () => `<img class="brand-logo b2" src="b.png">`).join("")}
    </div>`;
    // .brands-track is child [0] of root; its img children are [0,0], [0,1], …
    // The three b1 copies sit at [0,0], [0,1], [0,2] → each links to the other two.
    expect(findLinkedSlotPaths(tripled, [0, 0])).toEqual([[0, 1], [0, 2]]);
  });
});

describe("findLinkedSlotPaths — negative cases (no false syncing)", () => {
  it("does NOT sync a plain gallery grid of identically-classed images", () => {
    const grid = `<div class="gallery-grid">
      <img class="gallery-img" src="1.png">
      <img class="gallery-img" src="2.png">
      <img class="gallery-img" src="3.png">
      <img class="gallery-img" src="4.png">
    </div>`;
    expect(findLinkedSlotPaths(grid, [0, 0])).toEqual([]);
  });

  it("does NOT sync feature cards that each carry a unique modifier class", () => {
    const cards = `<div class="features">
      <img class="feat feat--1" src="1.png">
      <img class="feat feat--2" src="2.png">
      <img class="feat feat--3" src="3.png">
      <img class="feat feat--4" src="4.png">
    </div>`;
    expect(findLinkedSlotPaths(cards, [0, 0])).toEqual([]);
  });

  it("returns nothing for a slot whose path does not resolve", () => {
    expect(findLinkedSlotPaths(MARQUEE, [9, 9, 9])).toEqual([]);
  });

  it("falls back to positional halves for an unclassed but doubled marquee track", () => {
    const unclassed = `<div class="logos-marquee">
      <img src="1.png"><img src="2.png"><img src="3.png">
      <img src="1.png"><img src="2.png"><img src="3.png">
    </div>`;
    // 6 imgs, half = 3 → img [0,0] pairs with [0,3], img [0,1] with [0,4].
    expect(findLinkedSlotPaths(unclassed, [0, 0])).toEqual([[0, 3]]);
    expect(findLinkedSlotPaths(unclassed, [0, 1])).toEqual([[0, 4]]);
  });

  it("does NOT fall back to halves for a doubled set that is NOT a marquee", () => {
    const plain = `<div class="photo-row">
      <img src="1.png"><img src="2.png"><img src="3.png">
      <img src="1.png"><img src="2.png"><img src="3.png">
    </div>`;
    expect(findLinkedSlotPaths(plain, [0, 0])).toEqual([]);
  });
});
