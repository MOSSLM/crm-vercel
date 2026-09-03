import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { cloneTemplateSite } from "@/lib/site-builder/clone-template-site";
import { resolveLeadMagnetProjectId } from "@/lib/site-builder/resolve-project-id";
import {
  isServiceTagExplicitlyAllowed,
  isServiceTagKnownToTemplate,
  type ServiceTagSetting,
} from "@/utils/serviceTags";

export const dynamic = "force-dynamic";

// The dynamic segment is named [siteId] to match the sibling [siteId]/pages
// route (Next.js forbids two slug names at the same path level). The value
// carried here is the TEMPLATE site's id.
type Params = { siteId: string };

/**
 * POST /api/site-builder/claude/[siteId]/create-demo   (JSON: { companyId })
 *   ([siteId] = the template's id)
 *
 * Creates ONE demo site for a company by cloning a Claude Design template,
 * WITHOUT publishing — it lands in the kanban "À faire" column, pre-filled with
 * the company's variables, ready to be controlled then deployed. This is the
 * action behind dragging a "prêt pour LM" company into À faire.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json().catch(() => ({}));
  const companyId = Number((body as { companyId?: unknown }).companyId);
  if (!Number.isFinite(companyId)) return jsonError("companyId requis", 400);

  const supabase = getServiceClient();

  // Resolve the company name + its lead-magnet project (reviews source), and
  // the template's own name — echoed back so the caller can SHOW which template
  // the demo was actually cloned from instead of trusting its own dropdown.
  const [{ data: company }, project, { data: template }, { data: tagSettings }] = await Promise.all([
    supabase.from("entreprises").select("id, name, service_tags").eq("id", companyId).single(),
    // Résolveur partagé : une entreprise a un projet par opportunité, et c'est
    // ce lien qui décidera plus tard des chiffres clés affichés sur la démo.
    resolveLeadMagnetProjectId(supabase, { enterpriseId: companyId }),
    supabase.from("sites").select("name").eq("id", params.siteId).maybeSingle(),
    supabase.from("enrichment_tag_settings").select("tag, allowed, demarchable"),
  ]);
  if (!company) return jsonError("Entreprise introuvable", 404);

  // ── PAS DE MÉTIER AUTORISÉ, PAS DE DÉMO ─────────────────────────────────
  //
  // Le tableau refuse déjà (`missing_for_site` porte « Service tags » depuis la
  // #692), mais un garde posé par l'écran n'est pas un garde : c'est ICI que la
  // démo se fabrique, et cette route est le seul passage commun à tous les
  // appelants — bouton de carte, action de masse, glisser-déposer du kanban.
  //
  // Ce qui se joue n'est pas une règle de saisie : un design filtre ses pages,
  // ses sections et le tirage de ses photos sur les tags de l'entreprise. Sans
  // tag reconnu, le clone sort AMPUTÉ — des sections vides, des pages absentes
  // — et rien ne le signale avant qu'on ouvre le site. Mieux vaut un refus qui
  // nomme ce qui manque.
  //
  // « Explicitement autorisé », pas « faute de ligne qui l'interdise » : c'est
  // la même lecture que `missingForSite`, sinon les deux écrans ne diraient pas
  // la même chose de la même fiche.
  const tags = Array.isArray((company as { service_tags?: unknown }).service_tags)
    ? ((company as { service_tags: unknown[] }).service_tags.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      ))
    : [];
  const reglages = (tagSettings ?? []) as ServiceTagSetting[];
  const autorises = tags.filter((t) => isServiceTagExplicitlyAllowed(t, reglages));
  // ⚠️ « AUTORISÉ » NE VEUT PAS DIRE « LE GABARIT SAIT LE SERVIR ».
  //
  // Ce sont les DEUX PREMIERS des trois axes de `enrichment_tag_settings`, et
  // ce garde n'en lisait qu'un. `allowed` dit si l'enrichissement a le droit de
  // poser le tag ; c'est `isServiceTagKnownToTemplate` — la taxonomie des neuf
  // pages — qui dit si une page existe pour lui. Les libellés ADEME
  // (« Pompe à chaleur : chauffage », « Chauffe-Eau Thermodynamique ») sont
  // `allowed` parce qu'ils sont VRAIS, et ne correspondent à AUCUNE page.
  //
  // Mesuré le 03/09/2026 : 45 054 fiches sur 60 433 franchissaient ce garde et
  // sortaient avec un menu « Nos services » VIDE — constaté à l'écran sur
  // COLOMBET JEROME et FRANCE CONSEILS ECOLOGIE. Seules 529 fiches portaient un
  // tag de la taxonomie. Le refus ne servait donc à rien là où il servait le
  // plus, et rien ne le signalait avant d'ouvrir le site.
  const servables = autorises.filter((t) => isServiceTagKnownToTemplate(t));
  if (servables.length === 0) {
    return jsonError(
      tags.length === 0
        ? "Aucun métier sur cette fiche : le design n’aurait ni pages ni sections à filtrer. Pose un tag autorisé avant de fabriquer la démo."
        : autorises.length === 0
          ? `Aucun métier AUTORISÉ sur cette fiche (${tags.join(", ")}). Le design filtre ses pages sur le catalogue : la démo sortirait amputée. Pose un tag autorisé, ou autorise celui-ci dans Réglages → Tags.`
          : `Les métiers de cette fiche sont autorisés mais AUCUNE PAGE du gabarit ne les sert (${autorises.join(", ")}). La démo sortirait avec un menu « Nos services » vide. Pose un métier de la taxonomie — climatisation, pompe à chaleur, chauffage, ventilation, plomberie, électricité, photovoltaïque, rénovation générale, bornes IRVE.`,
      422,
    );
  }

  const clone = await cloneTemplateSite(supabase, params.siteId, {
    enterpriseId: companyId,
    name: (company as { name?: string }).name || `Site ${companyId}`,
    leadMagnetProjectId: project.projectId,
    buildStage: "a_faire",
  });
  if (!clone.ok || !clone.siteId) return jsonError(clone.error ?? "Clonage échoué", 500);

  return json(
    {
      siteId: clone.siteId,
      templateId: params.siteId,
      templateName: (template as { name?: string } | null)?.name ?? null,
    },
    { status: 201 },
  );
});
