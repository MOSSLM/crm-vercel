// /api/agent/demarchage/il-a-rappele — la porte de sortie du scénario.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE CE GESTE RATTRAPE
// ─────────────────────────────────────────────────────────────────────────────
// Un prospect qui rappelle de lui-même fait, en cinq minutes, tout ce que la
// séquence met trois semaines à obtenir : il parle, il pose ses conditions, il
// accepte ou refuse de recevoir la démo. Et rien de tout ça n'entrait dans le
// CRM — pas parce que c'était impossible, mais parce que c'était QUATRE gestes
// dans quatre écrans : consigner l'entrant dans l'inbox, journaliser les pièces
// envoyées à la main, poser l'issue sur la tâche, changer la séquence. Personne
// ne fait quatre gestes en raccrochant. Donc on n'en faisait aucun.
//
// D'où un bouton et une route : UN clic, et le CRM sait ce qui s'est passé.
//
// ─────────────────────────────────────────────────────────────────────────────
// SIX ÉCRITURES, ET AUCUNE N'EST DÉCORATIVE
// ─────────────────────────────────────────────────────────────────────────────
//   1. L'ENTRANT. `email_logs` direction `entrant` — le seul transport entrant
//      qui existe dans ce CRM est l'agent qui recopie ce qu'on lui a dit
//      (cf. l'en-tête de `conversation.ts`). Sans cette ligne, l'échange n'a
//      pas eu lieu : ni dans le fil, ni dans l'entonnoir, ni dans « a répondu ».
//   2. LES PIÈCES ENVOYÉES À LA MAIN. Une ligne `sortant` par pièce, avec son
//      lien. C'est le trou qu'on a mesuré le 29/08 : la démo et la plaquette
//      étaient parties, le fil n'en portait aucune trace, et le seul signal
//      d'intention du CRM — l'ouverture d'un lien à jeton — n'était rattachable
//      à aucun envoi.
//   3. LA TÂCHE COURANTE, bouclée en `done` et non `skipped` : quelque chose a
//      bel et bien eu lieu, et de la meilleure façon. `skipped` la rangerait
//      avec les tâches abandonnées en masse (cf. l'en-tête de `/equipe`).
//   4. `replied = true` sur l'état commercial. C'est ce qui éteint les
//      relances automatiques du tableau — « il a réagi, on n'insiste plus ».
//   5. L'AFFAIRE MONTE d'un cran, au rôle `interesse`. Pas `contacte` : être
//      contacté est ce que NOUS avons fait, rappeler est ce que LUI a fait.
//   6. LA BASCULE vers « S4 — Il a rappelé », qui reprend là où le scénario
//      s'arrête. Faite en dernier, et jamais avant d'avoir tout journalisé :
//      si la bascule échoue, ce qui s'est dit est déjà sauvé.
//
// ⚠️ CE GESTE N'ENVOIE RIEN. Il DÉCLARE ce qui est déjà parti de la main de
// l'agent. La distinction est la même que pour `/api/messages/log`, et elle
// n'est pas cosmétique : un bouton qui enverrait pour de vrai n'aurait pas sa
// place derrière une case à cocher.
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { resolveStageForRole } from "@/app/api/agent/_lib";
import { processSequenceEnrollment } from "@/lib/automations/engine";
import type { SequenceEnrollment } from "@/components/automations/types";
import {
  PIECES,
  SEQUENCE_IL_A_RAPPELE,
  basculerVersSequence,
  liensDesPieces,
  ligneDePiece,
  type Piece,
} from "@/lib/prospection/hors-scenario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const Corps = z.object({
  /** La tâche ouverte au moment de l'échange. Absente = geste pris hors file. */
  task_id: z.string().uuid().optional(),
  /** Obligatoire sans tâche : c'est le prospect dont on parle. */
  entreprise_id: z.number().int().positive().optional(),
  /** Par où il a pris contact. Le téléphone est le cas de loin le plus fréquent. */
  canal: z.enum(["call", "whatsapp", "email"]).default("call"),
  /**
   * CE QU'IL A DIT — exigé, et c'est la seule contrainte du formulaire.
   *
   * Un « il a rappelé » sans contenu ne vaut pas mieux que le silence qu'il
   * remplace : trois semaines plus tard, personne ne saura s'il était intéressé
   * ou s'il appelait pour qu'on cesse. La phrase EST le livrable de ce geste.
   */
  note: z.string().trim().min(1).max(4000),
  /** Ce qu'on lui a envoyé pendant l'échange, de sa propre main. */
  pieces: z.array(z.enum(PIECES)).max(PIECES.length).default([]),
});

type TacheRow = {
  id: string;
  status: string;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  step_id: string | null;
  enrollment_id: string | null;
  assignee_id: string | null;
  entreprise: { owner_id: string | null } | { owner_id: string | null }[] | null;
};

