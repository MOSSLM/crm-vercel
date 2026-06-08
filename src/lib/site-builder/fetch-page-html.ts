/**
 * Fetch a remote web page and return clean, self-contained HTML ready for the
 * import pipeline.
 *
 * Phase 1 strategy: a single "direct" tier — a plain Node `fetch` with a
 * realistic browser header set. This covers the large majority of small-business
 * / WordPress / static sites. JS-rendered SPAs (Wix, Squarespace, React) and
 * bot-protected sites (Cloudflare, DataDome) are detected and reported back with
 * a clear message so the user can paste the HTML manually. Heavier tiers
 * (headless browser, anti-bot API) can be slotted in as additional fallbacks
 * later without touching callers.
 *
 * Security: arbitrary user-supplied URLs are fetched server-side, so we apply an
 * SSRF guard (block localhost / private / link-local addresses, resolved via
 * DNS) before connecting, and re-validate the final URL after redirects.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { normalizeImportedHtml, type NormalizeResult } from "./normalize-imported-html";

export interface FetchPageResult extends NormalizeResult {
  /** URL actually fetched (after redirects). */
  finalUrl: string;
  /** Which tier produced the result. */
  method: "direct";
}

/** Error carrying an HTTP status + an optional actionable hint for the UI. */
export class FetchPageError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status = 502, hint?: string) {
    super(message);
    this.name = "FetchPageError";
    this.status = status;
    this.hint = hint;
  }
}

const PASTE_HINT =
  "Collez plutôt le HTML de la page manuellement (clic droit → « Afficher le code source », tout sélectionner, copier).";

const FETCH_TIMEOUT_MS = 25_000;
const MAX_BYTES = 5_000_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

/** Markers of anti-bot challenge pages / JS-gated walls. */
const BLOCK_MARKERS = [
  "just a moment",
  "cf-browser-verification",
  "cf_chl_",
  "/cdn-cgi/challenge-platform",
  "attention required! | cloudflare",
  "enable javascript and cookies",
  "captcha-delivery",
  "datadome",
  "perimeterx",
  "px-captcha",
  "incapsula",
  "_imperva",
];

function ipv4ToOctets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** Private / loopback / link-local / reserved address check (IPv4 + IPv6). */
function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToOctets(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // unique-local
  if (v6.startsWith("fe80")) return true; // link-local
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

/** Reject hostnames that resolve to internal/private addresses (SSRF guard). */
async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) {
    throw new FetchPageError("Adresse non autorisée.", 400);
  }
  let addresses: string[];
  if (isIP(h)) {
    addresses = [h];
  } else {
    try {
      const resolved = await lookup(h, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch {
      throw new FetchPageError("Nom de domaine introuvable.", 400);
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new FetchPageError("Adresse non autorisée (réseau interne).", 400);
  }
}

/** Parse + validate a user-supplied URL; default the scheme to https. */
function normalizeUrlInput(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new FetchPageError("URL invalide.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchPageError("Seules les URLs http(s) sont prises en charge.", 400);
  }
  return url;
}

/** Rough text length with tags stripped — to spot empty SPA shells. */
function visibleTextLength(html: string): number {
  return html
    .replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function detectBlocked(html: string): string | null {
  const lower = html.toLowerCase();
  for (const m of BLOCK_MARKERS) {
    if (lower.includes(m)) return "Le site affiche une protection anti-robot.";
  }
  if (visibleTextLength(html) < 200 && /<script/i.test(html)) {
    return "La page semble rendue côté JavaScript (peu de contenu statique).";
  }
  return null;
}

export async function fetchPageHtml(input: string): Promise<FetchPageResult> {
  const url = normalizeUrlInput(input);
  await assertPublicHost(url.hostname);

  let res: Response;
  try {
    res = await fetch(url.href, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new FetchPageError(
      aborted ? "Délai dépassé lors de la récupération de la page." : "Impossible de joindre l'URL.",
      504,
      PASTE_HINT,
    );
  }

  // Re-validate after redirects (best-effort SSRF guard against open redirects).
  try {
    const finalHost = new URL(res.url || url.href).hostname;
    if (finalHost.toLowerCase() !== url.hostname.toLowerCase()) {
      await assertPublicHost(finalHost);
    }
  } catch (e) {
    if (e instanceof FetchPageError) throw e;
  }

  if (res.status === 403 || res.status === 429 || res.status === 503) {
    throw new FetchPageError(
      "Le site bloque la récupération automatique (anti-robot).",
      422,
      PASTE_HINT,
    );
  }
  if (!res.ok) {
    throw new FetchPageError(`Le site a répondu ${res.status}.`, 422, PASTE_HINT);
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType && !/(text\/html|application\/xhtml|text\/plain|application\/xml)/.test(contentType)) {
    throw new FetchPageError(`L'URL ne renvoie pas une page HTML (type : ${contentType.split(";")[0]}).`, 422);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new FetchPageError(
      `Page trop volumineuse (${Math.round(buf.byteLength / 1_000_000)} Mo). Essayez une page plus simple.`,
      413,
    );
  }
  const rawHtml = new TextDecoder("utf-8").decode(buf);

  if (!rawHtml.trim() || !/<[a-z!]/i.test(rawHtml)) {
    throw new FetchPageError("La page récupérée est vide.", 422, PASTE_HINT);
  }

  const blocked = detectBlocked(rawHtml);
  if (blocked) {
    throw new FetchPageError(blocked, 422, PASTE_HINT);
  }

  const normalized = normalizeImportedHtml(rawHtml, res.url || url.href);
  return { ...normalized, finalUrl: res.url || url.href, method: "direct" };
}
