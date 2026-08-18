import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * « JE PRÉFÈRE L'APPELER. »
 *
 * Le geste manquait, et rien ne le remplaçait. Une séquence prévoit un WhatsApp,
 * on ouvre la fiche, on voit un artisan avec un fixe et quarante avis : on veut
 * décrocher. Les seules sorties disponibles étaient de boucler la tâche comme
 * FAITE (ce qui est faux — rien n'a été envoyé, et ça consomme l'objectif du
 * jour du mauvais canal) ou de la laisser traîner en file.
 *
 * CE QUE LA BASCULE FAIT, ET CE QU'ELLE NE FAIT PAS
 * Elle change le CANAL de la tâche, et rien d'autre : même prospect, même
 * inscription, même étape de séquence, même identifiant — donc l'écran reste
 * dessus au rechargement. Une fois l'appel bouclé, `advanceEnrollmentAfterTask`
 * enchaîne l'étape suivante exactement comme si le message était parti : le
 * canal employé pour franchir une étape n'a jamais fait partie de son contrat.
 *
 * Le texte préparé par le moteur reste dans la charge utile, et c'est voulu :
 * l'accroche WhatsApp écrite pour ce prospect est très exactement ce qu'on a à
 * lui dire de vive voix. La carte d'appel l'affiche comme script d'étape.
 *
 * SANS NUMÉRO, ON REFUSE. Basculer en appel une fiche qu'on ne peut pas appeler
 * ne déplacerait pas le problème, elle le cacherait : la tâche quitterait la
 * file WhatsApp pour une file d'appels où elle serait injoignable.
 */

type TacheRow = {
  id: string;
  kind: string;
  status: string;
  entreprise_id: number | null;
  assignee_id: string | null;
  payload: Record<string, unknown> | null;
  entreprise:
    | { owner_id: string | null; telephone: string | null; name: string | null }
    | { owner_id: string | null; telephone: string | null; name: string | null }[]
    | null;
};

/** Les canaux qu'on peut échanger contre un appel. Une attente n'en est pas un : rien n'en part. */
const BASCULABLES = new Set(["whatsapp", "linkedin", "email"]);

export const POST = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const taskId = typeof body.task_id === "string" ? body.task_id : null;
  if (!taskId) return jsonError("task_id requis", 400, {}, cors);

  const sc = getServiceClient();

  const { data: brut, error: lectureErr } = await sc
    .from("prospection_tasks")
    .select(
      "id, kind, status, entreprise_id, assignee_id, payload, " +
        "entreprise:entreprises(owner_id, telephone, name)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (lectureErr) return jsonError(lectureErr.message, 500, {}, cors);

  const tache = brut as unknown as TacheRow | null;
  const entreprise = Array.isArray(tache?.entreprise) ? tache?.entreprise[0] : tache?.entreprise;
  if (!tache || (tache.assignee_id !== user.id && entreprise?.owner_id !== user.id)) {
    return jsonError("introuvable", 404, {}, cors);
  }

  // Déjà un appel : rien à faire, et c'est un succès — le bouton a pu être
  // cliqué deux fois, ou la file affichait un état d'avant.
  if (tache.kind === "call") {
    return json({ ok: true, deja_en_appel: true }, { headers: cors });
  }
  if (!BASCULABLES.has(tache.kind)) return jsonError("canal_non_basculable", 400, {}, cors);

  const numero =
    (typeof tache.payload?.phone === "string" && tache.payload.phone.trim()
      ? tache.payload.phone.trim()
      : null) ?? (entreprise?.telephone?.trim() || null);
  if (!numero) {
    return jsonError(
      "Aucun numéro connu sur cette fiche — impossible d'en faire un appel.",
      409,
      {},
      cors,
    );
  }

  const { data, error } = await sc
    .from("prospection_tasks")
    .update({
      kind: "call",
      // Le numéro est posé dans la charge utile : la carte d'appel le lit là, et
      // il n'y était pas forcément (une étape WhatsApp peut ne porter que le
      // mobile du contact, une étape e-mail aucun numéro du tout).
      payload: { ...(tache.payload ?? {}), phone: numero },
    })
    .eq("id", taskId)
    .select("id, kind")
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data) return jsonError("introuvable", 404, {}, cors);

  return json({ ok: true, task: data, phone: numero }, { headers: cors });
});
