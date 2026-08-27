import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { lireCouverture, type LigneCouverture } from "@/lib/lots/couverture";
import { FLAGS_CONNUS, SOURCES_CONNUES } from "../explorer/criteres";

/**
 * Le plafond d'un lot. Même valeur que la porte « identifiants » ci-dessous :
 * au-delà, ce n'est plus un lot de travail, c'est un backfill — et un backfill
 * se pilote autrement qu'en cochant une case sur un téléphone.
 */
const PLAFOND_LOT = 20_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Les lots et leur couverture — le tableau de bord des populations.
 *
 * UN LOT EST UNE PHOTO, et c'est pour ça qu'on mesure ici plutôt que sur les
 * segments. Un segment est une requête vivante : son effectif bouge à mesure
 * que l'enrichissement travaille. Un lot a sa composition écrite ligne par
 * ligne dans `lots_entreprises` — le dénominateur ne bouge pas sous la mesure,
 * et un traitement lancé dessus se rejoue à l'identique.
 *
 * TOUT LE CALCUL EST DANS `couverture_des_lots()`, une seule fonction pour tous
 * les lots. Sept axes fois N lots feraient sept requêtes par ligne depuis ici,
 * pour un écran dont le sujet EST la comparaison entre lignes.
 *
 * Réservé aux admins, comme les segments qu'il prolonge : un lot porte
 * n'importe quelle entreprise du corpus, sans filtre de propriétaire.
 */

const MIGRATION = "sql/20260821_couverture_des_lots.sql n'est pas appliquée";

const fonctionAbsente = (e: { code?: string; message?: string } | null): boolean =>
  !!e &&
  (e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|does not exist/i.test(e.message ?? ""));

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();
  const { data, error } = await sc.rpc("couverture_des_lots");

  if (error) {
    if (fonctionAbsente(error)) return jsonError(MIGRATION, 503, { code: "migration" }, cors);
    return jsonError(error.message, 500, {}, cors);
  }

  const lots = ((data ?? []) as LigneCouverture[]).map(lireCouverture);
  return json({ lots }, { headers: cors });
});

/**
 * Figer un lot : la seule façon d'en créer un.
 *
 * ON FIGE DEPUIS UNE LISTE D'IDENTIFIANTS, jamais depuis des critères. C'est
 * l'appelant — l'explorateur, le marketing pipeline — qui a déjà résolu sa
 * requête et sait exactement ce qu'il a sous les yeux. Refaire la requête ici
 * rendrait un lot différent de ce que l'humain a vu défiler, sans que rien ne
 * le signale.
 *
 * Le doublon ne fait pas échouer : `lots_entreprises` a sa clé primaire sur le
 * couple, et un `upsert` qui ignore les conflits permet de rejouer un
 * enregistrement interrompu sans nettoyer d'abord.
 */
const corpsSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  entrepriseIds: z.array(z.number().int().positive()).min(1).max(20_000),
});

/**
 * L'AUTRE PORTE : figer depuis des critères, sans transporter les identifiants.
 *
 * La règle ci-dessus visait le SILENCE d'une divergence, pas la résolution côté
 * serveur — et sa prémisse (« ce que l'humain a vu défiler ») ne tient plus à
 * 34 633 lignes : personne ne fait défiler ça. Ce que l'humain voit, c'est un
 * NOMBRE. C'est donc ce nombre qu'on protège : `totalAttendu` est comparé en
 * base, et une divergence REFUSE la création au lieu de fabriquer un lot que
 * personne n'a validé.
 *
 * Sans cette porte, figer 20 000 fiches depuis un téléphone demandait de
 * parcourir cent pages puis de poster 150 ko de JSON. Avec, c'est un appel —
 * mesuré à ~350 ms sur les « sans site ».
 */
const corpsCriteresSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  criteres: z.object({
    q: z.string().trim().max(200).nullable().optional(),
    flags: z.array(z.string()).max(20).optional(),
    sources: z.array(z.string()).max(10).optional(),
    owner: z.string().uuid().nullable().optional(),
    /**
     * Le vocabulaire du pipeline marketing. Il est ACCEPTÉ à la lecture pour
     * qu'un segment venu de là puisse être présenté tel quel — et refusé plus
     * bas, parce que `chercher_entreprises` ne sait pas le trancher.
     */
    services: z.array(z.string()).max(50).optional(),
    filtres: z.array(z.string()).max(20).optional(),
  }),
  /** Le compte affiché au moment du clic. La garde, et la raison d'être de cette porte. */
  totalAttendu: z.number().int().nonnegative(),
});

