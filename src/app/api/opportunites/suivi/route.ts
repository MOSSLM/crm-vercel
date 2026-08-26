/**
 * GET /api/opportunites/suivi — ce qui demande qu'on s'en occupe aujourd'hui.
 *
 * ── LE TRI SE FAIT ICI ET NON EN SQL ─────────────────────────────────────
 * L'urgence dépend d'un classement (`lib/opportunites/suivi.ts`) qui compare
 * l'ancienneté du silence au seuil de l'ÉTAPE. Exprimer ça en SQL demanderait
 * d'y recopier la table des seuils — donc de la maintenir à deux endroits, et
 * de découvrir la divergence le jour où l'un des deux aura été mis à jour.
 *
 * Ce que ça coûte : on lit toutes les opportunités vivantes (877 aujourd'hui)
 * pour n'en rendre qu'une poignée. C'est tenable parce que la vue est bornée
 * aux affaires NON archivées et non-test, et que ce nombre-là ne croît pas
 * comme le fichier d'entreprises — une opportunité se ferme, une entreprise
 * reste. Le jour où il dépasserait quelques milliers, c'est le classement qu'il
 * faudrait descendre en base, pas la pagination qu'il faudrait bricoler ici.
 *
 * ── `limite` S'APPLIQUE APRÈS LE TRI ─────────────────────────────────────
 * L'inverse rendrait « les cinquante premières par hasard, triées » au lieu de
 * « les cinquante plus urgentes » — un écran qui a l'air juste et qui ment.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { trierParUrgence, type EtatSuivi, type LigneSuivi } from "@/lib/opportunites/suivi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ETATS_VALIDES: EtatSuivi[] = ["en_retard", "qui_pourrit", "sans_prochaine_action", "ok"];

/** Ce qu'on rend par défaut : ce qui appelle une action, pas le pipeline entier. */
const ETATS_PAR_DEFAUT: EtatSuivi[] = ["en_retard", "qui_pourrit", "sans_prochaine_action"];

const LIMITE_MAX = 200;

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);

  const etatsDemandes = (url.searchParams.get("etats") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e): e is EtatSuivi => (ETATS_VALIDES as string[]).includes(e));
  const etats = etatsDemandes.length > 0 ? etatsDemandes : ETATS_PAR_DEFAUT;

  const limiteBrute = Number(url.searchParams.get("limite") ?? 50);
  const limite = Number.isFinite(limiteBrute)
    ? Math.min(Math.max(Math.trunc(limiteBrute), 1), LIMITE_MAX)
    : 50;

  const proprietaire = url.searchParams.get("owner");

  const sb = getServiceClient();
  let requete = sb.from("vue_opportunites_suivi").select("*");
  if (proprietaire) requete = requete.eq("owner_id", proprietaire);

  const { data, error } = await requete;
  if (error) return jsonError(error.message, 500, {}, cors);

  const classees = trierParUrgence((data ?? []) as LigneSuivi[]);
  const retenues = classees.filter((l) => etats.includes(l.etat));

  // Les compteurs portent sur TOUT le pipeline, pas sur la page rendue : c'est
  // ce qui permet à l'écran d'annoncer « 12 en retard » tout en n'en montrant
  // que cinq.
  const compteurs = classees.reduce<Record<EtatSuivi, number>>(
    (acc, l) => {
      acc[l.etat] += 1;
      return acc;
    },
    { en_retard: 0, qui_pourrit: 0, sans_prochaine_action: 0, ok: 0 },
  );

  return json(
    {
      opportunites: retenues.slice(0, limite),
      total_retenu: retenues.length,
      compteurs,
    },
    { headers: cors },
  );
});
