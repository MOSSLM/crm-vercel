/**
 * /api/cron/og-cards — fabriquer à l'avance les cartes de partage manquantes.
 *
 * SA RAISON D'ÊTRE : les envois AUTOMATIQUES. Une séquence qui envoie un lien
 * de démo n'ouvre aucun dialogue et ne déclenche donc aucune fabrication. Et le
 * rattrapage pendant l'unfurl est impossible — un robot de messagerie abandonne
 * en quelques secondes là où une carte demande 20 à 45 s. Sans ce passage, tout
 * lien parti automatiquement s'affiche en URL nue, définitivement pour son
 * destinataire.
 *
 * Cron SÉPARÉ de celui de l'analyse de sites, et non un appendice comme dans la
 * première version : les deux travaux se disputaient un budget de 45 s, dont il
 * ne restait que 8 s pour les cartes — c'est-à-dire moins que la moitié d'UNE
 * capture. Le filet n'avait mathématiquement aucune chance de fabriquer quoi
 * que ce soit.
 *
 * Minute 41 : les autres jobs occupent `*`, 0, 7, 23 et `*​/5`.
 */

import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { preparerCartesManquantes } from "@/lib/og/preparer-cartes-manquantes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Copie conforme des autres crons — même dispositif, même contrat. */
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

/** Sous `maxDuration`, avec de quoi rendre un compte plutôt qu'une 504. */
const BUDGET_MS = 50_000;

async function handle(req: Request): Promise<Response> {
  if (!verifyCron(req)) return json({ error: "Unauthorized" }, { status: 401 });

  const debut = Date.now();
  const res = await preparerCartesManquantes(getServiceClient(), {
    // Six par passage, traités trois par trois : une carte demande deux
    // captures d'une vingtaine de secondes, menées en parallèle.
    limite: 6,
    budgetMs: BUDGET_MS,
  });

  // `restantes` est le chiffre qui compte : il dit si la file se vide ou si
  // elle s'accumule, ce qu'un simple compte de réussites ne révèle jamais.
  return json({
    ok: true,
    preparees: res.preparees,
    echecs: res.echecs,
    restantes: res.restantes,
    duree_ms: Date.now() - debut,
  });
}

export const GET = handle;
export const POST = handle;
