/**
 * POST /api/donnees-publiques/hydrate — le bouton d'une fiche.
 *
 * Rafraîchit à la demande les données publiques d'une ou plusieurs entreprises,
 * en forçant : quand un humain clique, c'est qu'il veut voir MAINTENANT, pas
 * s'entendre répondre que le TTL n'est pas dépassé.
 *
 * Le passage automatique est ailleurs (`/api/cron/donnees-publiques`), et
 * partage exactement le même moteur — il n'y a qu'une implémentation de
 * l'hydratation, donc aucun risque que le bouton et le cron divergent.
 */

import { z } from "zod";

import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { hydraterLot, type CibleHydratation } from "@/lib/donnees-publiques/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  entreprise_ids: z.array(z.number().int().positive()).min(1).max(50),
});

/**
 * Ouvert à l'admin et aux agents porteurs de `marketing_pipeline` : c'est la
 * même population que celle qui prépare les appels et complète les fiches.
 *
 * `capability` et non `role` — `requireRole` compare le rôle À L'IDENTIQUE, il
 * n'existe donc pas de valeur qui dise « admin OU freelance ». La capacité,
 * elle, passe toujours pour un admin et se délègue à un freelance.
 */
export const POST = withAuth(
  { capability: "marketing_pipeline", body: bodySchema },
  async ({ body, cors }) => {
    const sb = getServiceClient();

    // On lit les SIRET depuis `entreprises` : le corps de la requête ne porte que
    // des identifiants de fiches, jamais un SIRET fourni par le client. Accepter
    // un SIRET de l'extérieur permettrait d'écrire les données d'une entreprise
    // dans la fiche d'une autre.
    const { data, error } = await sb
      .from("entreprises")
      .select("id, siret, siren")
      .in("id", body.entreprise_ids)
      .is("merged_into_id", null);

    if (error) return jsonError("lecture_entreprises", 500, { detail: error.message }, cors);

    const lignes = (data ?? []) as Array<{ id: number; siret: string | null; siren: string | null }>;
    const cibles: CibleHydratation[] = lignes.map((e) => ({
      entreprise_id: e.id,
      siret: e.siret,
      siren: e.siren,
    }));

    const sansSiret = cibles.filter((c) => !c.siret).map((c) => c.entreprise_id);

    const { traitees, reste } = await hydraterLot(sb, cibles, {
      declencheur: "bouton",
      forcer: true,
      budgetMs: 100_000,
    });

    return json(
      {
        ok: true,
        traitees,
        reste,
        // Renvoyé explicitement : une fiche sans SIRET n'est pas un échec
        // d'hydratation, c'est une fiche qui attend sa résolution d'identité.
        sans_siret: sansSiret,
      },
      { headers: cors },
    );
  },
);
