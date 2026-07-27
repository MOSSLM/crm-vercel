import { getServiceClient } from "@/app/api/_lib/service-client";
import { canonicalizeDomain, canonicalizeUrl } from "@/lib/url-canonical";

/**
 * Helpers partagés par les routes de qualification déléguée aux agents.
 *
 * La file de l'agent est le pool GLOBAL des entreprises non qualifiées : tous
 * les agents autorisés voient la même. Ce qui en sort une :
 *   - `qualifie = true` ou `hidden_in_qualification = true` (traitée par l'admin) ;
 *   - une décision d'agent encore `pending` (traitée par un agent, en attente de
 *     revue admin — l'index unique partiel garantit qu'il n'y en a qu'une) ;
 *   - une entrée active dans `url_blacklist` qui matche son URL ou son domaine.
 */

export const QUEUE_COLUMNS =
  "id, name, ville, code_postal, adresse, telephone, email, canonical_url, site_web_canonique, note_moyenne, nombre_avis, service_tags, premiers_tags, logo_url, sources";

export type QueueCompany = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  canonical_url: string | null;
  site_web_canonique: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  service_tags: string[] | null;
  premiers_tags: string[] | null;
  logo_url: string | null;
  sources: string[] | null;
};

/** URL canonique d'une entreprise, `canonical_url` d'abord puis l'ancien champ. */
export const companyCanonicalSite = (c: {
  canonical_url?: string | null;
  site_web_canonique?: string | null;
}): string | undefined => {
  const url = c.canonical_url || c.site_web_canonique;
  if (!url) return undefined;
  return canonicalizeUrl(url) || undefined;
};

export type BlacklistEntry = { scope: string; value: string };

/** Entrées de blacklist actives, pré-canonicalisées pour la comparaison. */
export const loadBlacklist = async (): Promise<{ domains: Set<string>; urls: Set<string> }> => {
  const { data } = await getServiceClient()
    .from("url_blacklist")
    .select("scope, value")
    .eq("active", true);

  const domains = new Set<string>();
  const urls = new Set<string>();
  for (const entry of (data ?? []) as BlacklistEntry[]) {
    if (entry.scope === "domain") domains.add(canonicalizeDomain(entry.value));
    else urls.add(canonicalizeUrl(entry.value));
  }
  return { domains, urls };
};

export const isBlacklisted = (
  company: Pick<QueueCompany, "canonical_url" | "site_web_canonique">,
  blacklist: { domains: Set<string>; urls: Set<string> },
): boolean => {
  const site = companyCanonicalSite(company);
  if (!site) return false;
  return blacklist.urls.has(site) || blacklist.domains.has(canonicalizeDomain(site));
};

/**
 * Entreprises déjà traitées par un agent et en attente de revue admin.
 * Renvoie un Set vide si la table n'existe pas encore (migration non appliquée),
 * ce qui laisse simplement la file complète.
 */
export const loadPendingEntrepriseIds = async (): Promise<Set<number>> => {
  const { data, error } = await getServiceClient()
    .from("agent_qualification_decisions")
    .select("entreprise_id")
    .eq("review_status", "pending")
    .limit(10000);

  if (error || !data) return new Set();
  return new Set(data.map((r) => Number(r.entreprise_id)));
};

/** Journalise une action d'agent. Best-effort : n'échoue jamais l'appelant. */
export const logAgentAction = async (params: {
  agentId: string;
  entrepriseId: number | null;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  const { error } = await getServiceClient().from("agent_activity_events").insert({
    agent_id: params.agentId,
    entreprise_id: params.entrepriseId,
    action: params.action,
    metadata: params.metadata ?? {},
  });
  if (error) console.warn("agent_activity_events insert failed:", error.message);
};
