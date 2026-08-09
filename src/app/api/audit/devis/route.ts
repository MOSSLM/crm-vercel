import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { versOffreAudit, type OffreAudit } from "@/lib/audit/offres-audit";

/**
 * Valider un audit écrit le devis.
 *
 * `opportunite_offres` existait depuis des mois — table, API REST complète,
 * trigger de workflow sur le passage à « acceptee » — et n'avait jamais reçu une
 * seule ligne, faute d'appelant. Le seul lien offre ↔ opportunité réellement
 * utilisé était l'instantané d'UNE offre copié à la qualification, jamais
 * recalculé. Ici, l'audit qu'on vient de relire devient le devis, sans ressaisie.
 *
 * DEUX RÈGLES DE SÛRETÉ.
 *
 * 1. **On ne touche qu'à ce qu'on a écrit.** Les lignes posées par l'audit
 *    portent un marqueur ; une ligne ajoutée à la main par un commercial n'est
 *    jamais supprimée par un recalcul. Sans ça, valider un audit effacerait
 *    silencieusement une négociation.
 *
 * 2. **Le montant est une somme, pas une copie.** `montant` reçoit le ponctuel,
 *    `mrr` le récurrent. Les mélanger ferait apparaître un abonnement à 49 €
 *    comme une affaire à 49 €.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marqueur des lignes générées. Le seul champ libre de la table est `notes`. */
const MARQUEUR = "[audit]";

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { opportunite_id?: string; codes?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  const opportuniteId = body.opportunite_id;
  const codes = Array.isArray(body.codes) ? body.codes.filter((c): c is string => typeof c === "string") : [];
  if (!opportuniteId) return jsonError("opportunite_id requis.", 400);

  const sb = getServiceClient();

  // Les offres, relues depuis le catalogue : le client propose des codes, il ne
  // propose pas de prix. Un prix qui vient du navigateur n'est pas un prix.
  const { data: lignesOffres, error: erreurOffres } = await sb.from("offres").select("*").eq("actif", true);
  if (erreurOffres) return jsonError(`Catalogue indisponible : ${erreurOffres.message}`, 503);

  const parCode = new Map<string, OffreAudit & { id: string }>();
  for (const row of lignesOffres ?? []) {
    const o = versOffreAudit(row as Record<string, unknown>);
    const id = (row as { id?: string }).id;
    if (o && id) parCode.set(o.code, { ...o, id });
  }

  const retenues = codes.map((c) => parCode.get(c)).filter((o): o is OffreAudit & { id: string } => Boolean(o));
  const inconnus = codes.filter((c) => !parCode.has(c));

  // Règle 1 : on ne retire que nos propres lignes.
  const { error: erreurPurge } = await sb
    .from("opportunite_offres")
    .delete()
    .eq("opportunite_id", opportuniteId)
    .like("notes", `${MARQUEUR}%`);
  if (erreurPurge) return jsonError(`Nettoyage impossible : ${erreurPurge.message}`, 500);

  if (retenues.length > 0) {
    const { error } = await sb.from("opportunite_offres").insert(
      retenues.map((o) => ({
        opportunite_id: opportuniteId,
        offre_id: o.id,
        offre_nom: o.nom,
        offre_prix_ht: o.prixHt,
        statut: "proposee",
        notes: `${MARQUEUR} ${o.role}`,
      })),
    );
    if (error) return jsonError(`Écriture du devis impossible : ${error.message}`, 500);
  }

  // Règle 2 : deux natures de prix, deux colonnes.
  const ponctuel = retenues.filter((o) => !o.mensuel).reduce((a, o) => a + o.prixHt, 0);
  const recurrent = retenues.filter((o) => o.mensuel).reduce((a, o) => a + o.prixHt, 0);

  const { error: erreurMontant } = await sb
    .from("opportunites")
    .update({ montant: ponctuel, mrr: recurrent })
    .eq("id", opportuniteId);
  if (erreurMontant) return jsonError(`Montant non mis à jour : ${erreurMontant.message}`, 500);

  return json({
    lignes: retenues.length,
    montant: ponctuel,
    mrr: recurrent,
    // Nommés plutôt que comptés : un code muet est une erreur de catalogue, et
    // l'opérateur doit pouvoir la corriger sans lire les journaux.
    codes_inconnus: inconnus,
  });
}
