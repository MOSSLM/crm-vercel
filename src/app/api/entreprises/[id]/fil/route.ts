/**
 * GET /api/entreprises/:id/fil — tout ce qui s'est passé avec une boîte.
 *
 * La fusion des neuf sources est faite en base (`vue_fil_activite`, cf.
 * `sql/20260826_fil_activite.sql`) et pas ici. Ce n'est pas un détail de goût :
 * trier neuf listes paginées côté Node obligerait à tout charger pour pouvoir
 * rendre les cinquante premières lignes. La vue trie une fois, par index, et
 * rend exactement ce qu'on lui demande.
 *
 * ── LE FILTRE `entreprise_id` N'EST PAS OPTIONNEL ────────────────────────
 * Sans lui, chaque branche de l'UNION parcourt sa table entière. Il est posé
 * ici, à l'unique endroit qui interroge la vue, et l'id est validé avant :
 * un `Number('abc')` passé tel quel à PostgREST rendrait une erreur 400 opaque
 * au lieu d'un refus net.
 *
 * ── LA PAGINATION EST UN CURSEUR, PAS UN `offset` ────────────────────────
 * `offset` sur une vue en UNION ALL fait refaire tout le tri à chaque page, et
 * décale silencieusement les résultats dès qu'une ligne s'ajoute pendant la
 * lecture — ce qui arrive, puisque le fil est écrit pendant qu'on le lit. Le
 * curseur (`avant`, l'horodatage du dernier événement rendu) ne bouge pas.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  CANAUX_ECHANGE,
  type CanalFil,
  type EvenementFil,
  type ReponseFil,
} from "@/lib/fil-activite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** Le plafond d'une page. Au-delà, le fil se lit au défilement, pas d'un bloc. */
const LIMITE_MAX = 100;
const LIMITE_DEFAUT = 50;

type LigneVue = {
  survenu_le: string;
  source: string;
  canal: string;
  sens: string | null;
  titre: string | null;
  detail: string | null;
  opportunite_id: string | null;
  acteur_id: string | null;
  ref: string;
};

export const GET = withAuth<undefined, Params>({}, async ({ req, params, cors }) => {
  const entrepriseId = Number(params.id);
  if (!Number.isInteger(entrepriseId)) {
    return jsonError("id_entreprise_invalide", 400, {}, cors);
  }

  const url = new URL(req.url);
  const avant = url.searchParams.get("avant");
  const filtre = url.searchParams.get("filtre") === "tout" ? "tout" : "echanges";
  const limiteBrute = Number(url.searchParams.get("limite") ?? LIMITE_DEFAUT);
  const limite = Number.isFinite(limiteBrute)
    ? Math.min(Math.max(Math.trunc(limiteBrute), 1), LIMITE_MAX)
    : LIMITE_DEFAUT;

  const sb = getServiceClient();

  // On demande une ligne de plus que la limite : c'est elle, présente ou
  // absente, qui dit s'il reste une page — sans second aller-retour de comptage.
  let requete = sb
    .from("vue_fil_activite")
    .select("survenu_le, source, canal, sens, titre, detail, opportunite_id, acteur_id, ref")
    .eq("entreprise_id", entrepriseId)
    .order("survenu_le", { ascending: false })
    .limit(limite + 1);

  if (filtre === "echanges") requete = requete.in("canal", [...CANAUX_ECHANGE]);
  if (avant) requete = requete.lt("survenu_le", avant);

  const { data, error } = await requete;
  if (error) return jsonError(error.message, 500, {}, cors);

  const lignes = (data ?? []) as LigneVue[];
  const encore = lignes.length > limite;
  const page = encore ? lignes.slice(0, limite) : lignes;

  // Les acteurs en une seule lecture. Un fil de cinquante lignes touche rarement
  // plus de trois personnes : une jointure en base coûterait plus que ça.
  const acteurs = [...new Set(page.map((l) => l.acteur_id).filter((v): v is string => Boolean(v)))];
  const noms = new Map<string, string>();
  if (acteurs.length > 0) {
    const { data: profils } = await sb
      .from("user_profiles")
      .select("id, full_name, prenom, nom, email")
      .in("id", acteurs);
    for (const p of profils ?? []) {
      const compose = [p.prenom, p.nom].filter(Boolean).join(" ").trim();
      noms.set(p.id, p.full_name || compose || p.email || "—");
    }
  }

  const evenements: EvenementFil[] = page.map((l) => ({
    cle: `${l.source}:${l.ref}`,
    survenu_le: l.survenu_le,
    source: l.source,
    canal: l.canal as CanalFil,
    sens: l.sens === "entrant" || l.sens === "sortant" ? l.sens : null,
    titre: l.titre ?? "—",
    detail: l.detail && l.detail.trim().length > 0 ? l.detail : null,
    opportunite_id: l.opportunite_id,
    acteur_id: l.acteur_id,
    acteur_nom: l.acteur_id ? (noms.get(l.acteur_id) ?? null) : null,
  }));

  const reponse: ReponseFil = {
    evenements,
    suite: encore && page.length > 0 ? page[page.length - 1].survenu_le : null,
  };

  return json(reponse, { headers: cors });
});
