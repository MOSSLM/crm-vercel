/**
 * GET /api/atelier — tout ce dont l'écran mobile a besoin, en UN aller-retour.
 *
 * ── POURQUOI UNE ROUTE D'AGRÉGATION, ALORS QUE LES TROIS SOURCES EXISTENT ─
 * Sur un bureau, trois appels parallèles ne se voient pas. En 4G dans une
 * voiture, chacun coûte sa latence — et un écran qui s'assemble en trois temps
 * donne trois états intermédiaires où l'on ne peut rien faire. L'atelier est
 * fait pour être ouvert vingt secondes entre deux rendez-vous : il doit être
 * complet ou vide, pas en train de se remplir.
 *
 * Aucune logique métier ici : la couverture vient de `couverture_des_lots()`,
 * les compteurs du lissage d'un décompte par `lieu`. Cette route ne fait que
 * les mettre dans la même enveloppe.
 *
 * ── LE COMPTEUR PAR `lieu` EST LE CŒUR DU SUJET ──────────────────────────
 * `lissage_leads.lieu` vaut `serveur`, `local` ou `humain`. C'est la seule
 * donnée qui réponde à « qu'est-ce que je peux faire depuis mon téléphone, et
 * qu'est-ce qui attendra le bureau ». Onze des trente-trois bots du registre
 * sont des scripts locaux — Playwright, un profil Chrome persistant, des
 * CAPTCHA à contourner à l'œil — et ce n'est pas une limite à repousser : c'est
 * la raison pour laquelle ils marchent. L'atelier ne prétend donc pas les
 * remplacer, il les COMPTE, pour que l'absence soit productive et la séance au
 * bureau préparée.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { lireCouverture, type LigneCouverture } from "@/lib/lots/couverture";
import { lirePretDemo, type LignePretDemo } from "@/lib/lots/pret-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/** Les lignes de lissage encore à faire, rangées par où elles peuvent l'être. */
export type AttenteLissage = {
  serveur: number;
  local: number;
  humain: number;
  /** Les passes qui ne sont ni terminées ni en pause. */
  passesOuvertes: number;
};

const fonctionAbsente = (e: { code?: string; message?: string } | null): boolean =>
  !!e &&
  (e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|does not exist/i.test(e.message ?? ""));

const tableAbsente = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === "42P01" || e.code === "PGRST205");

async function attenteDuLissage(
  sc: ReturnType<typeof getServiceClient>,
): Promise<AttenteLissage | null> {
  // `a_faire` seulement : `en_cours` est déjà réclamé par un exécuteur, et le
  // compter ferait croire à du travail disponible qui ne l'est pas.
  const { data, error } = await sc
    .from("lissage_leads")
    .select("lieu")
    .eq("statut", "a_faire");

  // La migration du lissage peut ne pas être appliquée : l'atelier doit
  // s'ouvrir quand même, sans ce bloc, plutôt que de rendre une erreur pour
  // tout le monde.
  if (error) return tableAbsente(error) ? null : null;

  const compte: AttenteLissage = { serveur: 0, local: 0, humain: 0, passesOuvertes: 0 };
  for (const r of (data ?? []) as { lieu: string | null }[]) {
    // `lieu` nul = la ligne n'a pas encore d'outil choisi ; c'est le serveur qui
    // le choisira, donc elle lui revient.
    const lieu = r.lieu ?? "serveur";
    if (lieu === "local") compte.local += 1;
    else if (lieu === "humain") compte.humain += 1;
    else compte.serveur += 1;
  }

  const { count } = await sc
    .from("lissage_passes")
    .select("id", { count: "exact", head: true })
    .in("statut", ["brouillon", "en_cours"]);
  compte.passesOuvertes = count ?? 0;

  return compte;
}

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();

  const [couverture, pret, lissage] = await Promise.all([
    sc.rpc("couverture_des_lots"),
    sc.rpc("pretes_pour_demo_des_lots"),
    attenteDuLissage(sc),
  ]);

  if (couverture.error) {
    if (fonctionAbsente(couverture.error)) {
      return jsonError("sql/20260821_couverture_des_lots.sql n'est pas appliquée", 503, { code: "migration" }, cors);
    }
    return jsonError(couverture.error.message, 500, {}, cors);
  }

  const lots = ((couverture.data ?? []) as LigneCouverture[]).map(lireCouverture);

  // La préparation est SÉPARÉE de la couverture, et jointe par lot côté client.
  // Deux fonctions parce qu'elles répondent à deux questions : la couverture dit
  // ce qui manque au lot (SIRET, constat, démo…), la préparation dit combien
  // sont fabricables MAINTENANT. Une fiche peut avoir toutes ses pièces et
  // rester impossible à mettre en site faute de code postal.
  //
  // Si sa migration n'est pas appliquée, on rend une liste vide plutôt qu'une
  // erreur : l'atelier doit s'ouvrir sans ce bloc.
  const pretDemo = pret.error ? [] : ((pret.data ?? []) as LignePretDemo[]).map(lirePretDemo);

  return json({ lots, pretDemo, lissage }, { headers: cors });
});
