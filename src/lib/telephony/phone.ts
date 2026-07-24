/**
 * Phone-number normalisation helpers, shared across telephony features
 * (matching inbound callers to CRM records, de-duping, display).
 *
 * We deliberately keep this dependency-free and forgiving: CRM phone fields are
 * free text (`contacts.tel`, `entreprises.telephone`) and not guaranteed E.164.
 */

/** Strip everything except digits and a leading `+`. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/[^\d]/g, "").replace(/^00/, "");
  return hasPlus && digits ? `+${digits}` : digits;
}

/**
 * The last `n` significant digits — used for fuzzy matching a caller number
 * against loosely-formatted CRM fields (national vs international prefixes vary).
 */
export function phoneSuffix(raw: string | null | undefined, n = 9): string {
  const digits = normalizePhone(raw).replace(/^\+/, "");
  return digits.length <= n ? digits : digits.slice(-n);
}

/** True when two numbers plausibly refer to the same line. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = phoneSuffix(a);
  const sb = phoneSuffix(b);
  return sa.length >= 6 && sa === sb;
}

/** Longest internal extension we still dial verbatim (French PBX extensions are 3–4 digits). */
const MAX_EXTENSION_DIGITS = 6;

/**
 * Convert a free-text CRM phone field into an E.164 dial string the provider can
 * actually route.
 *
 * A SIP trunk (Zadarma included) only routes fully-international numbers: a French
 * national number such as `06 46 04 28 76` must become `+33646042876`, otherwise
 * the leading trunk `0` is meaningless and the call never leaves the PBX.
 *
 * French-first, and deliberately forgiving of how numbers are stored:
 *  - `+33…` / `0033…`      → kept international (digits re-tidied).
 *  - national `0X…` (10)   → `+<defaultCountry>X…` (drop the trunk 0).
 *  - short (≤6 digits)     → returned verbatim — an internal PBX extension.
 *  - anything else         → assumed to already start with a country code (`33…`,
 *                            `1…`) and just prefixed with `+`.
 *
 * Returns "" for empty input.
 */
export function toE164(raw: string | null | undefined, defaultCountry = "33"): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const d = trimmed.replace(/[^\d]/g, "");
    return d ? `+${d}` : "";
  }
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length <= MAX_EXTENSION_DIGITS) return digits; // internal extension
  if (digits.startsWith("0")) return `+${defaultCountry}${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * The dial string handed to the Zadarma web-phone widget: E.164 without the
 * leading `+` (`33646042876`), the plain international form its SIP/route lookup
 * expects. Internal extensions (no `+`) pass through unchanged.
 */
export function toDialDigits(raw: string | null | undefined, defaultCountry = "33"): string {
  return toE164(raw, defaultCountry).replace(/^\+/, "");
}
