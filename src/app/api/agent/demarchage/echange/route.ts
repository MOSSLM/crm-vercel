// /api/agent/demarchage/echange — ce qui se passe ENTRE deux étapes.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE TROU QUE CETTE ROUTE BOUCHE
// ─────────────────────────────────────────────────────────────────────────────
// Une séquence ne pose une carte dans la file qu'aux dates qu'elle a prévues.
// Entre deux, l'inscription est `active` avec un `next_run_at` dans le futur :
// le prospect n'a AUCUNE tâche, donc aucune carte, donc aucune surface. Il ne
// manque pas — il est garé. Mais lui ne le sait pas, et il écrit.
//
// JM2C, le 01/09/2026. La démo part à 10h50. `waDemo` bascule sur « S2 — Après
// la démo », dont la première étape (`plqWa`, la plaquette) porte `day: 2` : la
// prochaine carte tombe le 03/09. Une minute plus tard, le gérant répond « nous
// n'avons pas besoin de refaire le site internet ». Matteo lui écrit un dernier
// message pour lui laisser la plaquette — et n'a nulle part où le mettre, ni
// même le lien de la plaquette sous la main, parce que tout ça vivait sur une
// carte qui n'existait plus. Le CRM n'a donc rien vu : ni le refus, ni la
// réponse. Le 03/09, la file lui aurait rendu « Plaquette — ce que ça coûte »
// pour un homme qui venait de dire non.
//
// Au 01/09/2026, 214 inscriptions sont dans cet état d'attente sans surface.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE N'EST PAS « IL M'A RAPPELÉ », ET LES DEUX DOIVENT COEXISTER
// ─────────────────────────────────────────────────────────────────────────────
// `il-a-rappele` traite le prospect qui DÉCROCHE SON TÉLÉPHONE : il a tout
// obtenu d'un coup, il est devant nous, et le scénario qui le poussait n'a plus
// de sens — d'où la bascule vers « S4 — Il a rappelé ».
//
// Ici, rien de tel. Le prospect a dit un mot, ou on lui a envoyé une pièce de
// sa main. Ça ne change pas de scénario : ça se CONSIGNE, et ça décide
// seulement du sort de la séquence en cours — on continue, on repousse, ou on
// arrête. Fusionner les deux ferait passer un « merci, pas maintenant » pour un
// rappel entrant, et poserait un appel de suite dans la file de l'agent.
//
// ⚠️ CETTE ROUTE N'ENVOIE RIEN, comme `il-a-rappele` et `/api/messages/log`.
// Elle DÉCLARE ce qui est déjà parti de la main de l'agent. Le GET, lui,
// PRÉPARE les liens (il crée les jetons manquants) : c'est le geste explicite
// « de quoi je dispose pour ce prospect ? », jamais un effet de bord d'écran.
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { resolveStageForRole } from "@/app/api/agent/_lib";
import { logAgentAction } from "@/app/api/agent/qualification/_lib";
import { sortirDeSequence } from "@/lib/automations/engine";
import { stepOutcome } from "@/lib/sales-pipeline/stages";
import type { StageRole } from "@/lib/opportunites/stage-roles";
import type { SequenceDefinition, SequenceStep } from "@/components/automations/types";
import { PIECES, liensDesPieces, ligneDePiece, type Piece } from "@/lib/prospection/hors-scenario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Les issues qu'un échange hors file peut porter.
 *
 * Sous-ensemble de `STEP_OUTCOMES` : `no_answer` n'a aucun sens ici (personne
 * n'attendait de réponse — s'il n'a rien dit, il n'y a pas d'échange à
 * consigner). Le reste garde EXACTEMENT le vocabulaire des cartes, y compris
 * les identifiants : une note prise hors file et une note prise sur une carte
 * doivent se relire, se compter et se filtrer de la même façon.
 */
const ISSUES = ["answered", "lukewarm", "later", "not_interested", "blocked", "other"] as const;
type Issue = (typeof ISSUES)[number];

/**
 * L'issue → l'étape visée dans le pipeline de l'affaire. Recopie `OUTCOME_ROLE`
 * de `DemActionCard`, et c'est délibéré : le même mot doit ranger l'affaire au
 * même endroit, qu'il soit dit sur une carte ou sur une fiche hors file.
 *
 * `later` n'y figure pas — mettre de côté ne fait pas avancer une affaire, ça
 * la met en attente, et son étape ne doit pas bouger.
 */
const ROLE_DE_L_ISSUE: Partial<Record<Issue, StageRole>> = {
  answered: "contacte",
  lukewarm: "interesse",
  not_interested: "perdu",
  blocked: "perdu",
};

