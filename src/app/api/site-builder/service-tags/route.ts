import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { loadServiceTagUniverse } from "@/app/api/_lib/service-tag-universe";
import { withAuth } from "@/app/api/_lib/with-auth";
import { buildServiceTagCatalog } from "@/utils/serviceTags";

export const dynamic = "force-dynamic";

/**
 * Catalogue des service tags autorisés — celui que proposent la fiche du
 * pipeline (modale « Informations ») et le site builder, pour qu'un template
 * puisse être préparé avec le contenu de chaque service même sans entreprise
 * liée. Le filtrage au rendu reste celui des tags de l'entreprise : attribuer
 * une société plus tard ne fait ressortir que les siens.
 *
 * Sources réunies par `loadServiceTagUniverse` : tags réellement posés sur les
 * entreprises et sur les dossiers lead magnet, allowlist
 * `enrichment_tag_settings`, et taxonomie métier de référence. Sans cette
 * dernière, un métier qu'aucun prospect ne portait encore était absent du menu
 * déroulant et devait être retapé — au risque du tag jumeau que ni les pages,
 * ni les sections, ni la médiathèque ne reconnaissent.
 *
 * Retirés : les tags explicitement bloqués dans les Paramètres, et les
 * `EXCLUDED_SERVICE_TAGS` (« Artisanat », « Chauffagiste »… — des étiquettes
 * d'annuaire, pas des services).
 */
export const GET = withAuth({}, async () => {
  try {
    const universe = await loadServiceTagUniverse(getServiceClient());
    return json({ tags: buildServiceTagCatalog(universe) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "catalogue indisponible", 500);
  }
});
