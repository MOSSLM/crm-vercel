/**
 * @jest-environment node
 */
import { parseTwilioForm } from "../signature";

jest.mock("@/env", () => ({
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "secrettoken",
  TWILIO_API_KEY_SID: undefined,
  TWILIO_API_KEY_SECRET: undefined,
  TWILIO_TWIML_APP_SID: undefined,
  TWILIO_MOCK: undefined,
}));

// Mock the twilio SDK's validateRequest so we can assert our wiring without a
// real HMAC. default export is the client factory (unused here).
const mockValidateRequest = jest.fn();
jest.mock("twilio", () => ({
  __esModule: true,
  default: jest.fn(),
  validateRequest: (...args: unknown[]) => mockValidateRequest(...args),
}));

const makeReq = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/twilio/incoming", {
    method: "POST",
    headers,
  });

describe("parseTwilioForm", () => {
  it("parses url-encoded Twilio params into a flat map", () => {
    const params = parseTwilioForm("CallSid=CA123&From=%2B33612345678&Digits=1");
    expect(params).toEqual({ CallSid: "CA123", From: "+33612345678", Digits: "1" });
  });
});

describe("validateTwilioSignature (token configured)", () => {
  // Re-require after the env mock is in place so twilioConfig picks up the token.
  const { validateTwilioSignature } = require("../signature");

  beforeEach(() => mockValidateRequest.mockReset());

  it("rejects when the signature header is missing", () => {
    const ok = validateTwilioSignature(makeReq(), { CallSid: "CA1" });
    expect(ok).toBe(false);
    expect(mockValidateRequest).not.toHaveBeenCalled();
  });

  it("delegates to twilio.validateRequest and returns its verdict", () => {
    mockValidateRequest.mockReturnValue(true);
    const ok = validateTwilioSignature(
      makeReq({ "x-twilio-signature": "sig" }),
      { CallSid: "CA1" },
      { url: "https://app.example.com/api/twilio/incoming" },
    );
    expect(ok).toBe(true);
    expect(mockValidateRequest).toHaveBeenCalledWith(
      "secrettoken",
      "sig",
      "https://app.example.com/api/twilio/incoming",
      { CallSid: "CA1" },
    );
  });

  it("returns false when twilio.validateRequest throws", () => {
    mockValidateRequest.mockImplementation(() => {
      throw new Error("boom");
    });
    const ok = validateTwilioSignature(makeReq({ "x-twilio-signature": "sig" }), {});
    expect(ok).toBe(false);
  });
});
