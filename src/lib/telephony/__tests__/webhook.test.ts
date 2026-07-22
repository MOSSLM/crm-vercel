import {
  computeSignature,
  normalizeEvent,
  parseWebhookBody,
  signatureStringFor,
  verifySignature,
} from "../providers/zadarma/webhook";

const SECRET = "test-secret";

function signedBody(fields: Record<string, string>): string {
  const sigString = signatureStringFor(fields);
  const signature = computeSignature(sigString ?? "", SECRET);
  return new URLSearchParams({ ...fields, signature }).toString();
}

describe("zadarma webhook verification", () => {
  it("verifies a correctly signed OUT_END payload", () => {
    const body = signedBody({
      event: "NOTIFY_OUT_END",
      internal: "100",
      destination: "+33600000000",
      call_start: "2026-07-22 10:00:00",
      duration: "42",
      disposition: "answered",
    });
    expect(verifySignature(parseWebhookBody(body), SECRET)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const body = signedBody({
      event: "NOTIFY_START",
      caller_id: "+33600000000",
      called_did: "+33100000000",
      call_start: "2026-07-22 10:00:00",
    });
    const tampered = parseWebhookBody(body);
    tampered.caller_id = "+33699999999"; // changed after signing
    expect(verifySignature(tampered, SECRET)).toBe(false);
  });

  it("rejects unknown events", () => {
    expect(signatureStringFor({ event: "NOTIFY_BOGUS" })).toBeNull();
    expect(verifySignature({ event: "NOTIFY_BOGUS", signature: "x" }, SECRET)).toBe(false);
  });
});

describe("zadarma event normalisation", () => {
  it("maps an outbound end to a normalised ended event", () => {
    const ev = normalizeEvent(
      parseWebhookBody(
        new URLSearchParams({
          event: "NOTIFY_OUT_END",
          internal: "100",
          destination: "+33600000000",
          call_start: "2026-07-22 10:00:00",
          duration: "42",
          disposition: "answered",
          is_recorded: "1",
          call_id_with_rec: "rec-123",
          pbx_call_id: "call-abc",
        }).toString(),
      ),
    );
    expect(ev).toMatchObject({
      type: "ended",
      direction: "outbound",
      from: "100",
      to: "+33600000000",
      durationSec: 42,
      disposition: "answered",
      recordingProviderId: "rec-123",
      providerCallId: "call-abc",
    });
  });

  it("maps an inbound start to a ringing event", () => {
    const ev = normalizeEvent(
      parseWebhookBody(
        new URLSearchParams({
          event: "NOTIFY_START",
          caller_id: "+33600000000",
          called_did: "+33100000000",
          call_start: "2026-07-22 10:00:00",
          pbx_call_id: "call-xyz",
        }).toString(),
      ),
    );
    expect(ev).toMatchObject({
      type: "ringing",
      direction: "inbound",
      from: "+33600000000",
      to: "+33100000000",
      providerCallId: "call-xyz",
    });
  });

  it("ignores unknown events", () => {
    expect(normalizeEvent({ event: "NOTIFY_BOGUS" })).toBeNull();
  });

  it("normalises an inbound SMS payload", () => {
    const ev = normalizeEvent(
      parseWebhookBody(
        new URLSearchParams({
          caller_id: "+33600000000",
          called_did: "+33100000000",
          text: "Bonjour",
          sms_id: "sms-1",
        }).toString(),
      ),
    );
    expect(ev).toMatchObject({
      type: "sms_inbound",
      direction: "inbound",
      from: "+33600000000",
      to: "+33100000000",
      sms: { messageId: "sms-1", body: "Bonjour" },
    });
  });
});
