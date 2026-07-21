/**
 * TwiML builders. Kept separate from the route handlers so the XML shape is
 * unit-testable and reused across outbound (softphone) and, later, inbound
 * routing / IVR / voicemail.
 */
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export interface OutboundDialOptions {
  callerId: string;
  to: string;
  /** When true, record the call from answer (dual channel). */
  record?: boolean;
  /** Status-callback URL for the dialed (child) leg. */
  statusCallback?: string;
  /** Ring timeout in seconds before giving up. */
  timeout?: number;
}

/**
 * Outbound call from the browser: bridge the agent's Device to a PSTN number
 * (or another client identity, when `to` starts with `client:`).
 * `answerOnBridge` makes the caller hear real ringback until the callee picks up.
 */
export const outboundDialTwiml = (opts: OutboundDialOptions): string => {
  const response = new VoiceResponse();

  if (!opts.to) {
    response.say({ language: "fr-FR" }, "Numéro de destination manquant.");
    return response.toString();
  }

  const dial = response.dial({
    callerId: opts.callerId,
    answerOnBridge: true,
    record: opts.record ? "record-from-answer-dual" : undefined,
    timeout: opts.timeout ?? 30,
  });

  if (opts.to.startsWith("client:")) {
    dial.client(
      {
        statusCallback: opts.statusCallback,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      },
      opts.to.slice("client:".length),
    );
  } else {
    dial.number(
      {
        statusCallback: opts.statusCallback,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      },
      opts.to,
    );
  }

  return response.toString();
};

/** Minimal spoken error response (e.g. no caller number configured). */
export const sayErrorTwiml = (message: string): string => {
  const response = new VoiceResponse();
  response.say({ language: "fr-FR", voice: "Polly.Lea" }, message);
  response.hangup();
  return response.toString();
};
