import { getServiceClient } from "@/app/api/_lib/service-client";
import { SITE_DOMAIN } from "@/lib/site-domain";
import { isMissingColumn } from "@/lib/site-builder/clone-template-site";
import { noteSummaries } from "./_notes";

/**
 * Construction du tableau d'avancement Marketing & Web.
 *
 * Extrait de `board/route.ts` pour être partagé entre le board admin (toutes
 * les entreprises, 5 étapes dont l'attribution) et le board agent
 * (`ownerId` posé → seulement ses entreprises, 4 étapes, l'attribution ayant
 * déjà eu lieu en amont). Une seule implémentation, donc pas de dérive entre
 * les deux vues.
 */

/** How many opportunities to pull into the marketing board at once. */
const OPPORTUNITY_LIMIT = 1000;

type OppRow = {
  id: string;
  entreprise_id: number | null;
  pipeline_id: string | null;
  name: string | null;
  montant: number | null;
  priorite: string | null;
  type: string | null;
  mrr: number | null;
  recurrence_months: number | null;
  tags: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type EntRow = {
  id: number;
  name: string | null;
  canonical_url: string | null;
  site_web_canonique: string | null;
  logo_url: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  service_tags: string[] | string | null;
  note_moyenne: number | string | null;
  nombre_avis: number | string | null;
  owner_id: string | null;
};

/**
 * Une valeur de stat vide, au sens du rendu : le site n'affiche ni "", ni "0",
 * ni un tiret. Même règle que `isEmptyStat` dans `project-enrichment.ts`, qui
 * décide ce qui finit réellement dans le bloc « chiffres clés ».
 */
function hasStat(v: unknown): boolean {
  const t = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
  return t !== "" && t !== "0" && t !== "-" && t !== "—";
}

/**
 * Variables that must be present before a demo site can be generated cleanly.
 * Returns the human-readable labels missing.
 *
 * Le principe : tout ce que le site AFFICHE est obligatoire. D'où le logo et les
 * trois chiffres clés, en plus de l'identité (nom, ville, ville SEO, code
 * postal, téléphone) et des services — un site généré sans eux sort avec des
 * blocs vides qu'il faut ensuite rattraper à la main.
 *
 * Avec un tempérament, sans quoi le principe devient un piège : une exigence
 * doit être SATISFIABLE. Les qualifications RGE, la note et le nombre d'avis
 * n'existent pas pour une partie du parc — 1210 entreprises sur 2797 n'ont même
 * pas de fiche Google. Les réclamer ne produisait pas une fiche plus complète,
 * seulement une fiche impossible à valider, dont la seule issue était d'inventer
 * un chiffre. Ce qu'on exige d'elles est donc leur COHÉRENCE : des avis annoncés
 * sans note affichent un bloc noté vide, l'inverse non.
 *
 * Must stay in sync with `SITE_REQUIRED` in MarketingWebPipeline.tsx — including
 * the rule that everything living on `lead_magnet_projects` (SEO city, logo,
 * stats) is only required once that project exists. Le test
 * `missing-for-site.test.ts` compare les deux listes de libellés : la
 * synchronisation n'est plus une simple demande en commentaire.
 */
export function missingForSite(ent: EntRow | undefined, project: ProjectRow | null | undefined): string[] {
  const miss: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "");
  if (!ent) return ["Entreprise"];
  if (!str(ent.name)) miss.push("Nom");
  if (!str(ent.ville)) miss.push("Ville");
  if (project && !str(project.override_city)) miss.push("Ville SEO");
  if (!str(ent.code_postal)) miss.push("Code postal");
  if (!str(ent.telephone)) miss.push("Téléphone");
  const tags = Array.isArray(ent.service_tags)
    ? ent.service_tags.filter((t) => typeof t === "string" && t.trim().length > 0)
    : str(ent.service_tags)
      ? [str(ent.service_tags)]
      : [];
  if (tags.length === 0) miss.push("Service tags");
  // Les avis Google forment une paire FACULTATIVE, et c'est le seul énoncé
  // satisfiable : une entreprise sans fiche Google — 1210 sur 2797 — ou avec
  // zéro avis — 217 — ne pouvait pas les fournir. Les exiger rendait sa fiche
  // définitivement « incomplète », sans autre issue que d'inventer une note.
  //
  // Ce qui reste exigé est la COHÉRENCE : annoncer N avis sans note afficherait
  // un bloc noté vide sur le site. Sans avis, il n'y a rien à noter, et
  // `hydrate-reviews` retombe sur les cartes d'exemple du design.
  if (Number(ent.nombre_avis) > 0 && !(Number(ent.note_moyenne) > 0)) {
    miss.push("Note moyenne");
  }
  // Logo : celui du projet prime au rendu, celui de l'entreprise sert de repli.
  if (!str(project?.logo_url) && !str(ent.logo_url)) miss.push("Logo");
  if (project) {
    // Le chiffre confirmé par le client satisfait l'exigence autant que
    // l'estimation : c'est celui qui s'affichera (cf. `effectiveStat`). Sans ce
    // « ou », remplacer une estimation par un vrai chiffre aurait rendu la fiche
    // incomplète — l'inverse de l'effet voulu.
    const hasEither = (estimated: unknown, official: unknown) =>
      hasStat(official) || hasStat(estimated);
    if (!hasEither(project.stat_years_experience, project.stat_years_experience_official)) {
      miss.push("Années d'expérience");
    }
    if (!hasEither(project.stat_satisfied_clients, project.stat_satisfied_clients_official)) {
      miss.push("Clients satisfaits");
    }
    if (
      !hasEither(project.stat_installations_completed, project.stat_installations_completed_official)
    ) {
      miss.push("Installations");
    }
    // Les qualifications RGE ne sont PAS requises : beaucoup d'entreprises n'en
    // ont aucune, et le bloc « chiffres clés » se contente alors de trois
    // colonnes. L'exiger faisait remonter une variable manquante impossible à
    // combler autrement qu'en inventant un chiffre.
  }
  return miss;
}

