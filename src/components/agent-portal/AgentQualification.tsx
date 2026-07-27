"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  ExternalLink,
  MapPin,
  Target,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Check,
  Phone,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  History,
  Loader2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";
import { getCompanyDisplayName, ensureHttpsUrl } from "@/utils/displayHelpers";
import { normalizeServiceTags } from "@/utils/serviceTags";

/**
 * File de qualification de l'agent.
 *
 * Reprend le tableau, les filtres et le design system de l'écran admin
 * (`QualificationPage`, styles `.studio-surface` de `studio.css`) — mais c'est
 * un composant distinct, pas une variante : l'écran admin est câblé sur
 * `AppDataContext`, qui charge toutes les entreprises côté client et expose la
 * déqualification, le blacklist et la suppression. L'agent n'a droit à aucun
 * de ces trois gestes, et sa file passe par une API paginée.
 *
 * Quatre actions par ligne : visiter le site, chercher sur Google, **qualifier**,
 * **masquer**. Les deux dernières sont des propositions — elles n'écrivent rien
 * sur l'entreprise, l'admin valide ou corrige derrière.
 */

type QueueCompany = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  canonical_url: string | null;
  site_web_canonique: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  service_tags: string[] | null;
  premiers_tags: string | null;
  logo_url: string | null;
  sources: string[] | null;
  created_at: string | null;
};

type HistoryRow = {
  id: string;
  entreprise_id: number;
  decision: "qualify" | "skip";
  created_at: string;
  review_status: "pending" | "confirmed" | "overridden";
  review_action: string | null;
  entreprises: { id: number; name: string | null; ville: string | null } | null;
};

type UrlFilter = "all" | "with-url" | "without-url";

const SOURCE_OPTIONS = [
  { value: "google_search", label: "Google Search" },
  { value: "google_maps", label: "Google Maps" },
];

/**
 * Préférences de filtres persistées, comme côté admin
 * (`qualification.filters.v1`) — clé distincte pour que les deux écrans ne se
 * marchent pas dessus.
 */
const FILTERS_STORAGE_KEY = "agent.qualification.filters.v1";

type PersistedFilters = {
  searchTerm: string;
  selectedSources: string[];
  urlFilter: UrlFilter;
  viewMode: "grid" | "list";
};

function loadPersistedFilters(): Partial<PersistedFilters> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedFilters>) : {};
  } catch {
    return {};
  }
}

/** Une page de tableau, comme l'admin. Le serveur, lui, renvoie par gros lots. */
const ITEMS_PER_PAGE = 12;
const FETCH_SIZE = 60;

const REVIEW_LABEL: Record<string, string> = {
  qualify: "Qualifiée",
  blacklist: "Blacklistée",
  hide: "Masquée",
  requeue: "Remise en file",
  delete: "Supprimée",
};

const formatDate = (dateString: string | null) =>
  dateString ? new Date(dateString).toLocaleDateString("fr-FR") : "—";

/** Recherche Google sur le nom + la ville — pour vérifier l'entreprise vite fait. */
const googleSearchUrl = (c: QueueCompany) =>
  `https://www.google.com/search?q=${encodeURIComponent(
    `${getCompanyDisplayName(c.name, c.canonical_url) || c.name || ""} ${c.ville ?? ""}`.trim(),
  )}`;

