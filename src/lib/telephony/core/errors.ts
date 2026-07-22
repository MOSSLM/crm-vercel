/**
 * Telephony error types. Kept provider-agnostic so callers can catch a stable
 * type regardless of which carrier adapter raised it.
 */

export class TelephonyError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code = "telephony_error", cause?: unknown) {
    super(message);
    this.name = "TelephonyError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Thrown when a provider is asked to perform a capability it does not support
 * (e.g. Zadarma has no REST API for call supervision). UI should check
 * `provider.supports(cap)` first and hide the control rather than rely on this.
 */
export class NotSupportedError extends TelephonyError {
  constructor(capability: string, providerId: string) {
    super(
      `Capability "${capability}" is not supported by provider "${providerId}"`,
      "not_supported",
    );
    this.name = "NotSupportedError";
  }
}
