import { z } from "zod";

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { requireStaff } from "@/app/api/_lib/require-staff";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { parseQuery } from "@/app/api/_lib/schemas";
import { COMPANY_SEARCH_SELECT } from "@/lib/entreprises/colonnes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const rechercheQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** `true` pour ne proposer que des fiches déjà qualifiées. */
  qualifiees_seulement: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/**
 * GET /api/entreprises/recherche?q=…&limit=20
 *
 * Recherche serveur sur **tout** le corpus (~61 000 fiches), pour les
 * sélecteurs d'entreprise : Cmd+K, le formulaire de contact, le sélecteur de
 * RDV.
 *
 * Ces écrans parcouraient jusqu'ici le tableau complet en mémoire à chaque
 * frappe — et `AddContactForm` montait carrément une `<SelectItem>` par fiche,
 * soit 60 000 nœuds DOM d'un coup. Maintenant que le navigateur ne détient plus
 * que le périmètre actif, chercher en mémoire ne trouverait de toute façon plus
 * les prospects non qualifiés, alors que rattacher un contact à un prospect est
 * exactement ce qu'on attend d'eux.
 *
 * Le `%q%` est servi par les trois index trigram posés en même temps que cette
 * route (name / ville / adresse) : le planificateur les combine en BitmapOr.
 * Mesuré sur la base de production, 19 ms — contre un balayage séquentiel des
 * 61 000 lignes auparavant.
 */
export const GET = withAuth({}, async ({ req, user, cors }) => {
  const staff = await requireStaff(user, cors);
  if (!staff.ok) return staff.response;

  const parsed = parseQuery(new URL(req.url), rechercheQuerySchema, cors);
  if (!parsed.ok) return parsed.response;
  const { q, limit, qualifiees_seulement } = parsed.data;

  // `,` et `()` sont les séparateurs de la syntaxe `or` de PostgREST et `%`/`_`
  // les jokers de LIKE : les neutraliser évite qu'une frappe comme « a,b » soit
  // relue comme un filtre, ou qu'un « % » isolé dégénère en balayage complet.
  const echappe = q.replace(/[%_,()\\]/g, " ").trim();
  if (!echappe) return json({ entreprises: [] }, { headers: cors });

  const clauses = [
    `name.ilike.%${echappe}%`,
    `ville.ilike.%${echappe}%`,
    `adresse.ilike.%${echappe}%`,
  ];

  // Recherche par téléphone, à laquelle le cockpit RDV tient : quand quelqu'un
  // rappelle, le numéro affiché est souvent la seule chose qu'on sache de lui.
  // On compare les chiffres seuls, via la colonne générée
  // `telephone_chiffres`, pour que « 06 12 34 » retrouve « +33 6 12 34 56 78 ».
  // Seuil à 4 chiffres : en dessous, le motif ramène la moitié de la table.
  const chiffres = q.replace(/\D/g, "");
  if (chiffres.length >= 4) clauses.push(`telephone_chiffres.ilike.%${chiffres}%`);

  let requete = getServiceClient()
    .from("entreprises")
    .select(COMPANY_SEARCH_SELECT)
    .is("merged_into_id", null)
    .is("archived_at", null);

  if (qualifiees_seulement) requete = requete.eq("qualifie", true);

  const { data, error } = await requete
    .or(clauses.join(","))
    // Les fiches qualifiées d'abord : dans un sélecteur, c'est presque toujours
    // un client ou une cible active qu'on cherche, pas un prospect brut.
    .order("qualifie", { ascending: false })
    .order("nombre_avis", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return jsonError(error.message, 500, {}, cors);

  return json({ entreprises: data ?? [] }, { headers: cors });
});