export default function AgentQualification() {
  const [tab, setTab] = useState<"queue" | "history">("queue");

  const [persisted] = useState(loadPersistedFilters);
  const [searchTerm, setSearchTerm] = useState(persisted.searchTerm ?? "");
  const [selectedSources, setSelectedSources] = useState<string[]>(
    () => persisted.selectedSources ?? SOURCE_OPTIONS.map((o) => o.value),
  );
  // Par défaut : les entreprises AVEC site. Sans site, il n'y a ni refonte à
  // proposer ni audit à produire — ce n'est pas le gros du démarchage.
  const [urlFilter, setUrlFilter] = useState<UrlFilter>(persisted.urlFilter ?? "with-url");
  const [viewMode, setViewMode] = useState<"grid" | "list">(persisted.viewMode ?? "list");

  const [companies, setCompanies] = useState<QueueCompany[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // Persiste les filtres (pas la page : elle repart à 1 quand ils changent).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const data: PersistedFilters = { searchTerm, selectedSources, urlFilter, viewMode };
    try {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // quota / sérialisation : sans importance, on garde juste l'état en mémoire.
    }
  }, [searchTerm, selectedSources, urlFilter, viewMode]);

  const buildParams = useCallback(
    (after: number | null) => {
      const params = new URLSearchParams({
        limit: String(FETCH_SIZE),
        url_filter: urlFilter,
      });
      if (searchTerm.trim()) params.set("q", searchTerm.trim());
      if (selectedSources.length > 0 && selectedSources.length < SOURCE_OPTIONS.length) {
        params.set("sources", selectedSources.join(","));
      }
      if (after != null) params.set("after_id", String(after));
      return params;
    },
    [searchTerm, selectedSources, urlFilter],
  );

  const fetchQueue = useCallback(
    async (after: number | null, append: boolean) => {
      const res = await authedFetch(`/api/agent/qualification/queue?${buildParams(after)}`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        toast.error("Impossible de charger la file.");
        return;
      }
      const data = (await res.json()) as {
        companies: QueueCompany[];
        next_after_id: number | null;
        has_more: boolean;
      };
      setCompanies((cur) => (append ? [...cur, ...data.companies] : data.companies));
      setCursor(data.next_after_id);
      setHasMore(data.has_more);
    },
    [buildParams],
  );

  // Recharge à chaque changement de filtre, avec un léger debounce sur la
  // recherche pour ne pas tirer une requête par frappe.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setCurrentPage(1);
      await fetchQueue(null, false);
      if (!cancelled) setLoading(false);
    };
    const t = setTimeout(run, searchTerm ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fetchQueue, searchTerm]);

  const loadHistory = useCallback(async () => {
    const res = await authedFetch("/api/agent/qualification/history");
    if (!res.ok) return;
    const data = (await res.json()) as { decisions: HistoryRow[] };
    setHistory(data.decisions ?? []);
  }, []);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchQueue(cursor, true);
    setLoadingMore(false);
  };

  const decide = async (company: QueueCompany, decision: "qualify" | "skip") => {
    setBusyId(company.id);
    try {
      const res = await authedFetch("/api/agent/qualification/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: company.id, decision }),
      });

      if (res.status === 503) {
        toast.error("Fonctionnalité pas encore activée en base. Préviens l'administrateur.");
        return;
      }
      if (res.status === 409) {
        toast.info("Cette entreprise vient d'être traitée par quelqu'un d'autre.");
      } else if (!res.ok) {
        toast.error("Action impossible.");
        return;
      } else {
        const label = getCompanyDisplayName(company.name, company.canonical_url) || "Entreprise";
        toast.success(
          decision === "qualify"
            ? `${label} proposée à la qualification — en attente de validation.`
            : `${label} écartée — en attente de validation.`,
        );
      }
      setCompanies((cur) => cur.filter((c) => c.id !== company.id));
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleSource = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((v) => v !== source) : [...prev, source],
    );
  };

  const sourceFilterLabel =
    selectedSources.length === 0 || selectedSources.length === SOURCE_OPTIONS.length
      ? "Toutes les sources"
      : `${selectedSources.length} source${selectedSources.length > 1 ? "s" : ""}`;

  const totalPages = Math.max(1, Math.ceil(companies.length / ITEMS_PER_PAGE));
  const paginated = useMemo(
    () => companies.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [companies, currentPage],
  );
  const pendingCount = useMemo(
    () => history.filter((h) => h.review_status === "pending").length,
    [history],
  );

  /* ── Actions communes aux deux vues ─────────────────────────────────────── */
  const RowActions = ({ company }: { company: QueueCompany }) => {
    const disabled = busyId === company.id;
    return (
      <>
        <button
          type="button"
          className="btn"
          onClick={() => window.open(ensureHttpsUrl(company.canonical_url ?? ""), "_blank")}
          disabled={!company.canonical_url}
          title="Visiter le site"
        >
          <ExternalLink className="ico-sm" />
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => window.open(googleSearchUrl(company), "_blank")}
          title="Chercher sur Google"
        >
          <Search className="ico-sm" />
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => decide(company, "skip")}
          disabled={disabled}
          title="Masquer — proposer d'écarter cette entreprise"
        >
          <EyeOff className="ico-sm" />
        </button>
        <button
          type="button"
          className="btn primary labelled"
          onClick={() => decide(company, "qualify")}
          disabled={disabled}
          title="Qualifier — proposer cette entreprise à la validation"
        >
          <Check className="ico-sm" />
          Qualifier
        </button>
      </>
    );
  };

  if (forbidden) {
    return (
      <div className="studio-surface flex min-h-full flex-col">
        <div className="ws-overview">
          <div className="dtable">
            <div className="py-12 text-center">
              <Target className="mx-auto mb-4" style={{ width: 40, height: 40, color: "var(--text-4)" }} />
              <h3 className="mb-2 font-medium">Qualification non ouverte</h3>
              <p style={{ color: "var(--text-3)", fontSize: "12.5px" }}>
                Demande à l&apos;administrateur de t&apos;accorder l&apos;accès depuis Relations ›
                Agents.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-surface flex min-h-full flex-col">
      {/* Tabs strip */}
      <div className="tabs-strip">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "queue"}
          onClick={() => setTab("queue")}
        >
          <List className="ico-sm" />
          File à qualifier <span className="bd">{companies.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
        >
          <History className="ico-sm" />
          Mes décisions {pendingCount > 0 && <span className="bd">{pendingCount}</span>}
        </button>
        <span className="grow" />
      </div>

      <div className="ws-overview">
        {tab === "queue" && (
          <>
            <div className="ws-header" style={{ marginBottom: 14 }}>
              <div>
                <div className="ws-eyebrow">FILE DE QUALIFICATION</div>
                <h1>
                  <em>
                    {companies.length} entreprise{companies.length > 1 ? "s" : ""}
                  </em>{" "}
                  à trier
                </h1>
                <div className="sub">
                  Tes décisions sont des propositions : l&apos;administrateur les valide ou les
                  corrige. Une entreprise que tu traites sort de la file de tous les agents.
                </div>
              </div>
            </div>

            {/* Filter bar — même barre que l'écran admin, moins les bascules
                Qualifiées / Doublons / Masquées, qui n'ont pas de sens ici. */}
            <div className="filter-bar">
              <div className="search-w">
                <Search className="ico-sm" />
                <input
                  placeholder="Rechercher entreprise, ville, adresse…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <details className="relative">
                <summary className="select-w list-none" style={{ listStyle: "none" }}>
                  <span className="lb">Sources :</span>
                  <span className="val">{sourceFilterLabel}</span>
                  <ChevronDown className="chev ico-xs" />
                </summary>
                <div
                  className="absolute z-20 mt-2 w-56 space-y-2 rounded-md border p-3 shadow-lg"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedSources.includes(option.value)}
                        onChange={() => toggleSource(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </details>

              <Select value={urlFilter} onValueChange={(v) => setUrlFilter(v as UrlFilter)}>
                <SelectTrigger id="agent-url-filter" className="select-w" aria-label="Filtre URL">
                  <span className="lb">Site :</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="with-url">Avec site uniquement</SelectItem>
                  <SelectItem value="without-url">Sans site uniquement</SelectItem>
                  <SelectItem value="all">Toutes les entreprises</SelectItem>
                </SelectContent>
              </Select>

              <span className="grow" />

              <div className="seg">
                <button
                  type="button"
                  className="s icon"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  title="Grille"
                >
                  <LayoutGrid className="ico-sm" />
                </button>
                <button
                  type="button"
                  className="s icon"
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                  title="Liste"
                >
                  <List className="ico-sm" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="dtable">
                <div className="flex items-center justify-center gap-2 py-12" style={{ color: "var(--text-3)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                </div>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paginated.map((company) => {
                  const displayName = getCompanyDisplayName(company.name, company.canonical_url);
                  const tags = normalizeServiceTags(company.service_tags, company.premiers_tags);
                  const isMaps = company.sources?.includes("google_maps") ?? false;

                  return (
                    <div
                      key={company.id}
                      className="rounded-xl border p-3.5 transition-shadow hover:shadow-sm"
                      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium" style={{ letterSpacing: "-0.005em" }}>
                            {displayName || "Sans nom"}
                          </span>
                          {company.telephone && <Phone className="ico-phone ico-xs" />}
                        </div>
                        {company.canonical_url && (
                          <a
                            href={ensureHttpsUrl(company.canonical_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Ouvrir ${company.canonical_url} dans un nouvel onglet`}
                            className="url mt-0.5 block hover:underline"
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "10.5px",
                              color: "var(--text-3)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {company.canonical_url}
                          </a>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <span className={`src-pill ${isMaps ? "maps" : "search"}`}>
                          {isMaps ? <MapPin className="ico-xs" /> : <Globe className="ico-xs" />}
                          {isMaps ? "Maps" : "Search"}
                        </span>
                        <span className="date">{formatDate(company.created_at)}</span>
                      </div>

                      {company.adresse && (
                        <div
                          className="addr mt-2.5"
                          style={{
                            fontSize: "11.5px",
                            color: "var(--text-2)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "4px",
                          }}
                        >
                          <MapPin className="ico-xs" style={{ marginTop: "2px", color: "var(--text-4)" }} />
                          <span>{company.adresse}</span>
                        </div>
                      )}

                      {tags.length > 0 && (
                        <div className="tags mt-2.5 flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag, index) => (
                            <span key={index} className="pill">
                              {tag}
                            </span>
                          ))}
                          {tags.length > 3 && <span className="pill">+{tags.length - 3}</span>}
                        </div>
                      )}

                      <div
                        className="actions mt-3 flex items-center gap-1.5 border-t pt-3"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <RowActions company={company} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dtable agent-queue">
                <div className="dtable-head">
                  <div></div>
                  <div>Entreprise</div>
                  <div>Source</div>
                  <div>Adresse</div>
                  <div>Tags</div>
                  <div>Date</div>
                  <div>Actions</div>
                </div>
                {paginated.map((company) => {
                  const displayName = getCompanyDisplayName(company.name, company.canonical_url);
                  const tags = normalizeServiceTags(company.service_tags, company.premiers_tags);
                  const isMaps = company.sources?.includes("google_maps") ?? false;

                  return (
                    <div key={company.id} className="dtable-row">
                      <div className="chk" aria-hidden="true" />
                      <div className="ent">
                        <div className="nm">
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {displayName || "Sans nom"}
                          </span>
                          {company.telephone && <Phone className="ico-phone ico-xs" />}
                        </div>
                        {company.canonical_url && (
                          <a
                            href={ensureHttpsUrl(company.canonical_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Ouvrir ${company.canonical_url} dans un nouvel onglet`}
                            className="url hover:underline"
                          >
                            {company.canonical_url}
                          </a>
                        )}
                      </div>
                      <div>
                        <div className={`src-pill ${isMaps ? "maps" : "search"}`}>
                          {isMaps ? <MapPin className="ico-xs" /> : <Globe className="ico-xs" />}
                          {isMaps ? "Maps" : "Search"}
                        </div>
                      </div>
                      <div className="addr">
                        {company.adresse ? (
                          <>
                            <MapPin className="ico-xs" />
                            <span>{company.adresse}</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--text-4)" }}>—</span>
                        )}
                      </div>
                      <div className="tags">
                        {tags.slice(0, 2).map((tag, index) => (
                          <span key={index} className="pill">
                            {tag}
                          </span>
                        ))}
                        {tags.length > 2 && <span className="pill">+{tags.length - 2}</span>}
                      </div>
                      <div className="date">{formatDate(company.created_at)}</div>
                      <div className="actions">
                        <RowActions company={company} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {!loading && companies.length > 0 && (
              <div className="pagination">
                <button
                  type="button"
                  className={`pg-btn ${currentPage === 1 ? "disabled" : ""}`}
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="ico-sm" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    className="pg-btn"
                    aria-current={currentPage === pageNum ? "page" : undefined}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  className={`pg-btn ${currentPage === totalPages ? "disabled" : ""}`}
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Page suivante"
                >
                  <ChevronRight className="ico-sm" />
                </button>

                {hasMore && (
                  <button type="button" className="btn sm" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? <Loader2 className="ico-sm animate-spin" /> : <ChevronRight className="ico-sm" />}
                    Charger la suite
                  </button>
                )}

                <span className="pg-info">
                  Page {currentPage} / {totalPages} · {companies.length} entreprise
                  {companies.length > 1 ? "s" : ""} chargée{companies.length > 1 ? "s" : ""}
                  {hasMore ? " (il en reste)" : ""}
                </span>
              </div>
            )}

            {!loading && companies.length === 0 && (
              <div className="dtable">
                <div className="py-12 text-center">
                  <Target className="mx-auto mb-4" style={{ width: 40, height: 40, color: "var(--text-4)" }} />
                  <h3 className="mb-2 font-medium">Aucune entreprise trouvée</h3>
                  <p style={{ color: "var(--text-3)", fontSize: "12.5px" }}>
                    {searchTerm ||
                    urlFilter !== "all" ||
                    selectedSources.length !== SOURCE_OPTIONS.length
                      ? "Modifiez vos filtres pour voir plus d'entreprises"
                      : "La file est vide — tout a été trié !"}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            <div className="ws-header" style={{ marginBottom: 14 }}>
              <div>
                <div className="ws-eyebrow">MES DÉCISIONS</div>
                <h1>
                  <em>{history.length}</em> entreprise{history.length > 1 ? "s" : ""} triée
                  {history.length > 1 ? "s" : ""}
                </h1>
                <div className="sub">
                  Ce que tu as proposé et ce que l&apos;administrateur en a fait.
                </div>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="dtable">
                <div className="py-12 text-center">
                  <History className="mx-auto mb-4" style={{ width: 40, height: 40, color: "var(--text-4)" }} />
                  <h3 className="mb-2 font-medium">Aucune décision pour l&apos;instant</h3>
                  <p style={{ color: "var(--text-3)", fontSize: "12.5px" }}>
                    Trie quelques entreprises depuis la file pour les voir apparaître ici.
                  </p>
                </div>
              </div>
            ) : (
              <div className="dtable agent-history">
                <div className="dtable-head">
                  <div></div>
                  <div>Entreprise</div>
                  <div>Ma décision</div>
                  <div>Date</div>
                  <div>Verdict</div>
                </div>
                {history.map((h) => (
                  <div key={h.id} className="dtable-row">
                    <div className="chk" aria-hidden="true" />
                    <div className="ent">
                      <div className="nm">
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.entreprises?.name || "Sans nom"}
                        </span>
                      </div>
                      {h.entreprises?.ville && <span className="url">{h.entreprises.ville}</span>}
                    </div>
                    <div>
                      <span className="pill">
                        {h.decision === "qualify" ? (
                          <>
                            <Check className="ico-xs" /> Qualifiée
                          </>
                        ) : (
                          <>
                            <EyeOff className="ico-xs" /> Masquée
                          </>
                        )}
                      </span>
                    </div>
                    <div className="date">{formatDate(h.created_at)}</div>
                    <div>
                      {h.review_status === "pending" ? (
                        <span className="pill">
                          <Eye className="ico-xs" /> En attente
                        </span>
                      ) : h.review_status === "confirmed" ? (
                        <span className="pill" style={{ color: "var(--ok)" }}>
                          <Check className="ico-xs" /> Validée
                        </span>
                      ) : (
                        <span className="pill">
                          Corrigée : {REVIEW_LABEL[h.review_action ?? ""] ?? "autre"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
