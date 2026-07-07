import { convertVhToPx } from "../preview-viewport";

describe("convertVhToPx", () => {
  it("converts plain vh", () => {
    expect(convertVhToPx("100vh", 900)).toBe("900px");
    expect(convertVhToPx("50vh", 900)).toBe("450px");
  });

  it("converts the small/large/dynamic viewport-height units (svh/lvh/dvh)", () => {
    expect(convertVhToPx("100dvh", 900)).toBe("900px");
    expect(convertVhToPx("100svh", 812)).toBe("812px");
    expect(convertVhToPx("100lvh", 900)).toBe("900px");
  });

  it("works inside calc() and keeps other units", () => {
    expect(convertVhToPx("calc(100dvh - 64px)", 900)).toBe("calc(900px - 64px)");
    expect(convertVhToPx("min(58vh, 440px)", 900)).toBe("min(522px, 440px)");
  });

  it("does not touch unrelated tokens", () => {
    expect(convertVhToPx("width:100%", 900)).toBe("width:100%");
    // 'vh' must be a unit suffix on a number, not part of a word
    expect(convertVhToPx("overflow:hidden", 900)).toBe("overflow:hidden");
  });
});
