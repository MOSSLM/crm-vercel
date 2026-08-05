import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { serviceTagMergeSchema } from "@/app/api/_lib/schemas";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  applyServiceTagMerge,
  isServiceTagAllowed,
  isServiceTagKnownToTemplate,
  rewriteNestedServiceTag,
  serviceTagKey,
} from "@/utils/serviceTags";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

/** Écritures simultanées. Assez pour que ça aille vite, assez peu pour ne pas
 *  saturer le pool de connexions Postgres sur un parc de plusieurs milliers. */
const WRITE_CONCURRENCY = 20;

/** Une table réécrite par la fusion. */
interface TableTarget {
  /** Clé du rapport, côté client. */
  readonly name: ReportKey;
  readonly table: string;
  readonly column: string;
  /**
   * `list` : la colonne EST un tableau de tags (l'entité « propose » ces
   * services). `nested` : la colonne est un document JSON contenant des champs
   * `service_tag` scalaires (l'entité est « réservée » à un service).
   */
  readonly kind: "list" | "nested";
}

type ReportKey =
  | "entreprises"
  | "leadMagnets"
  | "media"
  | "sitemaps"
  | "sectionInstances"
  | "projectPages"
  | "settings";

const TARGETS: readonly TableTarget[] = [
  { name: "entreprises", table: "entreprises", column: "service_tags", kind: "list" },
  // Le snapshot ÉCRASE `entreprises.service_tags` au rendu du site
  // (`resolve-variables.ts` : `projectServiceTags ?? serviceTags`). L'oublier
  // ferait une fusion qui corrige la fiche et laisse la page masquée — le bug
  // exact qu'on répare ici.
  { name: "leadMagnets", table: "lead_magnet_projects", column: "service_tags_snapshot", kind: "list" },
  // La médiathèque choisit ses images sur ces mêmes tags, et le RPC
  // `media_library_by_company` les compare par INTERSECT SQL — égalité exacte,
  // sans canonicalisation. Sans elle la page réapparaît sans visuel.
  { name: "media", table: "media_library", column: "service_tags", kind: "list" },
  // Côté AUTEUR : ces documents déclarent « réservé au tag X » et sont comparés
  // aux tags de l'entreprise. Les omettre ne rendrait pas la fusion incomplète
  // mais nuisible — les pages et blocs composés pour l'ancien tag cesseraient de
  // matcher au moment même où l'on corrige l'entreprise.
  { name: "sitemaps", table: "sites", column: "sitemap", kind: "nested" },
  { name: "sectionInstances", table: "site_section_instances", column: "content", kind: "nested" },
  { name: "projectPages", table: "section_project_pages", column: "sections", kind: "nested" },
];

type TableReport = { scanned: number; changed: number; failed: number };
type Report = Record<ReportKey, TableReport>;

const emptyReport = (): Report => ({
  entreprises: { scanned: 0, changed: 0, failed: 0 },
  leadMagnets: { scanned: 0, changed: 0, failed: 0 },
  media: { scanned: 0, changed: 0, failed: 0 },
  sitemaps: { scanned: 0, changed: 0, failed: 0 },
  sectionInstances: { scanned: 0, changed: 0, failed: 0 },
  projectPages: { scanned: 0, changed: 0, failed: 0 },
  settings: { scanned: 0, changed: 0, failed: 0 },
});

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * Réécrit une table. En `dryRun`, compte sans écrire.
 *
 * Le tableau d'origine est réécrit tel quel, sans passer par
 * `normalizeServiceTags` : celui-ci écarte les étiquettes d'annuaire
 * (« Artisanat », « Chauffagiste »), et les réenregistrer filtrées supprimerait
 * en silence des données qu'on n'a pas demandé de toucher. Une fusion ne change
 * QUE les tags fusionnés.
 */
