const mockAnthropicCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

import { describeImage, sanitizeTags } from "../describe-image";

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

describe("describeImage", () => {
  const OLD_KEY = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = OLD_KEY;
  });
  beforeEach(() => mockAnthropicCreate.mockReset());

  const textResponse = (obj: unknown) => ({
    content: [{ type: "text", text: JSON.stringify(obj) }],
  });

  it("with withTags:false returns alt + description but NO tags, even if the model returns some", async () => {
    mockAnthropicCreate.mockResolvedValue(
      textResponse({ service_tags: ["climatisation"], alt_text: "Une clim murale", description: "Photo d'une unité." }),
    );
    const r = await describeImage({
      imageUrl: "https://x/y.webp",
      allowedTags: [],
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      withTags: false,
    });
    expect(r.service_tags).toEqual([]);
    expect(r.alt_text).toBe("Une clim murale");
    expect(r.description).toBe("Photo d'une unité.");
  });

  it("tags normally when withTags is not set", async () => {
    mockAnthropicCreate.mockResolvedValue(
      textResponse({ service_tags: ["climatisation"], alt_text: "A", description: "B" }),
    );
    const r = await describeImage({
      imageUrl: "https://x/y.webp",
      allowedTags: ["climatisation"],
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    expect(r.service_tags).toEqual(["climatisation"]);
  });
});
