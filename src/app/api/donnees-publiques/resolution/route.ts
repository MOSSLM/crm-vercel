/**
 * /api/donnees-publiques/resolution — proposer, lister, trancher.
 *
 * 190 fiches sont concernées, dont 150 sans le moindre identifiant. C'est le
 * seul chantier du socle qui demande du jugement, et la route est construite
 * pour l'imposer : `POST` PROPOSE, `PATCH` TRANCHE. Aucun chemin ne fait les
 * deux.
 */

import { z } from "zod";

import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  chercherCandidats,
  enregistrerCandidats,
  extraireIdentifiants,
  rejeterCandidat,
  validerCandidat,
} from "@/lib/donnees-publiques/resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

const proposerSchema = z.object({
  entreprise_ids: z.array(z.number().int().positive()).min(1).max(30),
});

const trancherSchema = z.object({
  entreprise_id: z.number().int().positive(),
  siret: z.string().regex(/^\d{14}$/),
  decision: z.enum(["valide", "rejete"]),
  commentaire: z.string().max(500).optional(),
  /**
   * D'où vient le numéro. `recherche_web` est le cas d'un SIRET trouvé hors du
   * CRM — pied de page d'un site, annuaire, registre consulté à la main — puis
   * rapporté ici. Il n'est PAS moins vérifié pour autant : la validation
   * interroge le registre avant d'écrire, quelle que soit la source.
   */
  source: z.enum(["resolution", "recherche_web", "saisie"]).optional(),
  /** L'URL où le numéro a été lu. Consignée dans le commentaire du candidat. */
  source_url: z.string().url().max(500).optional(),
});

type FicheRow = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  siret: string | null;
};

/**
 * POST — cherche et enregistre des candidats. N'écrit JAMAIS `entreprises.siret`.
 *
 * Le traitement est séquentiel et non parallèle : l'API est gratuite et sans
 * quota constaté, mais la marteler depuis une IP unique est le meilleur moyen
 * de le faire apparaître.
 */
export const POST = withAuth(
  { capability: "marketing_pipeline", body: proposerSchema },
  async ({ body, cors }) => {
    const sb = getServiceClient();

    const { data, error } = await sb
      .from("entreprises")
      .select("id, name, ville, code_postal, siret")
      .in("id", body.entreprise_ids)
      .is("merged_into_id", null);
    if (error) return jsonError("lecture_entreprises", 500, { detail: error.message }, cors);

    const fiches = (data ?? []) as FicheRow[];

    // Les identifiants déjà écrits à la main dans les notes sont les meilleurs
    // candidats du parc : posés par quelqu'un qui avait le registre ouvert.
    const { data: notes } = await sb
      .from("contacts")
      .select("entreprise_id, notes")
      .in("entreprise_id", body.entreprise_ids)
      .not("notes", "is", null);

    const parFiche = new Map<number, { siret: string | null; siren: string | null }>();
    for (const n of (notes ?? []) as Array<{ entreprise_id: number; notes: string }>) {
      const ids = extraireIdentifiants(n.notes);
      if (!ids.siret && !ids.siren) continue;
      const actuel = parFiche.get(n.entreprise_id);
      parFiche.set(n.entreprise_id, {
        siret: ids.siret ?? actuel?.siret ?? null,
        siren: ids.siren ?? actuel?.siren ?? null,
      });
    }

    const resultats: Array<{
      entreprise_id: number;
      candidats: number;
      meilleur_score: number | null;
      deja_resolu?: boolean;
      erreur?: string;
    }> = [];

    for (const fiche of fiches) {
      if (fiche.siret) {
        resultats.push({ entreprise_id: fiche.id, candidats: 0, meilleur_score: null, deja_resolu: true });
        continue;
      }
      try {
        const connus = parFiche.get(fiche.id);
        const candidats = await chercherCandidats({
          entreprise_id: fiche.id,
          name: fiche.name,
          ville: fiche.ville,
          code_postal: fiche.code_postal,
          siren_connu: connus?.siren ?? null,
          siret_connu: connus?.siret ?? null,
        });
        await enregistrerCandidats(sb, fiche.id, candidats);
        resultats.push({
          entreprise_id: fiche.id,
          candidats: candidats.length,
          meilleur_score: candidats[0]?.score ?? null,
        });
      } catch (e) {
        resultats.push({
          entreprise_id: fiche.id,
          candidats: 0,
          meilleur_score: null,
          erreur: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({ ok: true, resultats }, { headers: cors });
  },
);

/**
 * GET — les candidats en attente d'une décision.
 *
 * Sans `entreprise_id`, rend la file complète, la plus sûre d'abord : c'est
 * l'ordre dans lequel une session de validation va le plus vite.
 */
export const GET = withAuth({ capability: "marketing_pipeline" }, async ({ req, cors }) => {
  const sb = getServiceClient();
  const url = new URL(req.url);
  const entrepriseId = url.searchParams.get("entreprise_id");

  let q = sb
    .from("entreprise_siret_candidats")
    .select(
      "id, entreprise_id, siret, siren, denomination, enseignes, adresse, code_postal, ville, etat_administratif, naf_code, score, score_detail, rang, statut",
    )
    .eq("statut", "propose");

  if (entrepriseId) q = q.eq("entreprise_id", Number(entrepriseId));

  const { data, error } = await q.order("score", { ascending: false }).limit(500);
  if (error) return jsonError("lecture_candidats", 500, { detail: error.message }, cors);

  return json({ ok: true, candidats: data ?? [] }, { headers: cors });
});

/**
 * PATCH — la décision humaine, et le seul chemin qui écrit `entreprises.siret`.
 *
 * Réservé à l'admin : valider un SIRET engage tout ce qui en découle, y compris
 * les logos RGE affichés sur un site public.
 */
export const PATCH = withAuth({ role: "admin", body: trancherSchema }, async ({ body, user, cors }) => {
  const sb = getServiceClient();

  if (body.decision === "rejete") {
    await rejeterCandidat(sb, {
      entreprise_id: body.entreprise_id,
      siret: body.siret,
      decide_par: user.id,
      commentaire: body.commentaire,
    });
    return json({ ok: true, decision: "rejete" }, { headers: cors });
  }

  const res = await validerCandidat(sb, {
    entreprise_id: body.entreprise_id,
    siret: body.siret,
    decide_par: user.id,
    source: body.source,
    // La preuve voyage avec la décision : dans six mois, devant une fiche
    // douteuse, on veut pouvoir dire OÙ le numéro a été lu.
    commentaire: [body.commentaire, body.source_url && `source : ${body.source_url}`]
      .filter(Boolean)
      .join(" — ") || undefined,
  });

  if (!res.ok) return jsonError(res.erreur, 409, {}, cors);
  // Les divergences ne bloquent pas mais remontent : un code postal qui ne
  // correspond pas, ou une entreprise cessée, méritent d'être vus.
  return json({ ok: true, decision: "valide", avertissements: res.avertissements }, { headers: cors });
});
