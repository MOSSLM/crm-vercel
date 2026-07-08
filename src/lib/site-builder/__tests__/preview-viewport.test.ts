import { buildViewportLockScript, convertVhToPx } from "../preview-viewport";

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

describe("buildViewportLockScript", () => {
  it("embeds the simulated height as the locked value", () => {
    const script = buildViewportLockScript(812);
    expect(script).toContain("var H = 812;");
  });

  it("locks the JS-visible viewport-height reads the design JS relies on", () => {
    const script = buildViewportLockScript(900);
    expect(script).toContain("lock(window, 'innerHeight', H)");
    expect(script).toContain("window.visualViewport");
    expect(script).toContain("document.documentElement, 'clientHeight'");
  });

  it("locks innerHeight so JS reads the fixed height instead of the growing frame", () => {
    // Simulate an iframe window whose innerHeight would otherwise track the
    // (growing) frame height. After running the lock script, innerHeight is pinned.
    const fakeWindow: Record<string, unknown> = { innerHeight: 4000 };
    const fakeDocEl: Record<string, unknown> = { clientHeight: 4000 };
    const script = buildViewportLockScript(900).replace(/^<script>|<\/script>$/g, "");
    const run = new Function("window", "document", script);
    run(fakeWindow, { documentElement: fakeDocEl });
    expect(fakeWindow.innerHeight).toBe(900);
    expect(fakeDocEl.clientHeight).toBe(900);
  });
});
