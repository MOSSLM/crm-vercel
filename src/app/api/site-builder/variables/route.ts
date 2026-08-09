import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { chargerRgePourSite } from "@/lib/donnees-publiques/rge-pour-site";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  applyDerivedVariables,
  applyEnrichmentVariables,
  fetchEnrichmentSlice,
} from "@/lib/site-builder/enrichment-variables";
import { applyProjectEnrichment } from "@/lib/site-builder/project-enrichment";
import { resolveCities } from "@/lib/site-builder/city-variables";
import { finalizeEnterpriseVariables } from "@/lib/site-builder/build-enterprise-variables";
import { resolveLeadMagnetProjectId } from "@/lib/site-builder/resolve-project-id";
import {
  VARIABLES_SOURCE_KEY,
  type StatsSource,
  type VariablesSource,
} from "@/lib/site-builder/variables-source";
import type { StatItem } from "@/lib/site-builder/menu-overrides";

export const dynamic = "force-dynamic";

type EnterpriseVariablesRow = {
  nom: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  pays: string | null;
  service_tags: string[] | string | null;
  stats: Array<{ label: string; value: string; display_order?: number }> | null;
  note_moyenne: number | string | null;
  nombre_avis: number | string | null;
  logo_url: string | null;
  site_web_canonique: string | null;
  canonical_url: string | null;
  horaires: string | null;
};

type ProjectRow = {
  override_entreprise_name: string | null;
  override_city: string | null;
  override_location: string | null;
  override_phone: string | null;
  override_email: string | null;
  override_address: string | null;
  variables: Record<string, unknown> | null;
  logo_url: string | null;
  service_tags_snapshot: string[] | string | null;
  stat_years_experience: string | null;
  stat_satisfied_clients: string | null;
  stat_installations_completed: string | null;
  stat_rge_count: string | null;
};

type ReviewRow = {
  author_name: string | null;
  review_text: string | null;
  rating: number | null;
};

type SiteOverridesRow = {
  content_overrides: {
    stats?: Array<{ label: string; value: string; display_order?: number }>;
  } | null;
};

