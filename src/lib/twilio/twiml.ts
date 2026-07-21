/**
 * TwiML builders. Kept separate from the route handlers so the XML shape is
 * unit-testable and reused across outbound (softphone) and, later, inbound
 * routing / IVR / voicemail.
 */
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

const CONSENT_FR =
  "Cet appel est susceptible d'être enregistré à des fins de qualité et de suivi.";

export interface OutboundDialOptions {
  callerId: string;
  to: string;
  /** When true, record the call from answer (dual channel). */
  record?: boolean;
  /** Recording status callback URL (fires when the recording is ready). */
  recordingStatusCallback?: string;
  /** Play a recording-consent announcement before dialing. */
  consent?: boolean;
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

  if (opts.record && opts.consent) {
    response.say({ language: "fr-FR", voice: "Polly.Lea" }, CONSENT_FR);
  }

  const dialOptions: Record<string, unknown> = {
    callerId: opts.callerId,
    answerOnBridge: true,
    timeout: opts.timeout ?? 30,
  };
  if (opts.record) {
    dialOptions.record = "record-from-answer-dual";
    if (opts.recordingStatusCallback) {
      dialOptions.recordingStatusCallback = opts.recordingStatusCallback;
      dialOptions.recordingStatusCallbackEvent = "completed";
    }
  }
  const dial = response.dial(dialOptions);

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
