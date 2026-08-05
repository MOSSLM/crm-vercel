/**
 * Ingestion des visites de démo — appelée par la balise embarquée sur les sites
 * clients (cf. `components/site-builder/VisitBeacon.tsx`).
 *
 * Publique et non authentifiée par nature : le visiteur est un prospect, il n'a
 * pas de compte. Ce qui protège la table, c'est que l'`host` doit correspondre
 * à un site réellement publié — on n'enregistre rien pour un domaine inconnu —
 * et que les valeurs numériques sont bornées.
 *
 * Même origine que la page qui l'appelle (la balise tourne dans la même app
 * Next, servie sur le domaine du client), donc pas d'en-têtes CORS ici.
 *
 * Répond toujours 204, même sur rejet : la balise ne fait rien de la réponse,
 * et un code d'erreur ne renseignerait qu'un éventuel curieux sur ce qui a été
 * accepté ou non.
 */

import { getServiceClient } from "@/app/api/_lib/service-client";
import { extractSubdomain, CRM_SUBDOMAINS } from "@/lib/site-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Une session au-delà de 4 h est un onglet oublié, pas une lecture. */
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const MAX_PAGE_VIEWS = 500;
/** Assez pour un parcours réel, assez peu pour qu'un envoi forgé ne gonfle rien. */
const MAX_PATHS = 40;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nom d'hôte plausible, et rien d'autre.
 *
 * L'en-tête `Host` est fourni par le client : il finit dans un filtre
 * PostgREST `.or()`, dont la syntaxe est du texte (virgules, parenthèses,
 * opérateurs) et non un paramètre lié. Un `Host` fabriqué pourrait donc
 * réécrire la condition. On le rejette ici plutôt que de tenter de l'échapper.
 */
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const noContent = () => new Response(null, { status: 204 });

interface BeaconPayload {
  sessionId: string;
  path: string;
  paths: string[];
  referrer: string | null;
  durationMs: number;
  pageViews: number;
  token: string | null;
  internal: boolean;
}

/** Lit le corps que `sendBeacon` envoie (Blob text/plain, pas application/json). */
async function readPayload(req: Request): Promise<BeaconPayload | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await req.text());
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const sessionId = typeof o.sessionId === "string" ? o.sessionId.slice(0, 64) : "";
  if (!sessionId) return null;

  const paths = Array.isArray(o.paths)
    ? o.paths.filter((p): p is string => typeof p === "string").slice(0, MAX_PATHS).map((p) => p.slice(0, 300))
    : [];

  return {
    sessionId,
    path: typeof o.path === "string" ? o.path.slice(0, 300) : "/",
    paths,
    referrer: typeof o.referrer === "string" && o.referrer ? o.referrer.slice(0, 500) : null,
    durationMs: clampInt(o.durationMs, 0, MAX_DURATION_MS),
    pageViews: clampInt(o.pageViews, 1, MAX_PAGE_VIEWS),
    token: typeof o.token === "string" && o.token ? o.token.slice(0, 128) : null,
    internal: o.internal === true,
  };
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 'mobile' | 'desktop' — on ne garde pas l'UA brut, sans usage métier ici. */
function deviceOf(ua: string | null): string {
  if (!ua) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
}