/**
 * Les issues après lesquelles ON N'INSISTE PLUS — et les seules à poser
 * `sales_pipeline_state.replied`.
 *
 * ⚠️ `answered` EN EST ABSENT, et c'est tout l'objet de l'en-tête de
 * `reply.ts` : « oui c'est bien nous » est une AUTORISATION d'envoyer la suite,
 * pas de l'intérêt pour l'offre. `hasInterest()` se sert de `replied` pour
 * éteindre les cellules WhatsApp et Appel du tableau — le poser sur un simple
 * accusé de réception couperait précisément les étapes qu'on veut enchaîner.
 */
const ISSUES_QUI_ETEIGNENT: readonly Issue[] = ["lukewarm", "later", "not_interested", "blocked"];

type InscriptionVivante = {
  id: string;
  automation_id: string;
  current_step: number | null;
  next_run_at: string | null;
  nom: string | null;
  etape: string | null;
};

/**
 * L'inscription qui tourne encore pour cette entreprise, et où elle en est.
 *
 * `status in ('active','paused')` — les mêmes états que `sortirDeSequence`
 * accepte. Une inscription `exited` ne se reprend pas par ici : le geste
 * consigne un échange, il ne ressuscite pas un scénario clos.
 */
async function inscriptionVivante(
  sb: ReturnType<typeof getServiceClient>,
  entrepriseId: number,
): Promise<InscriptionVivante | null> {
  const { data } = await sb
    .from("sequence_enrollments")
    .select("id, automation_id, current_step, next_run_at, automation:automations(name, definition)")
    .eq("entreprise_id", entrepriseId)
    .in("status", ["active", "paused"])
    .order("entered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const auto = Array.isArray(data.automation) ? data.automation[0] : data.automation;
  const def = (auto?.definition as SequenceDefinition | undefined) ?? { steps: [] };
  const steps = (Array.isArray(def.steps) ? def.steps : []) as SequenceStep[];
  const idx = typeof data.current_step === "number" ? data.current_step : -1;

  return {
    id: data.id as string,
    automation_id: data.automation_id as string,
    current_step: data.current_step as number | null,
    next_run_at: data.next_run_at as string | null,
    nom: (auto?.name as string | undefined) ?? null,
    // L'IDENTIFIANT DE L'ÉTAPE, PAS SON RANG. `plqWa` se relit dans la
    // définition ; « étape 1 » ne se relit nulle part.
    etape: idx >= 0 && idx < steps.length ? ((steps[idx]?.id as string | undefined) ?? null) : null,
  };
}

/** Le mur du périmètre, identique à celui des autres routes du portail. */
async function verifierPerimetre(
  sb: ReturnType<typeof getServiceClient>,
  entrepriseId: number,
  userId: string,
): Promise<{ ok: true; ownerId: string | null } | { ok: false; message: string; code: number }> {
  const { data: ent } = await sb
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!ent) return { ok: false, message: "Entreprise introuvable.", code: 404 };
  if (ent.owner_id !== userId) {
    return { ok: false, message: "Cette entreprise n’est pas dans votre portefeuille.", code: 403 };
  }
  return { ok: true, ownerId: (ent.owner_id as string | null) ?? null };
}

/* ── GET : où il en est, et de quoi on dispose ───────────────────────────── */

/**
 * DEUX LECTURES, ET LA SECONDE SE DEMANDE.
 *
 * Sans paramètre, la route ne rend que l'ÉTAT : la séquence en cours, son
 * étape, la date de la prochaine carte. C'est la réponse à « pourquoi il
 * n'apparaît pas » — la seule question que la fiche hors file ne savait pas
 * répondre, et celle qui fait croire à une disparition.
 *
 * Avec `?pieces=1`, elle prépare EN PLUS les trois liens. Séparé exprès :
 * `liensDesPieces` crée les jetons manquants, et ouvrir une fiche ne doit pas
 * écrire en base.
 */
