import { buildParamsString, signRequest } from "../providers/zadarma/client";

describe("zadarma request signing", () => {
  it("sorts params ascending and encodes spaces as +", () => {
    const s = buildParamsString({ to: "+33 6", from: "100", b: undefined, a: "x" });
    // undefined dropped, keys sorted a,b(dropped),from,to
    expect(s).toBe("a=x&from=100&to=%2B33+6");
  });

  it("produces a stable Authorization header for the same inputs", () => {
    const a = signRequest("/v1/request/callback/", { from: "100", to: "200" }, "KEY", "SECRET");
    const b = signRequest("/v1/request/callback/", { to: "200", from: "100" }, "KEY", "SECRET");
    // Param order in the object must not change the signature (they are sorted).
    expect(a.signature).toBe(b.signature);
    expect(a.authorization.startsWith("KEY:")).toBe(true);
  });

  it("changes the signature when the secret changes", () => {
    const a = signRequest("/v1/x/", { p: "1" }, "KEY", "SECRET_A");
    const b = signRequest("/v1/x/", { p: "1" }, "KEY", "SECRET_B");
    expect(a.signature).not.toBe(b.signature);
  });
});