type ProjectRow = {
  id: string;
  opportunite_id: string | null;
  entreprise_id: number | null;
  statut: string | null;
  pret_pour_lm: boolean | null;
  /** Ville SEO — requise pour créer un site (voir `missingForSite`). */
  override_city: string | null;
  /** Logo + chiffres clés : affichés par le site, donc requis eux aussi. */
  logo_url: string | null;
  stat_years_experience: string | null;
  stat_satisfied_clients: string | null;
  stat_installations_completed: string | null;
  stat_rge_count: string | null;
  /**
   * Chiffres confirmés par le client (migration 20260805, appliquée à la main) :
   * prioritaires à l'affichage, et suffisants pour valider la fiche.
   */
  stat_years_experience_official?: string | null;
  stat_satisfied_clients_official?: string | null;
  stat_installations_completed_official?: string | null;
  stat_rge_count_official?: string | null;
  enrichment_validated?: boolean | null;
};

type EnrichMetaRow = {
  id: string;
  enrichment_error: string | null;
  enrichment_attempts: number | null;
};

type EnrichRow = {
  entreprise_id: number | null;
  status: string | null;
  website_url: string | null;
  updated_at: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  enterprise_id: number | null;
  build_stage: string | null;
  is_published: boolean | null;
  published_subdomain: string | null;
  published_domain: string | null;
  is_template: boolean | null;
  is_claude_design: boolean | null;
  /** Template dont ce site est le clone (migration 20260730, optionnelle). */
  source_template_id?: string | null;
  /** Vignette de partage déjà fabriquée (migration 20260810, optionnelle). */
  og_image_url?: string | null;
  /**
   * Les deux captures qui composent la vignette. Servent à distinguer une carte
   * COMPLÈTE d'une carte fabriquée sans son téléphone : les deux s'affichent
   * bien, seule la seconde a un trou, et rien à l'écran ne le disait.
   */
  og_shot_url?: string | null;
  og_shot_mobile_url?: string | null;
};

type AuditRow = {
  id: string;
  opportunite_id: string | null;
  statut: string | null;
  pdf_url: string | null;
};

type AgentRow = { id: string; full_name: string | null; email: string | null };

/**
 * Statuts d'`automated_enrichment` (ancien pipeline Production ›
 * Enrichissement) qui ne valent pas « enrichi ».
 */
const ENRICHMENT_FAIL_STATUSES = new Set(["pending", "queued", "running", "failed", "error"]);

/**
 * Statuts de `lead_magnet_projects` qui signent un enrichissement terminé :
 * l'edge function `enrich-lead-magnet` pose `framer` en fin de run réussi,
 * `ready`/`published` sont les états postérieurs (mêmes valeurs que
 * `TERMINAL_STATUSES` dans `enrich-prepare`).
 */
