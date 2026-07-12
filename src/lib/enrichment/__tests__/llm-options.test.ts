import {
  ENRICHMENT_LLM_OPTIONS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  isValidProvider,
  findLlmOption,
} from "../llm-options";

describe("enrichment llm-options", () => {
  it("le modèle par défaut fait partie des options", () => {
    expect(findLlmOption(DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL)).toBeDefined();
  });

  it("n'expose que des providers valides", () => {
    for (const opt of ENRICHMENT_LLM_OPTIONS) {
      expect(isValidProvider(opt.provider)).toBe(true);
      expect(opt.model.trim().length).toBeGreaterThan(0);
    }
  });

  it("OpenAI = schéma strict, DeepSeek = non strict", () => {
    for (const opt of ENRICHMENT_LLM_OPTIONS) {
      expect(opt.strictSchema).toBe(opt.provider === "openai");
    }
  });

  it("isValidProvider rejette les valeurs inconnues", () => {
    expect(isValidProvider("anthropic")).toBe(false);
    expect(isValidProvider(null)).toBe(false);
    expect(isValidProvider(undefined)).toBe(false);
  });
});
