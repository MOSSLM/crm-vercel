import { chooseSlotImage, drawImageSets, redrawSlot, seededRandom, type LibraryImage } from "../draw-image-sets";
import { pickCandidate } from "../image-set";

/** `n` library images all carrying `tag`, urls `<prefix>-1.jpg`… */
function pool(tag: string, n: number, prefix = tag): LibraryImage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`, url: `https://x/${prefix}-${i + 1}.jpg`, tags: [tag], alt: `${tag} ${i + 1}`,
  }));
}

/** `n` images carrying SEVERAL trades at once — one photo, several pools. */
function multiTag(tags: string[], n: number, prefix = "mixte"): LibraryImage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`, url: `https://x/${prefix}-${i + 1}.jpg`, tags, alt: `${prefix} ${i + 1}`,
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

describe("drawImageSets — a photo tagged for several trades", () => {
  // The pools of two trades OVERLAP as soon as a photo documents both jobs.
  // Counting per trade cannot see it, and the band showed the same photo twice.
  const TAGS = ["Climatisation", "Ventilation"];

  it("never places the same photo twice when every photo carries both trades", () => {
    const library = multiTag(TAGS, 8);
    const { slots } = drawImageSets({ slotCount: 6, companyTags: TAGS, library, random: SEED() });
    const urls = slots.map((s) => s.chosen!.url);
    expect(new Set(urls).size).toBe(6);
  });

  it("never places the same photo twice when the pools only partly overlap", () => {
    const library = [
      ...multiTag(TAGS, 3),                 // in BOTH pools
      ...pool("Climatisation", 3),
      ...pool("Ventilation", 3),
    ];
    for (let seed = 1; seed <= 40; seed++) {
      const { slots } = drawImageSets({
        slotCount: 6, companyTags: TAGS, library, random: seededRandom(seed),
      });
      const urls = slots.map((s) => s.chosen!.url);
      expect(new Set(urls).size).toBe(6);
    }
  });

  it("keeps alternating the trades while it dedupes", () => {
    const library = [...multiTag(TAGS, 3), ...pool("Climatisation", 3), ...pool("Ventilation", 3)];
    const { slots } = drawImageSets({ slotCount: 6, companyTags: TAGS, library, random: SEED() });
    expect(slots.map((s) => s.leadTag)).toEqual([
      "climatisation", "ventilation", "climatisation", "ventilation", "climatisation", "ventilation",
    ]);
    // And what the renderer resolves is still what the draw chose.
    for (const slot of slots) expect(pickCandidate(slot.candidates, TAGS)!.url).toBe(slot.chosen!.url);
  });

  it("still wraps, rather than leaving a hole, when the shared pool is too small", () => {
    const library = multiTag(TAGS, 2);
    const { slots } = drawImageSets({ slotCount: 6, companyTags: TAGS, library, random: SEED() });
    expect(slots.every((s) => s.chosen !== null)).toBe(true);
    expect(new Set(slots.map((s) => s.chosen!.url)).size).toBe(2); // reported via pools
  });

  it("gives a company the design is only CLONED for a repeat-free band too", () => {
    // Drawn for a plumber-electrician; a plumber sees the same six slots.
    const { slots } = drawImageSets({
      slotCount: 6, companyTags: ["Plomberie", "Électricité"], library: LIBRARY, random: SEED(),
    });
    const seen = slots.map((s) => pickCandidate(s.candidates, ["Plomberie"])!.url);
    expect(seen.every((u) => u.includes("Plomberie"))).toBe(true);
    expect(new Set(seen).size).toBe(6);
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

describe("redrawSlot — swapping ONE photo", () => {
  const TAGS = ["Climatisation", "Plomberie"];
  const base = () => drawImageSets({ slotCount: 6, companyTags: TAGS, library: LIBRARY, random: SEED() }).slots;

  it("keeps the slot's trade so the alternation survives", () => {
    const slots = base();
    // Slot 2 (index 1) leads with plomberie under the round-robin.
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99),
      slotIndex: 1,
      usedUrls: slots.filter((_, i) => i !== 1).map((s) => s.chosen!.url),
      currentUrl: slots[1].chosen!.url,
    })!;
    expect(next.leadTag).toBe("plomberie");
    expect(next.chosen!.url).toContain("Plomberie");
  });

  it("stays on the trade the slot SHOWS, not on its round-robin one", () => {
    // Slot 1 leads climatisation when drawn; a hand pick moved it to plomberie,
    // and re-rolling must not quietly move it back.
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99),
      slotIndex: 0, leadTag: "Plomberie", currentUrl: "https://x/Plomberie-1.jpg",
    })!;
    expect(next.leadTag).toBe("plomberie");
    expect(next.chosen!.url).toContain("Plomberie");
  });

  it("ignores a trade the library cannot serve and falls back to the round-robin", () => {
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99),
      slotIndex: 0, leadTag: "Ramonage",
    })!;
    expect(next.leadTag).toBe("climatisation");
  });

  it("actually changes the photo", () => {
    const slots = base();
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99),
      slotIndex: 0, currentUrl: slots[0].chosen!.url,
    })!;
    expect(next.chosen!.url).not.toBe(slots[0].chosen!.url);
  });

  it("avoids the photos the other slots already show", () => {
    const slots = base();
    const used = slots.filter((_, i) => i !== 0).map((s) => s.chosen!.url);
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99),
      slotIndex: 0, usedUrls: used, currentUrl: slots[0].chosen!.url,
    })!;
    expect(used).not.toContain(next.chosen!.url);
  });

  it("still resolves to the swapped photo through pickCandidate", () => {
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99),
      slotIndex: 2, currentUrl: "https://x/Climatisation-1.jpg",
    })!;
    expect(pickCandidate(next.candidates, TAGS)!.url).toBe(next.chosen!.url);
  });

  it("keeps serving the other companies — the set is rebuilt whole", () => {
    const next = redrawSlot({
      slotCount: 6, companyTags: TAGS, library: LIBRARY, random: seededRandom(99), slotIndex: 0,
    })!;
    expect(pickCandidate(next.candidates, ["Électricité"])!.url).toContain("Électricité");
  });

  it("settles for a repeat rather than nothing when the pool is exhausted", () => {
    // 2 photos for 3 slots of that trade: the swap can't avoid every other slot.
    const library = pool("Climatisation", 2);
    const next = redrawSlot({
      slotCount: 6, companyTags: ["Climatisation"], library, random: seededRandom(5),
      slotIndex: 0,
      usedUrls: ["https://x/Climatisation-2.jpg"],
      currentUrl: "https://x/Climatisation-1.jpg",
    })!;
    expect(next.chosen!.url).toBe("https://x/Climatisation-2.jpg"); // ≠ current, repeat accepted
  });

  it("reports that nothing else exists for a one-photo pool", () => {
    const library = pool("Climatisation", 1);
    expect(redrawSlot({
      slotCount: 6, companyTags: ["Climatisation"], library, random: seededRandom(5),
      slotIndex: 0, currentUrl: "https://x/Climatisation-1.jpg",
    })).toBeNull();
  });

  it("reports that nothing else exists when no trade is stocked", () => {
    expect(redrawSlot({
      slotCount: 6, companyTags: ["Ramonage"], library: LIBRARY, random: seededRandom(5), slotIndex: 0,
    })).toBeNull();
  });
});

