import { parseImageSet, serializeImageSet, pickCandidate, type ImageSetCandidate } from "../image-set";

const clim: ImageSetCandidate = { url: "https://x/clim.jpg", tags: ["climatisation"] };
const chauf: ImageSetCandidate = { url: "https://x/chauf.jpg", tags: ["chauffage"] };
const universal: ImageSetCandidate = { url: "https://x/team.jpg", tags: ["all"] };
const untagged: ImageSetCandidate = { url: "https://x/generic.jpg", tags: [] };

describe("parseImageSet / serializeImageSet", () => {
  it("round-trips candidates", () => {
    const value = serializeImageSet([clim, chauf]);
    expect(parseImageSet(value).candidates).toEqual([clim, chauf]);
  });

  it("drops candidates without a url and malformed input", () => {
    expect(parseImageSet(JSON.stringify({ candidates: [{ tags: ["x"] }, clim] })).candidates).toEqual([clim]);
    expect(parseImageSet("not json").candidates).toEqual([]);
    expect(parseImageSet("").candidates).toEqual([]);
  });
});

describe("pickCandidate", () => {
  it("returns null for an empty set", () => {
    expect(pickCandidate([], ["climatisation"])).toBeNull();
  });

  it("picks the candidate matching the company's service tags", () => {
    expect(pickCandidate([clim, chauf], ["chauffage"])).toBe(chauf);
    expect(pickCandidate([clim, chauf], ["climatisation"])).toBe(clim);
  });

  it("is accent/case-insensitive on tags", () => {
    const pv: ImageSetCandidate = { url: "https://x/pv.jpg", tags: ["Photovoltaïque"] };
    expect(pickCandidate([pv, chauf], ["photovoltaique"])).toBe(pv);
  });

  it("prefers a real service match over a universal image", () => {
    expect(pickCandidate([universal, clim], ["climatisation"])).toBe(clim);
  });

  it("falls back to a universal candidate when nothing matches", () => {
    expect(pickCandidate([clim, universal, chauf], ["plomberie"])).toBe(universal);
    // untagged counts as universal too
    expect(pickCandidate([clim, untagged], ["plomberie"])).toBe(untagged);
  });

  it("falls back to the first candidate when nothing matches and none universal", () => {
    expect(pickCandidate([clim, chauf], ["plomberie"])).toBe(clim);
    expect(pickCandidate([clim, chauf], [])).toBe(clim);
  });

  it("ranks by the number of shared tags, first wins ties", () => {
    const a: ImageSetCandidate = { url: "a", tags: ["climatisation"] };
    const b: ImageSetCandidate = { url: "b", tags: ["climatisation", "chauffage"] };
    expect(pickCandidate([a, b], ["climatisation", "chauffage"])).toBe(b);
    const c: ImageSetCandidate = { url: "c", tags: ["climatisation"] };
    const d: ImageSetCandidate = { url: "d", tags: ["climatisation"] };
    expect(pickCandidate([c, d], ["climatisation"])).toBe(c);
  });
});
