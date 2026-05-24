/**
 * @jest-environment node
 */
import { z } from "zod";
import { AiJsonParseError, extractJsonFromAiResponse } from "../ai-json";

describe("extractJsonFromAiResponse", () => {
  it("parses a bare JSON object", () => {
    expect(extractJsonFromAiResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts the first JSON object out of prose", () => {
    expect(extractJsonFromAiResponse('Here you go: {"a":1, "b":"two"} OK.'))
      .toEqual({ a: 1, b: "two" });
  });

  it("extracts JSON from a fenced ```json block", () => {
    expect(extractJsonFromAiResponse("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("throws AiJsonParseError on empty input", () => {
    expect(() => extractJsonFromAiResponse("")).toThrow(AiJsonParseError);
    expect(() => extractJsonFromAiResponse("   ")).toThrow(/Empty AI response/);
  });

  it("throws AiJsonParseError when no JSON object is present", () => {
    expect(() => extractJsonFromAiResponse("nope, just words"))
      .toThrow(/No JSON object found/);
  });

  it("throws AiJsonParseError when JSON is malformed", () => {
    // Has matching braces (so the regex finds an object) but the contents
    // aren't valid JSON.
    expect(() => extractJsonFromAiResponse('{"a": 1, "b":}'))
      .toThrow(/Malformed JSON/);
  });

  it("validates against a Zod schema and returns typed data", () => {
    const schema = z.object({ a: z.number(), b: z.string() });
    const result = extractJsonFromAiResponse('{"a":1,"b":"two"}', schema);
    // result is typed as { a: number; b: string }
    expect(result.a + 1).toBe(2);
    expect(result.b.toUpperCase()).toBe("TWO");
  });

  it("throws AiJsonParseError when Zod validation fails", () => {
    const schema = z.object({ a: z.number() });
    expect(() => extractJsonFromAiResponse('{"a":"oops"}', schema))
      .toThrow(/failed schema validation/);
  });
});
