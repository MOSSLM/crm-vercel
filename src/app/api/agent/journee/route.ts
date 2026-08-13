import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { dayStartIso } from "@/lib/agent-progress";
import { detailParCanal, type CanalJournee, type StatsJournee } from "@/lib/agent-journee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/agent/journee
 *
 * Ce que le commercial connecté a fait AUJOURD'HUI, pour la carte de
 * félicitations (`CelebrationJournee`). Trois nombres et un détail par canal :
 * de quoi dire bravo, rien de plus.
 *
 * POURQUOI UNE ROUTE À PART DE `/api/agent/progress` : celle-là reconstruit
 * tout le board marketing pour ses compteurs, ce qui coûte plusieurs requêtes
 * lourdes. Ici on interroge une seule table, sur un index déjà là
 * (`assignee_id`, `status`), et la carte peut se rafraîchir souvent sans peser.
 *
 * Ouverte à tout compte connecté, pas seulement aux `freelance` : l'admin
 * démarche aussi, et sa journée se compte pareil.
 *
 * Le jour commence à minuit à Paris (`dayStartIso`), pas en UTC — sans quoi
 * les contacts pris avant 2 h du matin l'été compteraient pour la veille.
 */
export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const debutJournee = dayStartIso(new Date());

  const [faites, restantes] = await Promise.all([
    sc
      .from("prospection_tasks")
      .select("kind")
      .eq("assignee_id", user.id)
      .eq("status", "done")
      .gte("done_at", debutJournee)
      .limit(1000),
    sc
      .from("prospection_tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", user.id)
      .eq("status", "pending"),
  ]);

  // Jamais d'erreur remontée à l'écran : une carte de félicitations qui tombe
  // en panne ne doit pas colorer la journée de quelqu'un. À défaut de compte,
  // on ne fête rien et on se tait.
  const lignes = (faites.data ?? []) as Array<{ kind: string | null }>;
  const brut: Partial<Record<CanalJournee, number>> = {};
  for (const ligne of lignes) {
    const canal = (ligne.kind ?? "task") as CanalJournee;
    brut[canal] = (brut[canal] ?? 0) + 1;
  }

  const stats: StatsJournee = {
    contacts: lignes.length,
    parCanal: detailParCanal(brut),
    restantes: restantes.count ?? 0,
    debutJournee,
  };

  return json(stats, { headers: cors });
});
