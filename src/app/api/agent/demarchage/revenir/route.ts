import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { replacerSurEtape, sortirDeSequence } from "@/lib/automations/engine";
import type { SequenceDefinition, SequenceStep } from "@/components/automations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * « Ce prospect est à l'étape 6 sur 22 et je ne lui ai jamais écrit. »
 *
 * CE QUI MANQUAIT. Tout ce qui existait pour reculer annule UN geste : le toast
 * qui suit l'action, le bloc « Revenir en arrière », l'annulation d'une tâche.
 * Aucun ne remonte cinq étapes — il faudrait cinq annulations dans le bon
 * ordre, et seulement si les gestes correspondants sont encore dans les cinq
 * dernières lignes du journal. Mesuré le 31/08/2026 : 224 inscriptions S1 à
 * l'étape 9, 151 à l'étape 15, dont personne ne pouvait redescendre.
 *
 * DEUX SÉQUENCES, PAS UNE, ET C'EST LE CAS QUI A DÉCLENCHÉ CE TRAVAIL. Boucler
 * la dernière étape de S1 fait entrer en S2 : c'est là qu'on s'aperçoit que
 * rien n'est parti. Le retour ne peut donc pas se limiter à la séquence de la
 * tâche affichée — il faut pouvoir rouvrir CELLE D'AVANT. Le GET rend donc les
 * inscriptions du prospect, la courante et les quittées, avec leurs étapes ;
 * le POST replace sur l'une d'elles et ferme les autres.
 *
 * `transfert` ET PAS `stop` POUR FERMER CELLE D'EN FACE : le démarchage
 * continue, ailleurs. `stop` renverrait le prospect au stock des « à
 * démarcher » alors qu'une inscription vient d'être rouverte pour lui, et il
 * serait ré-inscrit une seconde fois (cf. `sortie-sequence.ts`).
 */

type TacheRow = {
  id: string;
  status: string;
  assignee_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  enrollment_id: string | null;
  entreprise: { owner_id: string | null } | { owner_id: string | null }[] | null;
};

type InscriptionRow = {
  id: string;
  automation_id: string;
  current_step: number;
  status: string;
  entered_at: string;
  updated_at: string | null;
  exit_reason: string | null;
};

/** Ce que l'écran affiche pour choisir : une séquence, ses étapes, où on en est. */
type CibleRetour = {
  enrollment_id: string;
  sequence: string;
  statut: string;
  etape_courante: number;
  courante: boolean;
  steps: { index: number; label: string; kind: string; day: number }[];
};

/** Les blocs qu'on ne « fait » pas : y revenir n'aurait aucun sens. */
const STRUCTURE = new Set(["condition", "transition", "wait"]);

/** Le libellé d'une étape, tel que la frise l'écrit déjà. */
const libelle = (s: SequenceStep, i: number): string =>
  (s.label && s.label.trim()) || `Étape ${i + 1}`;

/** La tâche du caller, ou `null` — la même garde que les routes voisines. */
async function lireTache(sc: ReturnType<typeof getServiceClient>, taskId: string, userId: string) {
  const { data } = await sc
    .from("prospection_tasks")
    .select(
      "id, status, assignee_id, entreprise_id, opportunite_id, enrollment_id, " +
        "entreprise:entreprises(owner_id)",
    )
    .eq("id", taskId)
    .maybeSingle();
  const tache = data as unknown as TacheRow | null;
  const ent = Array.isArray(tache?.entreprise) ? tache?.entreprise[0] : tache?.entreprise;
  // Cadrée sur `user.id`, jamais sur un identifiant d'agent lu en paramètre.
  if (!tache || (tache.assignee_id !== userId && ent?.owner_id !== userId)) return null;
  return tache;
}

/**
 * Les inscriptions du prospect qu'on peut rouvrir, la plus récente d'abord.
 *
 * BORNÉES AUX SIX DERNIÈRES : au-delà, ce n'est plus un retour en arrière mais
 * l'histoire du prospect, et elle se lit dans son fil d'activité.
 */