async function mergeTable(
  sb: SupabaseClient,
  target: TableTarget,
  sources: string[],
  replacement: string,
  dryRun: boolean,
): Promise<TableReport> {
  const report: TableReport = { scanned: 0, changed: 0, failed: 0 };

  // La colonne étant choisie à l'exécution, l'inférence typée de supabase-js ne
  // peut pas résoudre le `select` : on annote le résultat à la main.
  const { data, error } = (await sb
    .from(target.table)
    .select(`id, ${target.column}`)
    .not(target.column, "is", null)) as unknown as {
    data: Array<Record<string, unknown>> | null;
    error: { message?: string } | null;
  };

  // Source secondaire illisible (table absente d'un environnement, RLS) : on le
  // signale par `failed` plutôt que de faire échouer une fusion dont les autres
  // tables sont parfaitement réécrites.
  if (error) return { scanned: 0, changed: 0, failed: 1 };

  const rows = data ?? [];
  const pending: Array<{ id: unknown; value: unknown }> = [];

  for (const row of rows) {
    report.scanned += 1;
    if (target.kind === "list") {
      const { tags, changed } = applyServiceTagMerge(asStrings(row[target.column]), sources, replacement);
      if (changed) pending.push({ id: row.id, value: tags });
    } else {
      const { value, changed } = rewriteNestedServiceTag(row[target.column], sources, replacement);
      if (changed) pending.push({ id: row.id, value });
    }
  }

  report.changed = pending.length;
  if (dryRun || pending.length === 0) return report;

  for (let i = 0; i < pending.length; i += WRITE_CONCURRENCY) {
    const slice = pending.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(
      slice.map((p) =>
        sb
          .from(target.table)
          .update({ [target.column]: p.value })
          .eq("id", p.id)
          .then((r) => r.error),
      ),
    );
    for (const err of results) {
      if (err) {
        report.failed += 1;
        report.changed -= 1;
      }
    }
  }

  return report;
}

/**
 * POST /api/settings/enrichment-tags/merge
 *
 * Fusionne des service tags : tout porteur d'un tag de `sources` reçoit `target`
 * à la place, partout où un service tag est stocké.
 *
 * Pourquoi cette route existe : l'allowlist des Paramètres ne FILTRE que les
 * enrichissements à venir, elle ne répare rien. Un tag déjà posé — parce que la
 * taxonomie du CRM disait « rénovation » quand le template attend
 * `renovation-generale` — restait donc en base à vie, masquant silencieusement
 * la page du service. C'est le seul chemin qui corrige l'existant.
 *
 * Tous les emplacements sont réécrits ensemble, faute de quoi la correction est
 * invisible — ou pire, destructrice. Ce que l'entité PROPOSE (tableaux de tags) :
 *   - `entreprises.service_tags` — la fiche et le catalogue ;
 *   - `lead_magnet_projects.service_tags_snapshot` — CELUI QUI DÉCIDE du rendu ;
 *   - `media_library.service_tags` — le choix des images.
 * Ce à quoi l'entité est RÉSERVÉE (champs `service_tag` scalaires, enfouis) :
 *   - `sites.sitemap` — une page qui 404 sans le tag ;
 *   - `site_section_instances.content` — un bloc masqué sans le tag ;
 *   - `section_project_pages.sections` — une section de projet.
 * Plus le ménage : `enrichment_tag_settings`, la ligne du tag disparu.
 *
 * Les trois derniers comptent autant que les premiers, et en sens inverse : sans
 * eux, renommer le tag d'une entreprise ferait disparaître les pages composées à
 * la main pour l'ancien tag, qui matchaient jusque-là.
 *
 * Pas de transaction : Supabase n'expose pas de transaction multi-requêtes en
 * REST. L'opération est en revanche IDEMPOTENTE — refusionner les mêmes sources
 * ne trouve plus rien à changer — donc un échec partiel se répare en relançant.
 * C'est pour ça que `failed` est remonté par table plutôt qu'avalé.
 *
 * Réservé aux admins, comme `ville-seo/recompute` : l'opération touche tout le
 * parc, pas une fiche.
 */
