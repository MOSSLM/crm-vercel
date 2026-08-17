import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/entreprises/explorateur
 *
 * Enveloppe de `explorateur_entreprises` : la fonction SQL rend le total, les
 * répartitions et la page en une passe. La route ne fait que valider les
 * entrées — le SQL reste seul juge de ce qu'un palier signifie.
 *
 * POST et pas GET parce que le jeu de filtres est un objet à vingt-cinq clés
 * dont neuf tableaux : le passer en querystring donnerait des URL illisibles et
 * plafonnées, et ces filtres ne sont de toute façon pas partageables sans le
 * reste de l'état de l'écran.
 *
 * Réservé aux admins, comme `/api/entreprises/explorer` : la fonction balaie
 * les 60 000 fiches sans filtre de propriétaire.
 */

const ternaire = z.enum(["oui", "non"]).optional();
const perimetre = z.enum(["exclure", "inclure", "seulement"]).optional();
const listeTexte = z.array(z.string().min(1).max(120)).max(200).optional();

const schemaFiltres = z
  .object({
    q: z.string().max(200).optional(),
    qualifie: ternaire,
    opportunite: ternaire,
    fiche_google: ternaire,
    demarche: ternaire,
    rge: ternaire,
    email: ternaire,
    telephone: ternaire,
    siret: ternaire,
    logo: ternaire,
    masquees: perimetre,
    archivees: perimetre,
    avis_min: z.number().int().min(0).max(100000).optional(),
    avis_max: z.number().int().min(0).max(100000).optional(),
    note_min: z.number().min(0).max(5).optional(),
    ca_min: z.number().int().min(0).optional(),
    ca_max: z.number().int().min(0).optional(),
    site: listeTexte,
    demo: listeTexte,
    ca: listeTexte,
    effectif: listeTexte,
    avis: listeTexte,
    departements: listeTexte,
    villes: listeTexte,
    sources: listeTexte,
    cohortes: listeTexte,
    technologies: listeTexte,
    // Un lot se choisit, pas se coche : un seul id, pas un tableau.
    lot_id: z.number().int().positive().optional(),
  })
  .strict();

const schemaCorps = z.object({
  filtres: schemaFiltres.optional(),
  page: z.number().int().min(1).max(10000).optional(),
  taille: z.number().int().min(1).max(200).optional(),
  tri: z.enum(["nom", "ville", "avis", "note", "ca", "recent", "touche", "anciennete"]).optional(),
  sens: z.enum(["asc", "desc"]).optional(),
});

type Corps = z.infer<typeof schemaCorps>;

/**
 * Zod laisse passer les clés absentes comme `undefined` ; `JSON.stringify` les
 * supprimerait, mais on les retire explicitement pour que le SQL voie un objet
 * sans clé plutôt qu'une clé à `null` — les deux ne veulent pas dire pareil
 * côté `nullif(...)`.
 */
function nettoyer(filtres: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(filtres ?? {})) {
    if (valeur === undefined || valeur === null) continue;
    if (typeof valeur === "string" && valeur.trim() === "") continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    out[cle] = valeur;
  }
  return out;
}

export const POST = withAuth<Corps>(
  { role: "admin", body: schemaCorps },
  async ({ body, cors }) => {
    const sc = getServiceClient();

    const { data, error } = await sc.rpc("explorateur_entreprises", {
      p_filtres: nettoyer(body.filtres as Record<string, unknown> | undefined),
      p_page: body.page ?? 1,
      p_taille: body.taille ?? 25,
      p_tri: body.tri ?? "nom",
      p_sens: body.sens ?? "asc",
    });

    if (error) {
      // La fonction n'est pas déployée sur cet environnement : on le dit, plutôt
      // qu'une 500 nue qui enverrait chercher le bug dans l'écran.
      if (error.code === "PGRST202" || error.code === "42883") {
        return jsonError(
          "La fonction explorateur_entreprises n'est pas déployée sur cet environnement (voir sql/20260817_explorateur_entreprises.sql)",
          503,
          {},
          cors,
        );
      }
      return jsonError(error.message, 500, {}, cors);
    }

    return json(data, { headers: cors });
  },
);
