/**
 * TwiML builders for inbound call handling: ring the agent's browser client,
 * forward to an external number, drop to voicemail, or present an IVR menu.
 */
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

const CONSENT_FR =
  "Cet appel est susceptible d'être enregistré à des fins de qualité et de suivi.";

type Dial = ReturnType<InstanceType<typeof VoiceResponse>["dial"]>;

const applyRecording = (
  dialOptions: Record<string, unknown>,
  record: boolean,
  recordingStatusCallback?: string,
) => {
  if (record) {
    dialOptions.record = "record-from-answer-dual";
    if (recordingStatusCallback) {
      dialOptions.recordingStatusCallback = recordingStatusCallback;
      dialOptions.recordingStatusCallbackEvent = "completed";
    }
  }
};

export interface DialClientsOptions {
  identities: string[];
  callerId?: string;
  actionUrl: string; // hit after the dial completes (for voicemail fallback)
  timeout?: number;
  record?: boolean;
  recordingStatusCallback?: string;
  consent?: boolean;
}

/** Ring one or more browser clients simultaneously; fall through to `actionUrl`. */
export const dialClientsTwiml = (opts: DialClientsOptions): string => {
  const response = new VoiceResponse();
  if (opts.consent) response.say({ language: "fr-FR", voice: "Polly.Lea" }, CONSENT_FR);

  const dialOptions: Record<string, unknown> = {
    action: opts.actionUrl,
    method: "POST",
    timeout: opts.timeout ?? 20,
    answerOnBridge: true,
  };
  if (opts.callerId) dialOptions.callerId = opts.callerId;
  applyRecording(dialOptions, !!opts.record, opts.recordingStatusCallback);

  const dial = response.dial(dialOptions) as Dial;
  for (const id of opts.identities) dial.client({}, id);
  return response.toString();
};

export interface ForwardOptions {
  to: string;
  callerId?: string;
  actionUrl: string;
  timeout?: number;
  record?: boolean;
  recordingStatusCallback?: string;
  consent?: boolean;
}

/** Forward to an external PSTN number (e.g. the agent's mobile). */
export const forwardTwiml = (opts: ForwardOptions): string => {
  const response = new VoiceResponse();
  if (opts.consent) response.say({ language: "fr-FR", voice: "Polly.Lea" }, CONSENT_FR);

  const dialOptions: Record<string, unknown> = {
    action: opts.actionUrl,
    method: "POST",
    timeout: opts.timeout ?? 25,
    answerOnBridge: true,
  };
  if (opts.callerId) dialOptions.callerId = opts.callerId;
  applyRecording(dialOptions, !!opts.record, opts.recordingStatusCallback);

  const dial = response.dial(dialOptions) as Dial;
  dial.number({}, opts.to);
  return response.toString();
};

export interface VoicemailOptions {
  greeting?: string;
  actionUrl: string; // receives RecordingUrl when the message is left
  transcribeCallback?: string; // when set, Twilio transcribes and posts here
  maxLength?: number;
}

/** Play a greeting and record a voicemail. */
export const voicemailTwiml = (opts: VoicemailOptions): string => {
  const response = new VoiceResponse();
  response.say(
    { language: "fr-FR", voice: "Polly.Lea" },
    opts.greeting ??
      "Vous êtes bien sur notre messagerie. Laissez votre message après le bip, puis raccrochez.",
  );
  const recordOptions: Record<string, unknown> = {
    action: opts.actionUrl,
    method: "POST",
    maxLength: opts.maxLength ?? 120,
    playBeep: true,
    trim: "trim-silence",
  };
  if (opts.transcribeCallback) {
    recordOptions.transcribe = true;
    recordOptions.transcribeCallback = opts.transcribeCallback;
  }
  response.record(recordOptions);
  response.hangup();
  return response.toString();
};

export interface GatherMenuOptions {
  greeting: string;
  actionUrl: string; // receives Digits
  numDigits?: number;
  reprompt?: string;
}

/** Present a keypad menu (IVR). Digits are posted to `actionUrl`. */
export const gatherMenuTwiml = (opts: GatherMenuOptions): string => {
  const response = new VoiceResponse();
  const gather = response.gather({
    action: opts.actionUrl,
    method: "POST",
    numDigits: opts.numDigits ?? 1,
    timeout: 6,
  });
  gather.say({ language: "fr-FR", voice: "Polly.Lea" }, opts.greeting);
  // No input → repeat once via redirect back to the menu.
  response.redirect({ method: "POST" }, opts.actionUrl);
  return response.toString();
};

/** Simple spoken message + hangup (e.g. closed / unavailable). */
export const sayHangupTwiml = (message: string): string => {
  const response = new VoiceResponse();
  response.say({ language: "fr-FR", voice: "Polly.Lea" }, message);
  response.hangup();
  return response.toString();
};
