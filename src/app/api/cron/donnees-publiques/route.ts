/**
 * /api/cron/donnees-publiques — le passage automatique.
 *
 * Déclenché par pg_cron (cf. la migration SQL qui l'installe), comme les trois
 * jobs déjà en place : `net.http_post` vers cette route, avec le même en-tête
 * `x-pg-cron-secret`.
 *
 * Le travail est BORNÉ : on prend une tranche, on la traite, on rend la main.
 * Ce qui reste attendra le tick suivant — c'est ce qui permet de rafraîchir un
 * parc entier sans jamais dépasser la durée d'une fonction serverless.
 *
 * L'ordre de service compte : les fiches jamais hydratées passent AVANT les
 * données périmées, sinon une fiche neuve resterait gelée derrière la
 * revérification de routine de tout le parc.
 *
 * La réponse dit toujours ce qui a été fait, y compris quand il n'y avait rien
 * à faire. C'est délibéré : le vérificateur d'emails répond
 * `{"ok":true,"checked":0}` depuis des semaines parce que rien ne l'alimente,
 * et rien dans sa réponse ne permet de distinguer « file vide » de « file
 * cassée ». Ici, `candidats_a_rafraichir` répond à la question.
 */

import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { chargerCibles, hydraterLot } from "@/lib/donnees-publiques/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vérifie la requête du ticker :
 *   - prod : au moins un des deux secrets DOIT être posé ET correspondre ;
 *   - dev/test : sans secret configuré, on laisse passer (tests locaux).
 *
 * Copie conforme de `/api/automations/tick` et `/api/email/verify/tick` — même
 * dispositif, même contrat.
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
const BUDGET_MS = 45_000;

async function handle(req: Request): Promise<Response> {
  if (!verifyCron(req)) return json({ error: "Unauthorized" }, { status: 401 });

  const sb = getServiceClient();
  const debut = Date.now();

  // Le réglage vit en base pour être modifiable sans redéploiement, comme le
  // régulateur d'envoi. Une absence de ligne ne bloque pas : on retient des
  // valeurs par défaut plutôt que de ne rien faire.
  const { data: reglages } = await sb
    .from("donnees_publiques_settings")
    .select("lot_max, actif")
    .eq("id", "global")
    .maybeSingle();

  const actif = (reglages as { actif?: boolean } | null)?.actif ?? true;
  const lotMax = (reglages as { lot_max?: number } | null)?.lot_max ?? 40;

  if (!actif) {
    return json({ ok: true, actif: false, traitees: 0, motif: "desactive_en_reglages" });
  }

  let cibles;
  try {
    cibles = await chargerCibles(sb, lotMax);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, erreur: message }, { status: 500 });
  }

  const { traitees, reste } = await hydraterLot(sb, cibles, {
    declencheur: "cron",
    budgetMs: BUDGET_MS,
  });

  const compte = (cle: "identite" | "rge", valeur: string) =>
    traitees.filter((t) => t[cle] === valeur).length;

  return json({
    ok: true,
    // Combien la vue proposait : distingue « rien à faire » de « rien fait ».
    candidats_a_rafraichir: cibles.length,
    traitees: traitees.length,
    reste_dans_ce_lot: reste,
    identite: { ok: compte("identite", "ok"), vide: compte("identite", "vide"), erreur: compte("identite", "erreur") },
    rge: {
      ok: compte("rge", "ok"),
      vide: compte("rge", "vide"),
      erreur: compte("rge", "erreur"),
      ajoutees: traitees.reduce((n, t) => n + t.rge_ajoutees, 0),
      retirees: traitees.reduce((n, t) => n + t.rge_retirees, 0),
    },
    duree_ms: Date.now() - debut,
  });
}

export const GET = handle;
export const POST = handle;
