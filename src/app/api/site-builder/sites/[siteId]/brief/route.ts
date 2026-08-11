import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { Reponses } from "@/lib/brief/formulaire";

/**
 * Le brief de reprise d'un site vendu.
 *
 * GET  — le brief, le contexte du site, et un PRÉ-REMPLISSAGE issu du CRM.
 * PUT  — enregistrement (appelé en continu pendant l'appel, d'où l'upsert).
 *
 * LE PRÉ-REMPLISSAGE EST RENVOYÉ À PART DES RÉPONSES, jamais fusionné côté
 * serveur. La distinction n'est pas cosmétique : une donnée devinée depuis
 * Google (un téléphone scrapé, une adresse approximative) et une donnée
 * confirmée au téléphone n'ont pas la même valeur, et c'est exactement ce
 * qu'on veut pouvoir distinguer quand le site part en production. Le
 * formulaire affiche donc la suggestion en gris derrière le champ vide ;
 * elle ne devient une réponse que si l'agent la valide.
 */

export const dynamic = "force-dynamic";

type Params = { siteId: string };

interface CorpsBrief {
  reponses?: Reponses;
  notes?: string | null;
  etape?: number;
  statut?: "en_cours" | "complet";
}

/** La table peut manquer tant que la migration n'est pas passée. */
const TABLE_ABSENTE = "42P01";

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const sb = getServiceClient();

  const { data: site, error: errSite } = await sb
    .from("sites")
    .select("id, name, enterprise_id, published_subdomain, paywall_enabled, client_brief, build_stage")
    .eq("id", params.siteId)
    .maybeSingle();
  if (errSite) return jsonError(errSite.message, 500);
  if (!site) return jsonError("site_introuvable", 404);

  const entrepriseId = site.enterprise_id as number | null;

  const [entrepriseRes, briefRes, oppRes] = await Promise.all([
    entrepriseId
      ? sb
          .from("entreprises")
          .select(
            "id, name, telephone, email, adresse, ville, horaires, siret, site_web_canonique, note_moyenne, nombre_avis",
          )
          .eq("id", entrepriseId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from("site_briefs").select("*").eq("site_id", params.siteId).maybeSingle(),
    entrepriseId
      ? sb
          .from("opportunites")
          .select("id, name")
          .eq("entreprise_id", entrepriseId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (briefRes.error && briefRes.error.code === TABLE_ABSENTE) {
    return json({
      disponible: false,
      motif: "sql/20260811_briefs_site.sql n'est pas appliquée.",
    });
  }
  if (briefRes.error) return jsonError(briefRes.error.message, 500);

  const ent = entrepriseRes.data as Record<string, unknown> | null;
  const avis =
    ent?.note_moyenne && ent?.nombre_avis
      ? `${String(ent.note_moyenne).replace(".", ",")} / 5 — ${ent.nombre_avis} avis`
      : null;

  return json({
    disponible: true,
    site: {
      id: site.id,
      name: site.name,
      entreprise_id: entrepriseId,
      published_subdomain: site.published_subdomain,
      paywall_enabled: site.paywall_enabled,
      build_stage: site.build_stage,
    },
    entreprise: ent,
    opportunite_id: (oppRes.data as { id?: string } | null)?.id ?? null,
    brief: briefRes.data ?? null,
    /**
     * Suggestions, pas réponses. Les clés correspondent à celles du
     * formulaire ; les absentes n'ont simplement rien à proposer.
     */
    prefill: nettoyer({
      nom_affiche: (ent?.name as string) ?? (site.name as string) ?? null,
      raison_sociale: (ent?.name as string) ?? null,
      siret: (ent?.siret as string) ?? null,
      telephone_affiche: (ent?.telephone as string) ?? null,
      email_pro: (ent?.email as string) ?? null,
      adresse: [ent?.adresse, ent?.ville].filter(Boolean).join(", ") || null,
      horaires: (ent?.horaires as string) ?? null,
      avis_google: avis,
      domaine_existant: (ent?.site_web_canonique as string) ?? null,
      // Le brief que le client avait pu saisir lui-même avant qu'on retire le
      // formulaire de son espace : point de départ plutôt que donnée perdue.
      a_changer_du_demo: (site.client_brief as string) ?? null,
    }),
  });
});

export const PUT = withAuth<undefined, Params>({}, async ({ req, params, user }) => {
  const sb = getServiceClient();

  let corps: CorpsBrief;
  try {
    corps = (await req.json()) as CorpsBrief;
  } catch {
    return jsonError("invalid_body", 400);
  }

  const { data: site, error: errSite } = await sb
    .from("sites")
    .select("id, enterprise_id")
    .eq("id", params.siteId)
    .maybeSingle();
  if (errSite) return jsonError(errSite.message, 500);
  if (!site) return jsonError("site_introuvable", 404);

  if (corps.statut && !["en_cours", "complet"].includes(corps.statut)) {
    return jsonError("statut_invalide", 400);
  }

  const ligne: Record<string, unknown> = {
    site_id: params.siteId,
    entreprise_id: site.enterprise_id ?? null,
    maj_par: user.id,
  };
  if (corps.reponses !== undefined) ligne.reponses = corps.reponses;
  if (corps.notes !== undefined) ligne.notes = corps.notes;
  if (corps.etape !== undefined) ligne.etape = corps.etape;
  if (corps.statut !== undefined) {
    ligne.statut = corps.statut;
    // Le moment où le brief a été déclaré complet est ce que la production
    // regarde pour savoir si elle peut démarrer. On le repasse à null si le
    // brief est rouvert, sinon il resterait à mentir sur une date passée.
    ligne.termine_le = corps.statut === "complet" ? new Date().toISOString() : null;
  }

  const { data, error } = await sb
    .from("site_briefs")
    .upsert(ligne, { onConflict: "site_id" })
    .select("*")
    .single();

  if (error) {
    if (error.code === TABLE_ABSENTE) {
      return jsonError("migration_absente", 503, {
        message: "sql/20260811_briefs_site.sql n'est pas appliquée.",
      });
    }
    return jsonError(error.message, 500);
  }

  return json({ brief: data });
});

/** Retire les suggestions vides — un champ absent est plus lisible qu'un null. */
function nettoyer(o: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(o).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  );
}