const PROJECT_ENRICHED_STATUSES = new Set(["framer", "ready", "published"]);

/**
 * L'étape « Enrichissement » est-elle franchie ? C'est ce booléen qui débloque
 * la carte « Validation données » côté matrice (`activeStageIndex`).
 *
 * Le signal qui compte est le **projet lead magnet** : c'est lui que
 * `/api/lead-magnet/enrich` fait tourner et que l'edge function passe à
 * `framer`. `automated_enrichment` appartient à l'ancien pipeline de production
 * et n'est jamais écrit par ce run — s'y fier seule laissait la ligne collée
 * sur la carte « Enrichir » après un enrichissement pourtant réussi, donc la
 * carte de validation restait verrouillée et il n'y avait rien à valider.
 *
 * @param project Projet lead magnet de l'opportunité (statut + validation
 *   humaine déjà résolue), `null` s'il n'y en a pas encore.
 * @param legacy Dernière ligne `automated_enrichment` de l'entreprise.
 * @param complete La fiche ne réclame plus aucune variable (`missingForSite`
 *   vide). C'est ce qui rattrape un enrichissement automatique en échec :
 *   rempli à la main, le dossier est enrichi, quoi qu'en dise le run.
 */
export function isEnrichmentDone(
  project: { statut: string | null; validated: boolean } | null,
  legacy: { status: string | null } | null,
  complete = false,
): boolean {
  // Déjà validé par un humain : l'étape ne régresse plus, même pendant un
  // ré-enrichissement (qui repasse le statut à `draft` le temps du run).
  if (project?.validated) return true;

  const statut = project?.statut ?? null;
  if (statut != null && PROJECT_ENRICHED_STATUSES.has(statut)) return true;

  // Saisi à la main : ce qui compte est le RÉSULTAT, pas le chemin. Quand le
  // dossier ne réclame plus aucune variable, l'étape est franchie même si
  // l'enrichissement automatique n'a jamais abouti (site introuvable, page
  // illisible…). Sans ça, une fiche complétée à la main restait collée sur la
  // carte « Enrichir » et la validation demeurait « à débloquer ».
  if (project && complete) return true;

  // Run en échec : la carte « Enrichir » reste active pour porter le bouton
  // « Relancer » et le message d'erreur, quoi qu'en dise l'ancien pipeline.
  if (statut === "failed") return false;

  // Ancien pipeline : une fiche déjà enrichie hors marketing pipeline compte,
  // mais seulement s'il y a un projet — sinon la carte suivante s'ouvrirait sur
  // un bouton « Valider » inerte (il n'y a pas de projet à valider).
  if (project && legacy && !(legacy.status != null && ENRICHMENT_FAIL_STATUSES.has(legacy.status))) {
    return true;
  }

  return false;
}

function siteUrl(s: SiteRow | undefined): string | null {
  if (!s) return null;
  if (s.published_domain) {
    return s.published_domain.startsWith("http") ? s.published_domain : `https://${s.published_domain}`;
  }
  if (s.published_subdomain) return `https://${s.published_subdomain}.${SITE_DOMAIN}`;
  return null;
}

/** Entreprises interrogées par lot : `.in(...)` sur 1 000 ids ferait une URL énorme. */
const ENT_CHUNK = 200;

/**
 * Sites de démo des entreprises du board, par lots.
 *
 * Le découpage n'est pas cosmétique : PostgREST plafonne une réponse à
 * 1 000 lignes, et une seule requête pour toutes les entreprises pouvait donc
 * rendre invisible le site d'une ligne — qui repartait alors « à créer ».
 */
const DEMO_SITE_COLUMNS =
  "id, name, enterprise_id, build_stage, is_published, published_subdomain, published_domain, is_template, is_claude_design";

