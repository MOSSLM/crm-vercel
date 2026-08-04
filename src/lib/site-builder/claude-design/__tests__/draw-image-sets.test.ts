import { drawImageSets, seededRandom, type LibraryImage } from "../draw-image-sets";
import { pickCandidate } from "../image-set";

/** `n` library images all carrying `tag`, urls `<prefix>-1.jpg`… */
function pool(tag: string, n: number, prefix = tag): LibraryImage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`, url: `https://x/${prefix}-${i + 1}.jpg`, tags: [tag], alt: `${tag} ${i + 1}`,
  }));
}

const LIBRARY = [...pool("Climatisation", 10), ...pool("Plomberie", 10), ...pool("Électricité", 10)];
const SEED = () => seededRandom(42);

describe("drawImageSets — what the drawn company sees", () => {
  it("alternates the company's trades across the slots", () => {
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation", "Plomberie"], library: LIBRARY, random: SEED(),
    });
    expect(slots.map((s) => s.leadTag)).toEqual([
      "climatisation", "plomberie", "climatisation", "plomberie", "climatisation", "plomberie",
    ]);
  });

  it("never repeats a photo when the pools are deep enough", () => {
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation", "Plomberie"], library: LIBRARY, random: SEED(),
    });
    const urls = slots.map((s) => s.chosen!.url);
    expect(new Set(urls).size).toBe(6);
  });

  it("resolves, through pickCandidate, to exactly the photo it drew", () => {
    // The set is ordered so the lead trade wins the tie — that is the whole
    // mechanism, so assert it against the real resolver rather than the order.
    const tags = ["Climatisation", "Plomberie"];
    const { slots } = drawImageSets({ slotCount: 6, companyTags: tags, library: LIBRARY, random: SEED() });
    for (const slot of slots) {
      expect(pickCandidate(slot.candidates, tags)!.url).toBe(slot.chosen!.url);
    }
  });

  it("gives a single-trade company six distinct photos of that trade", () => {
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation"], library: LIBRARY, random: SEED(),
    });
    expect(slots.every((s) => s.leadTag === "climatisation")).toBe(true);
    expect(new Set(slots.map((s) => s.chosen!.url)).size).toBe(6);
    expect(slots.every((s) => s.chosen!.url.includes("Climatisation"))).toBe(true);
  });

  it("matches the trade regardless of how the tag is written", () => {
    // The library says "Pompe à chaleur", the company "pompe-a-chaleur".
    const library = pool("Pompe à chaleur", 6);
    const { slots, emptyTags } = drawImageSets({
      slotCount: 6, companyTags: ["pompe-a-chaleur"], library, random: SEED(),
    });
    expect(emptyTags).toEqual([]);
    expect(slots.every((s) => s.chosen !== null)).toBe(true);
  });
});

describe("drawImageSets — serving the OTHER companies", () => {
  it("puts a candidate for every stocked trade in each slot", () => {
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation"], library: LIBRARY, random: SEED(),
    });
    // A plumber shown the same design still resolves to a plumbing photo.
    for (const slot of slots) {
      expect(pickCandidate(slot.candidates, ["Plomberie"])!.url).toContain("Plomberie");
      expect(pickCandidate(slot.candidates, ["Électricité"])!.url).toContain("Électricité");
    }
  });

  it("falls back to a universal image for a trade nobody stocked", () => {
    const library = [
      ...pool("Climatisation", 6),
      { id: "u1", url: "https://x/universelle.jpg", tags: ["all"], alt: "Chantier" },
    ];
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation"], library, random: SEED(),
    });
    expect(pickCandidate(slots[0].candidates, ["Ramonage"])!.url).toBe("https://x/universelle.jpg");
  });
});

describe("drawImageSets — reporting what the library lacks", () => {
  it("counts stock against need per trade", () => {
    const library = [...pool("Climatisation", 10), ...pool("Plomberie", 2)];
    const { pools } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation", "Plomberie"], library, random: SEED(),
    });
    // 6 slots over 2 trades → 3 photos each.
    expect(pools).toEqual([
      { tag: "climatisation", label: "Climatisation", available: 10, needed: 3 },
      { tag: "plomberie", label: "Plomberie", available: 2, needed: 3 },
    ]);
  });

  it("names a trade the library has nothing for", () => {
    const { emptyTags, slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation", "Ramonage"], library: LIBRARY, random: SEED(),
    });
    expect(emptyTags).toEqual(["Ramonage"]);
    // The band is still filled, from the trade that IS stocked.
    expect(slots.every((s) => s.leadTag === "climatisation")).toBe(true);
  });

  it("wraps a pool too small to cover its slots rather than leaving a hole", () => {
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation"], library: pool("Climatisation", 2), random: SEED(),
    });
    expect(slots.every((s) => s.chosen !== null)).toBe(true);
    expect(new Set(slots.map((s) => s.chosen!.url)).size).toBe(2); // repeats, reported via pools
  });

  it("returns nothing to write when the library is empty", () => {
    const { slots, emptyTags } = drawImageSets({
      slotCount: 6, companyTags: ["Climatisation"], library: [], random: SEED(),
    });
    expect(emptyTags).toEqual(["Climatisation"]);
    expect(slots.every((s) => s.candidates.length === 0 && s.chosen === null)).toBe(true);
  });
});

describe("drawImageSets — alt text and re-draws", () => {
  it("keeps the library description, falling back to the export's own alt", () => {
    const library = [
      { id: "a", url: "https://x/a.jpg", tags: ["Climatisation"] },            // no alt
      { id: "b", url: "https://x/b.jpg", tags: ["Climatisation"], alt: "Split mural" },
    ];
    const { slots } = drawImageSets(
      { slotCount: 2, companyTags: ["Climatisation"], library, random: SEED() },
      ["Chantier n°1", "Chantier n°2"],
    );
    const alts = slots.map((s) => s.candidates[0].alt);
    expect(alts).toContain("Split mural");
    expect(alts.some((a) => a?.startsWith("Chantier n°"))).toBe(true);
  });

  it("is reproducible from its seed, and different from another one", () => {
    const args = { slotCount: 6, companyTags: ["Climatisation", "Plomberie"], library: LIBRARY };
    const a = drawImageSets({ ...args, random: seededRandom(7) }).slots.map((s) => s.chosen!.url);
    const b = drawImageSets({ ...args, random: seededRandom(7) }).slots.map((s) => s.chosen!.url);
    const c = drawImageSets({ ...args, random: seededRandom(8) }).slots.map((s) => s.chosen!.url);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("handles a zone with no slot", () => {
    expect(drawImageSets({ slotCount: 0, companyTags: ["Climatisation"], library: LIBRARY })).toEqual({
      slots: [], pools: [], emptyTags: [],
    });
  });
});