export const GET = withAuth({ role: "freelance" }, async ({ req, user, cors }) => {
  const url = new URL(req.url);
  const entrepriseId = Number(url.searchParams.get("entreprise_id"));
  if (!Number.isInteger(entrepriseId) || entrepriseId <= 0) {
    return jsonError("entreprise_id requis", 400, {}, cors);
  }

  const sc = getServiceClient();
  const perimetre = await verifierPerimetre(sc, entrepriseId, user.id);
  if (!perimetre.ok) return jsonError(perimetre.message, perimetre.code, {}, cors);

  const inscription = await inscriptionVivante(sc, entrepriseId);

  // La prochaine carte peut aussi être une tâche déjà posée mais datée plus
  // tard (une mise de côté, typiquement). Les deux répondent à la même
  // question, on rend celle qui existe.
  const { data: tache } = await sc
    .from("prospection_tasks")
    .select("id, kind, due_at, title, status")
    .eq("entreprise_id", entrepriseId)
    .in("status", ["pending", "snoozed"])
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let pieces: Partial<Record<Piece, string>> | undefined;
  if (url.searchParams.get("pieces") === "1") {
    pieces = await liensDesPieces(sc, entrepriseId, perimetre.ownerId ?? user.id, PIECES);
  }

  return json(
    {
      sequence: inscription
        ? {
            enrollment_id: inscription.id,
            nom: inscription.nom,
            etape: inscription.etape,
            prochaine_le: inscription.next_run_at,
          }
        : null,
      prochaine_tache: tache
        ? { id: tache.id, kind: tache.kind, due_at: tache.due_at, title: tache.title }
        : null,
      ...(pieces ? { pieces } : {}),
    },
    { headers: cors },
  );
});

/* ── POST : consigner ce qui s'est passé ─────────────────────────────────── */

const Corps = z.object({
  entreprise_id: z.number().int().positive(),
  /** Par où l'échange a eu lieu. WhatsApp de très loin le plus fréquent. */
  canal: z.enum(["whatsapp", "call", "email"]).default("whatsapp"),
  /**
   * CE QU'IL A DIT — exigé, comme pour « il m'a rappelé ».
   *
   * C'est le livrable du geste : une issue seule ne dit pas si « pas
   * intéressé » voulait dire « j'ai déjà quelqu'un » ou « rappelez en janvier ».
   */
  note: z.string().trim().min(1).max(4000),
  /** Ce qu'on lui a envoyé de sa main pendant l'échange. */
  pieces: z.array(z.enum(PIECES)).max(PIECES.length).default([]),
  /** Ce que ça veut dire pour la suite. Absente = on consigne, rien ne bouge. */
  issue: z.enum(ISSUES).optional(),
  /** Obligatoire avec `later` : la date qu'IL a donnée. */
  revient_le: z.string().datetime().optional(),
});

