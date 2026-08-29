/**
 * GET /api/chaine?lot=<id> — où en est chaque fiche d'un lot, groupe par groupe.
 *
 * CE QUE ÇA RÉSOUT. Le pipeline marketing filtre très bien une fiche à la fois,
 * et devient illisible dès que la population grandit : on coche, on décoche, et
 * on ne sait plus dire « combien en sont où ». La couverture d'un lot compte des
 * PIÈCES par axe ; elle ne dit pas dans quel ÉTAT est une fiche, parce qu'une
 * fiche à qui il manque trois pièces n'a quand même qu'un seul prochain geste.
 *
 * LE CLASSEMENT N'EST PAS ICI, et c'est délibéré : `src/lib/chaine/groupes.ts`
 * le porte, la SQL rend des faits, cette route ne fait que les coudre. La chaîne
 * de nuit lit le MÊME module — sans quoi l'écran montrerait un état et le robot
 * en traiterait un autre.
 *
 * `missingForSite` EST RÉUTILISÉE, JAMAIS RECOPIÉE. La définition de « fiche
 * complète » est déjà dupliquée une fois en SQL (`pretes_pour_demo_des_lots`,
 * copie assumée et tenue par un test). Une troisième copie la ferait diverger :
 * on passe donc la ligne de la RPC à la fonction qui existe.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { missingForSite } from "@/app/api/marketing-pipeline/_board";
import {
  estMiseDeCote,
  normalizeServiceTags,
  porteUnMetierVendu,
  type ServiceTagSetting,
} from "@/utils/serviceTags";
import {
  GROUPES,
  attentes,
  classer,
  compter,
  type CleGroupe,
  type FaitsFiche,
} from "@/lib/chaine/groupes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Le plafond de lecture. Très au-dessus des lots d'aujourd'hui (524 et 128), et
 * c'est voulu : ce n'est pas une pagination, c'est un garde-fou. S'il est
 * atteint, la réponse le DIT plutôt que de rendre des comptes incomplets qui
 * auraient l'air entiers.
 */
const PLAFOND = 20_000;

/** Ce que combien de fiches d'un groupe on renvoie pour l'aperçu. */
const APERCU = 8;

/** Une ligne de `chaine_du_lot()`. */
type LigneChaine = {
  entreprise_id: number;
  nom: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  service_tags: string[] | string | null;
  nombre_avis: number | string | null;
  note_moyenne: number | string | null;
  logo_url: string | null;
  statut_site: string | null;
  origine_statut: string | null;
  projet_id: string | null;
  enrichie: boolean | null;
  override_city: string | null;
  stat_years_experience: string | null;
  stat_years_experience_official: string | null;
  stat_satisfied_clients: string | null;
  stat_satisfied_clients_official: string | null;
  stat_installations_completed: string | null;
  stat_installations_completed_official: string | null;
  site_existe: boolean | null;
  site_pret: boolean | null;
  a_vignette: boolean | null;
  a_plaquette: boolean | null;
  a_proprietaire: boolean | null;
  proprietaire: string | null;
  en_sequence: boolean | null;
  garee: boolean | null;
  demarchee: boolean | null;
};

/**
 * Les champs requis qui manquent, vus par la fonction du pipeline.
 *
 * Le logo n'y figure plus (`hydrate-logo` compose le nom à sa place) — c'est
 * pourquoi la chaîne le réclame SÉPARÉMENT, comme un choix de production et non
 * comme une exigence de rendu : « on ne prépare que ceux qui ont un logo ».
 */
function champsManquants(l: LigneChaine): string[] {
  return missingForSite(
    {
      id: l.entreprise_id,
      name: l.nom,
      canonical_url: null,
      site_web_canonique: null,
      logo_url: l.logo_url,
      ville: l.ville,
      code_postal: l.code_postal,
      telephone: l.telephone,
      telephones: null,
      email: null,
      service_tags: l.service_tags,
      note_moyenne: l.note_moyenne,
      nombre_avis: l.nombre_avis,
      owner_id: null,
      google_url: null,
      google_maps_url: null,
      premiere_touche_le: null,
    },
    l.projet_id
      ? {
          id: l.projet_id,
          opportunite_id: null,
          entreprise_id: l.entreprise_id,
          statut: null,
          pret_pour_lm: null,
          override_city: l.override_city,
          logo_url: l.logo_url,
          stat_years_experience: l.stat_years_experience,
          stat_satisfied_clients: l.stat_satisfied_clients,
          stat_installations_completed: l.stat_installations_completed,
          stat_rge_count: null,
          stat_years_experience_official: l.stat_years_experience_official,
          stat_satisfied_clients_official: l.stat_satisfied_clients_official,
          stat_installations_completed_official: l.stat_installations_completed_official,
        }
      : null,
  );
}

