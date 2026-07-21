/**
 * @jest-environment node
 */
import {
  getTwilioService,
  __resetTwilioServiceForTests,
} from "../service";

// No Twilio credentials → the service falls back to the in-memory mock, which
// must be fully functional so the whole call-center works with zero account.
jest.mock("@/env", () => ({
  TWILIO_ACCOUNT_SID: undefined,
  TWILIO_AUTH_TOKEN: undefined,
  TWILIO_API_KEY_SID: undefined,
  TWILIO_API_KEY_SECRET: undefined,
  TWILIO_TWIML_APP_SID: undefined,
  TWILIO_MOCK: undefined,
}));

describe("Twilio mock service (no credentials)", () => {
  beforeEach(() => __resetTwilioServiceForTests());

  it("runs in mock mode when unconfigured", () => {
    expect(getTwilioService().mock).toBe(true);
  });

  it("searches plausible FR local numbers with voice capability", async () => {
    const results = await getTwilioService().searchAvailableNumbers({
      country: "FR",
      type: "local",
      limit: 5,
    });
    expect(results).toHaveLength(5);
    for (const n of results) {
      expect(n.phoneNumber).toMatch(/^\+331\d{6}$/);
      expect(n.isoCountry).toBe("FR");
      expect(n.capabilities.voice).toBe(true);
    }
  });

  it("generates FR mobile numbers under +336", async () => {
    const [first] = await getTwilioService().searchAvailableNumbers({
      country: "FR",
      type: "mobile",
      limit: 1,
    });
    expect(first.phoneNumber).toMatch(/^\+336\d{6}$/);
  });

  it("buys a number and echoes it back with a PN sid", async () => {
    const bought = await getTwilioService().buyNumber({ phoneNumber: "+33123456789" });
    expect(bought.phoneNumber).toBe("+33123456789");
    expect(bought.sid).toMatch(/^PN[0-9a-f]{32}$/);
    expect(bought.capabilities.voice).toBe(true);
  });

  it("sends an SMS returning a queued SM sid", async () => {
    const res = await getTwilioService().sendSms({
      from: "+33123456789",
      to: "+33612345678",
      body: "Bonjour",
    });
    expect(res.sid).toMatch(/^SM[0-9a-f]{32}$/);
    expect(res.status).toBe("queued");
  });

  it("release/update/updateCall are safe no-ops in mock mode", async () => {
    const svc = getTwilioService();
    await expect(svc.releaseNumber("PNxxx")).resolves.toBeUndefined();
    await expect(svc.updateNumber("PNxxx", { friendlyName: "x" })).resolves.toBeUndefined();
    await expect(svc.updateCall("CAxxx", { status: "completed" })).resolves.toBeUndefined();
  });
});
