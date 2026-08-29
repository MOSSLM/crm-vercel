import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { loadServiceTagUniverse } from "@/app/api/_lib/service-tag-universe";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  SERVICE_TAGS_TAXONOMY,
  collectServiceTags,
  isServiceTagAllowed,
  isServiceTagDemarchable,
  isServiceTagKnownToTemplate,
  serviceTagKey,
  serviceTagNearMiss,
} from "@/utils/serviceTags";

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Tags proposables et leur autorisation. Même univers que
 * `/api/site-builder/service-tags` (d'où `loadServiceTagUniverse` partagé) :
 * tout tag que la fiche peut proposer doit pouvoir se bloquer ici, et
 * réciproquement.
 *
 * Contrairement au catalogue, les tags bloqués sont renvoyés eux aussi — sans
 * ça on ne pourrait jamais en réautoriser un.
 */
export const GET = withAuth({}, async ({ cors }) => {
  let universe;
  try {
    universe = await loadServiceTagUniverse(getServiceClient());
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "tags indisponibles", 500, {}, cors);
  }

  // Autorisation résolue par clé canonique : bloquer « climatisation » doit
  // aussi bloquer « Climatisation », que les deux graphies cohabitent ou non.
  //
  // `knownToTemplate` est un axe INDÉPENDANT de `allowed`. Un tag peut être
  // autorisé et pourtant ne correspondre à aucune page : c'est exactement le cas
  // qui nous a coûté deux campagnes. L'écran doit distinguer « je refuse ce
  // tag » de « ce tag ne marche pas ».
  const { usage } = universe;
  const tags = collectServiceTags(universe).map((tag) => {
    const key = serviceTagKey(tag);
    return {
      tag,
      allowed: isServiceTagAllowed(tag, universe.settings),
      /**
       * Troisième axe : vend-on à ce métier ? Indépendant d'`allowed`, qui ne
       * parle que de la POSE du tag. L'isolation vient de l'import ADEME —
       * l'interdire à la pose n'aurait écarté aucune fiche.
       */
      demarchable: isServiceTagDemarchable(tag, universe.settings),
      knownToTemplate: isServiceTagKnownToTemplate(tag),
      /** Tag de la taxonomie dont celui-ci n'est qu'une variante de graphie. */
      nearMiss: serviceTagNearMiss(tag),
      usage: {
        entreprises: usage.entreprises[key] ?? 0,
        leadMagnets: usage.leadMagnets[key] ?? 0,
        media: usage.media[key] ?? 0,
      },
    };
  });

  return json({ tags, taxonomy: SERVICE_TAGS_TAXONOMY }, { headers: cors });
});

export const PUT = withAuth({}, async ({ req, cors }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400, {}, cors);
  }

  const rawTags = (body as { tags?: unknown })?.tags;
  if (!Array.isArray(rawTags)) return jsonError("tags_must_be_array", 400, {}, cors);

  const now = new Date().toISOString();
  const rows: { tag: string; allowed: boolean; demarchable: boolean; updated_at: string }[] = [];
  for (const entry of rawTags) {
    const tag = typeof (entry as { tag?: unknown })?.tag === "string"
      ? ((entry as { tag: string }).tag).trim()
      : "";
    if (!tag) continue;
    // `demarchable` ABSENT vaut `true`, jamais `false` : un appelant qui ignore
    // ce champ — un script, une ancienne version de la page — ne doit pas
    // mettre de côté tout le catalogue en un enregistrement.
    const brut = (entry as { demarchable?: unknown }).demarchable;
    rows.push({
      tag,
      allowed: !!(entry as { allowed?: unknown }).allowed,
      demarchable: brut === undefined ? true : !!brut,
      updated_at: now,
    });
  }

  if (rows.length === 0) return jsonError("no_valid_tags", 400, {}, cors);

  const sb = getServiceClient();

  // Une seule ligne par tag canonique. La page renvoie le libellé de référence
  // (« Climatisation »), qui peut différer de celui déjà stocké
  // (« climatisation ») : sans ce ménage les deux lignes cohabiteraient, et
  // réautoriser le tag sur l'une le laisserait bloqué par l'autre.
  const submittedKeys = new Set(rows.map((r) => serviceTagKey(r.tag)));
  const submittedLabels = new Set(rows.map((r) => r.tag));
  const { data: existing } = await sb.from("enrichment_tag_settings").select("tag");
  const stale = ((existing ?? []) as Array<{ tag?: unknown }>)
    .map((r) => (typeof r.tag === "string" ? r.tag : ""))
    .filter((t) => t && !submittedLabels.has(t) && submittedKeys.has(serviceTagKey(t)));
  if (stale.length > 0) {
    await sb.from("enrichment_tag_settings").delete().in("tag", stale);
  }

  const { error } = await sb.from("enrichment_tag_settings").upsert(rows, { onConflict: "tag" });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true, count: rows.length }, { status: 200, headers: cors });
});
