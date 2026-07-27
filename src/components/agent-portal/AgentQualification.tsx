"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Star,
  Search,
  Check,
  EyeOff,
  ExternalLink,
  Loader2,
  ClipboardCheck,
  History,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { authedFetch } from "@/utils/authedFetch";
import { getCompanyDisplayName } from "@/utils/displayHelpers";

/**
 * File de qualification de l'agent.
 *
 * Volontairement séparée de `QualificationPage` (l'écran admin) : celui-ci est
 * entièrement câblé sur `AppDataContext` (chargement global de toutes les
 * entreprises, filtres localStorage) et expose blacklist, suppression et
 * déqualification — trois gestes que l'agent ne doit pas avoir. Ici, deux
 * actions seulement : **Qualifier** et **Masquer**.
 *
 * Aucune des deux n'écrit sur l'entreprise : elles enregistrent une proposition
 * que l'admin valide ou corrige depuis Relations › Agents. L'entreprise sort
 * immédiatement de la file — celle de tous les agents, le pool étant commun.
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
  premiers_tags: string[] | null;
  logo_url: string | null;
  sources: string[] | null;
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

const PAGE_SIZE = 30;

const siteOf = (c: QueueCompany): string | null => c.canonical_url || c.site_web_canonique || null;

const httpUrl = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const REVIEW_LABEL: Record<string, string> = {
  qualify: "Qualifiée",
  blacklist: "Blacklistée",
  hide: "Masquée",
  requeue: "Remise en file",
  delete: "Supprimée",
};

function CompanyCard({
  company,
  busy,
  onQualify,
  onSkip,
}: {
  company: QueueCompany;
  busy: boolean;
  onQualify: () => void;
  onSkip: () => void;
}) {
  const site = siteOf(company);
  const tags = company.service_tags?.length ? company.service_tags : company.premiers_tags;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {getCompanyDisplayName(company.name, company.canonical_url) || "Sans nom"}
              </span>
              {company.note_moyenne != null && (
                <span className="ml-1 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-current text-[var(--warn)]" />
                  {company.note_moyenne}
                  {company.nombre_avis ? ` (${company.nombre_avis})` : ""}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {(company.ville || company.code_postal) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[company.code_postal, company.ville].filter(Boolean).join(" ")}
                </span>
              )}
              {company.telephone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {company.telephone}
                </span>
              )}
              {company.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {company.email}
                </span>
              )}
            </div>
          </div>
          {site && (
            <Button variant="ghost" size="sm" className="shrink-0" asChild>
              <a href={httpUrl(site)} target="_blank" rel="noreferrer">
                Voir le site <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 6).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" disabled={busy} onClick={onQualify}>
            <Check className="mr-1 h-4 w-4" /> Qualifier
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onSkip}>
            <EyeOff className="mr-1 h-4 w-4" /> Masquer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentQualification() {
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [companies, setCompanies] = useState<QueueCompany[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const fetchQueue = useCallback(
    async (opts: { after?: number | null; q: string; append: boolean }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (opts.q) params.set("q", opts.q);
      if (opts.after != null) params.set("after_id", String(opts.after));

      const res = await authedFetch(`/api/agent/qualification/queue?${params.toString()}`);
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
      setCompanies((cur) => (opts.append ? [...cur, ...data.companies] : data.companies));
      setCursor(data.next_after_id);
      setHasMore(data.has_more);
    },
    [],
  );

  const loadQueue = useCallback(
    async (q: string) => {
      setLoading(true);
      await fetchQueue({ q, append: false });
      setLoading(false);
    },
    [fetchQueue],
  );

  useEffect(() => {
    void loadQueue(appliedSearch);
  }, [loadQueue, appliedSearch]);

  const loadHistory = useCallback(async () => {
    const res = await authedFetch("/api/agent/qualification/history");
    if (!res.ok) return;
    const data = (await res.json()) as { decisions: HistoryRow[] };
    setHistory(data.decisions ?? []);
  }, []);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const decide = async (company: QueueCompany, decision: "qualify" | "skip") => {
    setBusyId(company.id);
    try {
      const res = await authedFetch("/api/agent/qualification/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: company.id, decision }),
      });

      if (res.status === 409) {
        toast.info("Cette entreprise vient d'être traitée par quelqu'un d'autre.");
      } else if (res.status === 503) {
        toast.error("Fonctionnalité pas encore activée en base. Préviens l'administrateur.");
        return;
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
      // Traitée dans les deux cas : elle sort de la file.
      setCompanies((cur) => cur.filter((c) => c.id !== company.id));
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusyId(null);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchQueue({ after: cursor, q: appliedSearch, append: true });
    setLoadingMore(false);
  };

  const pendingCount = useMemo(
    () => history.filter((h) => h.review_status === "pending").length,
    [history],
  );

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            La qualification ne t&apos;a pas été ouverte. Demande à l&apos;administrateur de
            t&apos;accorder l&apos;accès depuis Relations › Agents.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Qualification</h1>
        <p className="text-sm text-muted-foreground">
          Trie le pool commun d&apos;entreprises. Tes décisions sont des propositions :
          l&apos;administrateur les valide ou les corrige. Une entreprise que tu traites sort de
          la file de tous les agents.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b">
        <button
          type="button"
          onClick={() => setTab("queue")}
          className={[
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
            tab === "queue"
              ? "border-primary font-medium text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <ClipboardCheck className="h-4 w-4" /> File à qualifier
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={[
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
            tab === "history"
              ? "border-primary font-medium text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <History className="h-4 w-4" /> Mes décisions
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-[11px]">
              {pendingCount} en attente
            </Badge>
          )}
        </button>
      </div>

      {tab === "queue" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(search.trim());
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom ou ville, puis Entrée…"
              className="pl-8"
            />
          </form>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : companies.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {appliedSearch
                  ? "Aucune entreprise ne correspond à ce filtre."
                  : "La file est vide. Tout a été trié !"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {companies.map((c) => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  busy={busyId === c.id}
                  onQualify={() => decide(c, "qualify")}
                  onSkip={() => decide(c, "skip")}
                />
              ))}

              {hasMore && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-1 h-4 w-4" />
                  )}
                  Charger la suite
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Tu n&apos;as encore trié aucune entreprise.
              </CardContent>
            </Card>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{h.entreprises?.name || "Sans nom"}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Tu as {h.decision === "qualify" ? "qualifié" : "masqué"} ·{" "}
                    {new Date(h.created_at).toLocaleDateString("fr-FR")}
                    {h.entreprises?.ville ? ` · ${h.entreprises.ville}` : ""}
                  </div>
                </div>
                <Badge
                  variant={
                    h.review_status === "pending"
                      ? "secondary"
                      : h.review_status === "confirmed"
                        ? "default"
                        : "outline"
                  }
                >
                  {h.review_status === "pending"
                    ? "En attente"
                    : h.review_status === "confirmed"
                      ? "Validée"
                      : `Corrigée : ${REVIEW_LABEL[h.review_action ?? ""] ?? "autre"}`}
                </Badge>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
