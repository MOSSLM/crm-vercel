import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { FLAGS_CONNUS, SOURCES_CONNUES } from "../explorer/criteres";
import { GROUPES } from "@/components/marketing-pipeline/filtres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Les segments : une recherche d'entreprises enregistrée sous un nom.
 *
 * UN SEGMENT EST UNE REQUÊTE, PAS UNE LISTE. On stocke les critères et jamais
 * les résultats : une entreprise entre et sort du segment toute seule quand ses
 * données changent — et c'est le signe que l'enrichissement a marché. Ce qui ne
 * doit PAS bouger, c'est un lot de campagne, et il vit ailleurs
 * (`entreprises.cohorte_demarchage`), pour que la population qu'on mesure reste
 * stable pendant qu'on la mesure.
 *
 * Réservé aux admins, comme l'explorateur qu'il rejoue : `chercher_entreprises`
 * cherche sur tout le corpus, sans filtre de propriétaire.
 *
 * DEUX ÉCRANS ÉCRIVENT ICI, ET ILS NE PARLENT PAS LA MÊME LANGUE.
 * L'explorateur pose `q`, `flags`, `sources` — le vocabulaire de
 * `/api/entreprises/explorer`. Le marketing pipeline pose `q`, `services`
 * (les métiers, `entreprises.service_tags`) et `filtres` (ses cases à cocher).
 * Le seul champ commun est `q`.
 *
 * On stocke les DEUX vocabulaires dans le même jsonb plutôt que d'inventer une
 * seconde table : un segment reste une requête enregistrée, et `origine` dit
 * d'où elle vient. Ce qui compte, c'est qu'un écran qui rouvre un segment
 * écrit par l'autre le DISE, au lieu de rendre une population plus large en
 * silence — c'est le piège que ce fichier a déjà nommé pour les drapeaux
 * inconnus, et il vaut d'un écran à l'autre.
 */

/** Les cases du marketing pipeline, telles que son module pur les déclare. */
const CLES_FILTRES = GROUPES.flatMap((g) => g.options.map((o) => o.cle));

const criteresSchema = z.object({
  q: z.string().trim().min(1).max(200).nullable().optional(),
  // On valide contre la MÊME liste que l'explorateur : un segment qui porterait
  // un drapeau inconnu se rejouerait en silence avec un critère de moins, et
  // rendrait une population plus large que son nom ne le promet.
  flags: z.array(z.string()).max(20).optional(),
  sources: z.array(z.string()).max(10).optional(),
  /**
   * Les MÉTIERS — `entreprises.service_tags`, libellés bruts. Volontairement
   * non normalisés : « climatisation » et « Installateur climatisation » sont
   * deux étiquettes distinctes en base, et les fondre inventerait une
   * population que personne ne retrouverait en SQL.
   */
  services: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  /** Les cases du marketing pipeline, mêmes clés que son module pur. */
  filtres: z.array(z.string()).max(20).optional(),
  /**
   * LES MENUS DE LA BARRE D'OUTILS — ce qu'un segment ignorait, et qui faisait
   * qu'une vue enregistrée n'en était pas une.
   *
   * On sauvait `q`, `services` et `filtres` : trois dimensions sur treize.
   * « Aucun tag autorisé + étape Site démo » se rouvrait sans l'étape, donc sur
   * une population plus large, sous un nom qui promettait un tri. C'est la
   * faute que ce fichier reproche déjà aux segments de l'explorateur.
   *
   * Vocabulaires FERMÉS, validés ici comme les drapeaux : une valeur inconnue
   * enregistrée aujourd'hui deviendrait un filtre muet demain.
   *
   * `owner` échappe à la règle — c'est un identifiant d'agent, il n'y a pas de
   * liste fermée. L'écran vérifie à la relecture que l'agent existe encore, et
   * le dit plutôt que de rendre un tableau vide.
   */
  vue: z
    .object({
      attribution: z.enum(["all", "assigned", "unassigned"]).optional(),
      owner: z.string().uuid().nullable().optional(),
      hideAttributed: z.boolean().optional(),
      pipeline: z.string().max(64).optional(),
      data: z.enum(["all", "incomplete", "complete"]).optional(),
      canal: z.string().max(32).optional(),
      sequence: z.string().max(64).optional(),
      ticket: z.enum(["all", "open", "none"]).optional(),
      stage: z.string().max(8).optional(),
      sort: z.string().max(32).optional(),
    })
    .optional(),
});

const postSchema = z.object({
  nom: z.string().trim().min(1).max(80),
  criteres: criteresSchema,
});
type PostBody = z.infer<typeof postSchema>;

