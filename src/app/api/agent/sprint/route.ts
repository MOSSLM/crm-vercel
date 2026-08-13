import { json } from "@/app/api/_lib/respond";
import { preflight } from "@/app/api/_lib/cors";
import { withAuth } from "@/app/api/_lib/with-auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { dayStartIso } from "@/lib/agent-progress";
import { classifyEtape, joursRestants, progression, rythmeRequisCents } from "@/lib/agent-sprint";
import { listDemoSites } from "@/lib/analytics-radar/demo-sites";
import { ga4DateRangeFromDays, ga4RowsToObjects, getGa4Config, runGa4Report } from "@/lib/analytics-radar/ga4-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/** Objectif du sprint en cours. Volontairement en dur : c'est un sprint daté,
 *  pas un réglage permanent — le jour où il en faut plusieurs, ça passera en
 *  base plutôt que de devenir un formulaire à moitié utilisé. */
const OBJECTIF_CENTS = 200_000; // 2 000 €
const DEADLINE = "2026-08-20";
const SPRINT_START = "2026-08-13";
/** Cible de nouveaux contacts par jour, pour situer la journée. */
const CIBLE_CONTACTS_JOUR = 40;

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/**
 * GET /api/agent/sprint
 *
 * Le bloc « objectif » du tableau de bord : combien est encaissé sur les
 * 2 000 € visés, et les compteurs de la journée face au cumul du sprint.
 *
 * Tous les nombres viennent d'une vraie table ou d'un vrai rapport GA4. Un
 * compteur qu'on ne sait pas mesurer n'est pas estimé : il vaut 0 et le
 * champ `mesure` dit d'où il vient, pour que personne ne pilote son activité
 * sur un chiffre décoratif.
 */
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();
  const now = new Date();
  const debutJour = dayStartIso(now);
  const debutSprint = `${SPRINT_START}T00:00:00.000Z`;

  // ── Pipeline : encaissé, ventes, décisions en cours ─────────────────────
  const { data: etapes } = await sb.from("etapes_pipeline").select("id, nom");
  const kindById = new Map((etapes ?? []).map((e) => [e.id as number, classifyEtape(String(e.nom ?? ""))]));

  const { data: opps } = await sb
    .from("opportunites")
    .select("id, montant, stage_id, updated_at, created_at")
    .is("archived_at", null);

  let encaisseCents = 0;
  let ventes = 0;
  let ventesToday = 0;
  let enDecision = 0;
  (opps ?? []).forEach((o) => {
    const kind = kindById.get(o.stage_id as number);
    if (!kind) return;
    const majAujourdhui = String(o.updated_at ?? "") >= debutJour;
    if (kind === "encaisse") {
      encaisseCents += Math.round(num(o.montant) * 100);
      ventes += 1;
      if (majAujourdhui) ventesToday += 1;
    } else if (kind === "gagne") {
      ventes += 1;
      if (majAujourdhui) ventesToday += 1;
    } else if (kind === "en_decision") {
      enDecision += 1;
    }
  });

  // ── Activité de démarchage ──────────────────────────────────────────────
  const compte = async (
    table: string,
    build: (q: ReturnType<ReturnType<typeof getServiceClient>["from"]>) => unknown,
  ): Promise<number> => {
    try {
      const { count } = (await (build(sb.from(table)) as unknown as Promise<{ count: number | null }>)) ?? { count: 0 };
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [
    contactsToday,
    contactsTotal,
    whatsappToday,
    whatsappTotal,
    demosToday,
    demosTotal,
    rdvToday,
  ] = await Promise.all([
    compte("prospection_tasks", (q) => q.select("id", { count: "exact", head: true }).eq("status", "done").gte("done_at", debutJour)),
    compte("prospection_tasks", (q) => q.select("id", { count: "exact", head: true }).eq("status", "done").gte("done_at", debutSprint)),
    compte("prospection_tasks", (q) => q.select("id", { count: "exact", head: true }).eq("kind", "whatsapp").eq("status", "done").gte("done_at", debutJour)),
    compte("prospection_tasks", (q) => q.select("id", { count: "exact", head: true }).eq("kind", "whatsapp").eq("status", "done").gte("done_at", debutSprint)),
    compte("sites", (q) => q.select("id", { count: "exact", head: true }).not("published_subdomain", "is", null).gte("published_at", debutJour)),
    compte("sites", (q) => q.select("id", { count: "exact", head: true }).not("published_subdomain", "is", null).gte("published_at", debutSprint)),
    compte("scheduling_bookings", (q) => q.select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("starts_at", debutJour)),
  ]);

  // ── Démos et audits réellement consultés (GA4) ──────────────────────────
  // Deux rapports seulement : le sprint est un écran de pilotage, pas le
  // radar complet, et la propriété GA4 a un quota à respecter.
  let demosVisiteesToday = 0;
  let demosVisiteesTotal = 0;
  let auditsConsultes = 0;
  const ga4 = getGa4Config();
  if (ga4) {
    const sites = await listDemoSites(sb).catch(() => []);
    const demoHosts = sites.flatMap((s) => s.hostnames);
    const filtre = demoHosts.length
      ? { filter: { fieldName: "hostName", inListFilter: { values: demoHosts } } }
      : undefined;
    const report = (days: number, dimensionFilter?: Record<string, unknown>) =>
      runGa4Report(ga4.propertyId, ga4.serviceAccountKey, {
        dateRanges: [ga4DateRangeFromDays(days)],
        dimensions: [{ name: "hostName" }],
        metrics: [{ name: "sessions" }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: 500,
      })
        .then(ga4RowsToObjects)
        .catch(() => [] as Array<Record<string, string>>);

    const [jour, sprint] = await Promise.all([report(1, filtre), report(8, filtre)]);
    demosVisiteesToday = jour.filter((r) => num(r.sessions) > 0).length;
    demosVisiteesTotal = sprint.filter((r) => num(r.sessions) > 0).length;

    // Le rapport d'audit vit sur son propre sous-domaine et porte le même tag.
    const rapportHost = demoHosts[0]?.split(".").slice(1).join(".");
    if (rapportHost) {
      const audits = await report(8, {
        filter: { fieldName: "hostName", stringFilter: { matchType: "BEGINS_WITH", value: "rapport." } },
      });
      auditsConsultes = audits.filter((r) => num(r.sessions) > 0).length;
    }
  }

  const jours = joursRestants(DEADLINE, now);

  return json(
    {
      objectif: {
        cents: OBJECTIF_CENTS,
        encaisseCents,
        progression: progression(encaisseCents, OBJECTIF_CENTS),
        deadline: DEADLINE,
        joursRestants: jours,
        rythmeRequisCents: rythmeRequisCents(encaisseCents, OBJECTIF_CENTS, jours),
      },
      compteurs: {
        nouveauxContacts: { today: contactsToday, total: contactsTotal, targetToday: CIBLE_CONTACTS_JOUR, mesure: "tâches de prospection terminées" },
        reponsesWhatsapp: { today: whatsappToday, total: whatsappTotal, mesure: "tâches WhatsApp terminées" },
        demosEnvoyees: { today: demosToday, total: demosTotal, mesure: "sites publiés" },
        demosVisitees: { today: demosVisiteesToday, total: demosVisiteesTotal, mesure: "GA4 — sites avec au moins une session" },
        auditsConsultes: { today: 0, total: auditsConsultes, mesure: "GA4 — rapports d'audit ouverts" },
        rdvAujourdhui: { today: rdvToday, total: rdvToday, mesure: "réservations confirmées" },
        offresEnDecision: { today: 0, total: enDecision, mesure: "opportunités en devis ou signature" },
        ventes: { today: ventesToday, total: ventes, mesure: "opportunités signées ou encaissées" },
      },
    },
    { headers: cors },
  );
});
