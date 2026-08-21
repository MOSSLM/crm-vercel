import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { lireCouverture, type LigneCouverture } from "@/lib/lots/couverture";

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

export const POST = withAuth({ role: "admin" }, async ({ req, user, cors }) => {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return jsonError("Corps illisible.", 400, {}, cors);
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
