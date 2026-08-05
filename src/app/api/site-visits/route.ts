/**
 * Lecture des visites de démo pour le CRM.
 *
 *   GET ?entreprise_id=123        → sessions détaillées + agrégat d'une fiche
 *   GET ?entreprise_ids=1,2,3     → agrégats seuls, pour trier la file d'appel
 *
 * Deux formes parce que les deux appelants n'ont pas les mêmes besoins : le
 * panneau du cockpit veut le détail d'UNE entreprise, la file d'appel veut le
 * résumé de SOIXANTE. Charger le détail des soixante pour n'en afficher que la
 * pastille serait le gros du coût de la page pour rien.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import type { SiteVisit, SiteVisitSummary } from "@/lib/site-visits";

export const runtime = "nodejs";

/** Assez pour l'historique affiché, borné pour qu'un prospect très actif ne
 *  fasse pas grossir la réponse sans limite. */
const MAX_SESSIONS = 50;
const MAX_SUMMARY_IDS = 200;

type ContactRow = { id: string; first_name: string | null; last_name: string | null };

function contactName(c: ContactRow | undefined): string | null {
  if (!c) return null;
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
}

export const GET = withAuth({ role: "freelance" }, async ({ req, cors }) => {
  const url = new URL(req.url);
  const sc = getServiceClient();

  // ── Forme « liste d'agrégats » ──────────────────────────────────────────
  const idsParam = url.searchParams.get("entreprise_ids");
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_SUMMARY_IDS);
    if (ids.length === 0) return json({ summaries: [] }, { headers: cors });

    const { data, error } = await sc
      .from("site_visit_summary")
      .select("*")
      .in("entreprise_id", ids);
    if (error) return jsonError("query_failed", 500, {}, cors);

    return json({ summaries: (data ?? []) as SiteVisitSummary[] }, { headers: cors });
  }

  // ── Forme « détail d'une entreprise » ───────────────────────────────────
  const entrepriseId = Number(url.searchParams.get("entreprise_id"));
  if (!Number.isInteger(entrepriseId) || entrepriseId <= 0) {
    return jsonError("entreprise_id_required", 400, {}, cors);
  }

  const { data: rows, error } = await sc
    .from("site_visits")
    .select(
      "id, entreprise_id, contact_id, host, entry_path, paths, page_views, referrer, device, duration_ms, started_at, last_seen_at",
    )
    .eq("entreprise_id", entrepriseId)
    .eq("is_internal", false)
    .order("started_at", { ascending: false })
    .limit(MAX_SESSIONS);
  if (error) return jsonError("query_failed", 500, {}, cors);

  // Les noms de contacts en une requête plutôt qu'une jointure : `contact_id`
  // est le plus souvent null (visite sans jeton), et une jointure imbriquée
  // ferait payer la résolution à toutes les lignes.
  const contactIds = Array.from(
    new Set((rows ?? []).map((r) => r.contact_id).filter((v): v is string => !!v)),
  );
  const contacts = new Map<string, ContactRow>();
  if (contactIds.length > 0) {
    const { data: cs } = await sc
      .from("contacts")
      .select("id, first_name, last_name")
      .in("id", contactIds);
    for (const c of (cs ?? []) as ContactRow[]) contacts.set(c.id, c);
  }

  const visits: SiteVisit[] = (rows ?? []).map((r) => ({
    id: r.id,
    entreprise_id: r.entreprise_id,
    contact_id: r.contact_id,
    contact_name: contactName(contacts.get(r.contact_id ?? "")),
    host: r.host,
    entry_path: r.entry_path,
    paths: r.paths ?? [],
    page_views: r.page_views,
    referrer: r.referrer,
    device: r.device,
    duration_ms: r.duration_ms,
    started_at: r.started_at,
    last_seen_at: r.last_seen_at,
  }));

  const { data: summaryRow } = await sc
    .from("site_visit_summary")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  return json(
    { visits, summary: (summaryRow ?? null) as SiteVisitSummary | null },
    { headers: cors },
  );
});
