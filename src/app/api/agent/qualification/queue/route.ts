import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { agentQualificationQuerySchema, parseQuery } from "@/app/api/_lib/schemas";
import { canonicalizeDomain } from "@/lib/url-canonical";
import {
  QUEUE_COLUMNS,
  companyCanonicalSite,
  isBlacklisted,
  loadBlacklist,
  loadPendingEntrepriseIds,
  type QueueCompany,
} from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/** Nombre max de lignes lues par passe avant filtrage en mémoire. */
const WINDOW = 200;
/** Nombre max de passes, pour ne pas balayer toute la table sur une file très filtrée. */
const MAX_PASSES = 5;

/**
 * GET /api/agent/qualification/queue?q=&limit=&after_id=&sources=&url_filter=
 *
 * File à qualifier de l'agent : le pool global des entreprises non qualifiées,
 * moins celles déjà traitées (par l'admin ou par un autre agent) et moins les
 * blacklistées.
 *
 * Les filtres reprennent ceux de l'écran admin : recherche, sources
 * (google_search / google_maps) et présence d'un site. `url_filter` vaut
 * `with-url` par défaut — sans site il n'y a ni refonte à proposer ni audit à
 * produire.
 *
 * Le filtrage blacklist / décisions en attente se fait en mémoire sur une
 * fenêtre de lignes, parce qu'il demande une canonicalisation d'URL que
 * PostgREST ne sait pas exprimer. On itère jusqu'à remplir la page demandée.
 *
 * Les doublons sont dédupliqués par domaine **à l'intérieur de la réponse**
 * seulement — deux entreprises d'un même domaine séparées par une page peuvent
 * encore apparaître toutes les deux. C'est un pré-tri : la revue admin tranche.
 *
 * `total` accompagne la page : c'est le nombre d'entreprises que la file
 * contient au total pour ces filtres, pour que l'écran affiche la vraie taille
 * de la file et pas seulement ce qui est chargé. Il est calculé en base, donc
 * il ne déduit ni les blacklistées ni les doublons — d'où son caractère
 * approximatif, signalé côté UI.
 */
export const GET = withAuth(
  { role: "freelance", capability: "qualify" },
  async ({ req, cors }) => {
    const parsed = parseQuery(new URL(req.url), agentQualificationQuerySchema, cors);
    if (!parsed.ok) return parsed.response;
    const { q, limit, after_id, url_filter } = parsed.data;
    const sources = (parsed.data.sources ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const sc = getServiceClient();
    const [blacklist, pending] = await Promise.all([loadBlacklist(), loadPendingEntrepriseIds()]);

    /**
     * Filtres exprimables en base, décrits une seule fois puis appliqués tels
     * quels à la requête de page et à celle du total — les deux ne peuvent pas
     * diverger. Exprimés en triplets `(colonne, opérateur, valeur)` pour passer
     * par `.filter()`, la seule méthode non générique du client : les
     * `.eq()/.is()/.not()` typés font exploser l'inférence de TypeScript quand
     * on tente de les factoriser.
     *
     * `not.is true` sur `hidden_in_qualification` couvre à la fois `false` et
     * `null` (colonne ajoutée après coup, les anciennes lignes sont à null) —
     * c'est ce que fait le `!c.hidden` de la file admin.
     */
    const filters: Array<[string, string, unknown]> = [
      ["qualifie", "eq", false],
      ["hidden_in_qualification", "not.is", true],
    ];

    // `sources` est un tableau : `ov` = « au moins une des sources cochées ».
    if (sources.length > 0) filters.push(["sources", "ov", `{${sources.join(",")}}`]);

    // Le filtre URL se pose en base sur le null, puis se raffine en mémoire sur
    // les chaînes vides (que la colonne autorise).
    if (url_filter === "with-url") filters.push(["canonical_url", "not.is", null]);
    else if (url_filter === "without-url") filters.push(["canonical_url", "is", null]);

    const searchExpr = q
      ? (() => {
          const escaped = q.replace(/[%,()]/g, " ");
          return `name.ilike.%${escaped}%,ville.ilike.%${escaped}%,adresse.ilike.%${escaped}%`;
        })()
      : null;

    // Taille de la file. Les décisions en attente sont déduites : ce sont des
    // entreprises du pool, donc bien comptées par la requête.
    let countQuery = sc.from("entreprises").select("id", { count: "exact", head: true });
    for (const [column, op, value] of filters) countQuery = countQuery.filter(column, op, value);
    if (searchExpr) countQuery = countQuery.or(searchExpr);
    const countPromise = countQuery;

    const picked: QueueCompany[] = [];
    const seenDomains = new Set<string>();
    let cursor = after_id ?? 0;
    let exhausted = false;

    for (let pass = 0; pass < MAX_PASSES && picked.length < limit && !exhausted; pass++) {
      let query = sc.from("entreprises").select(QUEUE_COLUMNS);
      for (const [column, op, value] of filters) query = query.filter(column, op, value);
      if (searchExpr) query = query.or(searchExpr);

      const { data, error } = await query
        .gt("id", cursor)
        .order("id", { ascending: true })
        .limit(WINDOW);
      if (error) return jsonError(error.message, 500, {}, cors);

      const rows = (data ?? []) as unknown as QueueCompany[];
      if (rows.length < WINDOW) exhausted = true;
      if (rows.length === 0) break;
      cursor = Number(rows[rows.length - 1].id);

      for (const row of rows) {
        if (picked.length >= limit) break;
        if (pending.has(Number(row.id))) continue;
        if (isBlacklisted(row, blacklist)) continue;

        // Une `canonical_url` vide compte comme « sans site ».
        const hasUrl = Boolean(row.canonical_url?.trim());
        if (url_filter === "with-url" && !hasUrl) continue;
        if (url_filter === "without-url" && hasUrl) continue;

        const site = companyCanonicalSite(row);
        if (site) {
          const domain = canonicalizeDomain(site);
          if (seenDomains.has(domain)) continue;
          seenDomains.add(domain);
        }
        picked.push(row);
      }
    }

    // Le curseur repart du dernier élément retenu : tout ce qui suit dans la
    // fenêtre n'a pas encore été examiné. Si rien n'a été retenu mais qu'il
    // reste des lignes, on avance quand même pour ne pas boucler sur place.
    const nextAfterId =
      picked.length > 0 ? Number(picked[picked.length - 1].id) : exhausted ? null : cursor;

    const { count } = await countPromise;
    const total = Math.max(0, (count ?? 0) - pending.size);

    return json(
      { companies: picked, next_after_id: nextAfterId, has_more: !exhausted, total },
      { headers: cors },
    );
  },
);