export const POST = withAuth({ role: "freelance", body: Corps }, async ({ body, user, cors }) => {
  const sc = getServiceClient();

  const perimetre = await verifierPerimetre(sc, body.entreprise_id, user.id);
  if (!perimetre.ok) return jsonError(perimetre.message, perimetre.code, {}, cors);

  const issue = body.issue ?? null;
  if (issue === "later" && !body.revient_le) {
    return jsonError("revient_le requis pour une mise de côté", 400, {}, cors);
  }

  const [{ data: opp }, { data: contacts }, inscription] = await Promise.all([
    sc.from("opportunites").select("id").eq("entreprise_id", body.entreprise_id).limit(1).maybeSingle(),
    sc.from("contacts").select("id").eq("entreprise_id", body.entreprise_id).limit(1),
    inscriptionVivante(sc, body.entreprise_id),
  ]);
  const opportuniteId = (opp?.id as string | undefined) ?? null;
  const contactId = (contacts?.[0]?.id as string | undefined) ?? null;

  const maintenant = new Date().toISOString();
  const commun = {
    entreprise_id: body.entreprise_id,
    opportunite_id: opportuniteId,
    contact_id: contactId,
    auteur_id: user.id,
    // `to_email` est NOT NULL : ni un entrant recopié ni une pièce déclarée
    // n'ont de destinataire. Convention de `20260815_notes_de_demarchage.sql`.
    to_email: "",
    status: "sent",
  };

  // ── 1. Ce qu'il a dit ────────────────────────────────────────────────────
  // EN PREMIER, ET SEUL À POUVOIR FAIRE ÉCHOUER L'APPEL. Tout le reste est du
  // rangement : si le rangement casse, la phrase est déjà sauvée. L'inverse
  // perdrait la seule chose que personne ne peut reconstituer.
  const { data: entrant, error: eEntrant } = await sc
    .from("email_logs")
    .insert({
      ...commun,
      channel: body.canal,
      direction: "entrant",
      sent_at: maintenant,
      subject: "Échange hors file",
      body_text: body.note,
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

  // ── 2. Ce qu'on lui a envoyé pendant l'échange ───────────────────────────
  const liens = await liensDesPieces(sc, body.entreprise_id, perimetre.ownerId ?? user.id, body.pieces);
  const journalisees: Piece[] = [];
  const introuvables: Piece[] = [];
  for (const piece of body.pieces) {
    const lien = liens[piece];
    // Une pièce sans lien ne se journalise pas AVEC UN TROU : elle est rendue à
    // l'écran comme non consignée. Écrire « démo envoyée » sans démo publiée
    // ferait croire à un envoi qui n'a pas pu avoir lieu.
    if (!lien) {
      introuvables.push(piece);
      continue;
    }
    const { error } = await sc.from("email_logs").insert({
      ...commun,
      channel: body.canal === "call" ? "whatsapp" : body.canal,
      direction: "sortant",
      sent_at: maintenant,
      subject: "Envoyé à la main",
      body_text: ligneDePiece(piece, lien),
    });
    if (!error) journalisees.push(piece);
  }

  // ── 3. Ce que devient la séquence ────────────────────────────────────────
  //
  // Trois sorts, et le troisième est le défaut :
  //
  //   · une issue qui ARRÊTE ferme l'inscription et annule ce qui était encore
  //     en vol — c'est la relance du 03/09 qu'on n'enverra pas ;
  //   · `later` REPOUSSE : la séquence reprendra où elle en est, à la date
  //     qu'il a donnée. On ne saute aucune étape, on décale le réveil ;
  //   · tout le reste NE TOUCHE À RIEN. Il a parlé, c'est consigné, et la
  //     séquence reprendra comme prévu. Avancer d'une étape parce que quelqu'un
  //     a dit un mot ferait sauter des envois que personne n'a décidés.
  let sequence: { arretee: boolean; repoussee_au: string | null } = {
    arretee: false,
    repoussee_au: null,
  };
  if (inscription) {
    const def = issue ? stepOutcome(issue) : null;
    try {
      if (def?.flow === "stop") {
        await sortirDeSequence(sc, inscription.id, "stop");
        sequence = { arretee: true, repoussee_au: null };
      } else if (issue === "later" && body.revient_le) {
        await sc
          .from("sequence_enrollments")
          .update({ next_run_at: body.revient_le })
          .eq("id", inscription.id)
          .in("status", ["active", "paused"]);
        // Et la carte déjà posée avec, sinon elle resterait échue en boucle
        // pendant que la séquence, elle, dort jusqu'à la date choisie.
        await sc
          .from("prospection_tasks")
          .update({ status: "snoozed", due_at: body.revient_le })
          .eq("enrollment_id", inscription.id)
          .in("status", ["pending"]);
        sequence = { arretee: false, repoussee_au: body.revient_le };
      }
    } catch {
      // L'échange est écrit : le sort de la séquence ne doit pas le perdre.
    }
  }

  // ── 4. L'état commercial ─────────────────────────────────────────────────
  let etapeVisee: number | null = null;
  if (opportuniteId && issue) {
    if (ISSUES_QUI_ETEIGNENT.includes(issue)) {
      await sc
        .from("sales_pipeline_state")
        .upsert({ opportunite_id: opportuniteId, replied: true }, { onConflict: "opportunite_id" })
        .then(
          () => {},
          () => {},
        );
    }

    const role = ROLE_DE_L_ISSUE[issue];
    if (role) {
      try {
        // DANS SON PIPELINE. `resolveStageForRole` cherche l'étape qui joue ce
        // rôle dans le pipeline de l'affaire — jamais un `stage_id` deviné, qui
        // aspirerait l'affaire vers « Agent SAMA » via
        // `trg_sync_opportunity_pipeline_from_stage`.
        const cible = await resolveStageForRole(sc, opportuniteId, role);
        if (cible) {
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
  }

  // `agent_activity_events` est le seul journal dont on sait qu'il ne contient
  // que des gestes humains (cf. CLAUDE.md) : sans cette ligne, une demi-heure
  // passée à répondre à des prospects entre deux étapes ne compte nulle part
  // dans `/equipe`. Best effort — l'échange est déjà écrit.
  await logAgentAction({
    agentId: user.id,
    entrepriseId: body.entreprise_id,
    action: "echange_hors_file",
    metadata: {
      canal: body.canal,
      issue,
      pieces: journalisees,
      sequence: inscription?.nom ?? null,
      etape: inscription?.etape ?? null,
    },
  });

  return json(
    {
      ok: true,
      entrant_id: entrant?.id ?? null,
      pieces_journalisees: journalisees,
      // Dire ce qui n'a PAS été écrit, et pourquoi.
      pieces_sans_lien: introuvables,
      sequence,
      etape_visee: etapeVisee,
    },
    { headers: cors },
  );
});