export const GET = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const enterpriseIdRaw = searchParams.get("enterprise");
  const projectId = searchParams.get("project");
  const siteId = searchParams.get("site");

  if (!enterpriseIdRaw) return json({});

  const enterpriseId = parseInt(enterpriseIdRaw, 10);
  if (isNaN(enterpriseId)) return jsonError("enterprise must be a number", 400);

  const supabase = getServiceClient();

  // Projet lead magnet effectif : `?project`, sinon le lien enregistré du site,
  // sinon le mieux classé des projets de l'entreprise. Une entreprise a une
  // ligne par OPPORTUNITÉ : sans cette règle unique, l'aperçu lisait un projet
  // au hasard pendant que la fiche écrivait sur un autre — d'où des chiffres
  // clés vides alors qu'ils étaient bien saisis.
  const projectResolution = await resolveLeadMagnetProjectId(supabase, {
    explicitProjectId: projectId,
    siteId,
    enterpriseId,
  });
  const effectiveProjectId = projectResolution.projectId;

  const [entResult, projectResult, reviewsResult, siteResult] = await Promise.all([
    supabase
      .from("entreprises")
      .select(
        "nom:name, ville, telephone, email, adresse, code_postal, pays, " +
        "service_tags, stats, note_moyenne, nombre_avis, logo_url, " +
        "site_web_canonique, canonical_url, horaires"
      )
      .eq("id", enterpriseId)
      .single(),

    effectiveProjectId
      ? supabase
          .from("lead_magnet_projects")
          .select(
            "override_entreprise_name, override_city, override_location, " +
            "override_phone, override_email, override_address, variables, " +
            "logo_url, service_tags_snapshot, stat_years_experience, " +
            "stat_satisfied_clients, stat_installations_completed, stat_rge_count, " +
            "stat_years_experience_official, stat_satisfied_clients_official, " +
            "stat_installations_completed_official, stat_rge_count_official"
          )
          .eq("id", effectiveProjectId)
          .single()
      : Promise.resolve({ data: null, error: null }),

    effectiveProjectId
      ? supabase
          .from("lead_magnet_reviews")
          .select("author_name, review_text, rating")
          .eq("lead_magnet_project_id", effectiveProjectId)
          .eq("is_active", true)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: null, error: null }),

    siteId
      ? supabase
          .from("sites")
          .select("content_overrides")
          .eq("id", siteId)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (entResult.error || !entResult.data) {
    return jsonError(entResult.error?.message ?? "Not found", 404);
  }

  const ent = entResult.data as unknown as EnterpriseVariablesRow;
  const proj = projectResult.data as unknown as ProjectRow | null;
  const reviews = (reviewsResult.data ?? []) as ReviewRow[];
  const siteOverrides = (siteResult.data as unknown as SiteOverridesRow | null)?.content_overrides ?? null;

  const serviceTags: string[] = Array.isArray(ent.service_tags)
    ? (ent.service_tags as string[])
    : (typeof ent.service_tags === "string" ? [ent.service_tags] : []);
  const servicesList = serviceTags.join(", ");

  const nom = proj?.override_entreprise_name ?? ent.nom ?? "";
  // ville / ville SEO / location : règle unique partagée avec le résolveur de
  // publication. `entreprise.ville` reste la VRAIE ville — `override_city` porte
  // désormais la ville SEO et ne doit plus l'écraser.
  const cities = resolveCities({
    ville: ent.ville,
    overrideCity: proj?.override_city,
    overrideLocation: proj?.override_location,
  });
  const ville = cities.ville;
  const telephone = proj?.override_phone ?? ent.telephone ?? "";
  const email = proj?.override_email ?? ent.email ?? "";
  const adresse = proj?.override_address ?? ent.adresse ?? "";

  const variables: Record<string, string> = {
    "entreprise.nom":         nom,
    "entreprise.ville":       cities.ville,
    "entreprise.ville_seo":   cities.villeSeo,
    "entreprise.location":    cities.location,
    "entreprise.telephone":   telephone,
    "entreprise.email":       email,
    "entreprise.adresse":     adresse,
    "entreprise.code_postal": ent.code_postal ?? "",
    "entreprise.pays":        ent.pays ?? "France",
    "entreprise.services":    servicesList,
    "entreprise.note_moyenne":String(ent.note_moyenne ?? ""),
    "entreprise.nombre_avis": String(ent.nombre_avis ?? ""),
    "entreprise.logo_url":    ent.logo_url ?? "",
    "entreprise.site_web_canonique": ent.site_web_canonique ?? ent.canonical_url ?? "",
    // `entreprise.horaires` : la colonne `entreprises` d'abord, comme le
    // résolveur de publication (le repli automated_enrichment vient plus bas).
    "entreprise.horaires":    ent.horaires ?? "",
  };
  // `entreprise.site_web` et la famille `company.*` sont dérivés en fin de
  // parcours par `finalizeEnterpriseVariables`, partagé avec la publication.

  if (proj?.variables && typeof proj.variables === "object") {
    for (const [k, v] of Object.entries(proj.variables)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "object") {
        variables[`__${k}`] = JSON.stringify(v);
      } else if (!(k in variables)) {
        variables[k] = String(v);
      }
    }
  }

  // Enrichissement du projet (edge function) : logo, stats, zones desservies.
  // État RGE VÉRIFIÉ : décide si `stat_rge_count` est un compte ADEME ou la
  // saisie conservée, et fournit les logos que le tweak posera. Cf.
  // `rge-compteur.ts` — ignorance et absence vérifiée ne se confondent pas.
  const rge = await chargerRgePourSite(supabase, enterpriseId);
  if (rge.logos.length > 0) {
    variables["__certifications"] = JSON.stringify(rge.logos);
  }

  let projectServiceTags: string[] | null = null;
  let projectStats: StatItem[] | null = null;
  if (proj) {
    const projEnrichment = applyProjectEnrichment(variables, { ...proj, rge: rge.etat });
    projectServiceTags = projEnrichment.serviceTags;
    projectStats = projEnrichment.stats;
  }

  if (reviews.length > 0) {
    const reviewsArray = reviews.map((r) => ({
      name: r.author_name ?? "",
      role: "",
      text: r.review_text ?? "",
      rating: Number(r.rating ?? 5),
      avatar: "",
    }));
    variables["__reviews"] = JSON.stringify(reviewsArray);
  }

  // Service tags : priorité au snapshot du projet (enrichissement), sinon
  // entreprises.service_tags.
  const effectiveServiceTags = projectServiceTags ?? serviceTags;
  const effectiveServicesList = effectiveServiceTags.join(", ");
  variables["entreprise.services"] = effectiveServicesList;
  variables["__service_tags"] = JSON.stringify(effectiveServiceTags);

  // Stats : priorité aux stats du projet (enrichissement), puis overrides du
  // site, puis stats de l'entreprise.
  const siteStats = siteOverrides?.stats;
  const entStats = Array.isArray(ent.stats) ? ent.stats : [];
  const hasSiteStats = Array.isArray(siteStats) && siteStats.length > 0;
  const resolvedStats = projectStats ?? (hasSiteStats ? siteStats : entStats);
  variables["__stats"] = JSON.stringify(resolvedStats);
  const statsSource: StatsSource = projectStats
    ? "project"
    : hasSiteStats
      ? "site_overrides"
      : entStats.length > 0
        ? "entreprise"
        : "none";

  // Enrichment + derived variables (fill-only), same complements as the
  // publish-time resolver so the editor preview matches the deployed site.
  const enrichment = await fetchEnrichmentSlice(supabase, enterpriseId);
  applyEnrichmentVariables(variables, enrichment);
  applyDerivedVariables(variables);

  // Passe finale partagée avec la publication (build-enterprise-variables) : le
  // moindre écart entre les deux se paie en « visible dans le builder, vide en
  // ligne ».
  finalizeEnterpriseVariables(variables, resolvedStats);

  // Provenance, pour le panneau « Diagnostic » du builder. Préfixe `__` : la
  // convention des valeurs structurées, donc aucune collision avec un token.
  // Un chiffre vide doit pouvoir s'expliquer sans ouvrir la base — quel projet
  // a été lu, comment il a été choisi, et d'où viennent les stats.
  variables[VARIABLES_SOURCE_KEY] = JSON.stringify({
    projectId: projectResolution.projectId,
    projectSource: projectResolution.source,
    candidates: projectResolution.candidates,
    statsSource,
  } satisfies VariablesSource);

  return json(variables);
});