const faitsDe = (
  l: LigneChaine,
  manquants: string[],
  reglages: readonly ServiceTagSetting[],
): FaitsFiche => ({
  metier_de_cote: estMiseDeCote(normalizeServiceTags(l.service_tags), reglages),
  statut_site: l.statut_site,
  origine_statut: l.origine_statut,
  enrichie: l.enrichie === true,
  champs_manquants: manquants.length > 0,
  a_logo: (l.logo_url ?? "").trim().length > 0,
  site_existe: l.site_existe === true,
  site_pret: l.site_pret === true,
  a_vignette: l.a_vignette === true,
  a_plaquette: l.a_plaquette === true,
  a_proprietaire: l.a_proprietaire === true,
  en_sequence: l.en_sequence === true,
  garee: l.garee === true,
  demarchee: l.demarchee === true,
});

export interface FicheChaine {
  id: number;
  nom: string | null;
  ville: string | null;
  proprietaire: string | null;
  /** Ce qui lui manque, en clair — vide quand rien ne manque. */
  manquants: string[];
}

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const params = new URL(req.url).searchParams;
  const lotId = Number(params.get("lot"));
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return jsonError("lot requis", 400, {}, cors);
  }

  const sc = getServiceClient();

  // LES RÉGLAGES DE MÉTIER SONT LUS ICI, PAS FIGÉS DANS LE CODE. C'est ce qui
  // rend le déblocage instantané : rouvrir l'isolation dans les Paramètres fait
  // revenir ses fiches au prochain affichage, sans retoucher une seule ligne.
  const [lotRes, chaineRes, reglagesRes] = await Promise.all([
    sc.from("lots").select("id, nom, note, cree_le").eq("id", lotId).maybeSingle(),
    sc.rpc("chaine_du_lot", { p_lot_id: lotId, p_limite: PLAFOND, p_decalage: 0 }),
    sc.from("enrichment_tag_settings").select("tag, allowed, demarchable"),
  ]);

  if (lotRes.error) return jsonError(lotRes.error.message, 500, {}, cors);
  if (!lotRes.data) return jsonError("lot_introuvable", 404, {}, cors);
  if (chaineRes.error) {
    // La migration peut ne pas être appliquée : le dire plutôt que de rendre
    // une 500 muette dans laquelle on cherche un bug de code.
    const e = chaineRes.error as { code?: string; message?: string };
    if (e.code === "PGRST202" || /could not find the function/i.test(e.message ?? "")) {
      return jsonError(
        "sql/20260829_chaine_du_lot.sql n'est pas appliquée",
        503,
        { code: "migration" },
        cors,
      );
    }
    return jsonError(e.message ?? "erreur", 500, {}, cors);
  }

  const lignes = (chaineRes.data ?? []) as LigneChaine[];
  // Une lecture en échec ne met RIEN de côté : mieux vaut une file trop large
  // qu'une population qui disparaît sans que personne ne sache pourquoi.
  const reglages = (reglagesRes.data ?? []) as ServiceTagSetting[];

  const faits: FaitsFiche[] = [];
  /**
   * Parmi les mises de côté, celles qui font AUSSI un métier qu'on vend. Ne
   * rattrape personne — la présence de l'isolation suffit à écarter — mais dit
   * combien reviendront en premier le jour du déblocage.
   */
  let misesDeCoteMixtes = 0;
  const fichesPar = new Map<CleGroupe, FicheChaine[]>(GROUPES.map((g) => [g.cle, []]));
  for (const l of lignes) {
    const manquants = champsManquants(l);
    const f = faitsDe(l, manquants, reglages);
    faits.push(f);
    if (f.metier_de_cote && porteUnMetierVendu(normalizeServiceTags(l.service_tags), reglages)) {
      misesDeCoteMixtes += 1;
    }
    const liste = fichesPar.get(classer(f));
    // On ne garde qu'un aperçu : l'écran montre des comptes, pas un annuaire.
    // Le détail complet d'un groupe se demande au pipeline, qui sait le filtrer.
    if (liste && liste.length < APERCU) {
      liste.push({
        id: l.entreprise_id,
        nom: l.nom,
        ville: l.ville,
        proprietaire: l.proprietaire,
        manquants,
      });
    }
  }

  const comptes = compter(faits);

  return json(
    {
      lot: {
        id: lotRes.data.id as number,
        nom: lotRes.data.nom as string,
        note: (lotRes.data.note as string | null) ?? null,
        creeLe: lotRes.data.cree_le as string,
      },
      total: lignes.length,
      tronque: lignes.length >= PLAFOND,
      groupes: comptes.map((c) => ({ ...c, apercu: fichesPar.get(c.cle) ?? [] })),
      attentes: attentes(comptes),
      /**
       * Combien de « site présent » ne tiennent qu'à une URL que personne n'a
       * vérifiée. Ce n'est pas un groupe — elles avancent — mais l'écran doit
       * pouvoir le dire : un constat explicite l'emporte toujours sur une
       * colonne, et 67 fiches de la base portent une URL ET un constat « absent ».
       */
      presumeParColonne: lignes.filter((l) => l.origine_statut === "colonne").length,
      /** Combien des mises de côté font aussi un métier vendu — cf. ci-dessus. */
      misesDeCoteMixtes,
    },
    { headers: cors },
  );
});
