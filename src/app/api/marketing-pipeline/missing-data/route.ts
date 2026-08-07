import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { marketingMissingDataSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { RequiredValues } from "@/components/marketing-pipeline/required-fields";
import { buildCompanyPatch, buildProjectPatch } from "../_missing-data";
import { ensureProjectId, writeProjectDetails } from "../_project-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Compléter en masse ce qui manque aux fiches du board Marketing & Web.
 *
 * Le bloc « À compléter » de la fiche règle un dossier à la fois. Sur près de
 * soixante lignes incomplètes, dont trente-six pour le seul logo, cela veut dire
 * soixante ouvertures de modale pour trois champs chacune. Cette route sert la
 * grille qui les met côte à côte : `GET` pour lire les valeurs des lignes
 * choisies, `POST` pour enregistrer d'un coup ce qui a été saisi.
 *
 * Comme `company-details` — dont la modale se sert déjà pour les deux variantes
 * de l'écran — l'accès est simplement authentifié et l'écriture passe par le
 * service client : tout ce que le board peut MONTRER, la grille doit pouvoir
 * l'enregistrer, y compris les entreprises « pool » (`owner_id IS NULL`) que le
 * RLS freelance refuse côté navigateur.
 */

/** Plafond par lot — aligné sur `marketingMissingDataSchema`. */
const MAX_ROWS = 200;

/** Strictement ce que la grille édite — le reste de la fiche ne la regarde pas. */
const ENT_COLUMNS =
  "id, name, logo_url, ville, code_postal, telephone, service_tags, note_moyenne, nombre_avis";

const PROJECT_COLUMNS =
  "id, entreprise_id, pret_pour_lm, override_city, logo_url, " +
  "stat_years_experience, stat_satisfied_clients, stat_installations_completed";
/** Chiffres confirmés par le client — migration 20260805, appliquée à la main. */
const OFFICIAL_COLUMNS =
  "stat_years_experience_official, stat_satisfied_clients_official, " +
  "stat_installations_completed_official";

type EntRow = {
  id: number;
  name: string | null;
  logo_url: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  service_tags: string[] | string | null;
  note_moyenne: number | string | null;
  nombre_avis: number | string | null;
};

type ProjRow = {
  id: string;
  entreprise_id: number | null;
  pret_pour_lm: boolean | null;
  override_city: string | null;
  logo_url: string | null;
  stat_years_experience: string | null;
  stat_satisfied_clients: string | null;
  stat_installations_completed: string | null;
  stat_years_experience_official?: string | null;
  stat_satisfied_clients_official?: string | null;
  stat_installations_completed_official?: string | null;
} | null;

const str = (v: unknown): string => (v == null || v === "" ? "" : String(v));
const list = (v: unknown): string =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(", ") : "";

/**
 * Les valeurs telles que la grille (et la fiche) les éditent : des chaînes.
 *
 * Le logo suit la même règle qu'à l'affichage du site — celui du dossier prime,
 * celui de l'entreprise sert de repli — sinon la grille afficherait « manquant »
 * sur une entreprise qui a bel et bien un logo.
 */
function toValues(ent: EntRow, project: ProjRow): RequiredValues {
  const p = (project ?? {}) as Record<string, unknown>;
  return {
    name: str(ent.name),
    ville: str(ent.ville),
    code_postal: str(ent.code_postal),
    telephone: str(ent.telephone),
    service_tags: Array.isArray(ent.service_tags) ? list(ent.service_tags) : str(ent.service_tags),
    note_moyenne: str(ent.note_moyenne),
    nombre_avis: str(ent.nombre_avis),
    lm_override_city: str(p.override_city),
    lm_logo_url: str(p.logo_url) || str(ent.logo_url),
    lm_stat_years: str(p.stat_years_experience),
    lm_stat_clients: str(p.stat_satisfied_clients),
    lm_stat_installations: str(p.stat_installations_completed),
    lm_stat_years_official: str(p.stat_years_experience_official),
    lm_stat_clients_official: str(p.stat_satisfied_clients_official),
    lm_stat_installations_official: str(p.stat_installations_completed_official),
  };
}

type Supabase = ReturnType<typeof getServiceClient>;

/**
 * Entreprises + dossiers des entreprises données, en deux requêtes.
 *
 * Les colonnes « officielles » viennent d'une migration appliquée à la main :
 * un `select` explicite qui les nomme échoue tout entier là où elle n'est pas
 * passée, et la grille s'ouvrirait vide. D'où le repli, comme dans `_board.ts`.
 */
async function loadRows(supabase: Supabase, entIds: number[]) {
  const [entsRes, projFull] = await Promise.all([
    supabase.from("entreprises").select(ENT_COLUMNS).in("id", entIds),
    supabase
      .from("lead_magnet_projects")
      .select(`${PROJECT_COLUMNS}, ${OFFICIAL_COLUMNS}`)
      .in("entreprise_id", entIds),
  ]);
  if (entsRes.error) return { error: entsRes.error.message, ents: [], projects: [] };

  let projects = (projFull.data ?? []) as unknown as ProjRow[];
  if (projFull.error) {
    const fallback = await supabase
      .from("lead_magnet_projects")
      .select(PROJECT_COLUMNS)
      .in("entreprise_id", entIds);
    if (fallback.error) return { error: fallback.error.message, ents: [], projects: [] };
    projects = (fallback.data ?? []) as unknown as ProjRow[];
  }

  return { error: null, ents: (entsRes.data ?? []) as unknown as EntRow[], projects };
}

/**
 * Un dossier par ENTREPRISE — le validé l'emporte, comme dans `_board.ts`. Tant
 * que d'anciens doublons subsistent en base, cette règle fait converger la
 * grille, le board et le site sur le même dossier.
 */
function projectByEnt(projects: ProjRow[]): Map<number, NonNullable<ProjRow>> {
  const map = new Map<number, NonNullable<ProjRow>>();
  for (const p of projects) {
    if (!p || p.entreprise_id == null) continue;
    const cur = map.get(p.entreprise_id);
    if (!cur || (p.pret_pour_lm === true && cur.pret_pour_lm !== true)) map.set(p.entreprise_id, p);
  }
  return map;
}

/**
 * GET /api/marketing-pipeline/missing-data?ids=<opportunités, séparées par des virgules>
 *
 * Renvoie, pour chaque opportunité demandée, les valeurs éditables.
 *
 * Pas de liste « ce qui manque » : la grille l'obtient de
 * `SITE_REQUIRED_WITH_PROJECT`, qu'elle doit de toute façon réévaluer à chaque
 * frappe pour suivre la saisie — un verdict figé au chargement ne servirait qu'à
 * introduire une seconde vérité. Ces règles et `missingForSite` produisent
 * exactement les mêmes libellés ; `missing-for-site.test.ts` compare les deux.
 */
export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ROWS);
  if (ids.length === 0) return json({ rows: [] }, { headers: cors });

  const supabase = getServiceClient();
  const oppsRes = await supabase
    .from("opportunites")
    .select("id, entreprise_id, name")
    .in("id", ids)
    .not("entreprise_id", "is", null);
  if (oppsRes.error) return jsonError(oppsRes.error.message, 500, {}, cors);

  const opps = (oppsRes.data ?? []) as Array<{ id: string; entreprise_id: number; name: string | null }>;
  const entIds = [...new Set(opps.map((o) => o.entreprise_id))];
  if (entIds.length === 0) return json({ rows: [] }, { headers: cors });

  const loaded = await loadRows(supabase, entIds);
  if (loaded.error) return jsonError(loaded.error, 500, {}, cors);

  const entById = new Map(loaded.ents.map((e) => [e.id, e]));
  const projById = projectByEnt(loaded.projects);

  const rows = opps.flatMap((o) => {
    const ent = entById.get(o.entreprise_id);
    if (!ent) return [];
    const project = projById.get(o.entreprise_id) ?? null;
    return [
      {
        opportunite_id: o.id,
        entreprise_id: o.entreprise_id,
        project_id: project?.id ?? null,
        company_name: ent.name ?? o.name ?? null,
        values: toValues(ent, project),
      },
    ];
  });

  return json({ rows }, { headers: cors });
});

