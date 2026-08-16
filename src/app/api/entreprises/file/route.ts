import { z } from "zod";

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { requireStaff } from "@/app/api/_lib/require-staff";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { parseQuery } from "@/app/api/_lib/schemas";
import type { Company } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const fileQuerySchema = z.object({
  onglet: z.enum(["queue", "qualified", "hidden"]).default("queue"),
  q: z.string().trim().max(120).optional(),
  /** Sources séparées par des virgules (`google_search,google_maps`). */
  sources: z.string().trim().max(200).optional(),
  url_filter: z.enum(["all", "with-url", "without-url"]).default("all"),
  /** `false` pour laisser les doublons de domaine dans la file. */
  masquer_doublons: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  offset: z.coerce.number().int().min(0).default(0),
});

type LigneFile = { fiche: Company; total: number };

/**
 * GET /api/entreprises/file
 *
 * Une page de la file de qualification, filtrée et comptée en base.
 *
 * L'écran chargeait les 60 000 entreprises puis les filtrait en mémoire, sans
 * mémoïsation — donc à chaque frappe dans la recherche — en appelant pour
 * chaque fiche un `isDuplicate()` qui balayait lui-même les groupes de
 * doublons. Sur 60 000 objets, ce produit était le gel de l'onglet.
 *
 * Tout est redescendu dans `entreprises_file()` : onglet, recherche (nom,
 * ville, adresse et numéro de téléphone en chiffres seuls), sources, présence
 * d'un site, blacklist et masquage des doublons.
 *
 * `total` est exact pour ces filtres, blacklist et doublons compris, ce qui
 * permet de garder la pagination numérotée de l'écran. La route jumelle
 * /api/agent/qualification/queue, elle, filtre la blacklist en mémoire sur une
 * fenêtre et documente son total comme approximatif.
 */
export const GET = withAuth({}, async ({ req, user, cors }) => {
  const staff = await requireStaff(user, cors);
  if (!staff.ok) return staff.response;

  const parsed = parseQuery(new URL(req.url), fileQuerySchema, cors);
  if (!parsed.ok) return parsed.response;
  const { onglet, q, sources, url_filter, masquer_doublons, limit, offset } = parsed.data;

  const listeSources = (sources ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { data, error } = await getServiceClient().rpc("entreprises_file", {
    p_onglet: onglet,
    p_q: q ?? null,
    p_sources: listeSources.length > 0 ? listeSources : null,
    p_url_filter: url_filter,
    p_masquer_doublons: masquer_doublons,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return jsonError(error.message, 500, {}, cors);

  const lignes = (data ?? []) as LigneFile[];

  // `total` voyage sur chaque ligne (même valeur partout). Quand la page est
  // vide, la fonction renvoie tout de même une ligne sans fiche pour porter le
  // total — c'est ce qui distingue « on a dépassé la fin » (total > 0, la
  // pagination doit pouvoir revenir en arrière) de « aucun résultat » (total 0).
  return json(
    {
      entreprises: lignes.map((l) => l.fiche).filter(Boolean),
      total: lignes[0]?.total ?? 0,
    },
    { headers: cors },
  );
});
