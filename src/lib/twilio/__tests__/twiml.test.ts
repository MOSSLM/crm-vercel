/**
 * @jest-environment node
 */
import { outboundDialTwiml, sayErrorTwiml } from "../twiml";
import { clientIdentityForUser } from "../token";

jest.mock("@/env", () => ({
  TWILIO_ACCOUNT_SID: undefined,
  TWILIO_AUTH_TOKEN: undefined,
  TWILIO_API_KEY_SID: undefined,
  TWILIO_API_KEY_SECRET: undefined,
  TWILIO_TWIML_APP_SID: undefined,
  TWILIO_MOCK: undefined,
}));

describe("outboundDialTwiml", () => {
  it("dials a PSTN number with the given caller ID", () => {
    const xml = outboundDialTwiml({ callerId: "+33123456789", to: "+33612345678" });
    expect(xml).toContain("<Dial");
    expect(xml).toContain('callerId="+33123456789"');
    expect(xml).toContain("<Number");
    expect(xml).toContain("+33612345678");
    expect(xml).toContain('answerOnBridge="true"');
  });

  it("dials a client identity when target starts with client:", () => {
    const xml = outboundDialTwiml({ callerId: "+33123456789", to: "client:agent-1" });
    expect(xml).toContain("<Client");
    expect(xml).toContain("agent-1");
    expect(xml).not.toContain("<Number");
  });

  it("speaks an error when no destination is given", () => {
    const xml = outboundDialTwiml({ callerId: "+33123456789", to: "" });
    expect(xml).toContain("<Say");
    expect(xml).not.toContain("<Dial");
  });
});

describe("sayErrorTwiml", () => {
  it("says the message and hangs up", () => {
    const xml = sayErrorTwiml("Erreur test");
    expect(xml).toContain("Erreur test");
    expect(xml).toContain("<Hangup");
  });
});

describe("clientIdentityForUser", () => {
  it("keeps UUID characters (alphanumerics and dashes)", () => {
    const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(clientIdentityForUser(id)).toBe(id);
  });

  it("strips disallowed characters", () => {
    expect(clientIdentityForUser("a b@c#1")).toBe("abc1");
  });
});