async function fetchDemoSites(
  supabase: ReturnType<typeof getServiceClient>,
  entIds: number[],
): Promise<{ data: SiteRow[]; error: { message: string } | null }> {
  if (entIds.length === 0) return { data: [], error: null };
  // `source_template_id` vient d'une migration tardive : on retente sans elle
  // plutôt que de faire tomber le board (même parti pris qu'ailleurs ici).
  let columns = `${DEMO_SITE_COLUMNS}, source_template_id, og_image_url, og_shot_url, og_shot_mobile_url`;
  const rows: SiteRow[] = [];
  for (let i = 0; i < entIds.length; i += ENT_CHUNK) {
    const chunk = entIds.slice(i, i + ENT_CHUNK);
    let res = await supabase.from("sites").select(columns).in("enterprise_id", chunk);
    if (res.error && isMissingColumn(res.error)) {
      columns = DEMO_SITE_COLUMNS;
      res = await supabase.from("sites").select(columns).in("enterprise_id", chunk);
    }
    if (res.error) return { data: [], error: res.error };
    rows.push(...((res.data ?? []) as unknown as SiteRow[]));
  }
  return { data: rows, error: null };
}

export type BoardResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number };

/**
 * Agrège, pour chaque opportunité liée à une entreprise, l'état du workflow de
 * production marketing : enrichissement → prêt pour LM → site démo → audit →
 * attribution d'un agent. Renvoie aussi les templates de site, les agents et
 * les pipelines.
 *
 * @param ownerId Restreint aux entreprises appartenant à cet agent. Omis côté
 *   admin, où le board est global.
 */