type LigneSegment = {
  id: string;
  nom: string;
  criteres: {
    q?: string | null;
    flags?: string[];
    sources?: string[];
    services?: string[];
    filtres?: string[];
    vue?: Record<string, unknown>;
  };
  cree_le: string;
  utilise_le: string | null;
};

/** Une table absente n'est pas une panne : c'est une migration non jouée. */
const migrationAbsente = (erreur: { code?: string; message?: string } | null): boolean =>
  erreur?.code === "42P01" || /segments_entreprises/i.test(erreur?.message ?? "");

const MESSAGE_MIGRATION = "sql/20260817_segments_entreprises.sql n'est pas appliquée";

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();
  const { data, error } = await sc
    .from("segments_entreprises")
    .select("id, nom, criteres, cree_le, utilise_le")
    .order("nom", { ascending: true })
    .limit(200);

  if (error) {
    if (migrationAbsente(error)) return jsonError(MESSAGE_MIGRATION, 503, {}, cors);
    return jsonError(error.message, 500, {}, cors);
  }

  return json({ segments: (data ?? []) as unknown as LigneSegment[] }, { headers: cors });
});

export const POST = withAuth<PostBody>(
  { role: "admin", body: postSchema },
  async ({ body, user, cors }) => {
    // Les critères sont NETTOYÉS avant d'être écrits, pas seulement validés :
    // un drapeau inconnu enregistré aujourd'hui deviendrait un filtre muet
    // demain, et le segment rendrait plus de lignes que son nom n'annonce.
    const flags = (body.criteres.flags ?? []).filter((f) => FLAGS_CONNUS.has(f));
    const sources = (body.criteres.sources ?? []).filter((s) => SOURCES_CONNUES.has(s));
    const q = body.criteres.q?.trim() || null;
    // Les services ne se valident contre AUCUNE liste : le vocabulaire vient de
    // la base et grandit tout seul. Ils se dédoublonnent seulement — deux fois
    // la même étiquette ne trie pas deux fois.
    const services = [...new Set((body.criteres.services ?? []).map((s) => s.trim()).filter(Boolean))];
    // Les cases, elles, sont un vocabulaire fermé : même règle que les drapeaux.
    const filtres = (body.criteres.filtres ?? []).filter((f) =>
      (CLES_FILTRES as string[]).includes(f),
    );

    // La vue est nettoyée comme le reste : on ne garde que les clés RENSEIGNÉES,
    // pour qu'une valeur absente se relise comme « le défaut du jour » plutôt
    // que comme celui d'il y a trois mois.
    const vue = Object.fromEntries(
      Object.entries(body.criteres.vue ?? {}).filter(([, v]) => v !== undefined && v !== null),
    );

    if (
      !q &&
      flags.length === 0 &&
      sources.length === 0 &&
      services.length === 0 &&
      filtres.length === 0 &&
      Object.keys(vue).length === 0
    ) {
      // Un segment sans aucun critère, c'est « toutes les entreprises » sous un
      // nom qui promet un tri. Le refuser vaut mieux que de le laisser tromper.
      return jsonError("Une vue sans critère ne trie rien", 400, {}, cors);
    }

    const sc = getServiceClient();
    const { data, error } = await sc
      .from("segments_entreprises")
      .insert({
        nom: body.nom.trim(),
        criteres: { q, flags, sources, services, filtres, vue },
        cree_par: user.id,
      })
      .select("id, nom, criteres, cree_le, utilise_le")
      .single();

    if (error) {
      if (migrationAbsente(error)) return jsonError(MESSAGE_MIGRATION, 503, {}, cors);
      // 23505 = l'index unique sur le nom normalisé. Ce n'est pas une panne,
      // c'est une réponse : ce segment existe déjà, sous une autre casse.
      if (error.code === "23505") {
        return jsonError("Un segment porte déjà ce nom", 409, {}, cors);
      }
      return jsonError(error.message, 500, {}, cors);
    }

    return json({ segment: data as unknown as LigneSegment }, { headers: cors });
  },
);

export const DELETE = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id manquant", 400, {}, cors);

  const sc = getServiceClient();
  const { error } = await sc.from("segments_entreprises").delete().eq("id", id);
  if (error) {
    if (migrationAbsente(error)) return jsonError(MESSAGE_MIGRATION, 503, {}, cors);
    return jsonError(error.message, 500, {}, cors);
  }

  // Supprimer un segment ne supprime AUCUNE entreprise : c'est une requête
  // qu'on jette, pas une population. D'où l'absence de confirmation côté route.
  return json({ ok: true }, { headers: cors });
});
