/**
 * /api/cron/audit-site — le passage automatique de l'analyseur.
 *
 * Déclenché par pg_cron (`sql/20260810_audit_site_cron.sql`), même dispositif
 * que les jobs déjà en place : `net.http_post` avec l'en-tête
 * `x-pg-cron-secret`.
 *
 * Le travail est BORNÉ : une tranche, puis on rend la main. Ce qui reste attend
 * le tick suivant — c'est ce qui permet d'analyser 2 800 entreprises sans jamais
 * dépasser la durée d'une fonction serverless.
 *
 * La réponse rapporte TOUJOURS `candidats_a_rafraichir`, y compris quand rien
 * n'a été fait. Sans ce chiffre, `{"ok":true,"traitees":0}` ne permet pas de
 * distinguer « file vide » de « file cassée » — c'est exactement l'angle mort
 * du vérificateur d'emails, qui répond 0 depuis des semaines sans que personne
 * puisse dire pourquoi.
 */

import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { analyserLot, chargerCibles, compterCandidats } from "@/lib/audit-site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vérifie la requête du ticker. Copie conforme de `/api/cron/donnees-publiques`
 * — même dispositif, même contrat : en production, au moins un secret doit être
 * posé ET correspondre ; en local sans secret, on laisse passer.
 */
const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const pgCronSecret = process.env.PG_CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !cronSecret && !pgCronSecret) return false;
  if (!cronSecret && !pgCronSecret) return true;

  const auth = req.headers.get("authorization");
  const pgHeader = req.headers.get("x-pg-cron-secret");
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret;
  return validVercel || validPgCron;
};

/** Budget sous `maxDuration`, pour rendre un compte plutôt qu'une 504. */
const BUDGET_MS = 50_000;

async function handle(req: Request): Promise<Response> {
  if (!verifyCron(req)) return json({ error: "Unauthorized" }, { status: 401 });

  const sb = getServiceClient();
  const debut = Date.now();

  // Réglages en base pour être modifiables sans redéploiement. Une absence de
  // ligne ne bloque pas : on retient des valeurs par défaut.
  const { data: reglages } = await sb
    .from("audit_site_settings")
    .select("lot_max, actif, ttl_jours")
    .eq("id", "global")
    .maybeSingle();

  const r = (reglages ?? {}) as { lot_max?: number; actif?: boolean; ttl_jours?: number };
  if (r.actif === false) {
    return json({ ok: true, desactive: true, traitees: 0, candidats_a_rafraichir: null });
  }

  const lotMax = r.lot_max ?? 30;

  let candidats: number | null = null;
  let cibles: Awaited<ReturnType<typeof chargerCibles>> = [];
  try {
    [candidats, cibles] = await Promise.all([compterCandidats(sb), chargerCibles(sb, lotMax)]);
  } catch (e) {
    // La table ou la vue peut manquer (migration non appliquée). On le DIT
    // plutôt que de répondre « 0 traitées », qui se confondrait avec un succès.
    return json(
      {
        ok: false,
        erreur: e instanceof Error ? e.message : String(e),
        indice: "sql/20260810_audit_site.sql n'est peut-être pas appliquée sur cet environnement.",
        candidats_a_rafraichir: null,
      },
      { status: 503 },
    );
  }

  const { traitees, reste } = await analyserLot(sb, cibles, {
    declencheur: "cron",
    budgetMs: BUDGET_MS,
    ttlJours: r.ttl_jours ?? 30,
  });

  return json({
    ok: true,
    candidats_a_rafraichir: candidats,
    lot: cibles.length,
    traitees: traitees.length,
    reste,
    injoignables: traitees.filter((t) => t.statut === "injoignable").length,
    erreurs: traitees.filter((t) => t.statut === "erreur").length,
    duree_ms: Date.now() - debut,
  });
}

export const GET = handle;
export const POST = handle;
