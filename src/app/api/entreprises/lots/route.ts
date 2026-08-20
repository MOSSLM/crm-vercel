import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/entreprises/lots
 *
 * Figer une sélection de l'explorateur dans un lot nommé. Un LOT est une photo
 * — voir sql/20260817_technologie_explorateur_et_lots.sql — distincte des
 * SEGMENTS (`segments_entreprises`, une requête vivante) et des deux cohortes
 * de campagne (`entreprises.cohorte_demarchage`). Un nom = un lot : reposer le
 * même nom rend 409, jamais un ajout silencieux à l'existant.
 *
 * Réservé aux admins, comme l'explorateur qu'il prolonge.
 */

const MAX_ENTREPRISES = 500;

const bodySchema = z
  .object({
    nom: z.string().trim().min(1).max(120),
    entreprise_ids: z.array(z.number().int().positive()).min(1).max(MAX_ENTREPRISES),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

type Body = z.infer<typeof bodySchema>;

const migrationAbsente = (erreur: { code?: string; message?: string } | null): boolean =>
  erreur?.code === "42P01" || /\blots\b/i.test(erreur?.message ?? "");

const MESSAGE_MIGRATION = "sql/20260817_technologie_explorateur_et_lots.sql n'est pas appliquée";

/**
 * GET /api/entreprises/lots
 *
 * La liste des lots, avec leur taille. Ajoutée pour le sélecteur d'audience
 * d'une campagne : on ne choisit pas un lot dont on ignore combien il contient.
 *
 * La taille est comptée en une passe sur `lots_entreprises` plutôt qu'en une
 * requête par lot — une trentaine de lots, c'est déjà trente allers-retours
 * pour afficher un menu déroulant.
 */
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();

  const { data, error } = await sc
    .from("lots")
    .select("id, nom, note, cree_le")
    .order("cree_le", { ascending: false })
    .limit(200);
  if (error) {
    if (migrationAbsente(error)) return jsonError(MESSAGE_MIGRATION, 503, {}, cors);
    return jsonError(error.message, 500, {}, cors);
  }

  const lots = (data ?? []) as { id: string; nom: string; note: string | null; cree_le: string }[];
  const { data: membres } = lots.length
    ? await sc.from("lots_entreprises").select("lot_id").in("lot_id", lots.map((l) => l.id))
    : { data: [] as { lot_id: string }[] };

  const taille = new Map<string, number>();
  for (const m of (membres ?? []) as { lot_id: string }[]) {
    taille.set(m.lot_id, (taille.get(m.lot_id) ?? 0) + 1);
  }

  return json(
    { lots: lots.map((l) => ({ ...l, taille: taille.get(l.id) ?? 0 })) },
    { headers: cors },
  );
});

export const POST = withAuth<Body>(
  { role: "admin", body: bodySchema },
  async ({ body, user, cors }) => {
    const entrepriseIds = [...new Set(body.entreprise_ids)];
    const sc = getServiceClient();

    const { data: lot, error: erreurLot } = await sc
      .from("lots")
      .insert({ nom: body.nom.trim(), note: body.note?.trim() || null, cree_par: user.id })
      .select("id, nom, cree_le")
      .single();

    if (erreurLot) {
      if (migrationAbsente(erreurLot)) return jsonError(MESSAGE_MIGRATION, 503, {}, cors);
      // 23505 = l'index unique sur le nom normalisé.
      if (erreurLot.code === "23505") return jsonError("Un lot porte déjà ce nom", 409, {}, cors);
      return jsonError(erreurLot.message, 500, {}, cors);
    }

    const lignes = entrepriseIds.map((entreprise_id) => ({ lot_id: lot.id, entreprise_id }));
    const { error: erreurMembres, count } = await sc
      .from("lots_entreprises")
      .insert(lignes, { count: "exact" });

    if (erreurMembres) {
      // Le lot est déjà créé : on ne le supprime pas — un lot vide, visible
      // avec son motif d'échec dans les logs, vaut mieux qu'une transaction
      // à moitié annulée qu'on ne peut pas rejouer à l'identique.
      return jsonError(
        `lot #${lot.id} créé, mais l'ajout des entreprises a échoué : ${erreurMembres.message}`,
        500,
        { lot_id: lot.id },
        cors,
      );
    }

    return json(
      { id: lot.id, nom: lot.nom, cree_le: lot.cree_le, taille: count ?? entrepriseIds.length },
      { status: 201, headers: cors },
    );
  },
);
