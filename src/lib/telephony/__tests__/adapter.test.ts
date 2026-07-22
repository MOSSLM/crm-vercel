import { ZadarmaAdapter } from "../providers/zadarma/adapter";
import { TwilioAdapter } from "../providers/twilio/adapter";
import { NotSupportedError } from "../core/errors";

/** Build a fake `fetch` that records the last call and returns `json`. */
function fakeFetch(json: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(json),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("ZadarmaAdapter", () => {
  const opts = { key: "KEY", secret: "SECRET" };

  it("advertises Zadarma's real capability profile", () => {
    const a = new ZadarmaAdapter(opts);
    expect(a.id).toBe("zadarma");
    expect(a.supports("recording")).toBe(true);
    expect(a.supports("browserWebRTC")).toBe(true);
    expect(a.supports("transcription")).toBe(true);
    // Zadarma cannot do these via API:
    expect(a.supports("supervisionApi")).toBe(false);
    expect(a.supports("portNumber")).toBe(false);
  });

  it("places a callback and returns the provider call id", async () => {
    const { impl, calls } = fakeFetch({ status: "success", pbx_call_id: "cb-1" });
    const a = new ZadarmaAdapter({ ...opts, fetchImpl: impl });
    const res = await a.placeCallback({ from: "100", to: "+33600000000" });
    expect(res.providerCallId).toBe("cb-1");
    expect(calls[0].url).toContain("/v1/request/callback/");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toContain("KEY:");
  });

  it("mints a browser key with a 72h expiry", async () => {
    const { impl } = fakeFetch({ status: "success", key: "webrtc-key" });
    const a = new ZadarmaAdapter({ ...opts, fetchImpl: impl });
    const key = await a.mintBrowserKey({ ext: "100", sip: "100" });
    expect(key.key).toBe("webrtc-key");
    const ttlHours = (new Date(key.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(71);
    expect(ttlHours).toBeLessThanOrEqual(72);
  });

  it("surfaces Zadarma API errors", async () => {
    const { impl } = fakeFetch({ status: "error", message: "bad_request" });
    const a = new ZadarmaAdapter({ ...opts, fetchImpl: impl });
    await expect(a.listNumbers()).rejects.toThrow(/bad_request/);
  });

  it("registers a webrtc domain", async () => {
    const { impl, calls } = fakeFetch({ status: "success" });
    const a = new ZadarmaAdapter({ ...opts, fetchImpl: impl });
    const res = await a.registerWebrtcDomain("crm.example.com");
    expect(res.ok).toBe(true);
    expect(calls[0].url).toContain("/v1/webrtc/create/");
  });

  it("lists webrtc domains", async () => {
    const { impl } = fakeFetch({ status: "success", domains: ["crm.example.com"] });
    const a = new ZadarmaAdapter({ ...opts, fetchImpl: impl });
    expect(await a.listWebrtcDomains()).toContain("crm.example.com");
  });
});

describe("TwilioAdapter (stub) proves the abstraction seam", () => {
  const t = new TwilioAdapter();

  it("reports no capabilities yet", () => {
    expect(t.id).toBe("twilio");
    expect(t.supports("callback")).toBe(false);
    expect(t.supports("nativeSms")).toBe(false);
  });

  it("throws NotSupportedError for unimplemented methods", async () => {
    await expect(t.placeCallback({ from: "1", to: "2" })).rejects.toBeInstanceOf(NotSupportedError);
    await expect(t.sendSms({ from: "1", to: "2", text: "x" })).rejects.toBeInstanceOf(
      NotSupportedError,
    );
  });
});