export async function buildBoard(opts: { ownerId?: string } = {}): Promise<BoardResult> {
  const supabase = getServiceClient();

  const empty = {
    items: [],
    templates: [],
    agents: [],
    pipelines: [],
    has_validated_column: true,
  };

  // Scope agent : on part des entreprises qui lui appartiennent, puis on ne
  // remonte que leurs opportunités.
  let ownedEntIds: number[] | null = null;
  if (opts.ownerId) {
    const { data, error } = await supabase
      .from("entreprises")
      .select("id")
      .eq("owner_id", opts.ownerId);
    if (error) return { ok: false, error: error.message, status: 500 };
    ownedEntIds = (data ?? []).map((e) => Number(e.id));
    if (ownedEntIds.length === 0) return { ok: true, data: empty };
  }

  let oppQuery = supabase
    .from("opportunites")
    .select(
      "id, entreprise_id, pipeline_id, name, montant, priorite, type, mrr, recurrence_months, tags, updated_at, created_at",
    )
    .not("entreprise_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(OPPORTUNITY_LIMIT);

  if (ownedEntIds) oppQuery = oppQuery.in("entreprise_id", ownedEntIds);

  const { data: oppsData, error: oppErr } = await oppQuery;
  if (oppErr) return { ok: false, error: oppErr.message, status: 500 };

  const opps = (oppsData ?? []) as OppRow[];
  const oppIds = opps.map((o) => o.id);
  const entIds = [...new Set(opps.map((o) => o.entreprise_id).filter((v): v is number => v != null))];

  if (opps.length === 0) return { ok: true, data: empty };

  // The explicit human-validation flag lives in a column added by a later
  // migration; degrade to `pret_pour_lm` when it isn't there yet.
  let hasValidatedColumn = true;
  let projectRows: ProjectRow[] = [];
  {
    const PROJECT_COLUMNS =
      "id, opportunite_id, entreprise_id, statut, pret_pour_lm, override_city, logo_url, " +
      "stat_years_experience, stat_satisfied_clients, stat_installations_completed, stat_rge_count";
    /** Chiffres confirmés par le client — migration 20260805, appliquée à la main. */
    const OFFICIAL_COLUMNS =
      "stat_years_experience_official, stat_satisfied_clients_official, " +
      "stat_installations_completed_official, stat_rge_count_official";
    // Recherche par ENTREPRISE, pas par opportunité : le dossier lead magnet est
    // par entreprise (chiffres clés, logo, ville SEO, avis, site démo le sont
    // tous). Interroger par `opportunite_id` laissait sans dossier la carte du
    // deal qui n'avait pas créé la ligne — et en affichait un différent sur
    // chaque deal quand l'entreprise en avait deux.
    // Deux groupes de colonnes facultatifs, issus de migrations distinctes, qui
    // doivent dégrader INDÉPENDAMMENT : une base qui a `enrichment_validated`
    // mais pas encore les chiffres officiels ne doit pas perdre sa validation
    // explicite au passage. D'où une chaîne du plus complet au plus dépouillé,
    // dont chaque repli n'est payé que s'il sert.
    const attempts: Array<{ select: string; validated: boolean }> = [
      { select: `${PROJECT_COLUMNS}, ${OFFICIAL_COLUMNS}, enrichment_validated`, validated: true },
      { select: `${PROJECT_COLUMNS}, enrichment_validated`, validated: true },
      { select: `${PROJECT_COLUMNS}, ${OFFICIAL_COLUMNS}`, validated: false },
      { select: PROJECT_COLUMNS, validated: false },
    ];

    let lastError: string | null = null;
    let loaded = false;
    for (const attempt of attempts) {
      const res = await supabase
        .from("lead_magnet_projects")
        .select(attempt.select)
        .in("entreprise_id", entIds);
      if (res.error) {
        lastError = res.error.message;
        continue;
      }
      hasValidatedColumn = attempt.validated;
      projectRows = (res.data ?? []) as unknown as ProjectRow[];
      loaded = true;
      break;
    }
    if (!loaded) return { ok: false, error: lastError ?? "lecture des projets impossible", status: 500 };
  }

  // Sites : deux requêtes ciblées plutôt qu'un `select` sur toute la table.
  // PostgREST plafonne une réponse à 1 000 lignes : avec assez de démos, un
  // « select all » finissait par tronquer la liste des templates (le template
  // choisi disparaissait du menu) et par perdre des sites d'entreprises.
  const [entsRes, enrichRes, templatesRes, sitesRes, auditsRes, agentsRes, pipelinesRes] = await Promise.all([
    supabase
      .from("entreprises")
      .select(
        "id, name, canonical_url, site_web_canonique, logo_url, ville, code_postal, telephone, service_tags, note_moyenne, nombre_avis, owner_id",
      )
      .in("id", entIds),
    entIds.length > 0
      ? supabase
          .from("automated_enrichment")
          .select("entreprise_id, status, website_url, updated_at")
          .in("entreprise_id", entIds)
      : Promise.resolve({ data: [] as EnrichRow[], error: null }),
    supabase
      .from("sites")
      .select("id, name, is_template, is_claude_design, updated_at")
      .eq("is_template", true)
      .order("name", { ascending: true }),
    fetchDemoSites(supabase, entIds),
    oppIds.length > 0
      ? supabase.from("audits").select("id, opportunite_id, statut, pdf_url").in("opportunite_id", oppIds)
      : Promise.resolve({ data: [] as AuditRow[], error: null }),
    supabase.from("user_profiles").select("id, full_name, email").eq("role", "freelance"),
    supabase.from("pipelines").select("id, nom, ordre, is_default").order("ordre", { ascending: true }),
  ]);

  if (entsRes.error) return { ok: false, error: entsRes.error.message, status: 500 };
  if (sitesRes.error) return { ok: false, error: sitesRes.error.message, status: 500 };
  if (templatesRes.error) return { ok: false, error: templatesRes.error.message, status: 500 };

  // Tickets (notes agent ↔ admin) par opportunité, pour les badges du board.
  const notesByOpp = await noteSummaries(oppIds);

  // Enrichment run metadata (statut/error/attempts written by the edge function).
  // These columns are optional: the board degrades gracefully if a DB predates
  // them, exactly like `enrichment_validated` above.
  const enrichMetaById = new Map<string, EnrichMetaRow>();
  {
    const projectIds = projectRows.map((p) => p.id);
    if (projectIds.length > 0) {
      const metaRes = await supabase
        .from("lead_magnet_projects")
        .select("id, enrichment_error, enrichment_attempts")
        .in("id", projectIds);
      if (!metaRes.error) {
        for (const row of (metaRes.data ?? []) as EnrichMetaRow[]) enrichMetaById.set(row.id, row);
      }
    }
  }

  const isValidated = (p: ProjectRow) =>
    hasValidatedColumn ? p.enrichment_validated === true : p.pret_pour_lm === true;

  const entById = new Map<number, EntRow>();
  for (const e of (entsRes.data ?? []) as EntRow[]) entById.set(e.id, e);

  // Un dossier lead magnet par ENTREPRISE (on garde le validé s'il y en a un).
  // Tant que d'anciens doublons subsistent en base, cette règle fait converger
  // toutes les cartes d'une entreprise sur le même dossier — celui que lit
  // aussi le site.
  const projectByEnt = new Map<number, ProjectRow>();
  for (const p of projectRows) {
    if (p.entreprise_id == null) continue;
    const cur = projectByEnt.get(p.entreprise_id);
    if (!cur || (isValidated(p) && !isValidated(cur))) projectByEnt.set(p.entreprise_id, p);
  }

  // Latest enrichment per company.
  const enrichByEnt = new Map<number, EnrichRow>();
  for (const r of (enrichRes.data ?? []) as EnrichRow[]) {
    if (r.entreprise_id == null) continue;
    const cur = enrichByEnt.get(r.entreprise_id);
    if (!cur || (r.updated_at ?? "") > (cur.updated_at ?? "")) enrichByEnt.set(r.entreprise_id, r);
  }

  // Templates : Claude Designs d'abord (ce sont eux qui produisent les démos du
  // pipeline), puis les templates classiques, chacun trié par nom. Un ordre
  // stable évite que le menu se réordonne d'un rafraîchissement à l'autre.
  const templateRows = (templatesRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    is_claude_design: boolean | null;
  }>;
  const templates = templateRows
    .map((s) => ({
      id: s.id,
      name: s.name?.trim() || "Template sans nom",
      is_claude_design: s.is_claude_design === true,
    }))
    .sort((a, b) =>
      a.is_claude_design === b.is_claude_design
        ? a.name.localeCompare(b.name, "fr")
        : a.is_claude_design
          ? -1
          : 1,
    );

  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  // Best demo site per company (published > pret > other), templates excluded.
  const allSites = (sitesRes.data ?? []) as SiteRow[];
  const rank = (s: SiteRow) => (s.is_published ? 2 : s.build_stage === "pret" ? 1 : 0);
  const siteByEnt = new Map<number, SiteRow>();
  for (const s of allSites) {
    if (s.is_template === true || s.enterprise_id == null) continue;
    const cur = siteByEnt.get(s.enterprise_id);
    if (!cur || rank(s) > rank(cur)) siteByEnt.set(s.enterprise_id, s);
  }

  // Best audit per opportunity (ready first).
  const auditByOpp = new Map<string, AuditRow>();
  for (const a of (auditsRes.data ?? []) as AuditRow[]) {
    if (!a.opportunite_id) continue;
    const cur = auditByOpp.get(a.opportunite_id);
    const isReady = a.statut === "ready";
    if (!cur || (isReady && cur.statut !== "ready")) auditByOpp.set(a.opportunite_id, a);
  }

  const agents = ((agentsRes.data ?? []) as AgentRow[]).map((a) => ({
    id: a.id,
    name: a.full_name?.trim() || a.email || "Agent",
  }));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const items = opps.map((o) => {
    const ent = o.entreprise_id != null ? entById.get(o.entreprise_id) : undefined;
    const project = o.entreprise_id != null ? (projectByEnt.get(o.entreprise_id) ?? null) : null;
    const enrich = o.entreprise_id != null ? enrichByEnt.get(o.entreprise_id) : undefined;
    const site = o.entreprise_id != null ? siteByEnt.get(o.entreprise_id) : undefined;
    const audit = auditByOpp.get(o.id) ?? null;
    const owner = ent?.owner_id ? agentById.get(ent.owner_id) : undefined;

    // Ce qui manque encore pour générer le site. Calculé une fois : il sert à
    // la fois d'indicateur sur la carte et de preuve qu'un enrichissement fait
    // à la main est terminé.
    const missing = missingForSite(ent, project);

    const enriched = isEnrichmentDone(
      project ? { statut: project.statut, validated: isValidated(project) } : null,
      enrich ? { status: enrich.status } : null,
      missing.length === 0,
    );

    // Milestones (linear).
    const m1 = !!project && isValidated(project); // enrichment validated → ready for LM
    const m2 = !!site; // demo site created
    const m3 = !!site && (site.is_published === true || site.build_stage === "pret"); // site validated
    const m5 = audit?.statut === "ready"; // audit validated

    let column = 1;
    if (!m1) column = 1;
    else if (!m2) column = 2;
    else if (!m3) column = 3;
    else if (!m5) column = 4;
    else column = 5;

    return {
      id: o.id,
      name: o.name ?? ent?.name ?? "Opportunité",
      entreprise_id: o.entreprise_id,
      pipeline_id: o.pipeline_id,
      company_name: ent?.name ?? o.name ?? null,
      company_url: ent?.canonical_url ?? ent?.site_web_canonique ?? null,
      logo_url: ent?.logo_url ?? null,
      ville: ent?.ville ?? null,
      priorite: o.priorite ?? null,
      montant: o.montant ?? null,
      type: o.type ?? null,
      mrr: o.mrr ?? null,
      recurrence_months: o.recurrence_months ?? null,
      tags: o.tags ?? null,
      enriched,
      enrichment: enrich
        ? { status: enrich.status ?? null, website_url: enrich.website_url ?? null }
        : null,
      project: project
        ? {
            id: project.id,
            pret_pour_lm: project.pret_pour_lm === true,
            enrichment_validated: isValidated(project),
            statut: project.statut,
            enrichment_error: enrichMetaById.get(project.id)?.enrichment_error ?? null,
            enrichment_attempts: enrichMetaById.get(project.id)?.enrichment_attempts ?? null,
          }
        : null,
      site: site
        ? {
            id: site.id,
            name: site.name ?? null,
            build_stage: site.build_stage ?? "a_faire",
            is_published: site.is_published === true,
            url: siteUrl(site),
            // Le sous-domaine, brut, en plus de `url` : `demoShareUrl` en a
            // besoin pour distinguer « site déployé » de « aperçu brouillon »,
            // et `url` vaut null dans le second cas — qui est précisément celui
            // où le lien partagé n'avait aucune preview sociale.
            published_subdomain: site.published_subdomain ?? null,
            // La vignette telle qu'elle est aujourd'hui : le pipeline l'affiche
            // pour qu'un défaut se voie AVANT l'envoi, pas dans la conversation
            // du prospect.
            og_image_url: site.og_image_url ?? null,
            og_shot_url: site.og_shot_url ?? null,
            og_shot_mobile_url: site.og_shot_mobile_url ?? null,
            is_claude_design: site.is_claude_design === true,
            // Template d'origine : la carte peut ainsi dire d'où vient le site,
            // et signaler qu'il ne vient pas du template sélectionné en haut.
            template_id: site.source_template_id ?? null,
            template_name:
              site.source_template_id != null
                ? templateNameById.get(site.source_template_id) ?? null
                : null,
          }
        : null,
      audit: audit ? { id: audit.id, statut: audit.statut ?? "draft", pdf_url: audit.pdf_url ?? null } : null,
      agent: owner ? { id: owner.id, name: owner.name } : null,
      missing_for_site: missing,
      notes: notesByOpp.get(o.id) ?? { open: 0, total: 0, open_subjects: [] },
      column,
    };
  });

  // UNE carte par entreprise. Ce board suit un workflow d'ENTREPRISE
  // (enrichissement → site démo → audit) : tout ce qu'il affiche est par
  // entreprise sauf l'audit. Une carte par opportunité faisait apparaître deux
  // fois la même entreprise dès qu'elle avait un deal dans deux pipelines — ce
  // qui arrive à chaque attribution à un agent, d'où « 21 entreprises
  // attribuées, 42 cartes ».
  // On garde l'opportunité la plus avancée (colonne la plus haute), et à égalité
  // la plus récemment mise à jour — `opps` est déjà trié en ce sens.
  const bestByEnterprise = new Map<number, (typeof items)[number]>();
  const otherOpportunities = new Map<number, number>();
  for (const item of items) {
    if (item.entreprise_id == null) continue;
    const cur = bestByEnterprise.get(item.entreprise_id);
    if (!cur) {
      bestByEnterprise.set(item.entreprise_id, item);
      continue;
    }
    otherOpportunities.set(item.entreprise_id, (otherOpportunities.get(item.entreprise_id) ?? 0) + 1);
    if (item.column > cur.column) bestByEnterprise.set(item.entreprise_id, item);
  }
  // `other_opportunities` : on ne masque pas l'existence des autres deals, on
  // arrête juste d'en faire des cartes séparées.
  const dedupedItems = [...bestByEnterprise.values()].map((item) => ({
    ...item,
    other_opportunities: item.entreprise_id != null ? (otherOpportunities.get(item.entreprise_id) ?? 0) : 0,
  }));

  const pipelines = (
    (pipelinesRes.data ?? []) as Array<{
      id: string;
      nom: string | null;
      ordre: number | null;
      is_default: boolean | null;
    }>
  ).map((p) => ({ id: p.id, nom: p.nom ?? "Pipeline", is_default: p.is_default === true }));

  return {
    ok: true,
    data: {
      items: dedupedItems,
      templates,
      // Le board agent n'attribue pas : la liste des agents ne lui sert à rien.
      agents: opts.ownerId ? [] : agents,
      pipelines,
      has_validated_column: hasValidatedColumn,
    },
  };
}