export const POST = withAuth({ role: "freelance", body: Corps }, async ({ body, user, cors }) => {
  const sc = getServiceClient();

  // ── Qui, et de quel droit ────────────────────────────────────────────────
  let tache: TacheRow | null = null;
  if (body.task_id) {
    const { data, error } = await sc
      .from("prospection_tasks")
      .select(
        "id, status, contact_id, entreprise_id, opportunite_id, step_id, enrollment_id, assignee_id, " +
          "entreprise:entreprises(owner_id)",
      )
      .eq("id", body.task_id)
      .maybeSingle();
    if (error) return jsonError(error.message, 500, {}, cors);
    tache = data as unknown as TacheRow | null;
    const ent = Array.isArray(tache?.entreprise) ? tache?.entreprise[0] : tache?.entreprise;
    if (!tache || (tache.assignee_id !== user.id && ent?.owner_id !== user.id)) {
      return jsonError("introuvable", 404, {}, cors);
    }
  }

  const entrepriseId = tache?.entreprise_id ?? body.entreprise_id ?? null;
  if (entrepriseId == null) return jsonError("entreprise_id requis", 400, {}, cors);

  // LE MUR EST ICI, PAS DANS L'ÉCRAN — même règle que
  // `POST /api/agent/conversations` : l'identifiant du corps de la requête ne
  // doit jamais suffire à écrire dans le fil de quelqu'un d'autre.
  const { data: ent } = await sc
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!ent) return jsonError("Entreprise introuvable.", 404, {}, cors);
  if (ent.owner_id !== user.id && tache?.assignee_id !== user.id) {
    return jsonError("Cette entreprise n’est pas dans votre portefeuille.", 403, {}, cors);
  }

  // L'opportunité et le contact se retrouvent depuis l'entreprise quand la
  // tâche ne les porte pas — un geste hors file doit se rattacher au même
  // endroit qu'un geste pris sur une carte.
  const [{ data: opp }, { data: contacts }] = await Promise.all([
    tache?.opportunite_id
      ? Promise.resolve({ data: { id: tache.opportunite_id } })
      : sc.from("opportunites").select("id").eq("entreprise_id", entrepriseId).limit(1).maybeSingle(),
    tache?.contact_id
      ? Promise.resolve({ data: [{ id: tache.contact_id }] })
      : sc.from("contacts").select("id").eq("entreprise_id", entrepriseId).limit(1),
  ]);
  const opportuniteId = (opp?.id as string | undefined) ?? null;
  const contactId = tache?.contact_id ?? (contacts?.[0]?.id as string | undefined) ?? null;

  const maintenant = new Date().toISOString();
  const commun = {
    entreprise_id: entrepriseId,
    opportunite_id: opportuniteId,
    contact_id: contactId,
    auteur_id: user.id,
    // `to_email` est NOT NULL : ni un entrant recopié ni une pièce déclarée
    // n'ont de destinataire. Chaîne vide, convention déjà posée par
    // `20260815_notes_de_demarchage.sql`.
    to_email: "",
    status: "sent",
  };

  // ── 1. Ce qu'il a dit ────────────────────────────────────────────────────
  const { data: entrant, error: eEntrant } = await sc
    .from("email_logs")
    .insert({
      ...commun,
      channel: body.canal,
      direction: "entrant",
      sent_at: maintenant,
      subject: "Il a pris contact de lui-même",
      body_text: body.note,
      step_id: tache?.step_id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (eEntrant) {
    if (/direction/i.test(eEntrant.message)) {
      return jsonError(
        "La colonne `direction` n’existe pas encore : appliquer `sql/20260820_conversation.sql`.",
        503,
        {},
        cors,
      );
    }
    return jsonError(eEntrant.message, 500, {}, cors);
  }

  // ── 2. Ce qu'on lui a donné pendant l'échange ────────────────────────────
  const liens = await liensDesPieces(sc, entrepriseId, ent.owner_id ?? user.id, body.pieces);
  const journalisees: Piece[] = [];
  const introuvables: Piece[] = [];
  for (const piece of body.pieces) {
    const url = liens[piece];
    // Une pièce sans lien ne se journalise pas AVEC UN TROU : on la rend à
    // l'écran comme non journalisée. Écrire « démo envoyée » sans démo
    // publiée ferait croire à un envoi qui n'a pas pu avoir lieu.
    if (!url) {
      introuvables.push(piece);
      continue;
    }
    const { error } = await sc.from("email_logs").insert({
      ...commun,
      channel: body.canal === "call" ? "whatsapp" : body.canal,
      direction: "sortant",
      sent_at: maintenant,
      subject: `${piece === "demo" ? "Site démo" : piece === "plaquette" ? "Plaquette" : "Rapport d’audit"} — envoyé à la main`,
      body_text: ligneDePiece(piece, url),
    });
    if (!error) journalisees.push(piece);
  }

  // ── 3. La tâche courante ─────────────────────────────────────────────────
  let tacheBouclee = false;
  if (tache && tache.status !== "done") {
    const { error } = await sc
      .from("prospection_tasks")
      .update({ status: "done", done_at: maintenant })
      .eq("id", tache.id);
    tacheBouclee = !error;
  }

  // ── 4 et 5. L'état commercial ────────────────────────────────────────────
  let etapeVisee: number | null = null;
  if (opportuniteId) {
    await sc
      .from("sales_pipeline_state")
      .upsert(
        { opportunite_id: opportuniteId, replied: true, state: "progress", state_reason: null },
        { onConflict: "opportunite_id" },
      )
      .then(
        () => {},
        () => {},
      );

    // DANS SON PIPELINE, et EN AVANT SEULEMENT.
    //
    // `resolveStageForRole` cherche l'étape qui joue ce rôle dans le pipeline
    // de l'affaire — jamais un `stage_id` deviné, qui aspirerait l'affaire vers
    // « Agent SAMA » via `trg_sync_opportunity_pipeline_from_stage`.
    //
    // DEUX RÔLES, ET LE SECOND N'EST PAS UN LUXE : « Site en construction », le
    // pipeline où vivent ces prospects, n'a AUCUNE étape qui se lise comme
    // « intéressé » (Qualifié · LM Déployé · Approche · Relance 1-3 · RDV…).
    // Avec le seul rôle `interesse`, la fonction rendait `null` et l'affaire ne
    // bougeait jamais — un rangement silencieusement inopérant, exactement le
    // genre de panne qu'aucun écran ne montre. `contacte` est le repli.
    try {
      const cible = await resolveStageForRole(sc, opportuniteId, "interesse", "contacte");
      // EN AVANT SEULEMENT. Sans ce garde-fou, un prospect déjà au devis qui
      // rappelle pour donner son accord redescendrait en « Relance 1 ».
      const { data: dealActuel } = await sc
        .from("opportunites")
        .select("stage:etapes_pipeline!opportunites_stage_id_fkey(ordre)")
        .eq("id", opportuniteId)
        .maybeSingle();
      const ordreActuel = (() => {
        const s = (dealActuel as { stage?: { ordre?: number } | { ordre?: number }[] } | null)?.stage;
        const un = Array.isArray(s) ? s[0] : s;
        return un?.ordre ?? null;
      })();

      if (cible && (ordreActuel == null || cible.ordre > ordreActuel)) {
        await sc
          .from("opportunites")
          .update({ stage_id: cible.id, updated_at: maintenant })
          .eq("id", opportuniteId);
        etapeVisee = cible.id;
      }
    } catch {
      /* l'échange est journalisé : le rangement du pipeline ne doit pas le perdre */
    }
  }

  // ── 6. La bascule ────────────────────────────────────────────────────────
  const bascule = await basculerVersSequence(sc, SEQUENCE_IL_A_RAPPELE, {
    entrepriseId,
    contactId,
    opportuniteId,
    enrollmentId: tache?.enrollment_id ?? null,
    userId: user.id,
  }).catch(() => ({
    enrollmentId: null,
    dejaInscrit: false,
    sortieDe: null,
    refus: "erreur" as string | null,
  }));

  // ON NE FAIT PAS ATTENDRE LE TICKER. La première étape de S4 est une
  // CONDITION : tant qu'elle n'est pas évaluée, l'inscription n'est sur aucune
  // voie et l'agent ne voit rien changer. Même geste que `handleEnroll` pour
  // une étape manuelle du jour 0 — un clic doit produire un effet visible tout
  // de suite, sinon on reclique.
  if (bascule.enrollmentId && !bascule.dejaInscrit) {
    const { data: enr } = await sc
      .from("sequence_enrollments")
      .select("*")
      .eq("id", bascule.enrollmentId)
      .maybeSingle();
    if (enr) await processSequenceEnrollment(enr as SequenceEnrollment).catch(() => {});
  }

  return json(
    {
      ok: true,
      entrant_id: entrant?.id ?? null,
      pieces_journalisees: journalisees,
      // Dire ce qui n'a PAS été écrit, et pourquoi : une pièce cochée sans
      // lien disponible doit se voir à l'écran, sinon l'agent croit l'avoir
      // consignée.
      pieces_sans_lien: introuvables,
      tache_bouclee: tacheBouclee,
      etape_visee: etapeVisee,
      sequence: {
        inscrit: bascule.enrollmentId != null,
        deja_inscrit: bascule.dejaInscrit,
        sortie_de: bascule.sortieDe,
        refus: bascule.refus,
      },
    },
    { headers: cors },
  );
});
