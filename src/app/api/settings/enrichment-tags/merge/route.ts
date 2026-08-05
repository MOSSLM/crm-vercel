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

/**
 * Lignes par page de lecture.
 *
 * La pagination n'est PAS une optimisation, c'est une correction. PostgREST
 * plafonne un `select` sans `limit` (1000 lignes par défaut) et ne signale rien :
 * sur 2797 entreprises, la première version de cette route n'en a vu qu'une
 * partie, a réécrit ce qu'elle voyait et annoncé un succès complet. Sept fiches
 * ont gardé l'ancien tag, et le rapport ne pouvait pas le dire.
 *
 * Sous le plafond, pour que la dernière page soit toujours reconnaissable à sa
 * taille et jamais tronquée par lui.
 */
const READ_PAGE = 500;

/** Garde-fou : au-delà, on préfère un rapport incomplet à une boucle infinie. */
const MAX_PAGES = 200;

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
  // SOURCE DE VÉRITÉ, et le seul chemin vers les snapshots.
  //
  // `lead_magnet_projects.service_tags_snapshot` n'est PAS écrit ici, et ce n'est
  // pas un oubli : le trigger `lm_force_service_tags_snapshot_from_entreprise`
  // fait `new.service_tags_snapshot := (select service_tags from entreprises …)`
  // en BEFORE UPDATE. Toute écriture directe du snapshot est donc écrasée par la
  // valeur de l'entreprise — la tentative précédente le « modifiait » et la base
  // le remettait aussitôt, en gonflant le rapport d'un changement fictif.
  //
  // La bonne porte est celle-ci : écrire l'entreprise déclenche
  // `sync_lm_projects_service_tags_from_entreprise`, qui propage aux snapshots ET
  // recalcule `variables` via `lm_merge_service_variables` — ce qu'une écriture
  // directe du snapshot aurait laissé incohérent.
  { name: "entreprises", table: "entreprises", column: "service_tags", kind: "list" },
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
/**
 * Toutes les lignes dont `column` est non nulle, par curseur keyset sur `id`.
 *
 * Chaque ligne est vue une fois, et aucun plafond implicite ne peut en cacher —
 * c'est tout l'objet de la pagination ici, cf. `READ_PAGE`.
 */
async function scanAll(
  sb: SupabaseClient,
  table: string,
  column: string,
): Promise<{ rows: Array<Record<string, unknown>>; failed: boolean }> {
  const rows: Array<Record<string, unknown>> = [];
  let cursor: unknown = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let q = sb
      .from(table)
      .select(`id, ${column}`)
      .not(column, "is", null)
      .order("id", { ascending: true })
      .limit(READ_PAGE);
    if (cursor !== null) q = q.gt("id", cursor);

    // La colonne étant choisie à l'exécution, l'inférence typée de supabase-js ne
    // peut pas résoudre le `select` : on annote le résultat à la main.
    const { data, error } = (await q) as unknown as {
      data: Array<Record<string, unknown>> | null;
      error: { message?: string } | null;
    };

    // Source secondaire illisible (table absente d'un environnement, RLS) : on le
    // signale plutôt que de faire échouer une fusion dont les autres tables sont
    // parfaitement réécrites.
    if (error) return { rows, failed: true };

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < READ_PAGE) break;

    const next = batch[batch.length - 1]?.id;
    // Curseur qui n'avance pas : on s'arrête au lieu de relire la même page.
    if (next === undefined || next === cursor) break;
    cursor = next;
  }

  return { rows, failed: false };
}

/**
 * Lignes portant encore l'un des tags fusionnés. Sert à VÉRIFIER après coup, pas
 * à décider : c'est ce compte qui aurait révélé tout de suite que sept fiches
 * n'avaient pas été touchées.
 */
async function countCarriers(
  sb: SupabaseClient,
  table: string,
  column: string,
  sourceKeys: ReadonlySet<string>,
): Promise<{ total: number; carriers: number; failed: boolean }> {
  const { rows, failed } = await scanAll(sb, table, column);
  let carriers = 0;
  for (const row of rows) {
    if (asStrings(row[column]).some((t) => sourceKeys.has(serviceTagKey(t)))) carriers += 1;
  }
  return { total: rows.length, carriers, failed };
}

async function mergeTable(
  sb: SupabaseClient,
  target: TableTarget,
  sources: string[],
  replacement: string,
  dryRun: boolean,
): Promise<TableReport> {
  const report: TableReport = { scanned: 0, changed: 0, failed: 0 };

  const { rows, failed } = await scanAll(sb, target.table, target.column);
  if (failed) return { scanned: rows.length, changed: 0, failed: 1 };

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

    const sourceKeySet = new Set(sources.map((s) => serviceTagKey(s)).filter(Boolean));
    sourceKeySet.delete(targetKey); // la cible n'est pas un tag « à faire disparaître »

    /**
     * Les snapshots lead magnet ne sont pas écrits mais DÉRIVÉS : le trigger
     * `sync_lm_projects_service_tags_from_entreprise` les recopie depuis
     * l'entreprise. On les mesure donc au lieu de les toucher — avant la fusion
     * pour annoncer ce qui va être propagé, après pour prouver que ça l'a été.
     */
    const lmBefore = await countCarriers(
      sb,
      "lead_magnet_projects",
      "service_tags_snapshot",
      sourceKeySet,
    );

    const report = emptyReport();
    for (const target of TARGETS) {
      report[target.name] = await mergeTable(sb, target, sources, body.target, body.dry_run);
    }

    // `failed` non nul ici veut dire : des snapshots portent encore l'ancien tag
    // alors que les entreprises ont été corrigées. C'est exactement le symptôme
    // qui était passé inaperçu la première fois, et il ne doit plus l'être.
    const lmAfter = body.dry_run
      ? lmBefore
      : await countCarriers(sb, "lead_magnet_projects", "service_tags_snapshot", sourceKeySet);

    report.leadMagnets = {
      scanned: lmBefore.total,
      changed: body.dry_run ? lmBefore.carriers : lmBefore.carriers - lmAfter.carriers,
      failed: lmBefore.failed || lmAfter.failed ? lmBefore.total : body.dry_run ? 0 : lmAfter.carriers,
    };

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