async function lireCibles(
  sc: ReturnType<typeof getServiceClient>,
  tache: TacheRow,
): Promise<CibleRetour[]> {
  let req = sc
    .from("sequence_enrollments")
    .select("id, automation_id, current_step, status, entered_at, updated_at, exit_reason")
    .order("entered_at", { ascending: false })
    .limit(6);
  // Par l'opportunité quand elle existe (c'est la clé des inscriptions), sinon
  // par l'entreprise — une tâche peut porter l'une sans l'autre.
  req = tache.opportunite_id
    ? req.eq("opportunite_id", tache.opportunite_id)
    : req.eq("entreprise_id", tache.entreprise_id ?? -1);
  const { data } = await req;
  const lignes = (data ?? []) as InscriptionRow[];
  if (lignes.length === 0) return [];

  const { data: autos } = await sc
    .from("automations")
    .select("id, name, definition")
    .in("id", [...new Set(lignes.map((l) => l.automation_id))]);
  const parId = new Map(
    ((autos ?? []) as { id: string; name: string | null; definition: unknown }[]).map((a) => [
      a.id,
      a,
    ]),
  );

  return lignes.map((l) => {
    const auto = parId.get(l.automation_id);
    const def = ((auto?.definition as SequenceDefinition) ?? { steps: [] }) as SequenceDefinition;
    const steps = (Array.isArray(def.steps) ? def.steps : []) as SequenceStep[];
    return {
      enrollment_id: l.id,
      sequence: auto?.name ?? "Séquence",
      statut: l.status,
      etape_courante: l.current_step,
      courante: l.id === tache.enrollment_id,
      // Seules les étapes ANTÉRIEURES sont proposées, et jamais les blocs de
      // structure : revenir sur une condition ne veut rien dire, elle
      // s'aiguille toute seule au passage.
      steps: steps
        .map((s, index) => ({ index, label: libelle(s, index), kind: s.kind, day: s.day }))
        .filter(
          (s) =>
            !STRUCTURE.has(s.kind) &&
            // Une inscription quittée garde son `current_step` : toutes ses
            // étapes sont derrière elle, y compris la dernière.
            (l.status === "active" ? s.index < l.current_step : s.index <= l.current_step),
        ),
    };
  });
}

export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const taskId = new URL(req.url).searchParams.get("task_id");
  if (!taskId) return jsonError("task_id requis", 400, {}, cors);

  const sc = getServiceClient();
  const tache = await lireTache(sc, taskId, user.id);
  if (!tache) return jsonError("introuvable", 404, {}, cors);

  return json({ ok: true, cibles: await lireCibles(sc, tache) }, { headers: cors });
});

export const POST = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const taskId = typeof body.task_id === "string" ? body.task_id : null;
  const enrollmentId = typeof body.enrollment_id === "string" ? body.enrollment_id : null;
  const cible = Number(body.step_index);
  if (!taskId || !enrollmentId || !Number.isInteger(cible)) {
    return jsonError("task_id, enrollment_id et step_index requis", 400, {}, cors);
  }

  const sc = getServiceClient();
  const tache = await lireTache(sc, taskId, user.id);
  if (!tache) return jsonError("introuvable", 404, {}, cors);

  // L'inscription visée doit être une de CELLES DE CE PROSPECT : sans cette
  // vérification, un identifiant d'inscription pris ailleurs serait replacé par
  // n'importe quel agent propriétaire d'une tâche quelconque.
  const cibles = await lireCibles(sc, tache);
  const visee = cibles.find((c) => c.enrollment_id === enrollmentId);
  if (!visee) return jsonError("inscription_hors_perimetre", 403, {}, cors);
  if (!visee.steps.some((s) => s.index === cible)) {
    return jsonError("etape_non_proposee", 409, {}, cors);
  }

  // Les autres inscriptions vivantes du prospect se ferment AVANT : deux
  // inscriptions actives lui écriraient deux fois, et l'ordre compte — fermer
  // après aurait pu fermer celle qu'on vient de rouvrir.
  const fermees: string[] = [];
  for (const c of cibles) {
    if (c.enrollment_id === enrollmentId) continue;
    if (c.statut !== "active" && c.statut !== "paused") continue;
    await sortirDeSequence(sc, c.enrollment_id, "transfert");
    fermees.push(c.sequence);
  }

  const res = await replacerSurEtape(enrollmentId, cible);
  if (!res.ok) return jsonError(res.motif, 409, {}, cors);

  return json(
    {
      ok: true,
      sequence: visee.sequence,
      etape: cible + 1,
      libelle: visee.steps.find((s) => s.index === cible)?.label ?? null,
      fermees,
      annule: res.annule,
    },
    { headers: cors },
  );
});
