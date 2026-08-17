import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { sortirDeSequence } from "@/lib/automations/engine";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * « CETTE PERSONNE N'EST PAS SUR CE CANAL. »
 *
 * Le cas est banal et n'avait aucune sortie : on ouvre la carte WhatsApp, et le
 * numéro n'a pas de compte WhatsApp. Rien n'est parti, personne n'a rien dit —
 * ce n'est donc NI un « fait », NI une issue d'échange (« pas de réponse »
 * supposerait qu'on ait écrit, « pas intéressé » qu'on ait eu quelqu'un). Les
 * deux seuls gestes disponibles enregistraient donc un fait faux, et la
 * séquence continuait : relance J+3 sur WhatsApp, relance J+7 sur WhatsApp,
 * chez quelqu'un qui n'y sera jamais.
 *
 * Ce n'est pas une issue de plus dans `STEP_OUTCOMES` : ce vocabulaire décrit
 * ce que le PROSPECT a répondu, et il est partagé avec le pipeline commercial
 * où chaque issue « qui arrête » déclenche une réaction commerciale (perdu,
 * blacklist). Or perdre l'affaire serait exactement le contraire de ce qu'on
 * veut : le prospect reste bon, c'est le CANAL qui ne va pas. D'où une route à
 * part, qui ne touche qu'à la séquence et au canal.
 *
 * Trois effets, tous voulus :
 *   · la tâche est annulée (`skipped`) — le geste n'a pas eu lieu, il ne doit
 *     pas gonfler le compteur du jour ;
 *   · l'inscription SORT de la séquence, et ce qui était encore en vol est
 *     annulé ;
 *   · un appel est semé à la place, si on le demande — sans quoi un prospect
 *     parfaitement joignable au téléphone disparaîtrait de la file pour la
 *     seule raison qu'il n'a pas WhatsApp.
 */

/** Les canaux dont on peut être absent. Un appel n'en fait pas partie : un numéro sonne ou ne sonne pas. */
const CANAUX = {
  whatsapp: { label: "WhatsApp", sujet: "Pas sur WhatsApp" },
  linkedin: { label: "LinkedIn", sujet: "Pas sur LinkedIn" },
} as const;

type Canal = keyof typeof CANAUX;

type TacheRow = {
  id: string;
  kind: string;
  status: string;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  step_id: string | null;
  enrollment_id: string | null;
  assignee_id: string | null;
  payload: Record<string, unknown> | null;
  entreprise: { owner_id: string | null; telephone: string | null } | { owner_id: string | null; telephone: string | null }[] | null;
};

export const POST = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const taskId = typeof body.task_id === "string" ? body.task_id : null;
  if (!taskId) return jsonError("task_id requis", 400, {}, cors);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const basculerAppel = body.basculer_appel === true;

  const sc = getServiceClient();

  const { data: brut, error: lectureErr } = await sc
    .from("prospection_tasks")
    .select(
      "id, kind, status, contact_id, entreprise_id, opportunite_id, step_id, enrollment_id, assignee_id, payload, " +
        "entreprise:entreprises(owner_id, telephone)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (lectureErr) return jsonError(lectureErr.message, 500, {}, cors);

  const tache = brut as unknown as TacheRow | null;
  const entreprise = Array.isArray(tache?.entreprise) ? tache?.entreprise[0] : tache?.entreprise;
  if (!tache || (tache.assignee_id !== user.id && entreprise?.owner_id !== user.id)) {
    return jsonError("introuvable", 404, {}, cors);
  }

  const canal = tache.kind as Canal;
  if (!(canal in CANAUX)) return jsonError("canal_sans_objet", 400, {}, cors);
  const infoCanal = CANAUX[canal];

  const { error: majErr } = await sc
    .from("prospection_tasks")
    .update({ status: "skipped" })
    .eq("id", taskId);
  if (majErr) return jsonError(majErr.message, 500, {}, cors);

  let sortie = false;
  if (tache.enrollment_id) {
    try {
      await sortirDeSequence(sc, tache.enrollment_id);
      sortie = true;
    } catch {
      // la tâche est retirée de la file quoi qu'il arrive ; la séquence sera
      // reprise à la main depuis le pipeline commercial si besoin
    }
  }

  // La trace, dans le fil que l'agent relit — c'est là qu'on comprendra dans
  // trois semaines pourquoi cette entreprise n'a jamais reçu le message.
  try {
    await sc.from("email_logs").insert({
      channel: "note",
      contact_id: tache.contact_id,
      entreprise_id: tache.entreprise_id,
      opportunite_id: tache.opportunite_id,
      step_id: tache.step_id,
      to_email: "",
      subject: infoCanal.sujet,
      body_text:
        note ||
        `Le numéro n'a pas de compte ${infoCanal.label} : sortie de la séquence ${infoCanal.label}.`,
      status: "sent",
    });
  } catch {
    // best effort : la sortie de séquence est faite, la note est un bonus
  }

  // ── Le repli téléphone ─────────────────────────────────────────────────
  let appelCree = false;
  const numero =
    (typeof tache.payload?.phone === "string" ? tache.payload.phone : null) ||
    entreprise?.telephone ||
    null;

  if (basculerAppel && tache.entreprise_id != null && numero) {
    // Un appel déjà en attente sur cette entreprise suffit : en semer un second
    // ferait deux lignes dans la file pour une seule entreprise à appeler.
    const { data: dejaPrevu } = await sc
      .from("prospection_tasks")
      .select("id")
      .eq("entreprise_id", tache.entreprise_id)
      .eq("kind", "call")
      .in("status", ["pending", "snoozed"])
      .limit(1)
      .maybeSingle();

    if (!dejaPrevu) {
      const { error: insErr } = await sc.from("prospection_tasks").insert({
        kind: "call",
        status: "pending",
        contact_id: tache.contact_id,
        entreprise_id: tache.entreprise_id,
        opportunite_id: tache.opportunite_id,
        assignee_id: user.id,
        title: `Appel — pas joignable sur ${infoCanal.label}`,
        payload: { phone: numero },
      });
      appelCree = !insErr;
    }
  }

  return json({ ok: true, canal, sequence_stoppee: sortie, appel_cree: appelCree }, { headers: cors });
});