describe("chooseSlotImage — the operator picks the photo himself", () => {
  const TAGS = ["Climatisation", "Plomberie"];
  const pick = (url: string, slotIndex = 0, extra: Partial<{ library: LibraryImage[] }> = {}) =>
    chooseSlotImage({
      slotCount: 6, companyTags: TAGS, library: extra.library ?? LIBRARY, random: SEED(), slotIndex, url,
    });

  it("puts exactly the named photo on the slot", () => {
    const next = pick("https://x/Plomberie-7.jpg")!;
    expect(next.chosen!.url).toBe("https://x/Plomberie-7.jpg");
    expect(pickCandidate(next.candidates, TAGS)!.url).toBe("https://x/Plomberie-7.jpg");
  });

  it("takes the trade of the photo, even against the slot's round-robin", () => {
    // Slot 1 (index 0) leads climatisation when drawn; a plumbing photo wins it.
    const next = pick("https://x/Plomberie-2.jpg", 0)!;
    expect(next.leadTag).toBe("plomberie");
  });

  it("wins on score, not merely on order, for a photo of several of the trades", () => {
    const library = [...LIBRARY, ...multiTag(TAGS, 1, "mixte")];
    const next = pick("https://x/mixte-1.jpg", 0, { library })!;
    expect(next.candidates[0].tags).toEqual(TAGS);
    expect(pickCandidate(next.candidates, TAGS)!.url).toBe("https://x/mixte-1.jpg");
  });

  it("pins a generic photo on the slot for THIS company only", () => {
    const library = [...LIBRARY, { id: "u", url: "https://x/generique.jpg", tags: ["all"], alt: "Chantier" }];
    const next = pick("https://x/generique.jpg", 2, { library })!;
    expect(next.chosen!.url).toBe("https://x/generique.jpg");
    expect(pickCandidate(next.candidates, TAGS)!.url).toBe("https://x/generique.jpg");
    // Another company still resolves to a photo of ITS trade.
    expect(pickCandidate(next.candidates, ["Électricité"])!.url).toContain("Électricité");
  });

  it("keeps serving the other companies — the set is rebuilt whole", () => {
    const next = pick("https://x/Climatisation-4.jpg", 3)!;
    expect(pickCandidate(next.candidates, ["Électricité"])!.url).toContain("Électricité");
    expect(pickCandidate(next.candidates, ["Plomberie"])!.url).toContain("Plomberie");
  });

  it("refuses a url the library does not hold", () => {
    expect(pick("https://x/ailleurs.jpg")).toBeNull();
    expect(pick("")).toBeNull();
  });

  it("works for a company whose trades the library cannot serve at all", () => {
    const library = [{ id: "u", url: "https://x/generique.jpg", tags: ["all"], alt: "Chantier" }];
    const next = chooseSlotImage({
      slotCount: 6, companyTags: ["Ramonage"], library, random: SEED(), slotIndex: 0,
      url: "https://x/generique.jpg",
    })!;
    expect(next.chosen!.url).toBe("https://x/generique.jpg");
    expect(pickCandidate(next.candidates, ["Ramonage"])!.url).toBe("https://x/generique.jpg");
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