export const POST = withAuth({ role: "admin" }, async ({ req, user, cors }) => {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return jsonError("Corps illisible.", 400, {}, cors);
  }
  // La porte « critères » se reconnaît à son champ, pas à un drapeau de mode :
  // un corps ne peut pas porter les deux sans être ambigu.
  if (brut && typeof brut === "object" && "criteres" in (brut as Record<string, unknown>)) {
    return figerDepuisCriteres(brut, user.id, cors);
  }

  const lu = corpsSchema.safeParse(brut);
  if (!lu.success) return jsonError(lu.error.issues[0]?.message ?? "Corps invalide.", 400, {}, cors);

  const sc = getServiceClient();
  const { data: lot, error: erreurLot } = await sc
    .from("lots")
    .insert({ nom: lu.data.nom, note: lu.data.note ?? null, cree_par: user.id })
    .select("id")
    .single();

  if (erreurLot || !lot) return jsonError(erreurLot?.message ?? "Lot non créé.", 500, {}, cors);

  const lotId = (lot as { id: number }).id;
  // Dédoublonné ici : deux fois la même entreprise dans la sélection ferait
  // deux lignes, donc un total de lot supérieur au nombre d'entreprises — et
  // des taux de couverture qui ne pourraient jamais atteindre 100 %.
  const ids = [...new Set(lu.data.entrepriseIds)];
  const { error: erreurMembres } = await sc
    .from("lots_entreprises")
    .upsert(
      ids.map((entreprise_id) => ({ lot_id: lotId, entreprise_id })),
      { onConflict: "lot_id,entreprise_id", ignoreDuplicates: true },
    );

  if (erreurMembres) return jsonError(erreurMembres.message, 500, {}, cors);
  return json({ lotId, entreprises: ids.length }, { headers: cors });
});

/**
 * Figer depuis des critères. Toute la résolution est en base
 * (`figer_lot_depuis_criteres`, cf. sql/20260826_figer_lot_depuis_criteres.sql) :
 * une seule instruction, aucun identifiant sur le réseau.
 *
 * LES REFUS SONT DES RÉPONSES, PAS DES PANNES — la fonction rend un statut
 * plutôt que de lever, pour que cette route n'ait pas à reconnaître un message
 * d'erreur au texte.
 */
async function figerDepuisCriteres(
  brut: unknown,
  userId: string,
  cors: Record<string, string>,
): Promise<Response> {
  const lu = corpsCriteresSchema.safeParse(brut);
  if (!lu.success) return jsonError(lu.error.issues[0]?.message ?? "Corps invalide.", 400, {}, cors);

  const { nom, note, criteres, totalAttendu } = lu.data;

  // Nettoyés contre la MÊME liste que l'explorateur et les segments : un
  // drapeau inconnu passerait ici en filtre muet, et le lot serait plus large
  // que son nom ne le promet.
  const flags = (criteres.flags ?? []).filter((f) => FLAGS_CONNUS.has(f));
  const sources = (criteres.sources ?? []).filter((s) => SOURCES_CONNUES.has(s));
  const q = criteres.q?.trim() || null;

  // ⚠️ LE VOCABULAIRE DU PIPELINE MARKETING NE SE MATÉRIALISE PAS.
  // Un segment écrit depuis le pipeline porte `services` (les métiers) et
  // `filtres` (ses cases) — que `chercher_entreprises` ne sait pas trancher.
  // Les ignorer en silence fabriquerait un lot BEAUCOUP plus large que le
  // segment dont il porte le nom : c'est exactement le mensonge que ce dépôt
  // nomme déjà pour les drapeaux inconnus. On refuse, en le disant.
  const nonTranchables = [
    ...(criteres.services?.length ? ["services"] : []),
    ...(criteres.filtres?.length ? ["filtres"] : []),
  ];
  if (nonTranchables.length > 0) {
    return jsonError(
      "criteres_non_tranchables",
      422,
      {
        champs: nonTranchables,
        message:
          "Ce segment vient du pipeline marketing : ses métiers et ses cases ne sont pas des critères de l'explorateur. Figer le lot ici rendrait une population plus large que le segment.",
      },
      cors,
    );
  }

  if (!q && flags.length === 0 && sources.length === 0 && !criteres.owner) {
    return jsonError("criteres_vides", 400, { message: "Un lot sans critère prendrait tout le parc." }, cors);
  }

  const sc = getServiceClient();
  const { data, error } = await sc.rpc("figer_lot_depuis_criteres", {
    p_nom: nom.trim(),
    p_note: note ?? null,
    p_cree_par: userId,
    p_recherche: q,
    p_flags: flags,
    p_sources: sources,
    p_owner: criteres.owner ?? null,
    p_criteres: { q, flags, sources, owner: criteres.owner ?? null },
    p_total_attendu: totalAttendu,
    p_plafond: PLAFOND_LOT,
  });

  if (error) {
    if (fonctionAbsente(error)) {
      return jsonError("sql/20260826_figer_lot_depuis_criteres.sql n'est pas appliquée", 503, { code: "migration" }, cors);
    }
    return jsonError(error.message, 500, {}, cors);
  }

  // La fonction rend une table : une seule ligne, mais une table.
  const ligne = (Array.isArray(data) ? data[0] : data) as
    | { statut: string; lot: number | null; membres: number; total_trouve: number }
    | undefined;
  if (!ligne) return jsonError("reponse_vide", 500, {}, cors);

  switch (ligne.statut) {
    case "cree":
      return json({ lotId: ligne.lot, entreprises: ligne.membres }, { headers: cors });

    case "population_a_change":
      // 409 et non 400 : rien n'est invalide, c'est le monde qui a bougé entre
      // l'affichage et le clic. L'écran doit rafraîchir puis reproposer.
      return jsonError(
        "population_a_change",
        409,
        { totalAttendu, totalTrouve: ligne.total_trouve },
        cors,
      );

    case "trop_grand":
      return jsonError(
        "trop_grand",
        413,
        { totalTrouve: ligne.total_trouve, plafond: PLAFOND_LOT },
        cors,
      );

    case "vide":
      return jsonError("aucune_entreprise", 400, {}, cors);

    default:
      return jsonError("statut_inconnu", 500, { statut: ligne.statut }, cors);
  }
}
