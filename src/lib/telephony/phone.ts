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