/**
 * POST /api/marketing-pipeline/missing-data
 *
 * Enregistre les lignes modifiées. Ne touche QUE les colonnes envoyées : la
 * grille ne connaît que les champs requis, écrire le reste à `null` viderait
 * l'adresse, l'e-mail et les horaires de chaque fiche complétée.
 *
 * Une ligne en échec n'annule pas le lot — sur soixante lignes saisies à la
 * main, tout perdre parce que la soixantième bute sur une contrainte serait le
 * pire des comportements. Chaque ligne repart avec son verdict.
 */
export const POST = withAuth({ body: marketingMissingDataSchema }, async ({ body, cors }) => {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  // Villes SEO actuelles, lues en UNE requête : `buildProjectPatch` en a besoin
  // pour ne marquer « saisi à la main » que ce qui change vraiment, et une
  // lecture par ligne aurait allongé d'autant les allers-retours du lot. Seules
  // les lignes qui touchent à la ville sont concernées.
  const knownProjectIds = body.rows
    .filter((r) => r.project && "override_city" in r.project)
    .map((r) => r.project_id)
    .filter((id): id is string => !!id);
  const cityByProject = new Map<string, string | null>();
  if (knownProjectIds.length > 0) {
    const res = await supabase
      .from("lead_magnet_projects")
      .select("id, override_city")
      .in("id", knownProjectIds);
    if (res.error) return jsonError(res.error.message, 500, {}, cors);
    for (const p of (res.data ?? []) as Array<{ id: string; override_city: string | null }>) {
      cityByProject.set(p.id, p.override_city);
    }
  }

  const results: Array<{ opportunite_id: string; ok: boolean; error?: string }> = [];

  for (const row of body.rows) {
    const fail = (error: string) => results.push({ opportunite_id: row.opportunite_id, ok: false, error });

    const companyPatch = row.company ? buildCompanyPatch(row.company, now) : null;
    if (companyPatch) {
      const { error } = await supabase.from("entreprises").update(companyPatch).eq("id", row.entreprise_id);
      if (error) {
        fail(error.message);
        continue;
      }
    }

    if (row.project) {
      const found = await ensureProjectId(supabase, {
        entreprise_id: row.entreprise_id,
        opportunite_id: row.opportunite_id,
        project_id: row.project_id ?? null,
      });
      if (found.error) {
        fail(found.error.message ?? "dossier lead magnet introuvable");
        continue;
      }
      const projectId = found.id;
      if (!projectId) {
        fail("dossier lead magnet introuvable");
        continue;
      }

      // Ville SEO d'avant : celle du lot pour un dossier déjà connu, sinon une
      // lecture ciblée — un dossier trouvé (ou créé) à l'instant n'était pas
      // dans la requête groupée. Inutile si la ligne ne touche pas à la ville.
      let previousCity: string | null = null;
      if ("override_city" in row.project && !cityByProject.has(projectId)) {
        const current = await supabase
          .from("lead_magnet_projects")
          .select("override_city")
          .eq("id", projectId)
          .maybeSingle();
        previousCity = (current.data as { override_city?: string | null } | null)?.override_city ?? null;
      } else {
        previousCity = cityByProject.get(projectId) ?? null;
      }

      const patch = buildProjectPatch(row.project, previousCity, now);
      if (patch) {
        // `writeProjectDetails` dégrade le payload plutôt que de perdre la
        // saisie : colonne pas encore migrée, chiffre clé que la base refuse à
        // vide. Même chemin que la fiche.
        const error = await writeProjectDetails(
          async (p) => (await supabase.from("lead_magnet_projects").update(p).eq("id", projectId)).error,
          patch,
        );
        if (error) {
          fail(error.message ?? "enregistrement du dossier impossible");
          continue;
        }
      }
    }

    results.push({ opportunite_id: row.opportunite_id, ok: true });
  }

  const failed = results.filter((r) => !r.ok).length;
  return json({ results, saved: results.length - failed, failed }, { headers: cors });
});
