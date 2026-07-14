import { sanitizeTags } from "../describe-image";

const allowed = ["climatisation", "chauffage", "photovoltaïque"];

describe("sanitizeTags", () => {
  it("keeps only tags from the authorized catalogue", () => {
    expect(sanitizeTags(["climatisation", "poney", "chauffage"], allowed)).toEqual([
      "climatisation",
      "chauffage",
    ]);
  });

  it("matches accent/case-insensitively but returns the canonical spelling", () => {
    expect(sanitizeTags(["Photovoltaique", "CLIMATISATION"], allowed)).toEqual([
      "photovoltaïque",
      "climatisation",
    ]);
  });

  it("always allows the universal tag 'all'", () => {
    expect(sanitizeTags(["all"], allowed)).toEqual(["all"]);
  });

  it("de-duplicates and drops non-strings", () => {
    expect(sanitizeTags(["climatisation", "climatisation", 42, null], allowed)).toEqual([
      "climatisation",
    ]);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeTags("climatisation", allowed)).toEqual([]);
    expect(sanitizeTags(undefined, allowed)).toEqual([]);
  });
});
