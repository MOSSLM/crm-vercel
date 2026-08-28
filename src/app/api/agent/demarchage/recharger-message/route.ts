import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { renderStepMessage, resolveMessageVars } from "@/lib/automations/engine";
import type { SequenceDefinition, SequenceStep } from "@/components/automations/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * « J'ai changé le modèle, et les cartes de ma journée disent toujours l'ancien
 * texte. »
 *
 * CE N'EST PAS UNE PANNE, C'EST LA MÉCANIQUE. Le moteur rend le message AU
 * MOMENT où il pose l'étape : il interpole le modèle avec les variables de ce
 * prospect-là et écrit le résultat dans `prospection_tasks.payload.message`. La
 * carte lit cette charge utile, jamais le modèle. C'est ce qui garantit qu'un
 * agent voit exactement le texte que le moteur a préparé — y compris pour les
 * tâches posées il y a huit jours, dont les variables ont pu changer depuis.
 * Le prix de cette garantie est celui-ci : un modèle corrigé ne rattrape que
 * les tâches créées APRÈS la correction. Au 28/08/2026, quarante-neuf tâches
 * « Plaquette » en attente portaient encore le texte d'avant.
 *
 * CETTE ROUTE EST LA PORTE, ET ELLE EST EXPLICITE. Elle refait le rendu d'UNE
 * tâche depuis son étape de séquence, et écrit le résultat dans la charge
 * utile. Rien ne se recalcule tout seul : l'agent clique, lit le nouveau texte,
 * et décide de l'envoyer. Un rafraîchissement silencieux à chaque ouverture de
 * la journée ferait changer le message sous les yeux de quelqu'un qui vient de
 * le relire — et ferait diverger ce qui est affiché de ce qui a été journalisé.
 *
 * LES DEUX VERSIONS SONT REFAITES ENSEMBLE. La carte propose de basculer
 * « entreprise » / « contact » juste avant d'ouvrir WhatsApp : n'en rafraîchir
 * qu'une laisserait l'autre à l'ancien modèle, et la bascule ferait réapparaître
 * le texte qu'on vient de corriger.
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne touche ni au canal, ni à l'échéance, ni à
 * l'attribution, ni à `plaquette_url` : le document préparé pour ce prospect
 * reste le sien. Et elle refuse les tâches sans étape — celles qu'une action
 * `create_task` a posées n'ont aucun modèle à relire.
 */

type TacheRow = {
  id: string;
  status: string;
  assignee_id: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  enrollment_id: string | null;
  step_id: string | null;
  payload: Record<string, unknown> | null;
  entreprise: { owner_id: string | null } | { owner_id: string | null }[] | null;
};

/** Une tâche bouclée ne se remet pas à jour : son message est parti tel quel. */
const OUVERTES = new Set(["pending", "snoozed"]);

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
      "id, status, assignee_id, contact_id, entreprise_id, opportunite_id, " +
        "enrollment_id, step_id, payload, entreprise:entreprises(owner_id)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (lectureErr) return jsonError(lectureErr.message, 500, {}, cors);

  const tache = brut as unknown as TacheRow | null;
  const entreprise = Array.isArray(tache?.entreprise) ? tache?.entreprise[0] : tache?.entreprise;
  // La même garde que les routes voisines : on se cadre sur `user.id`, jamais
  // sur un identifiant d'agent lu dans les paramètres.
  if (!tache || (tache.assignee_id !== user.id && entreprise?.owner_id !== user.id)) {
    return jsonError("introuvable", 404, {}, cors);
  }
  if (!OUVERTES.has(tache.status)) return jsonError("tache_close", 409, {}, cors);
  if (!tache.enrollment_id || !tache.step_id) {
    return jsonError(
      "Cette tâche ne vient pas d'une séquence : elle n'a pas de modèle à relire.",
      409,
      {},
      cors,
    );
  }

  const { data: enr } = await sc
    .from("sequence_enrollments")
    .select("automation_id")
    .eq("id", tache.enrollment_id)
    .maybeSingle();
  const automationId = (enr as { automation_id?: string } | null)?.automation_id;
  if (!automationId) return jsonError("inscription_introuvable", 409, {}, cors);

  const { data: autoRow } = await sc
    .from("automations")
    .select("definition")
    .eq("id", automationId)
    .maybeSingle();
  const def = ((autoRow?.definition as SequenceDefinition) ?? { steps: [] }) as SequenceDefinition;
  const steps = (Array.isArray(def.steps) ? def.steps : []) as SequenceStep[];
  const step = steps.find((s) => s.id === tache.step_id);
  // Une étape supprimée de la séquence depuis que la tâche existe : il n'y a
  // plus de modèle à lire, et en inventer un enverrait autre chose que ce que
  // la séquence dit aujourd'hui.
  if (!step) {
    return jsonError(
      "L'étape de séquence qui a posé cette tâche n'existe plus dans le modèle.",
      409,
      {},
      cors,
    );
  }

  // EXACTEMENT le sac du moteur : `resolveMessageVars` passe par
  // `resolveEntities`, donc les liens du rapport et de la démo sont ceux que
  // l'envoi produirait. Un second chemin de résolution finirait par rendre un
  // autre texte que la séquence.
  const vars = await resolveMessageVars({
    contact_id: tache.contact_id,
    entreprise_id: tache.entreprise_id,
    opportunite_id: tache.opportunite_id,
  });

  const rendu = await renderStepMessage(sc, step, vars, null);
  if (!rendu.body.trim()) {
    // Le même refus que le moteur, pour la même raison : un écran blanc au
    // moment d'ouvrir WhatsApp se lit comme une panne, pas comme un modèle vide.
    return jsonError("Le modèle de cette étape est vide — rien à recharger.", 409, {}, cors);
  }

  const avant = typeof tache.payload?.message === "string" ? tache.payload.message : "";
  const payload = {
    ...(tache.payload ?? {}),
    message: rendu.body,
    // `script` suit `message` depuis toujours : c'est ce que la carte d'appel
    // lit quand la tâche a été basculée en appel.
    script: rendu.body,
    scriptName: rendu.source ?? undefined,
    variant: rendu.variant,
    variantAlt: rendu.other ? { variant: rendu.other.variant, message: rendu.other.body } : null,
  };

  const { error } = await sc.from("prospection_tasks").update({ payload }).eq("id", taskId);
  if (error) return jsonError(error.message, 500, {}, cors);

  return json(
    {
      ok: true,
      // `inchange` distingue « le modèle n'a pas bougé » d'un rechargement qui
      // a vraiment changé le texte : sans lui, un clic sans effet visible se
      // lirait comme un bouton cassé.
      inchange: avant === rendu.body,
      message: rendu.body,
      variant: rendu.variant,
      variantAlt: payload.variantAlt,
      scriptName: rendu.source ?? null,
    },
    { headers: cors },
  );
});
