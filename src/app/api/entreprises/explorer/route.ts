import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { FLAGS_CONNUS, SOURCES_CONNUES } from "./criteres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/entreprises/explorer
 *
 * ENVELOPPE FINE AUTOUR DE `chercher_entreprises`, RIEN DE PLUS.
 *
 * Cette fonction SQL existe en production depuis un moment, cherche par nom,
 * ville, code postal, SIRET, SIREN, e-mail, domaine et téléphone normalisé, et
 * rend le total exact — mais n'avait aucun appelant dans le dépôt. Elle a été
 * écrite pour l'outillage de fusion des doublons (ses drapeaux `fusionnee`,
 * `masquee`, `archivee` en témoignent) : elle cherche donc sur les 60 000
 * fiches, SANS filtre de propriétaire. C'est pour ça que cette route est
 * réservée aux admins et vit dans la navigation `crmEnterpriseTabs`, pas dans
 * l'espace agent.
 *
 * On ne fait ici que valider les entrées et traduire la forme de réponse — la
 * fonction SQL reste la seule source de vérité sur ce qu'un drapeau signifie.
 */

const LIMITE_DEFAUT = 50;
const LIMITE_MAX = 200;

/** Une ligne telle que `chercher_entreprises` la rend, en lecture seule ici. */
type LigneRecherche = {
  id: number;
  name: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  email: string | null;
  site: string | null;
  siret: string | null;
  siren: string | null;
  sources: string[] | null;
  google_place_id: string | null;
  qualifie: boolean;
  masquee: boolean;
  archivee: boolean;
  archive_reason: string | null;
  fusionnee_vers: number | null;
  motifs_qualite: string[] | null;
  created_at: string;
  total: number | string;
};

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const sp = new URL(req.url).searchParams;

  const q = sp.get("q")?.trim() || null;

  const flags = (sp.get("flags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((f) => FLAGS_CONNUS.has(f));

  const sources = (sp.get("sources") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SOURCES_CONNUES.has(s));

  const limite = Math.min(Math.max(Number(sp.get("limite")) || LIMITE_DEFAUT, 1), LIMITE_MAX);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);

  const sc = getServiceClient();
  const { data, error } = await sc.rpc("chercher_entreprises", {
    p_recherche: q,
    p_flags: flags,
    p_sources: sources,
    p_limite: limite,
    p_offset: offset,
  });

  if (error) {
    // `PGRST202` / `42883` : la fonction n'existe pas sur cet environnement
    // (recette non migrée). Un message qui dit quoi faire plutôt qu'une 500 nue.
    if (error.code === "PGRST202" || error.code === "42883") {
      return jsonError("La fonction chercher_entreprises n'est pas déployée sur cet environnement", 503, {}, cors);
    }
    return jsonError(error.message, 500, {}, cors);
  }

  const lignes = (data ?? []) as unknown as LigneRecherche[];
  // Le total voyage sur CHAQUE ligne (c'est ce que rend la fonction SQL) : on ne
  // le lit qu'une fois, et 0 quand la page est vide plutôt que d'inventer un
  // second aller-retour de comptage.
  const total = lignes.length > 0 ? Number(lignes[0].total) : 0;
  const items = lignes.map(({ total: _total, ...reste }) => reste);

  return json({ items, total, limite, offset }, { headers: cors });
});