export const POST = withAuth(
  { role: "admin", body: serviceTagMergeSchema },
  async ({ body, cors }) => {
    const sb = getServiceClient();
    const targetKey = serviceTagKey(body.target);
    if (!targetKey) return jsonError("target_invalide", 400, {}, cors);

    // Les sources illisibles sont écartées, PAS celles qui partagent la clé de
    // la cible : fusionner « pompe-a-chaleur » vers « Pompe à chaleur » est une
    // normalisation de graphie légitime, et `applyServiceTagMerge` la traite.
    const sources = body.sources.filter((s) => serviceTagKey(s));
    if (sources.length === 0) return jsonError("aucune_source_valide", 400, {}, cors);

    const { data: settingsRows } = await sb.from("enrichment_tag_settings").select("tag, allowed");
    const settings = (settingsRows ?? []) as Array<{ tag?: unknown; allowed?: unknown }>;

    const targetAllowed = isServiceTagAllowed(body.target, settings);
    const targetKnownToTemplate = isServiceTagKnownToTemplate(body.target);

    // Garde-fous. Les deux cas laisseraient le parc dans un état pire qu'avant,
    // et un rapport « 34 entreprises corrigées » masquerait le problème.
    if (!targetAllowed && !body.allow_blocked_target) {
      return jsonError("cible_bloquee", 409, { targetAllowed, targetKnownToTemplate }, cors);
    }
    if (!targetKnownToTemplate && !body.allow_unknown_target) {
      return jsonError("cible_hors_taxonomie", 409, { targetAllowed, targetKnownToTemplate }, cors);
    }

    const report = emptyReport();
    for (const target of TARGETS) {
      report[target.name] = await mergeTable(sb, target, sources, body.target, body.dry_run);
    }

    // Lignes d'allowlist des tags fusionnés : le tag n'existe plus, sa ligne
    // n'aurait plus aucun porteur et resterait dans l'écran à vie.
    //
    // Les lignes qui partagent la clé de la CIBLE sont épargnées : ce sont les
    // siennes. Les supprimer débloquerait en silence un tag que les Paramètres
    // interdisent — l'inverse de ce que la fusion doit faire.
    const sourceKeys = new Set(
      sources.map((s) => serviceTagKey(s)).filter((k) => k && k !== targetKey),
    );
    const staleSettings = settings
      .map((r) => (typeof r.tag === "string" ? r.tag : ""))
      .filter((t) => t && sourceKeys.has(serviceTagKey(t)));
    report.settings.scanned = settings.length;
    report.settings.changed = staleSettings.length;
    if (!body.dry_run && staleSettings.length > 0) {
      const { error } = await sb.from("enrichment_tag_settings").delete().in("tag", staleSettings);
      if (error) {
        report.settings.failed = staleSettings.length;
        report.settings.changed = 0;
      }
    }

    /**
     * Entreprises dont le tag ne vit que dans `premiers_tags` (colonne héritée,
     * chaîne à virgules lue seulement quand `service_tags` est vide). La fusion
     * ne la réécrit pas — le format n'est pas un tableau et la migration vers
     * `service_tags` est un autre chantier — mais un décompte muet donnerait
     * l'illusion d'une correction complète.
     */
    const { count: legacyOnly } = await sb
      .from("entreprises")
      .select("id", { count: "exact", head: true })
      .is("service_tags", null)
      .not("premiers_tags", "is", null);

    return json(
      {
        dry_run: body.dry_run,
        sources,
        target: body.target,
        targetAllowed,
        targetKnownToTemplate,
        report,
        /** Non réécrites par la fusion — à traiter à part si le compte n'est pas nul. */
        legacy_premiers_tags_rows: legacyOnly ?? 0,
      },
      { headers: cors },
    );
  },
);