/** Adresses/préfixes IP de l'équipe, à exclure des compteurs. `1.2.3.4,10.0.` */
function isInternalIp(ip: string | null): boolean {
  if (!ip) return false;
  const list = (process.env.INTERNAL_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.some((prefix) => ip === prefix || ip.startsWith(prefix));
}

type Resolved = { siteId: string | null; entrepriseId: number | null };

/**
 * `host` → site publié. Trois formes, dans l'ordre où le middleware les traite :
 * sous-domaine publié, domaine personnalisé, sous-domaine UUID (aperçu).
 * Retourne null quand rien ne correspond — l'appel est alors ignoré.
 */
async function resolveHost(host: string): Promise<Resolved | null> {
  const sb = getServiceClient();
  const clean = host.split(":")[0].toLowerCase().replace(/\.+$/, "");
  if (!clean || !HOSTNAME_RE.test(clean)) return null;

  const sub = extractSubdomain(clean);

  // Le CRM lui-même n'est jamais une visite de démo.
  if (sub && CRM_SUBDOMAINS.has(sub)) return null;

  if (sub && UUID_RE.test(sub)) {
    const { data } = await sb.from("sites").select("id, enterprise_id").eq("id", sub).maybeSingle();
    return data ? { siteId: data.id, entrepriseId: data.enterprise_id ?? null } : null;
  }

  if (sub) {
    const { data } = await sb
      .from("sites")
      .select("id, enterprise_id")
      .eq("published_subdomain", sub)
      .maybeSingle();
    if (data) return { siteId: data.id, entrepriseId: data.enterprise_id ?? null };
  }

  // Domaine personnalisé : stocké tantôt nu, tantôt avec le protocole.
  const { data } = await sb
    .from("sites")
    .select("id, enterprise_id, published_domain")
    .or(`published_domain.eq.${clean},published_domain.eq.https://${clean}`)
    .maybeSingle();
  return data ? { siteId: data.id, entrepriseId: data.enterprise_id ?? null } : null;
}

/** Jeton `?k=` du lien envoyé en séquence → le contact qui a cliqué. */
async function resolveContact(token: string | null, entrepriseId: number | null): Promise<string | null> {
  if (!token) return null;
  const sb = getServiceClient();
  const { data } = await sb
    .from("contacts")
    .select("id, entreprise_id")
    .eq("visit_token", token)
    .maybeSingle();
  if (!data) return null;
  // Un jeton recopié d'un autre prospect ne doit pas polluer cette fiche.
  if (entrepriseId != null && data.entreprise_id != null && data.entreprise_id !== entrepriseId) return null;
  return data.id;
}

export async function POST(req: Request) {
  const payload = await readPayload(req);
  if (!payload) return noContent();

  const host = req.headers.get("host") ?? "";
  const resolved = await resolveHost(host);
  if (!resolved) return noContent();

  const sb = getServiceClient();
  const contactId = await resolveContact(payload.token, resolved.entrepriseId);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const internal = payload.internal || isInternalIp(ip);

  const { data: existing } = await sb
    .from("site_visits")
    .select("id, paths, duration_ms, page_views, contact_id")
    .eq("session_id", payload.sessionId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    // La balise envoie des totaux cumulés, mais deux battements peuvent arriver
    // dans le désordre (`sendBeacon` ne garantit pas l'ordre) : on ne fait donc
    // que monter, jamais redescendre.
    const paths = Array.from(new Set([...(existing.paths ?? []), ...payload.paths])).slice(0, MAX_PATHS);
    await sb
      .from("site_visits")
      .update({
        paths,
        duration_ms: Math.max(existing.duration_ms ?? 0, payload.durationMs),
        page_views: Math.max(existing.page_views ?? 1, payload.pageViews),
        // Un jeton n'arrive parfois qu'à la deuxième page ; on ne l'écrase pas
        // une fois posé.
        contact_id: existing.contact_id ?? contactId,
        last_seen_at: now,
      })
      .eq("id", existing.id);
    return noContent();
  }

  await sb.from("site_visits").insert({
    site_id: resolved.siteId,
    entreprise_id: resolved.entrepriseId,
    contact_id: contactId,
    session_id: payload.sessionId,
    host: host.split(":")[0].toLowerCase(),
    entry_path: payload.path,
    paths: payload.paths.length ? payload.paths : [payload.path],
    page_views: payload.pageViews,
    referrer: payload.referrer,
    device: deviceOf(req.headers.get("user-agent")),
    duration_ms: payload.durationMs,
    is_internal: internal,
    started_at: now,
    last_seen_at: now,
  });

  return noContent();
}
