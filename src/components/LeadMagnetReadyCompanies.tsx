"use client";

import React from "react";
import { useAppData } from "./AppDataContext";
import type { Company, Opportunity } from "@/types";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import {
  Search, Building2, ChevronRight, ChevronDown, Target, Zap,
  Phone, Mail, ExternalLink, X, Loader2, Star,
} from "lucide-react";
import { toast } from "sonner";
import { getCompanyDisplayName, ensureHttpsUrl } from "../utils/displayHelpers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LMProject {
  opportunite_id: string;
  statut: string;
  pret_pour_lm?: boolean;
}

// ─── Opportunity card ────────────────────────────────────────────────────────

function OpportunityCard({
  opp,
  lmProject,
  onLinkToLM,
}: {
  opp: Opportunity;
  lmProject: LMProject | undefined;
  onLinkToLM: (opportuniteId: string) => void;
}) {
  const statusColors: Record<string, string> = {
    ready: "bg-green-100 text-green-700",
    framer: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-700",
    failed: "bg-red-100 text-red-700",
  };
  const lmStatus = lmProject?.statut ?? (opp.lead_magnet ? "linked" : null);

  return (
    <div className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors bg-white">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-800 truncate">{opp.name || "Opportunité"}</span>
          {opp.lead_magnet && (
            <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0 font-medium">LM</Badge>
          )}
          {lmStatus && lmStatus !== "linked" && (
            <Badge className={`text-[10px] px-1.5 py-0 font-medium ${statusColors[lmStatus] ?? "bg-gray-100 text-gray-600"}`}>
              {lmStatus}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {opp.montant && <span className="font-medium text-gray-700">{opp.montant.toLocaleString("fr-FR")} €</span>}
          {opp.stage && <span>{opp.stage}</span>}
          {opp.priorite && (
            <span className={`font-medium ${opp.priorite === "haute" ? "text-red-600" : opp.priorite === "moyenne" ? "text-amber-600" : "text-gray-400"}`}>
              {opp.priorite}
            </span>
          )}
        </div>
      </div>
      {!opp.lead_magnet && (
        <button
          onClick={() => onLinkToLM(opp.id)}
          className="flex-shrink-0 text-[11px] px-2 py-1 rounded border border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-300 transition-colors font-medium"
        >
          Lier au LM
        </button>
      )}
      {lmProject?.statut === "ready" && (
        <span className="flex-shrink-0 flex items-center gap-1 text-[11px] text-green-600 font-medium">
          <Zap size={10} />
          Prêt
        </span>
      )}
    </div>
  );
}

// ─── Company row ─────────────────────────────────────────────────────────────

function CompanyRow({
  company,
  opportunities,
  lmProjects,
  onLinkOpportunity,
}: {
  company: Company;
  opportunities: Opportunity[];
  lmProjects: Map<string, LMProject>;
  onLinkOpportunity: (companyId: number, opportuniteId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const displayName = getCompanyDisplayName(company.name, company.canonical_url);
  const lmOpps = opportunities.filter((o) => o.lead_magnet);
  const readyLmOpps = lmOpps.filter((o) => lmProjects.get(o.id)?.statut === "ready" || lmProjects.get(o.id)?.pret_pour_lm);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center flex-shrink-0">
          <Building2 size={16} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{displayName}</span>
            {company.note_moyenne && (
              <span className="flex items-center gap-0.5 text-xs text-amber-500">
                <Star size={10} fill="currentColor" />
                {company.note_moyenne}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            {company.ville && <span>{company.ville}</span>}
            {company.telephone && (
              <span className="flex items-center gap-1">
                <Phone size={10} />
                {company.telephone}
              </span>
            )}
            {company.canonical_url && (
              <a
                href={ensureHttpsUrl(company.canonical_url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-blue-500 hover:underline"
              >
                <ExternalLink size={10} />
                Site
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {readyLmOpps.length > 0 && (
            <Badge className="bg-green-100 text-green-700 text-[10px] font-medium">
              <Zap size={9} className="mr-1" />
              {readyLmOpps.length} prêt{readyLmOpps.length > 1 ? "s" : ""}
            </Badge>
          )}
          {lmOpps.length > 0 && (
            <Badge className="bg-purple-100 text-purple-700 text-[10px] font-medium">
              {lmOpps.length} LM
            </Badge>
          )}
          <span className="text-[10px] text-gray-400">{opportunities.length} opp.</span>
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/30">
          {opportunities.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">Aucune opportunité</p>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Opportunités — cliquez "Lier au LM" pour associer un lead magnet
              </div>
              {opportunities.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opp={opp}
                  lmProject={lmProjects.get(opp.id)}
                  onLinkToLM={(oppId) => onLinkOpportunity(company.id, oppId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterMode = "all_qualified" | "lm_linked" | "lm_ready";

export function LeadMagnetReadyCompanies() {
  const { companies, opportunities, loading } = useAppData();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterMode>("all_qualified");
  const [lmProjects, setLmProjects] = React.useState<Map<string, LMProject>>(new Map());
  const [loadingLM, setLoadingLM] = React.useState(true);

  // Fetch LM project statuses
  React.useEffect(() => {
    const fetchLMProjects = async () => {
      try {
        const res = await fetch("/api/lead-magnet-projects");
        if (res.ok) {
          const data: LMProject[] = await res.json();
          setLmProjects(new Map(data.map((p) => [p.opportunite_id, p])));
        }
      } catch {
        // Non-critical — projects just won't show status
      } finally {
        setLoadingLM(false);
      }
    };
    fetchLMProjects();
  }, []);

  const handleLinkOpportunity = async (companyId: number, opportuniteId: string) => {
    try {
      const res = await fetch("/api/opportunities/" + opportuniteId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_magnet: true }),
      });
      if (!res.ok) throw new Error("Erreur");
      toast.success("Opportunité liée au lead magnet");
    } catch {
      toast.error("Erreur lors de la liaison");
    }
  };

  const qualifiedCompanies = React.useMemo(
    () => companies.filter((c) => c.qualifie),
    [companies]
  );

  // Group opportunities by company
  const oppsByCompany = React.useMemo(() => {
    const map = new Map<number, Opportunity[]>();
    for (const opp of opportunities) {
      if (!opp.entreprise_id) continue;
      const list = map.get(opp.entreprise_id) ?? [];
      list.push(opp);
      map.set(opp.entreprise_id, list);
    }
    return map;
  }, [opportunities]);

  const filtered = React.useMemo(() => {
    let base = qualifiedCompanies;

    if (filter === "lm_linked") {
      base = base.filter((c) => (oppsByCompany.get(c.id) ?? []).some((o) => o.lead_magnet));
    } else if (filter === "lm_ready") {
      base = base.filter((c) =>
        (oppsByCompany.get(c.id) ?? []).some((o) => {
          const lm = lmProjects.get(o.id);
          return lm?.statut === "ready" || lm?.pret_pour_lm;
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((c) =>
        getCompanyDisplayName(c.name, c.canonical_url).toLowerCase().includes(q) ||
        c.ville?.toLowerCase().includes(q) ||
        c.canonical_url?.toLowerCase().includes(q)
      );
    }
    return base;
  }, [qualifiedCompanies, filter, search, oppsByCompany, lmProjects]);

  const FILTERS: { id: FilterMode; label: string }[] = [
    { id: "all_qualified", label: "Toutes (qualifiées)" },
    { id: "lm_linked", label: "Avec lead magnet" },
    { id: "lm_ready", label: "Prêtes pour LM" },
  ];

  if (loading || loadingLM) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entreprises qualifiées</h1>
        <p className="text-sm text-gray-500 mt-1">
          {qualifiedCompanies.length} entreprise{qualifiedCompanies.length !== 1 ? "s" : ""} qualifiée{qualifiedCompanies.length !== 1 ? "s" : ""}
          {" · "}
          {opportunities.filter((o) => o.lead_magnet).length} opportunité{opportunities.filter((o) => o.lead_magnet).length !== 1 ? "s" : ""} avec lead magnet
        </p>
      </div>

      {/* Filters + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${filter === f.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une entreprise…"
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={40} className="text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium">Aucune entreprise trouvée</p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === "lm_ready" ? "Aucune entreprise n'a encore de lead magnet prêt" :
             filter === "lm_linked" ? "Aucune opportunité avec lead magnet" :
             "Qualifiez des entreprises dans l'onglet Prospection"}
          </p>
        </div>
      )}

      {/* Company list */}
      <div className="space-y-3">
        {filtered.map((company) => (
          <CompanyRow
            key={company.id}
            company={company}
            opportunities={oppsByCompany.get(company.id) ?? []}
            lmProjects={lmProjects}
            onLinkOpportunity={handleLinkOpportunity}
          />
        ))}
      </div>
    </div>
  );
}
